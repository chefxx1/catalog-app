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
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?lc=en&cc=us`);
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
    if (p.ingredients_text_en || p.ingredients_text) specs['Ingredients'] = p.ingredients_text_en || p.ingredients_text;
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
      name: p.product_name_en || p.product_name || null,
      brand: p.brands || null,
      description: p.generic_name_en || p.generic_name || null,
      category: p.categories_en || p.categories || null,
      quantity: p.quantity || null,
      source: {
        source_name: 'Open Food Facts',
        source_url: `https://world.openfoodfacts.org/product/${barcode}`,
        weight: p.quantity || null,
        description: p.generic_name_en || p.generic_name || null,
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

      // Strip cached AI descriptions if language doesn't match the user's locale.
      // Frontend auto-regenerates when ai_description_professional is null.
      const requestedLang = (req.query.lang || 'English').toString();
      const cachedProduct = { ...cached[0] };
      if (cachedProduct.ai_description_language && cachedProduct.ai_description_language !== requestedLang) {
        cachedProduct.ai_description_professional = null;
        cachedProduct.ai_description_friendly = null;
        cachedProduct.ai_description_luxury = null;
      }

      return res.json({
        product: cachedProduct,
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
    const { barcode, name, brand, description, category, sources, images, ai_descriptions, seo_tags, language } = req.body;

    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

    // Insert or update product
    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);

    const aiLang = language || 'English';

    const [existing] = await db.query('SELECT id FROM products WHERE barcode = ?', [barcode]);

    let productId;
    if (existing.length > 0) {
      productId = existing[0].id;
      await db.query(
        `UPDATE products SET name = ?, brand = ?, description = ?,
         ai_description_professional = ?, ai_description_friendly = ?, ai_description_luxury = ?,
         ai_description_language = ?,
         seo_tags = ?, search_count = search_count + 1, cached_at = NOW(), cache_expires_at = ?
         WHERE id = ?`,
        [name, brand, description,
         ai_descriptions?.professional, ai_descriptions?.friendly, ai_descriptions?.luxury,
         aiLang,
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
         ai_description_language,
         seo_tags, cache_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [barcode, name, brand, description,
         ai_descriptions?.professional, ai_descriptions?.friendly, ai_descriptions?.luxury,
         aiLang,
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
    const { product: p, sources, images, enriched, language } = req.body;
    if (!p?.name) return res.status(400).json({ error: 'Product name is required' });

    const barcode = p.barcode || `AI-${Date.now()}`;
    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);
    const aiLang = language || 'English';

    // Insert or update product
    const [existing] = await db.query('SELECT id FROM products WHERE barcode = ?', [barcode]);
    let productId;

    if (existing.length > 0) {
      productId = existing[0].id;
      await db.query(
        `UPDATE products SET name = ?, brand = ?, description = ?,
         ai_description_professional = ?, ai_description_friendly = ?, ai_description_luxury = ?,
         ai_description_language = ?,
         ai_category_suggestion = ?, ai_attributes = ?, seo_tags = ?, cached_at = NOW(), cache_expires_at = ?
         WHERE id = ?`,
        [p.name, p.brand, p.description,
         p.ai_description_professional || null, p.ai_description_friendly || null, p.ai_description_luxury || null,
         aiLang,
         p.ai_category_suggestion || null, p.attributes ? JSON.stringify(p.attributes) : null,
         p.seo_tags ? JSON.stringify(p.seo_tags) : null, cacheExpiry, productId]
      );
    } else {
      const [result] = await db.query(
        `INSERT INTO products (barcode, name, brand, description,
         ai_description_professional, ai_description_friendly, ai_description_luxury,
         ai_description_language,
         ai_category_suggestion, ai_attributes, seo_tags, cache_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [barcode, p.name, p.brand, p.description,
         p.ai_description_professional || null, p.ai_description_friendly || null, p.ai_description_luxury || null,
         aiLang,
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

    // Coerce price strings like "$29.99" / "29,99 USD" → 29.99; invalid → NULL
    const cleanPrice = (() => {
      const raw = enriched?.price;
      if (raw === null || raw === undefined || raw === '') return null;
      const cleaned = String(raw).replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
      const n = parseFloat(cleaned);
      return isNaN(n) || n < 0 ? null : n;
    })();

    // Create or update catalog entry with "Review" status
    const [existingEntry] = await db.query(
      'SELECT id FROM catalog_entries WHERE store_id = ? AND product_id = ?',
      [req.user.store_id, productId]
    );
    if (existingEntry.length === 0) {
      await db.query(
        `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_description, custom_price)
         VALUES (?, ?, ?, 'Review', ?, ?, ?)`,
        [req.user.store_id, req.user.id, productId, p.name, p.edited_description || p.description || null, cleanPrice]
      );
    } else {
      await db.query(
        "UPDATE catalog_entries SET status = 'Review', custom_name = ?, custom_description = ?, custom_price = ?, updated_at = NOW() WHERE id = ?",
        [p.name, p.edited_description || p.description || null, cleanPrice, existingEntry[0].id]
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
              p.ai_description_professional, p.ai_category_suggestion, p.seo_tags
       FROM catalog_entries ce
       JOIN products p ON ce.product_id = p.id
       WHERE ce.store_id = ?
       ORDER BY ce.updated_at DESC`,
      [req.user.store_id]
    );

    // Bulk-load per-row aggregates so we don't run correlated subqueries per
    // entry. Tags and image counts are each one IN-query.
    const entryIds = entries.map(e => e.id);
    const productIds = [...new Set(entries.map(e => e.product_id))];
    const tagMap = {};
    const imgCountMap = {};

    if (entryIds.length > 0) {
      const [tagRows, imgRows] = await Promise.all([
        db.query(
          `SELECT cet.catalog_entry_id, cet.tag_id
           FROM catalog_entry_tags cet
           JOIN tags t ON t.id = cet.tag_id
           WHERE t.store_id = ? AND cet.catalog_entry_id IN (?)`,
          [req.user.store_id, entryIds]
        ),
        db.query(
          `SELECT product_id, COUNT(*) AS cnt
           FROM product_images
           WHERE product_id IN (?)
           GROUP BY product_id`,
          [productIds]
        ),
      ]);

      for (const r of tagRows[0]) {
        if (!tagMap[r.catalog_entry_id]) tagMap[r.catalog_entry_id] = [];
        tagMap[r.catalog_entry_id].push(r.tag_id);
      }
      for (const r of imgRows[0]) imgCountMap[r.product_id] = Number(r.cnt);
    }

    const enriched = entries.map(e => {
      const withCounts = { ...e, image_count: imgCountMap[e.product_id] || 0 };
      const { score, issues } = calcCompleteness(withCounts);
      return { ...withCounts, completeness: score, completeness_issues: issues, tag_ids: tagMap[e.id] || [] };
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
    if (rawName !== undefined) {
      fields.push('custom_name = ?');
      values.push(rawName == null ? null : sanitize(String(rawName)).slice(0, 200));
    }
    if (rawDesc !== undefined) {
      fields.push('custom_description = ?');
      values.push(rawDesc == null ? null : sanitize(String(rawDesc)).slice(0, 5000));
    }
    if (custom_price !== undefined) {
      // Coerce empty/invalid to NULL; clean "$29.99" → 29.99 so MySQL DECIMAL doesn't choke
      let priceVal = null;
      if (custom_price !== null && custom_price !== '') {
        const cleaned = String(custom_price).replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
        const n = parseFloat(cleaned);
        if (!isNaN(n) && n >= 0) priceVal = n;
      }
      fields.push('custom_price = ?');
      values.push(priceVal);
    }
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
    if (rawName !== undefined) changes.name = rawName == null ? null : sanitize(String(rawName)).slice(0, 200);
    if (custom_price !== undefined) changes.price = custom_price;
    if (stock_quantity !== undefined) changes.stock_quantity = stock_quantity;
    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'updated', entity_type: 'catalog_entry', entity_id: parseInt(req.params.id, 10), entity_name: rawName || null, details: changes });
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /catalog/:id failed:', err.message, { body: req.body });
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

// Helper shared by translations — verify entry belongs to caller's store
async function ensureEntryInStore(entryId, storeId) {
  const [rows] = await db.query('SELECT id FROM catalog_entries WHERE id = ? AND store_id = ?', [entryId, storeId]);
  return rows.length > 0;
}

// ── PRODUCT TRANSLATIONS ──
const { GoogleGenerativeAI } = require('@google/generative-ai');
const SUPPORTED_LANGUAGES = new Set(['English', 'Arabic', 'French', 'Spanish', 'German', 'Chinese', 'Turkish', 'Portuguese', 'Italian', 'Japanese']);

// GET /api/products/catalog/:id/translations — list saved translations for a product
router.get('/catalog/:id/translations', auth, async (req, res) => {
  try {
    if (!(await ensureEntryInStore(req.params.id, req.user.store_id))) return res.status(404).json({ error: 'Not found' });
    const [[entry]] = await db.query('SELECT product_id FROM catalog_entries WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    const [rows] = await db.query(
      'SELECT language, name, description, meta_title, meta_description, seo_tags, updated_at FROM product_translations WHERE product_id = ? ORDER BY updated_at DESC',
      [entry.product_id]
    );
    res.json({ translations: rows.map(r => ({ ...r, seo_tags: typeof r.seo_tags === 'string' ? JSON.parse(r.seo_tags || '[]') : (r.seo_tags || []) })) });
  } catch (err) {
    console.error('List translations error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/products/catalog/:id/translate — translate and save
router.post('/catalog/:id/translate', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { language } = req.body;
    if (!language || typeof language !== 'string') return res.status(400).json({ error: 'language required' });
    if (!SUPPORTED_LANGUAGES.has(language)) return res.status(400).json({ error: `Unsupported language. Supported: ${[...SUPPORTED_LANGUAGES].join(', ')}` });
    if (!process.env.GEMINI_API_KEY) return res.status(400).json({ error: 'AI API key not configured' });
    if (!(await ensureEntryInStore(req.params.id, req.user.store_id))) return res.status(404).json({ error: 'Not found' });

    const [[entry]] = await db.query(
      `SELECT ce.product_id, ce.custom_name, ce.custom_description,
              p.name AS p_name, p.brand AS p_brand, p.description AS p_description,
              p.ai_description_professional, p.ai_description_friendly
       FROM catalog_entries ce JOIN products p ON ce.product_id = p.id
       WHERE ce.id = ?`,
      [req.params.id]
    );
    if (!entry) return res.status(404).json({ error: 'Not found' });

    const name = entry.custom_name || entry.p_name || '';
    const brand = entry.p_brand || '';
    const description = entry.custom_description || entry.ai_description_professional || entry.p_description || entry.ai_description_friendly || '';
    if (!name) return res.status(400).json({ error: 'Product has no name to translate' });

    // Check cache first — if we already have this language saved, return it
    const [cached] = await db.query(
      'SELECT name, description, meta_title, meta_description, seo_tags, updated_at FROM product_translations WHERE product_id = ? AND language = ?',
      [entry.product_id, language]
    );
    if (cached.length > 0 && !req.body.force) {
      const c = cached[0];
      return res.json({
        language,
        cached: true,
        name: c.name,
        description: c.description,
        metaTitle: c.meta_title,
        metaDescription: c.meta_description,
        seoTags: typeof c.seo_tags === 'string' ? JSON.parse(c.seo_tags || '[]') : (c.seo_tags || []),
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are an expert e-commerce translator and copywriter. Translate and adapt the following product information into ${language}. Don't just translate literally — adapt it to sound natural and compelling for ${language}-speaking customers.

Product: ${name}
${brand ? `Brand: ${brand}` : ''}
${description ? `Description: ${description}` : ''}

Return ONLY a JSON object (no markdown fences):
{
  "name": "Product name in ${language}",
  "description": "Product description in ${language} (2-3 compelling sentences)",
  "metaTitle": "SEO title in ${language} (under 60 chars)",
  "metaDescription": "SEO meta description in ${language} (under 155 chars)",
  "seoTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"]
}

All output must be in ${language}. Make it sound native, not translated.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    let parsed;
    try {
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    const seoTagsJson = JSON.stringify(Array.isArray(parsed.seoTags) ? parsed.seoTags.slice(0, 10) : []);
    await db.query(
      `INSERT INTO product_translations (product_id, language, name, description, meta_title, meta_description, seo_tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), meta_title = VALUES(meta_title), meta_description = VALUES(meta_description), seo_tags = VALUES(seo_tags)`,
      [entry.product_id, language, parsed.name || null, parsed.description || null, parsed.metaTitle || null, parsed.metaDescription || null, seoTagsJson]
    );

    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'translated', entity_type: 'product', entity_id: entry.product_id, entity_name: name, details: { language } });

    res.json({ language, cached: false, ...parsed });
  } catch (err) {
    console.error('Translate error:', err.message);
    res.status(500).json({ error: 'Translation failed: ' + err.message });
  }
});

// DELETE /api/products/catalog/:id/translations/:lang — remove a saved translation
router.delete('/catalog/:id/translations/:lang', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    if (!(await ensureEntryInStore(req.params.id, req.user.store_id))) return res.status(404).json({ error: 'Not found' });
    const [[entry]] = await db.query('SELECT product_id FROM catalog_entries WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    await db.query('DELETE FROM product_translations WHERE product_id = ? AND language = ?', [entry.product_id, req.params.lang]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── BULK IMPORT ──
router.post('/bulk-import', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { rows, mapping, mode: rawMode } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No data to import' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 rows per import' });
    }

    // Duplicate handling: 'skip' leaves existing catalog entries untouched;
    // 'update' overwrites their custom_name / custom_description / custom_price.
    // Default 'skip' so re-uploading a CSV never silently clobbers manual edits.
    const mode = rawMode === 'update' ? 'update' : 'skip';

    const results = { imported: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

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
          if (mode === 'skip') {
            // Leave existing entry alone — report it so user knows
            results.skipped++;
            results.errors.push({ row: i + 1, error: `Skipped: "${name || barcode}" already in catalog` });
            continue;
          }
          // mode === 'update' — overwrite with CSV values (sanitized)
          const safeName = name ? sanitize(name).slice(0, 255) : null;
          const safeDesc = description ? sanitize(description).slice(0, 5000) : null;
          await db.query(
            `UPDATE catalog_entries SET custom_name = COALESCE(?, custom_name), custom_description = COALESCE(?, custom_description), custom_price = COALESCE(?, custom_price), updated_at = NOW() WHERE id = ?`,
            [safeName, safeDesc, price, existingEntry[0].id]
          );
          results.updated++;
        } else {
          await db.query(
            `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_description, custom_price) VALUES (?, ?, ?, 'Draft', ?, ?, ?)`,
            [req.user.store_id, req.user.id, productId, sanitize(name).slice(0, 255) || null, description ? sanitize(description).slice(0, 5000) : null, price]
          );
          results.imported++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ row: i + 1, error: err.message });
      }
    }

    if (results.imported > 0 || results.updated > 0) logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'imported', entity_type: 'bulk_import', details: { imported: results.imported, updated: results.updated, skipped: results.skipped, failed: results.failed } });
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
