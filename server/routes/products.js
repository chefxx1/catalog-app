const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

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
        'INSERT INTO search_history (user_id, barcode, search_type, cache_hit, response_time_ms) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, barcode, 'barcode', true, Date.now() - startTime]
      );

      return res.json({
        product: cached[0],
        sources,
        images,
        conflicts,
        cache_hit: true
      });
    }

    // Cache miss — try Open Food Facts API
    const offData = await fetchFromOpenFoodFacts(barcode);

    if (!offData || !offData.name) {
      // Not found anywhere — log and return null
      await db.query(
        'INSERT INTO search_history (user_id, barcode, search_type, cache_hit, response_time_ms) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, barcode, 'barcode', false, Date.now() - startTime]
      );
      return res.json({ product: null, cache_hit: false });
    }

    // Save product to DB cache (update if exists, insert if new)
    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);

    const [existing] = await db.query('SELECT id FROM products WHERE barcode = ?', [barcode]);
    let productId;

    if (existing.length > 0) {
      productId = existing[0].id;
      await db.query(
        `UPDATE products SET name = ?, brand = ?, description = ?, search_count = search_count + 1, cached_at = NOW(), cache_expires_at = ? WHERE id = ?`,
        [offData.name, offData.brand, offData.description, cacheExpiry, productId]
      );
      // Clear old sources/images for refresh
      await db.query('DELETE FROM product_sources WHERE product_id = ?', [productId]);
      await db.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
    } else {
      const [insertResult] = await db.query(
        `INSERT INTO products (barcode, name, brand, description, cache_expires_at) VALUES (?, ?, ?, ?, ?)`,
        [barcode, offData.name, offData.brand, offData.description, cacheExpiry]
      );
      productId = insertResult.insertId;
    }

    // Save source (with specs JSON)
    await db.query(
      `INSERT INTO product_sources (product_id, source_name, source_url, weight, description, trust_score, specs)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [productId, offData.source.source_name, offData.source.source_url,
       offData.source.weight, offData.source.description, offData.source.trust_score,
       offData.source.specs ? JSON.stringify(offData.source.specs) : null]
    );

    // Save images
    for (let i = 0; i < offData.images.length; i++) {
      await db.query(
        'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
        [productId, offData.images[i].source_name, offData.images[i].image_url, offData.images[i].quality_score, i]
      );
    }

    // Fetch back full data
    const [product] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
    const [sources] = await db.query('SELECT * FROM product_sources WHERE product_id = ?', [productId]);
    const [images] = await db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [productId]);
    const [conflicts] = await db.query('SELECT * FROM conflicts WHERE product_id = ?', [productId]);

    // Log search
    await db.query(
      'INSERT INTO search_history (user_id, barcode, search_type, cache_hit, response_time_ms) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, barcode, 'barcode', false, Date.now() - startTime]
    );

    res.json({ product: product[0], sources, images, conflicts, cache_hit: false });
  } catch (err) {
    console.error('Product search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save product (after API fetch — stores in cache)
router.post('/', auth, async (req, res) => {
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
           src.weight, src.color, src.description, JSON.stringify(src.specs), src.trust_score || 0]
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

// Resolve a conflict
router.patch('/conflicts/:id/resolve', auth, async (req, res) => {
  try {
    const { chosen_value } = req.body;
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
router.post('/refresh/:barcode', auth, async (req, res) => {
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
       WHERE ce.user_id = ?
       ORDER BY ce.updated_at DESC`,
      [req.user.id]
    );
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Save to catalog
router.post('/catalog', auth, async (req, res) => {
  try {
    const { product_id, custom_name, custom_description, custom_price, brand_voice, notes } = req.body;
    const [result] = await db.query(
      `INSERT INTO catalog_entries (user_id, product_id, custom_name, custom_description, custom_price, brand_voice, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, product_id, custom_name, custom_description, custom_price, brand_voice, notes]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update catalog entry status
router.patch('/catalog/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;
    await db.query('UPDATE catalog_entries SET status = ? WHERE id = ? AND user_id = ?', [status, req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
