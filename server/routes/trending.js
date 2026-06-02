const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const logActivity = require('../helpers/activity');

// Validate that specs is a non-empty object with real attribute pairs.
// Filters out placeholder responses like { "Key1": "Value1", ... } that Gemini
// occasionally echoes back verbatim from the prompt example.
function validSpecs(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  const entries = Object.entries(s).filter(([k, v]) => k && v && v !== 'null' && !/^Key\d+$/i.test(k) && !/^Value\d+$/i.test(String(v)));
  return entries.length >= 3;
}

// Gemini call with exponential backoff + model fallback. 2.5-flash gets 503'd a lot;
// flash-latest and 2.5-flash-lite are the recovery chain (lite is cheaper/faster
// so it's the last resort when both primary models are unavailable).
async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const models = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
  let lastErr;
  for (const modelName of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
        return JSON.parse(jsonStr);
      } catch (err) {
        lastErr = err;
        const msg = err?.message || '';
        const transient = /503|overload|UNAVAILABLE|high demand|429|quota|rate/i.test(msg);
        if (!transient) break; // non-retryable → next model
        if (attempt < 2) await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// AI enrichment for trending products — generates description + specs + SEO from product name.
// Gemini occasionally drops the specs field or returns placeholders; we retry once with a
// specs-only prompt instead of throwing away the descriptions that already came back.
async function enrichWithAI(name, category) {
  if (!process.env.GEMINI_API_KEY) return null;
  const mainPrompt = `You are an e-commerce copywriter. Generate marketing data for this product:
Product: ${name}
Category: ${category || 'general'}

Return ONLY a JSON object (no markdown, no code fences):
{
  "description": "2-sentence neutral product description",
  "professional": "professional/data-driven 2-3 sentences",
  "friendly": "warm/conversational 2-3 sentences",
  "luxury": "elevated/aspirational 2-3 sentences",
  "specs": { "<real attribute name>": "<real value>", ... 5-7 entries total },
  "seoTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"]
}

For specs: 5-7 concrete attributes RELEVANT to this product type (e.g. headphones: Driver Size, Battery Life, Connectivity; furniture: Material, Dimensions, Weight Capacity). DO NOT return "Key1: Value1" placeholders — use real attribute names and values.`;

  let main = null;
  try {
    main = await callGemini(mainPrompt);
  } catch (err) {
    console.warn('[trending] AI enrichment (main) failed:', err.message);
    return null;
  }

  // Re-fetch specs on its own if Gemini omitted them or returned placeholders
  if (!validSpecs(main.specs)) {
    try {
      const specsOnly = await callGemini(`Return ONLY a JSON object with 5-7 real, concrete specifications for this product. Use real attribute names and real values (no "Key1/Value1" placeholders).

Product: ${name}
Category: ${category || 'general'}

Format: { "<attribute>": "<value>", ... }`);
      if (validSpecs(specsOnly)) {
        main.specs = specsOnly;
      } else if (specsOnly && typeof specsOnly === 'object' && specsOnly.specs && validSpecs(specsOnly.specs)) {
        main.specs = specsOnly.specs;
      }
    } catch (err) {
      console.warn('[trending] AI enrichment (specs retry) failed:', err.message);
    }
  }

  return main;
}

const router = express.Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — trending changes slowly enough
const SERPER_TIMEOUT_MS = 8000;

// Serper's Shopping API returns inline data: URIs (~27KB base64) as imageUrl,
// not real URLs. Those don't fit in image_url VARCHAR(500) and wouldn't be
// fetchable by Shopify/Google Merchant anyway. When that's what we got, do a
// secondary Serper Images search (which returns real https URLs) to find a
// real product image to store. Same pattern chat.js uses for chat-added products.
async function fetchProductImageUrl(name) {
  const key = process.env.SERPER_API_KEY;
  if (!key || !name) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);
    const r = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: String(name).slice(0, 200) + ' product', num: 1 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const data = await r.json();
    const img = (data.images || [])[0];
    const candidate = img?.imageUrl || img?.thumbnailUrl || null;
    return candidate && /^https?:\/\//i.test(candidate) ? candidate : null;
  } catch { return null; }
}

// One broad query per category — Serper returns up to 40 products per call,
// so we don't need multiple narrow queries
const CATEGORIES = {
  'Electronics':  'best selling electronics 2026',
  'Beauty':       'best selling beauty products 2026',
  'Home':         'best selling home products 2026',
  'Fashion':      'best selling fashion products 2026',
  'Food':         'best selling food and drinks 2026',
  'Toys':         'best selling toys and games 2026',
  'Fitness':      'best selling fitness equipment 2026',
};

async function getCached(key) {
  try {
    const [rows] = await db.query('SELECT data, cached_at FROM trending_cache WHERE cache_key = ?', [key]);
    if (!rows.length) return null;
    const age = Date.now() - new Date(rows[0].cached_at).getTime();
    if (age > CACHE_TTL_MS) return null;
    const parsed = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    // Treat empty results as cache miss so we don't serve stale blanks
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch { return null; }
}

async function setCached(key, data) {
  try {
    await db.query(
      'INSERT INTO trending_cache (cache_key, data, cached_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), cached_at = NOW()',
      [key, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('Trending cache write failed:', err.message);
  }
}

async function fetchShoppingResults(query, geo) {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    console.warn('[trending] SERPER_API_KEY missing — trending requires Serper');
    return [];
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);
    const body = { q: query, num: 20 };
    if (geo) body.gl = geo.toLowerCase();
    const response = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.warn(`[trending] Serper shopping failed (${response.status}) for "${query}"`);
      return [];
    }
    const data = await response.json();
    return (data.shopping || []).map(item => ({
      query: item.title || '',
      price: item.price || null,
      source: item.source || null,
      rating: item.rating || null,
      reviews: item.ratingCount || null,
      link: item.link || null,
      image: item.imageUrl || null,
    })).filter(x => x.query);
  } catch (err) {
    console.warn(`[trending] Serper fetch failed for "${query}":`, err.message);
    return [];
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// GET /api/trending?country=US&category=Electronics
router.get('/', auth, async (req, res) => {
  const country  = (req.query.country  || 'US').toUpperCase().slice(0, 3);
  const category = (req.query.category || 'Electronics').slice(0, 40);

  if (!CATEGORIES[category]) {
    return res.status(400).json({ error: 'Invalid category', validCategories: Object.keys(CATEGORIES) });
  }

  const cacheKey = `trending:${country}:${category}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ items: cached, cached: true, category, country });

  // Countries where Google Shopping has no/limited coverage — skip straight to worldwide
  const UNSUPPORTED_GEO = ['LB', 'SA', 'AE', 'EG', 'JO', 'KW', 'QA', 'OM', 'BH', 'IQ', 'SY', 'YE'];

  const collectFor = async (geo) => {
    const query = CATEGORIES[category];
    const list = await fetchShoppingResults(query, geo);
    const seen = new Set();
    const all = [];
    list.forEach(item => {
      const norm = (item.query || '').toLowerCase().trim();
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      all.push({
        query: item.query, price: item.price, source: item.source,
        rating: item.rating, reviews: item.reviews, link: item.link, image: item.image,
        score: item.rating ? `★ ${item.rating}` : 'Trending',
        seed: category, category,
      });
    });
    return all;
  };

  try {
    const wantsWorldwide = UNSUPPORTED_GEO.includes(country) || !country;
    let all = [];
    let fallback = false;
    let effectiveCountry = country;

    if (wantsWorldwide) {
      // Shared worldwide cache — all MENA countries hit same cache bucket
      const wwKey = `trending:WW:${category}`;
      const wwCached = await getCached(wwKey);
      if (wwCached) {
        return res.json({ items: wwCached, cached: true, category, country, fallback: UNSUPPORTED_GEO.includes(country), warning: UNSUPPORTED_GEO.includes(country) ? `Google Shopping has no data for ${country} — showing worldwide trends` : undefined });
      }
      all = await collectFor('');
      effectiveCountry = '';
      fallback = UNSUPPORTED_GEO.includes(country);
      if (all.length > 0) await setCached(wwKey, all.slice(0, 20).map(it => ({ ...it, country: '' })));
    } else {
      all = await collectFor(country);
      if (all.length === 0 && country) {
        // Worldwide fallback — reuse shared cache
        const wwKey = `trending:WW:${category}`;
        const wwCached = await getCached(wwKey);
        if (wwCached) {
          all = wwCached;
          fallback = true;
          effectiveCountry = '';
        } else {
          all = await collectFor('');
          fallback = all.length > 0;
          effectiveCountry = fallback ? '' : country;
          if (fallback) await setCached(wwKey, all.slice(0, 20).map(it => ({ ...it, country: '' })));
        }
      }
    }

    if (all.length === 0) {
      console.warn(`[trending] No Serper results for ${country}/${category} (even worldwide)`);
      return res.json({ items: [], cached: false, category, country, warning: 'No trending products found' });
    }

    const items = all.slice(0, 20).map(it => ({ ...it, country: effectiveCountry }));
    // Country-specific cache too (so supported countries don't refetch worldwide)
    if (!wantsWorldwide && !fallback) await setCached(cacheKey, items);
    res.json({ items, cached: false, category, country, fallback, warning: fallback ? `Google Shopping has no data for ${country} — showing worldwide trends` : undefined });
  } catch (err) {
    console.error('Trending fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trends: ' + err.message });
  }
});

// GET /api/trending/categories
router.get('/categories', auth, (req, res) => {
  res.json({ categories: Object.keys(CATEGORIES) });
});

// POST /api/trending/add — pull a trending item into the store's catalog
router.post('/add', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { query, category, image, price, source } = req.body;
    if (!query || typeof query !== 'string') return res.status(400).json({ error: 'query required' });

    const name = query.slice(0, 200);
    const barcode = `TREND-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + 30);

    // Parse price like "$29.99" → 29.99
    let cleanPrice = null;
    if (price) {
      const num = parseFloat(String(price).replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, ''));
      if (!isNaN(num) && num > 0) cleanPrice = num;
    }

    // Resolve a real image URL. Serper Shopping returns inline data: URIs
    // that don't fit in image_url and aren't fetchable by Shopify/Google
    // Merchant. If the supplied image isn't a real http URL, do a Serper
    // Images search for the product name and use the first result.
    let realImage = image && /^https?:\/\//i.test(image) ? image : null;
    // Run enrichment + image fetch in parallel — both are external network calls
    const [enriched, fetchedImage] = await Promise.all([
      enrichWithAI(name, category),
      realImage ? Promise.resolve(realImage) : fetchProductImageUrl(name),
    ]);
    realImage = realImage || fetchedImage;

    const [productResult] = await db.query(
      `INSERT INTO products (barcode, name, description, ai_description_professional, ai_description_friendly, ai_description_luxury, ai_category_suggestion, ai_attributes, seo_tags, cache_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        barcode,
        name,
        enriched?.description || null,
        enriched?.professional || null,
        enriched?.friendly || null,
        enriched?.luxury || null,
        category || null,
        enriched?.specs ? JSON.stringify(enriched.specs) : null,
        enriched?.seoTags ? JSON.stringify(enriched.seoTags) : null,
        cacheExpiry,
      ]
    );
    const productId = productResult.insertId;

    if (realImage) {
      await db.query(
        'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
        [productId, source || 'Google Shopping', realImage, 75, 0]
      );
    }

    if (source && cleanPrice) {
      try {
        await db.query(
          `INSERT INTO product_sources (product_id, source_name, price, currency, trust_score) VALUES (?, ?, ?, ?, ?)`,
          [productId, source, cleanPrice, 'USD', 70]
        );
      } catch {}
    }

    const [entryResult] = await db.query(
      `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_price) VALUES (?, ?, ?, 'Draft', ?, ?)`,
      [req.user.store_id, req.user.id, productId, name, cleanPrice]
    );

    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'created', entity_type: 'catalog_entry', entity_id: entryResult.insertId, entity_name: name, details: { source: 'trending', category, price: cleanPrice } });
    res.status(201).json({ success: true, catalog_entry_id: entryResult.insertId, product_id: productId });
  } catch (err) {
    console.error('Trending add error:', err.message);
    res.status(500).json({ error: 'Failed to add trending item: ' + err.message });
  }
});

module.exports = router;
