const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { sanitize } = require('../middleware/validate');

const router = express.Router();

// Cache duration in days
const CACHE_DAYS = 30;

// Fetch product data from Open Food Facts API
async function fetchFromOpenFoodFacts(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const images = [];

    // Prefer full-size images, fall back to display size
    const frontFull = p.selected_images?.front?.display?.en || p.image_front_url;
    const ingredientsFull = p.selected_images?.ingredients?.display?.en || p.image_ingredients_url;
    const nutritionFull = p.selected_images?.nutrition?.display?.en || p.image_nutrition_url;

    if (frontFull) images.push({ source_name: 'Open Food Facts', image_url: frontFull, quality_score: 90 });
    if (ingredientsFull) images.push({ source_name: 'Open Food Facts', image_url: ingredientsFull, quality_score: 70 });
    if (nutritionFull) images.push({ source_name: 'Open Food Facts', image_url: nutritionFull, quality_score: 70 });

    // Build real specs from API data
    const specs = {};
    if (p.quantity) specs['Quantity'] = p.quantity;
    if (p.packaging) specs['Packaging'] = p.packaging;
    if (p.labels) specs['Labels'] = p.labels;
    if (p.origins) specs['Origin'] = p.origins;
    if (p.ingredients_text || p.ingredients_text_en) specs['Ingredients'] = p.ingredients_text || p.ingredients_text_en;
    if (p.nutriscore_grade) specs['Nutri-Score'] = p.nutriscore_grade.toUpperCase();
    if (p.nova_group) specs['NOVA Group'] = String(p.nova_group);
    if (p.ecoscore_grade && p.ecoscore_grade !== 'not-applicable') specs['Eco-Score'] = p.ecoscore_grade.toUpperCase();
    // Key nutriments
    const n = p.nutriments || {};
    if (n.energy_100g != null) specs['Energy (100g)'] = `${n.energy_100g} ${n.energy_unit || 'kJ'}`;
    if (n.fat_100g != null) specs['Fat (100g)'] = `${n.fat_100g}g`;
    if (n.sugars_100g != null) specs['Sugars (100g)'] = `${n.sugars_100g}g`;
    if (n.proteins_100g != null) specs['Proteins (100g)'] = `${n.proteins_100g}g`;
    if (n.salt_100g != null) specs['Salt (100g)'] = `${n.salt_100g}g`;

    return {
      name: p.product_name || p.product_name_en || null,
      brand: p.brands || null,
      description: p.generic_name || p.generic_name_en || null,
      category: p.categories || null,
      quantity: p.quantity || null,
      source: {
        source_name: 'Open Food Facts',
        source_url: `https://world.openfoodfacts.org/product/${barcode}`,
        weight: p.quantity || null,
        description: p.generic_name || p.generic_name_en || null,
        trust_score: 75,
        specs: Object.keys(specs).length > 0 ? specs : null,
      },
      images,
    };
  } catch (err) {
    console.error('Open Food Facts fetch error:', err.message);
    return null;
  }
}

// Fetch product data from UPCitemdb (general products — electronics, household, etc.)
async function fetchFromUPCitemdb(barcode) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;

    const item = data.items[0];
    const images = [];

    // Collect images from the API response
    if (item.images && item.images.length > 0) {
      item.images.slice(0, 6).forEach((url, i) => {
        images.push({ source_name: 'UPC Database', image_url: url, quality_score: 85 - (i * 5) });
      });
    }

    // Build specs
    const specs = {};
    if (item.weight) specs['Weight'] = item.weight;
    if (item.dimension) specs['Dimensions'] = item.dimension;
    if (item.color) specs['Color'] = item.color;
    if (item.size) specs['Size'] = item.size;
    if (item.model) specs['Model'] = item.model;

    // Get lowest offer price if available
    let price = null;
    let currency = 'USD';
    if (item.offers && item.offers.length > 0) {
      const offer = item.offers.find(o => o.price) || item.offers[0];
      if (offer.price) price = offer.price;
      if (offer.currency) currency = offer.currency;
    }

    // Clean up description — UPCitemdb often dumps specs into description
    let cleanDesc = item.description || null;
    if (cleanDesc && cleanDesc.length > 500) {
      // Likely a spec dump — truncate to first meaningful sentence
      const firstBreak = cleanDesc.search(/Features|Specifications|Dimensions|Overall|Frame Material/i);
      if (firstBreak > 20) cleanDesc = cleanDesc.slice(0, firstBreak).trim();
      else if (firstBreak >= 0) cleanDesc = null;
    }

    // Clean category — strip anything after first category-like segment
    let cleanCategory = item.category || null;
    if (cleanCategory) {
      // Take only the last segment if it's a breadcrumb path (e.g. "Home > Furniture > Chairs")
      const parts = cleanCategory.split('>').map(s => s.trim()).filter(Boolean);
      cleanCategory = parts[parts.length - 1] || cleanCategory;
      // If it's still too long (spec dump), discard it
      if (cleanCategory.length > 100) cleanCategory = null;
    }

    return {
      name: item.title || null,
      brand: item.brand || null,
      description: cleanDesc,
      category: cleanCategory,
      source: {
        source_name: 'UPC Database',
        source_url: `https://www.upcitemdb.com/upc/${barcode}`,
        price: price,
        currency: currency,
        weight: item.weight || null,
        color: item.color || null,
        description: item.description || null,
        trust_score: 80,
        specs: Object.keys(specs).length > 0 ? specs : null,
      },
      images,
    };
  } catch (err) {
    console.error('UPCitemdb fetch error:', err.message);
    return null;
  }
}

// Search by barcode (with caching)
router.get('/search/:barcode', auth, async (req, res) => {
  try {
    const { barcode } = req.params;
    const startTime = Date.now();

    // Check cache first
    const [cached] = await db.query(
      'SELECT * FROM products WHERE barcode = ? AND cache_expires_at > NOW()',
      [barcode]
    );

    if (cached.length > 0) {
      // Cache hit — increment search count
      await db.query('UPDATE products SET search_count = search_count + 1 WHERE id = ?', [cached[0].id]);

      // Get sources, images, conflicts
      const [sources] = await db.query('SELECT * FROM product_sources WHERE product_id = ?', [cached[0].id]);
      const [images] = await db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [cached[0].id]);
      const [conflicts] = await db.query('SELECT * FROM conflicts WHERE product_id = ?', [cached[0].id]);

      // Log search
      await db.query(
        'INSERT INTO search_history (store_id, user_id, barcode, search_type, cache_hit, response_time_ms) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.store_id, req.user.id, barcode, 'barcode', true, Date.now() - startTime]
      );

      return res.json({
        product: cached[0],
        sources,
        images,
        conflicts,
        cache_hit: true
      });
    }

    // Cache miss — try multiple barcode APIs
    const [offData, upcData] = await Promise.all([
      fetchFromOpenFoodFacts(barcode),
      fetchFromUPCitemdb(barcode),
    ]);

    // Pick the best primary result (prefer whichever has a name)
    const primary = (offData?.name ? offData : null) || (upcData?.name ? upcData : null);

    if (!primary) {
      // Not found anywhere — log and return null
      await db.query(
        'INSERT INTO search_history (store_id, user_id, barcode, search_type, cache_hit, response_time_ms) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.store_id, req.user.id, barcode, 'barcode', false, Date.now() - startTime]
      );
      return res.json({ product: null, cache_hit: false });
    }

    // Merge data from both sources
    const allSources = [];
    const allImages = [];
    if (offData?.name) { allSources.push(offData.source); allImages.push(...offData.images); }
    if (upcData?.name) { allSources.push(upcData.source); allImages.push(...upcData.images); }

    // Pick best category from API data
    const apiCategory = primary.category || (offData?.category) || (upcData?.category) || null;

    // Save product to DB cache (update if exists, insert if new)
    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);

    const [existing] = await db.query('SELECT id FROM products WHERE barcode = ?', [barcode]);
    let productId;

    if (existing.length > 0) {
      productId = existing[0].id;
      await db.query(
        `UPDATE products SET name = ?, brand = ?, description = ?, ai_category_suggestion = COALESCE(ai_category_suggestion, ?), search_count = search_count + 1, cached_at = NOW(), cache_expires_at = ? WHERE id = ?`,
        [primary.name, primary.brand, primary.description, apiCategory, cacheExpiry, productId]
      );
      // Clear old sources/images for refresh
      await db.query('DELETE FROM product_sources WHERE product_id = ?', [productId]);
      await db.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
    } else {
      const [insertResult] = await db.query(
        `INSERT INTO products (barcode, name, brand, description, ai_category_suggestion, cache_expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [barcode, primary.name, primary.brand, primary.description, apiCategory, cacheExpiry]
      );
      productId = insertResult.insertId;
    }

    // Save all sources
    for (const src of allSources) {
      await db.query(
        `INSERT INTO product_sources (product_id, source_name, source_url, price, currency, weight, color, description, trust_score, specs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [productId, src.source_name, src.source_url, src.price || null, src.currency || 'USD',
         src.weight || null, src.color || null, src.description || null, src.trust_score,
         src.specs ? JSON.stringify(src.specs) : null]
      );
    }

    // Save all images (deduplicated)
    const seenUrls = new Set();
    let imgOrder = 0;
    for (const img of allImages) {
      if (seenUrls.has(img.image_url)) continue;
      seenUrls.add(img.image_url);
      await db.query(
        'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
        [productId, img.source_name, img.image_url, img.quality_score, imgOrder++]
      );
    }

    // Fetch back full data
    const [product] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
    const [sources] = await db.query('SELECT * FROM product_sources WHERE product_id = ?', [productId]);
    const [images] = await db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [productId]);
    const [conflicts] = await db.query('SELECT * FROM conflicts WHERE product_id = ?', [productId]);

    // Log search
    await db.query(
      'INSERT INTO search_history (store_id, user_id, barcode, search_type, cache_hit, response_time_ms) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.store_id, req.user.id, barcode, 'barcode', false, Date.now() - startTime]
    );

    res.json({ product: product[0], sources, images, conflicts, cache_hit: false });
  } catch (err) {
    console.error('Product search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save product (after API fetch — stores in cache)
router.post('/', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { barcode, name, brand, description, category, sources, images, ai_descriptions, seo_tags } = req.body;

    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

    // Insert or update product
    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);

    const [existing] = await db.query('SELECT id FROM products WHERE barcode = ?', [barcode]);

    let productId;
    if (existing.length > 0) {
      productId = existing[0].id;
      await db.query(
        `UPDATE products SET name = ?, brand = ?, description = ?,
         ai_description_professional = ?, ai_description_friendly = ?, ai_description_luxury = ?,
         seo_tags = ?, search_count = search_count + 1, cached_at = NOW(), cache_expires_at = ?
         WHERE id = ?`,
        [name, brand, description,
         ai_descriptions?.professional, ai_descriptions?.friendly, ai_descriptions?.luxury,
         JSON.stringify(seo_tags), cacheExpiry, productId]
      );
      // Clear old sources/images/conflicts for refresh
      await db.query('DELETE FROM product_sources WHERE product_id = ?', [productId]);
      await db.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
      await db.query('DELETE FROM conflicts WHERE product_id = ?', [productId]);
    } else {
      const [result] = await db.query(
        `INSERT INTO products (barcode, name, brand, description,
         ai_description_professional, ai_description_friendly, ai_description_luxury,
         seo_tags, cache_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [barcode, name, brand, description,
         ai_descriptions?.professional, ai_descriptions?.friendly, ai_descriptions?.luxury,
         JSON.stringify(seo_tags), cacheExpiry]
      );
      productId = result.insertId;
    }

    // Save sources
    if (sources && sources.length > 0) {
      for (const src of sources) {
        await db.query(
          `INSERT INTO product_sources (product_id, source_name, source_url, price, currency, weight, color, description, specs, trust_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [productId, src.source_name, src.source_url, src.price, src.currency || 'USD',
           src.weight, src.color, src.description, typeof src.specs === 'string' ? src.specs : JSON.stringify(src.specs), src.trust_score || 0]
        );
      }
    }

    // Save images
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        await db.query(
          'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
          [productId, images[i].source_name, images[i].image_url, images[i].quality_score, i]
        );
      }
    }

    // Detect conflicts across sources
    const [savedSources] = await db.query('SELECT * FROM product_sources WHERE product_id = ?', [productId]);
    const conflictFields = ['price', 'weight', 'color'];

    for (const field of conflictFields) {
      const values = {};
      for (const src of savedSources) {
        if (src[field] != null && src[field] !== '') {
          const val = String(src[field]);
          if (!values[val]) values[val] = [];
          values[val].push(src.source_name);
        }
      }
      // If more than one distinct value, it's a conflict
      if (Object.keys(values).length > 1) {
        await db.query(
          'INSERT INTO conflicts (product_id, field_name, source_values) VALUES (?, ?, ?)',
          [productId, field, JSON.stringify(values)]
        );
      }
    }

    // Return full product
    const [product] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
    const [productSources] = await db.query('SELECT * FROM product_sources WHERE product_id = ?', [productId]);
    const [productImages] = await db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [productId]);
    const [conflicts] = await db.query('SELECT * FROM conflicts WHERE product_id = ?', [productId]);

    res.status(201).json({ product: product[0], sources: productSources, images: productImages, conflicts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save for later (saves product + creates catalog entry with Review status)
router.post('/save-for-later', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { product: p, sources, images, enriched } = req.body;
    if (!p?.name) return res.status(400).json({ error: 'Product name is required' });

    const barcode = p.barcode || `AI-${Date.now()}`;
    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);

    // Insert or update product
    const [existing] = await db.query('SELECT id FROM products WHERE barcode = ?', [barcode]);
    let productId;

    if (existing.length > 0) {
      productId = existing[0].id;
      await db.query(
        `UPDATE products SET name = ?, brand = ?, description = ?,
         ai_description_professional = ?, ai_description_friendly = ?, ai_description_luxury = ?,
         ai_category_suggestion = ?, ai_attributes = ?, seo_tags = ?, cached_at = NOW(), cache_expires_at = ?
         WHERE id = ?`,
        [p.name, p.brand, p.description,
         p.ai_description_professional || null, p.ai_description_friendly || null, p.ai_description_luxury || null,
         p.ai_category_suggestion || null, p.attributes ? JSON.stringify(p.attributes) : null,
         p.seo_tags ? JSON.stringify(p.seo_tags) : null, cacheExpiry, productId]
      );
    } else {
      const [result] = await db.query(
        `INSERT INTO products (barcode, name, brand, description,
         ai_description_professional, ai_description_friendly, ai_description_luxury,
         ai_category_suggestion, ai_attributes, seo_tags, cache_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [barcode, p.name, p.brand, p.description,
         p.ai_description_professional || null, p.ai_description_friendly || null, p.ai_description_luxury || null,
         p.ai_category_suggestion || null, p.attributes ? JSON.stringify(p.attributes) : null,
         p.seo_tags ? JSON.stringify(p.seo_tags) : null, cacheExpiry]
      );
      productId = result.insertId;
    }

    // Save images (skip base64)
    if (images?.length > 0) {
      await db.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
      for (let i = 0; i < images.length; i++) {
        const url = images[i].image_url || images[i].url;
        if (url && !url.startsWith('data:')) {
          await db.query(
            'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
            [productId, images[i].source_name || 'Web', url, images[i].quality_score || 80, i]
          );
        }
      }
    }

    // Save sources
    if (sources?.length > 0) {
      await db.query('DELETE FROM product_sources WHERE product_id = ?', [productId]);
      for (const src of sources) {
        if (!src.source_name) continue;
        try {
          await db.query(
            `INSERT INTO product_sources (product_id, source_name, source_url, price, currency, weight, description, trust_score, specs)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [productId, src.source_name, src.source_url || null, src.price || null, src.currency || 'USD',
             src.weight || null, src.description || null, src.trust_score || 0, src.specs ? (typeof src.specs === 'string' ? src.specs : JSON.stringify(src.specs)) : null]
          );
        } catch {}
      }
    }

    // Create or update catalog entry with "Review" status
    const [existingEntry] = await db.query(
      'SELECT id FROM catalog_entries WHERE store_id = ? AND product_id = ?',
      [req.user.store_id, productId]
    );
    if (existingEntry.length === 0) {
      await db.query(
        `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_description, custom_price)
         VALUES (?, ?, ?, 'Review', ?, ?, ?)`,
        [req.user.store_id, req.user.id, productId, p.name, p.edited_description || p.description || null, enriched?.price || null]
      );
    } else {
      await db.query(
        "UPDATE catalog_entries SET status = 'Review', custom_name = ?, custom_description = ?, custom_price = ?, updated_at = NOW() WHERE id = ?",
        [p.name, p.edited_description || p.description || null, enriched?.price || null, existingEntry[0].id]
      );
    }

    res.status(201).json({ success: true, productId });
  } catch (err) {
    console.error('Save for later error:', err.message);
    res.status(500).json({ error: 'Failed to save product: ' + err.message });
  }
});

// Resolve a conflict
router.patch('/conflicts/:id/resolve', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const chosen_value = req.body.chosen_value ? sanitize(String(req.body.chosen_value)).slice(0, 500) : null;
    await db.query(
      'UPDATE conflicts SET is_resolved = TRUE, chosen_value = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?',
      [chosen_value, req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Force refresh (ignore cache)
router.post('/refresh/:barcode', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    await db.query('UPDATE products SET cache_expires_at = NOW() WHERE barcode = ?', [req.params.barcode]);
    res.json({ success: true, message: 'Cache cleared — next search will fetch fresh data' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's catalog entries
router.get('/catalog', auth, async (req, res) => {
  try {
    const [entries] = await db.query(
      `SELECT ce.*, p.barcode, p.name, p.brand, p.description
       FROM catalog_entries ce
       JOIN products p ON ce.product_id = p.id
       WHERE ce.store_id = ?
       ORDER BY ce.updated_at DESC`,
      [req.user.store_id]
    );
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Save to catalog
router.post('/catalog', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { product_id, custom_name: rawName, custom_description: rawDesc, custom_price, brand_voice, notes: rawNotes } = req.body;
    const custom_name = rawName ? sanitize(rawName).slice(0, 200) : null;
    const custom_description = rawDesc ? sanitize(rawDesc).slice(0, 5000) : null;
    const notes = rawNotes ? sanitize(rawNotes).slice(0, 2000) : null;
    const [result] = await db.query(
      `INSERT INTO catalog_entries (store_id, user_id, product_id, custom_name, custom_description, custom_price, brand_voice, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.store_id, req.user.id, product_id, custom_name, custom_description, custom_price, brand_voice, notes]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update catalog entry (status, custom fields)
router.patch('/catalog/:id', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { status, custom_name: rawName, custom_description: rawDesc, custom_price } = req.body;
    const validStatuses = ['Draft', 'Review', 'Published', 'Exported'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const fields = [];
    const values = [];
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (rawName !== undefined) { fields.push('custom_name = ?'); values.push(sanitize(rawName).slice(0, 200)); }
    if (rawDesc !== undefined) { fields.push('custom_description = ?'); values.push(sanitize(rawDesc).slice(0, 5000)); }
    if (custom_price !== undefined) { fields.push('custom_price = ?'); values.push(custom_price); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push('updated_at = NOW()');
    values.push(req.params.id, req.user.store_id);
    await db.query(`UPDATE catalog_entries SET ${fields.join(', ')} WHERE id = ? AND store_id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete catalog entry
router.delete('/catalog/:id', auth, requireRole('Admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM catalog_entries WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get product by ID (for catalog view/edit) — must be after /catalog to avoid conflict
router.get('/:id', auth, async (req, res) => {
  try {
    const [product] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product[0]) return res.status(404).json({ error: 'Product not found' });
    const [sources] = await db.query('SELECT * FROM product_sources WHERE product_id = ?', [req.params.id]);
    const [images] = await db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [req.params.id]);
    const [conflicts] = await db.query('SELECT * FROM conflicts WHERE product_id = ?', [req.params.id]);
    res.json({ product: product[0], sources, images, conflicts });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
