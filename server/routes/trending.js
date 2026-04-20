const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const logActivity = require('../helpers/activity');

const router = express.Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — trending changes slowly enough
const SERPER_TIMEOUT_MS = 8000;

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

    const [productResult] = await db.query(
      `INSERT INTO products (barcode, name, ai_category_suggestion, cache_expires_at) VALUES (?, ?, ?, ?)`,
      [barcode, name, category || null, cacheExpiry]
    );
    const productId = productResult.insertId;

    if (image && !image.startsWith('data:')) {
      await db.query(
        'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
        [productId, source || 'Google Shopping', image, 75, 0]
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
