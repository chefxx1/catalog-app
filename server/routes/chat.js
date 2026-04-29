const express = require('express');
const Groq = require('groq-sdk').default || require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { sanitize } = require('../middleware/validate');
const logActivity = require('../helpers/activity');

const router = express.Router();

const SERPER_TIMEOUT_MS = 6000;

// Fetch a product image via Serper (mirrors trending route)
async function fetchProductImage(query) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);
    const r = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query + ' product', num: 1 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const data = await r.json();
    const img = (data.images || [])[0];
    return img?.imageUrl || img?.thumbnailUrl || null;
  } catch { return null; }
}

// Enrich a product with AI-generated content (description, specs, SEO)
async function enrichWithAI(name, category) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Generate marketing data for: ${name}
Category: ${category || 'general'}

Return ONLY a JSON object (no markdown, no fences):
{
  "description": "2-sentence neutral description",
  "professional": "professional 2-3 sentences",
  "friendly": "warm 2-3 sentences",
  "luxury": "elevated 2-3 sentences",
  "specs": { "Key1": "Value1", "Key2": "Value2", "Key3": "Value3", "Key4": "Value4", "Key5": "Value5" },
  "seoTags": ["tag1","tag2","tag3","tag4","tag5","tag6"]
}

Specs: 5-7 attributes RELEVANT to this product type.`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return JSON.parse(text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim());
  } catch (err) {
    console.warn('[chat] AI enrichment failed:', err.message);
    return null;
  }
}

const SYSTEM_PROMPT = `You are CatalogAI's catalog assistant. You help users query and manage their product catalog using natural language.

Output ONLY a JSON object (no markdown, no code fences). Choose ONE of three response types:

1. FILTER (read-only — find products):
{ "type": "filter", "filter": { ...criteria }, "summary": "short human-readable summary of what you're showing" }

Filter fields available (combine any):
- name: substring search on product name (e.g. "headphones")
- status: one of "Draft", "Review", "Published", "Exported"
- category: substring on category (e.g. "fashion")
- tag: tag name to match
- minPrice, maxPrice: numeric price range
- minStock, maxStock: numeric stock range
- noImages: true (find products without images)
- noPrice: true (find products without a price)
- needsAttention: true (completeness < 70)
- limit: max results (default 50)

2. ACTION (write — modify or create):
{ "type": "action", "action": "<name>", "filter": { ...criteria }, "change": { ...new values }, "summary": "preview text" }

Available actions:
- "update_status" with change: { status: "Published" | "Draft" | "Review" | "Exported" }
- "update_stock" with change: { stock: <number> }
- "update_price" with change: { price: <number> }
- "update_name" with change: { name: "new name" }
- "update_description" with change: { description: "new description" }
- "update_threshold" with change: { threshold: <number> } (low-stock alert threshold)
- "delete" with no change
- "add_tag" with change: { tag: "<existing tag name>" }
- "create_tag" with change: { name: "tag name", color: "#hexcolor" } (no filter needed)
- "create_product" with change: { name: "product name", price: <number>, category: "category" } (no filter needed; price/category optional)

3. TEXT (conversational — answer questions about the catalog):
{ "type": "text", "message": "your conversational answer" }

Rules:
- Use TEXT for general questions, advice, summaries (e.g. "how is my catalog doing?")
- Use FILTER for "show me X" or "find Y" queries
- Use ACTION when the user asks to change/delete/update something — server will require user confirmation before executing
- For destructive actions (delete), be conservative — narrow the filter
- Never invent fields not in the lists above

Examples:
User: "show me everything under $20"
Output: {"type":"filter","filter":{"maxPrice":20},"summary":"Products priced under $20"}

User: "how many products do I have?"
Output: {"type":"text","message":"Let me count..."} — actually use filter with no criteria for count requests, or just answer based on stats provided

User: "delete all draft products"
Output: {"type":"action","action":"delete","filter":{"status":"Draft"},"summary":"Delete all draft products"}

User: "publish everything that's been in review"
Output: {"type":"action","action":"update_status","filter":{"status":"Review"},"change":{"status":"Published"},"summary":"Publish all products currently in Review"}

User: "create a tag called Sale with red color"
Output: {"type":"action","action":"create_tag","filter":{},"change":{"name":"Sale","color":"#EF4444"},"summary":"Create a new tag 'Sale' (red)"}

User: "add a product called Red Sneakers $80"
Output: {"type":"action","action":"create_product","filter":{},"change":{"name":"Red Sneakers","price":80,"category":"Footwear"},"summary":"Create new product 'Red Sneakers' at $80 with AI enrichment"}

User: "set price to $19.99 for items under $30"
Output: {"type":"action","action":"update_price","filter":{"maxPrice":30},"change":{"price":19.99},"summary":"Change price to $19.99 for products under $30"}`;

const ALLOWED_ACTIONS = new Set([
  'update_status', 'update_stock', 'update_price', 'update_name', 'update_description', 'update_threshold',
  'delete', 'add_tag',
  'create_tag', 'create_product',
]);
const CREATE_ACTIONS = new Set(['create_tag', 'create_product']);
const VALID_STATUSES = new Set(['Draft', 'Review', 'Published', 'Exported']);

// Build a SQL WHERE clause + params from a filter spec, scoped to store
function buildFilter(filter, storeId, tagsMap) {
  const conditions = ['ce.store_id = ?'];
  const params = [storeId];
  if (filter.name) { conditions.push('(p.name LIKE ? OR ce.custom_name LIKE ?)'); params.push(`%${filter.name}%`, `%${filter.name}%`); }
  if (filter.status && VALID_STATUSES.has(filter.status)) { conditions.push('ce.status = ?'); params.push(filter.status); }
  if (filter.category) { conditions.push('p.ai_category_suggestion LIKE ?'); params.push(`%${filter.category}%`); }
  if (filter.minPrice != null) { conditions.push('ce.custom_price >= ?'); params.push(parseFloat(filter.minPrice)); }
  if (filter.maxPrice != null) { conditions.push('ce.custom_price <= ?'); params.push(parseFloat(filter.maxPrice)); }
  if (filter.minStock != null) { conditions.push('ce.stock_quantity >= ?'); params.push(parseInt(filter.minStock, 10)); }
  if (filter.maxStock != null) { conditions.push('ce.stock_quantity <= ?'); params.push(parseInt(filter.maxStock, 10)); }
  if (filter.noImages) { conditions.push('NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)'); }
  if (filter.noPrice) { conditions.push('(ce.custom_price IS NULL OR ce.custom_price = 0)'); }
  if (filter.tag && tagsMap?.[filter.tag.toLowerCase()]) {
    conditions.push('EXISTS (SELECT 1 FROM catalog_entry_tags cet WHERE cet.catalog_entry_id = ce.id AND cet.tag_id = ?)');
    params.push(tagsMap[filter.tag.toLowerCase()]);
  }
  return { where: conditions.join(' AND '), params };
}

async function loadTagsMap(storeId) {
  const [tags] = await db.query('SELECT id, name FROM tags WHERE store_id = ?', [storeId]);
  const map = {};
  tags.forEach(t => { map[t.name.toLowerCase()] = t.id; });
  return map;
}

async function runFilter(filter, storeId) {
  const tagsMap = await loadTagsMap(storeId);
  const { where, params } = buildFilter(filter, storeId, tagsMap);
  const limit = Math.min(parseInt(filter.limit, 10) || 50, 200);
  const [rows] = await db.query(
    `SELECT ce.id, ce.product_id, ce.status, ce.custom_name, ce.custom_price, ce.stock_quantity, ce.low_stock_threshold,
            p.name, p.barcode, p.ai_category_suggestion AS category,
            (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS image
     FROM catalog_entries ce
     JOIN products p ON ce.product_id = p.id
     WHERE ${where}
     ORDER BY ce.updated_at DESC
     LIMIT ?`,
    [...params, limit]
  );
  return rows;
}

async function runCount(filter, storeId) {
  const tagsMap = await loadTagsMap(storeId);
  const { where, params } = buildFilter(filter, storeId, tagsMap);
  const [[{ count }]] = await db.query(
    `SELECT COUNT(*) as count FROM catalog_entries ce JOIN products p ON ce.product_id = p.id WHERE ${where}`,
    params
  );
  return count;
}

// POST /api/chat — converse with catalog
router.post('/', auth, async (req, res) => {
  const { message, history } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  try {
    // Stats snapshot for context
    const [[stats]] = await db.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status='Draft' THEN 1 ELSE 0 END) as drafts,
              SUM(CASE WHEN status='Published' THEN 1 ELSE 0 END) as published,
              SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock
       FROM catalog_entries WHERE store_id = ?`,
      [req.user.store_id]
    );

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + `\n\nCURRENT CATALOG STATS:\n${JSON.stringify(stats)}` },
    ];
    if (Array.isArray(history)) {
      history.slice(-6).forEach(h => {
        if (h?.role && h?.content) messages.push({ role: h.role, content: String(h.content).slice(0, 1000) });
      });
    }
    messages.push({ role: 'user', content: message.slice(0, 1000) });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.3,
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.json({ type: 'text', message: "I had trouble understanding. Try rephrasing?" }); }

    if (parsed.type === 'filter') {
      const items = await runFilter(parsed.filter || {}, req.user.store_id);
      return res.json({ type: 'filter', summary: parsed.summary || 'Results', filter: parsed.filter, items });
    }
    if (parsed.type === 'action') {
      if (!ALLOWED_ACTIONS.has(parsed.action)) {
        return res.json({ type: 'text', message: `I don't know how to "${parsed.action}". Try a different phrasing.` });
      }
      // Create actions don't filter — they make new things
      if (CREATE_ACTIONS.has(parsed.action)) {
        return res.json({
          type: 'action',
          action: parsed.action,
          filter: {},
          change: parsed.change || {},
          summary: parsed.summary || `Create a new ${parsed.action === 'create_tag' ? 'tag' : 'product'}`,
          affected: 1,
          preview: [],
        });
      }
      const previewItems = await runFilter(parsed.filter || {}, req.user.store_id);
      const count = previewItems.length;
      return res.json({
        type: 'action',
        action: parsed.action,
        filter: parsed.filter || {},
        change: parsed.change || {},
        summary: parsed.summary || `${parsed.action} on ${count} products`,
        affected: count,
        preview: previewItems.slice(0, 10),
      });
    }
    return res.json({ type: 'text', message: parsed.message || 'Done.' });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
});

// Action → minimum role required (mirrors the existing UI permissions exactly)
const ACTION_ROLES = {
  update_status: ['Admin', 'Editor'],
  update_stock: ['Admin', 'Editor'],
  update_price: ['Admin', 'Editor'],
  update_name: ['Admin', 'Editor'],
  update_description: ['Admin', 'Editor'],
  update_threshold: ['Admin', 'Editor'],
  add_tag: ['Admin', 'Editor'],
  create_tag: ['Admin', 'Editor'],
  create_product: ['Admin', 'Editor'],
  delete: ['Admin'], // mirrors DELETE /products/catalog/:id which is Admin-only
};

// POST /api/chat/execute — run a previously-previewed action
router.post('/execute', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  const { action, filter, change } = req.body;
  if (!ALLOWED_ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' });
  const requiredRoles = ACTION_ROLES[action];
  if (requiredRoles && !requiredRoles.includes(req.user.role)) {
    return res.status(403).json({ error: `${action} requires ${requiredRoles.join(' or ')} role` });
  }

  try {
    const tagsMap = await loadTagsMap(req.user.store_id);
    const { where, params } = buildFilter(filter || {}, req.user.store_id, tagsMap);

    let affected = 0;
    if (action === 'update_status') {
      if (!VALID_STATUSES.has(change?.status)) return res.status(400).json({ error: 'Invalid status' });
      const [r] = await db.query(
        `UPDATE catalog_entries ce JOIN products p ON ce.product_id = p.id SET ce.status = ?, ce.updated_at = NOW() WHERE ${where}`,
        [change.status, ...params]
      );
      affected = r.affectedRows;
    } else if (action === 'update_stock') {
      const stock = change?.stock === null || change?.stock === '' ? null : parseInt(change?.stock, 10);
      if (stock !== null && (isNaN(stock) || stock < 0)) return res.status(400).json({ error: 'Invalid stock' });
      const [r] = await db.query(
        `UPDATE catalog_entries ce JOIN products p ON ce.product_id = p.id SET ce.stock_quantity = ?, ce.updated_at = NOW() WHERE ${where}`,
        [stock, ...params]
      );
      affected = r.affectedRows;
    } else if (action === 'delete') {
      // Find IDs first so we can delete cleanly
      const [rows] = await db.query(
        `SELECT ce.id FROM catalog_entries ce JOIN products p ON ce.product_id = p.id WHERE ${where}`,
        params
      );
      const ids = rows.map(r => r.id);
      if (ids.length > 0) {
        const [r] = await db.query('DELETE FROM catalog_entries WHERE id IN (?) AND store_id = ?', [ids, req.user.store_id]);
        affected = r.affectedRows;
      }
    } else if (action === 'add_tag') {
      const tagName = change?.tag;
      if (!tagName) return res.status(400).json({ error: 'tag required' });
      const tagId = tagsMap[String(tagName).toLowerCase()];
      if (!tagId) return res.status(400).json({ error: `Tag "${tagName}" doesn't exist. Create it first.` });
      const [rows] = await db.query(
        `SELECT ce.id FROM catalog_entries ce JOIN products p ON ce.product_id = p.id WHERE ${where}`,
        params
      );
      for (const r of rows) {
        try { await db.query('INSERT IGNORE INTO catalog_entry_tags (catalog_entry_id, tag_id) VALUES (?, ?)', [r.id, tagId]); affected++; } catch {}
      }
    } else if (action === 'update_price') {
      const price = change?.price === null || change?.price === '' ? null : parseFloat(change?.price);
      if (price !== null && (isNaN(price) || price < 0)) return res.status(400).json({ error: 'Invalid price' });
      const [r] = await db.query(
        `UPDATE catalog_entries ce JOIN products p ON ce.product_id = p.id SET ce.custom_price = ?, ce.updated_at = NOW() WHERE ${where}`,
        [price, ...params]
      );
      affected = r.affectedRows;
    } else if (action === 'update_name') {
      const newName = change?.name ? sanitize(String(change.name)).slice(0, 200) : null;
      if (!newName) return res.status(400).json({ error: 'name required' });
      const [r] = await db.query(
        `UPDATE catalog_entries ce JOIN products p ON ce.product_id = p.id SET ce.custom_name = ?, ce.updated_at = NOW() WHERE ${where}`,
        [newName, ...params]
      );
      affected = r.affectedRows;
    } else if (action === 'update_description') {
      const desc = change?.description ? sanitize(String(change.description)).slice(0, 5000) : null;
      if (!desc) return res.status(400).json({ error: 'description required' });
      const [r] = await db.query(
        `UPDATE catalog_entries ce JOIN products p ON ce.product_id = p.id SET ce.custom_description = ?, ce.updated_at = NOW() WHERE ${where}`,
        [desc, ...params]
      );
      affected = r.affectedRows;
    } else if (action === 'update_threshold') {
      const t = change?.threshold === null || change?.threshold === '' ? null : parseInt(change?.threshold, 10);
      if (t !== null && (isNaN(t) || t < 0)) return res.status(400).json({ error: 'Invalid threshold' });
      const [r] = await db.query(
        `UPDATE catalog_entries ce JOIN products p ON ce.product_id = p.id SET ce.low_stock_threshold = ?, ce.updated_at = NOW() WHERE ${where}`,
        [t, ...params]
      );
      affected = r.affectedRows;
    } else if (action === 'create_tag') {
      const tagName = change?.name ? sanitize(String(change.name)).slice(0, 50) : null;
      if (!tagName) return res.status(400).json({ error: 'Tag name required' });
      const color = /^#[0-9A-Fa-f]{6}$/.test(change?.color || '') ? change.color : '#3B82F6';
      try {
        const [r] = await db.query('INSERT INTO tags (store_id, name, color) VALUES (?, ?, ?)', [req.user.store_id, tagName, color]);
        affected = 1;
        logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'created', entity_type: 'tag', entity_id: r.insertId, entity_name: tagName });
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: `Tag "${tagName}" already exists.` });
        throw err;
      }
    } else if (action === 'create_product') {
      const productName = change?.name ? sanitize(String(change.name)).slice(0, 200) : null;
      if (!productName) return res.status(400).json({ error: 'Product name required' });
      const productCategory = change?.category ? sanitize(String(change.category)).slice(0, 100) : null;
      let productPrice = null;
      if (change?.price != null) {
        const p = parseFloat(change.price);
        if (!isNaN(p) && p >= 0) productPrice = p;
      }

      // Fetch image + AI enrichment in parallel (outside the transaction so
      // long network calls don't hold a DB connection).
      const [imageUrl, enriched] = await Promise.all([
        fetchProductImage(productName),
        enrichWithAI(productName, productCategory),
      ]);

      const barcode = `CHAT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const cacheExpiry = new Date(); cacheExpiry.setDate(cacheExpiry.getDate() + 30);

      // Wrap product + image + catalog entry inserts in a transaction so a
      // partial failure can't leave an orphan product without a catalog entry.
      const conn = await db.getConnection();
      let entryResultId;
      try {
        await conn.beginTransaction();

        const [productResult] = await conn.query(
          `INSERT INTO products (barcode, name, description, ai_description_professional, ai_description_friendly, ai_description_luxury, ai_category_suggestion, ai_attributes, seo_tags, cache_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            barcode, productName,
            enriched?.description || null,
            enriched?.professional || null,
            enriched?.friendly || null,
            enriched?.luxury || null,
            productCategory || null,
            enriched?.specs ? JSON.stringify(enriched.specs) : null,
            enriched?.seoTags ? JSON.stringify(enriched.seoTags) : null,
            cacheExpiry,
          ]
        );
        const productId = productResult.insertId;

        if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
          await conn.query(
            'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
            [productId, 'Google Images', imageUrl, 75, 0]
          );
        }

        const [entryResult] = await conn.query(
          `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_price) VALUES (?, ?, ?, 'Draft', ?, ?)`,
          [req.user.store_id, req.user.id, productId, productName, productPrice]
        );
        entryResultId = entryResult.insertId;

        await conn.commit();
      } catch (txErr) {
        try { await conn.rollback(); } catch {}
        throw txErr;
      } finally {
        conn.release();
      }

      logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'created', entity_type: 'catalog_entry', entity_id: entryResultId, entity_name: productName, details: { source: 'chat', enriched: !!enriched, image: !!imageUrl } });
      affected = 1;
    }

    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'chat_' + action, entity_type: 'catalog_entry', entity_name: null, details: { filter, change, affected } });
    res.json({ success: true, affected });
  } catch (err) {
    console.error('Chat execute error:', err.message);
    res.status(500).json({ error: 'Execute failed: ' + err.message });
  }
});

module.exports = router;
