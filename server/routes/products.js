const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { sanitize } = require('../middleware/validate');
const logActivity = require('../helpers/activity');

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

    // Cache miss — try multiple barcode APIs in parallel
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

    // Record price history for sources with prices
    for (const src of allSources) {
      if (src.price) {
        try {
          await db.query(
            'INSERT INTO price_history (store_id, product_id, source_name, price, currency) VALUES (?, ?, ?, ?, ?)',
            [req.user.store_id, productId, src.source_name, src.price, src.currency || 'USD']
          );
        } catch {}
      }
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

    // Save images — only persist http(s) URLs, reject data:/javascript:/etc.
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const url = images[i].image_url;
        if (!url || !/^https?:\/\//i.test(url)) continue;
        await db.query(
          'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
          [productId, images[i].source_name, url, images[i].quality_score, i]
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
        // Only persist http(s) URLs — reject data:, javascript:, etc.
        if (url && /^https?:\/\//i.test(url)) {
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

    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'saved', entity_type: 'product', entity_id: productId, entity_name: p.name });
    res.status(201).json({ success: true, productId });
  } catch (err) {
    console.error('Save for later error:', err.message);
    res.status(500).json({ error: 'Failed to save product: ' + err.message });
  }
});

// Resolve a conflict
router.patch('/conflicts/:id/resolve', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const [allowed] = await db.query(
      `SELECT c.id FROM conflicts c
       JOIN catalog_entries ce ON ce.product_id = c.product_id
       WHERE c.id = ? AND ce.store_id = ?`,
      [req.params.id, req.user.store_id]
    );
    if (allowed.length === 0) return res.status(404).json({ error: 'Conflict not found' });
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

// Force refresh (ignore cache) — only for products in caller's catalog or unclaimed cache
router.post('/refresh/:barcode', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const [allowed] = await db.query(
      `SELECT p.id FROM products p
       LEFT JOIN catalog_entries ce ON ce.product_id = p.id AND ce.store_id = ?
       WHERE p.barcode = ? AND (ce.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM catalog_entries WHERE product_id = p.id))`,
      [req.user.store_id, req.params.barcode]
    );
    if (allowed.length === 0) return res.status(404).json({ error: 'Product not found' });
    await db.query('UPDATE products SET cache_expires_at = NOW() WHERE id = ?', [allowed[0].id]);
    res.json({ success: true, message: 'Cache cleared — next search will fetch fresh data' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Compute completeness score for a catalog entry + product row
function calcCompleteness(entry) {
  let score = 0;
  const issues = [];
  // Name (15%)
  if (entry.custom_name || entry.name) score += 15;
  else issues.push('Missing product name');
  // Description (20%)
  if (entry.custom_description || entry.description || entry.ai_description_professional) score += 20;
  else issues.push('Missing description');
  // Price (15%)
  if (entry.custom_price) score += 15;
  else issues.push('No price set');
  // Images (20%)
  const imgs = entry.selected_images ? (typeof entry.selected_images === 'string' ? JSON.parse(entry.selected_images || '[]') : entry.selected_images) : [];
  if (entry.image_count > 0 || imgs.length > 0) score += 20;
  else issues.push('No product images');
  // Category (15%)
  if (entry.ai_category_suggestion) score += 15;
  else issues.push('No category assigned');
  // SEO tags (15%)
  const tags = entry.seo_tags ? (typeof entry.seo_tags === 'string' ? JSON.parse(entry.seo_tags || '[]') : entry.seo_tags) : [];
  if (tags.length > 0) score += 15;
  else issues.push('No SEO tags');
  return { score, issues };
}

// Get user's catalog entries
router.get('/catalog', auth, async (req, res) => {
  try {
    const [entries] = await db.query(
      `SELECT ce.*, p.barcode, p.name, p.brand, p.description,
              p.ai_description_professional, p.ai_category_suggestion, p.seo_tags,
              (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS image_count,
              (SELECT COUNT(*) FROM product_variants pv WHERE pv.catalog_entry_id = ce.id) AS variant_count,
              (SELECT COALESCE(SUM(pv.stock_quantity),0) FROM product_variants pv WHERE pv.catalog_entry_id = ce.id) AS variant_stock
       FROM catalog_entries ce
       JOIN products p ON ce.product_id = p.id
       WHERE ce.store_id = ?
       ORDER BY ce.updated_at DESC`,
      [req.user.store_id]
    );

    // Bulk-load tag assignments per entry so the dashboard can render tag chips
    // and the tag-filter pill without N+1 round trips.
    const entryIds = entries.map(e => e.id);
    const tagMap = {};
    if (entryIds.length > 0) {
      const [tagRows] = await db.query(
        `SELECT cet.catalog_entry_id, cet.tag_id
         FROM catalog_entry_tags cet
         JOIN tags t ON t.id = cet.tag_id
         WHERE t.store_id = ? AND cet.catalog_entry_id IN (?)`,
        [req.user.store_id, entryIds]
      );
      for (const r of tagRows) {
        if (!tagMap[r.catalog_entry_id]) tagMap[r.catalog_entry_id] = [];
        tagMap[r.catalog_entry_id].push(r.tag_id);
      }
    }

    const enriched = entries.map(e => {
      const { score, issues } = calcCompleteness(e);
      return { ...e, completeness: score, completeness_issues: issues, tag_ids: tagMap[e.id] || [] };
    });
    res.json({ entries: enriched });
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

// Update catalog entry (status, custom fields, stock)
router.patch('/catalog/:id', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { status, custom_name: rawName, custom_description: rawDesc, custom_price, stock_quantity, low_stock_threshold } = req.body;
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
    if (stock_quantity !== undefined) {
      const n = stock_quantity === null || stock_quantity === '' ? null : parseInt(stock_quantity, 10);
      if (n !== null && (isNaN(n) || n < 0)) return res.status(400).json({ error: 'Invalid stock_quantity' });
      fields.push('stock_quantity = ?'); values.push(n);
    }
    if (low_stock_threshold !== undefined) {
      const n = low_stock_threshold === null || low_stock_threshold === '' ? null : parseInt(low_stock_threshold, 10);
      if (n !== null && (isNaN(n) || n < 0)) return res.status(400).json({ error: 'Invalid low_stock_threshold' });
      fields.push('low_stock_threshold = ?'); values.push(n);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push('updated_at = NOW()');
    values.push(req.params.id, req.user.store_id);
    await db.query(`UPDATE catalog_entries SET ${fields.join(', ')} WHERE id = ? AND store_id = ?`, values);
    const changes = {};
    if (status !== undefined) changes.status = status;
    if (rawName !== undefined) changes.name = sanitize(rawName).slice(0, 200);
    if (custom_price !== undefined) changes.price = custom_price;
    if (stock_quantity !== undefined) changes.stock_quantity = stock_quantity;
    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'updated', entity_type: 'catalog_entry', entity_id: parseInt(req.params.id, 10), entity_name: rawName || null, details: changes });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete catalog entry
router.delete('/catalog/:id', auth, requireRole('Admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM catalog_entries WHERE id = ? AND store_id = ?', [req.params.id, req.user.store_id]);
    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'deleted', entity_type: 'catalog_entry', entity_id: parseInt(req.params.id, 10) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PRODUCT VARIANTS ──
async function ensureEntryInStore(entryId, storeId) {
  const [rows] = await db.query('SELECT id FROM catalog_entries WHERE id = ? AND store_id = ?', [entryId, storeId]);
  return rows.length > 0;
}

router.get('/catalog/:id/variants', auth, async (req, res) => {
  try {
    if (!(await ensureEntryInStore(req.params.id, req.user.store_id))) return res.status(404).json({ error: 'Not found' });
    const [variants] = await db.query('SELECT * FROM product_variants WHERE catalog_entry_id = ? ORDER BY id ASC', [req.params.id]);
    res.json({ variants: variants.map(v => ({ ...v, option_values: typeof v.option_values === 'string' ? JSON.parse(v.option_values || '{}') : (v.option_values || {}) })) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/catalog/:id/variants', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    if (!(await ensureEntryInStore(req.params.id, req.user.store_id))) return res.status(404).json({ error: 'Not found' });
    const { variant_name: rawName, option_values, sku: rawSku, price, stock_quantity } = req.body;
    if (!rawName || typeof rawName !== 'string') return res.status(400).json({ error: 'variant_name required' });
    const variant_name = sanitize(rawName).slice(0, 255);
    const sku = rawSku ? sanitize(String(rawSku)).slice(0, 100) : null;
    const priceVal = price === undefined || price === null || price === '' ? null : parseFloat(price);
    if (priceVal !== null && (isNaN(priceVal) || priceVal < 0)) return res.status(400).json({ error: 'Invalid price' });
    const stockVal = stock_quantity === undefined || stock_quantity === null || stock_quantity === '' ? 0 : parseInt(stock_quantity, 10);
    if (isNaN(stockVal) || stockVal < 0) return res.status(400).json({ error: 'Invalid stock_quantity' });
    const opts = option_values && typeof option_values === 'object' ? JSON.stringify(option_values) : null;
    const [result] = await db.query(
      'INSERT INTO product_variants (catalog_entry_id, variant_name, option_values, sku, price, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, variant_name, opts, sku, priceVal, stockVal]
    );
    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'created', entity_type: 'variant', entity_id: result.insertId, entity_name: variant_name });
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/variants/:vid', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const [[variant]] = await db.query(
      `SELECT pv.id FROM product_variants pv JOIN catalog_entries ce ON ce.id = pv.catalog_entry_id WHERE pv.id = ? AND ce.store_id = ?`,
      [req.params.vid, req.user.store_id]
    );
    if (!variant) return res.status(404).json({ error: 'Not found' });
    const { variant_name, option_values, sku, price, stock_quantity } = req.body;
    const fields = [], values = [];
    if (variant_name !== undefined) { fields.push('variant_name = ?'); values.push(sanitize(String(variant_name)).slice(0, 255)); }
    if (option_values !== undefined) { fields.push('option_values = ?'); values.push(option_values ? JSON.stringify(option_values) : null); }
    if (sku !== undefined) { fields.push('sku = ?'); values.push(sku ? sanitize(String(sku)).slice(0, 100) : null); }
    if (price !== undefined) {
      const p = price === null || price === '' ? null : parseFloat(price);
      if (p !== null && (isNaN(p) || p < 0)) return res.status(400).json({ error: 'Invalid price' });
      fields.push('price = ?'); values.push(p);
    }
    if (stock_quantity !== undefined) {
      const n = stock_quantity === null || stock_quantity === '' ? 0 : parseInt(stock_quantity, 10);
      if (isNaN(n) || n < 0) return res.status(400).json({ error: 'Invalid stock_quantity' });
      fields.push('stock_quantity = ?'); values.push(n);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields' });
    values.push(req.params.vid);
    await db.query(`UPDATE product_variants SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/variants/:vid', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const [result] = await db.query(
      `DELETE pv FROM product_variants pv JOIN catalog_entries ce ON ce.id = pv.catalog_entry_id WHERE pv.id = ? AND ce.store_id = ?`,
      [req.params.vid, req.user.store_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── BULK IMPORT ──
router.post('/bulk-import', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { rows, mapping } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No data to import' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 rows per import' });
    }

    const results = { imported: 0, skipped: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const name = (row[mapping.name] || '').trim();
        const barcode = (row[mapping.barcode] || '').trim();
        const description = mapping.description ? (row[mapping.description] || '').trim() : null;
        let price = null;
        if (mapping.price) {
          const parsed = parseFloat(String(row[mapping.price]).replace(/[^0-9.]/g, ''));
          if (!isNaN(parsed) && parsed >= 0) price = parsed;
        }
        const brand = mapping.brand ? (row[mapping.brand] || '').trim() : null;
        const category = mapping.category ? (row[mapping.category] || '').trim() : null;

        if (!name && !barcode) {
          results.skipped++;
          results.errors.push({ row: i + 1, error: 'Missing both name and barcode' });
          continue;
        }

        // Find or create product
        let productId;
        if (barcode) {
          const [existing] = await db.query('SELECT id FROM products WHERE barcode = ?', [barcode]);
          if (existing.length > 0) {
            productId = existing[0].id;
          } else {
            const [ins] = await db.query(
              `INSERT INTO products (barcode, name, brand, description, ai_category_suggestion) VALUES (?, ?, ?, ?, ?)`,
              [barcode, sanitize(name).slice(0, 255), brand ? sanitize(brand).slice(0, 255) : null, description ? sanitize(description).slice(0, 5000) : null, category ? sanitize(category).slice(0, 255) : null]
            );
            productId = ins.insertId;
          }
        } else {
          // No barcode — generate a placeholder
          const placeholder = `IMPORT-${Date.now()}-${i}`;
          const [ins] = await db.query(
            `INSERT INTO products (barcode, name, brand, description, ai_category_suggestion) VALUES (?, ?, ?, ?, ?)`,
            [placeholder, sanitize(name).slice(0, 255), brand ? sanitize(brand).slice(0, 255) : null, description ? sanitize(description).slice(0, 5000) : null, category ? sanitize(category).slice(0, 255) : null]
          );
          productId = ins.insertId;
        }

        // Check if catalog entry already exists for this store
        const [existingEntry] = await db.query(
          'SELECT id FROM catalog_entries WHERE store_id = ? AND product_id = ?',
          [req.user.store_id, productId]
        );

        if (existingEntry.length > 0) {
          // Update existing — sanitize like the INSERT branch does
          const safeName = name ? sanitize(name).slice(0, 255) : null;
          const safeDesc = description ? sanitize(description).slice(0, 5000) : null;
          await db.query(
            `UPDATE catalog_entries SET custom_name = COALESCE(?, custom_name), custom_description = COALESCE(?, custom_description), custom_price = COALESCE(?, custom_price), updated_at = NOW() WHERE id = ?`,
            [safeName, safeDesc, price, existingEntry[0].id]
          );
        } else {
          await db.query(
            `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_description, custom_price) VALUES (?, ?, ?, 'Draft', ?, ?, ?)`,
            [req.user.store_id, req.user.id, productId, sanitize(name).slice(0, 255) || null, description ? sanitize(description).slice(0, 5000) : null, price]
          );
        }

        results.imported++;
      } catch (err) {
        results.failed++;
        results.errors.push({ row: i + 1, error: err.message });
      }
    }

    if (results.imported > 0) logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'imported', entity_type: 'bulk_import', details: { imported: results.imported, skipped: results.skipped, failed: results.failed } });
    res.json(results);
  } catch (err) {
    console.error('Bulk import error:', err.message);
    res.status(500).json({ error: 'Bulk import failed: ' + err.message });
  }
});

// Get product by ID (for catalog view/edit) — must be after /catalog to avoid conflict
router.get('/:id', auth, async (req, res) => {
  try {
    // Allow only if the product is in this store's catalog, or still uncalimed in global cache.
    const [product] = await db.query(
      `SELECT p.* FROM products p
       LEFT JOIN catalog_entries ce ON ce.product_id = p.id AND ce.store_id = ?
       WHERE p.id = ? AND (ce.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM catalog_entries WHERE product_id = p.id))`,
      [req.user.store_id, req.params.id]
    );
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
