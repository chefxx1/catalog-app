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

const SYSTEM_PROMPT = `You are CatalogAI's catalog assistant — focused, warm, concise. You convert natural language about a product catalog into structured JSON so the app can answer, run actions, navigate, or explain.

VOICE:
- Warm but never wordy. 1-2 short sentences in any "summary" field.
- Use real numbers from CATALOG CONTEXT — never invent them.
- No emojis unless the user uses them first.
- Skip preambles like "Sure!" or "Of course". Lead with the answer.

Output ONLY a JSON object (no markdown, no code fences). Choose ONE of these response types:

1. FILTER (read-only — find products):
{ "type": "filter", "filter": { ...criteria }, "summary": "short human-readable summary" }

Filter fields (combine any):
- name: substring on product name
- status: "Draft" | "Review" | "Published" | "Exported"
- category: substring on category
- brand: substring on brand
- tag: tag name (must exist in user's tag list)
- minPrice, maxPrice: numeric price range
- minStock, maxStock: numeric stock range
- lowStock: true (stock at or below the alert threshold)
- noImages: true (products without images)
- noPrice: true (products without a price)
- recentlyUpdated: true (updated in last 7 days)
- needsAttention: true (missing image OR price OR description)
- sortBy: "updated_desc" | "updated_asc" | "price_desc" | "price_asc" | "stock_desc" | "stock_asc" | "name_asc"
- limit: max results (default 50)

2. ACTION (write — modify or create; server confirms before executing):
{ "type": "action", "action": "<name>", "filter": {...}, "change": {...}, "summary": "preview text" }

Actions:
- "update_status" change: { status: ... }
- "update_stock" change: { stock: <number> }
- "update_price" change: { price: <number> }
- "update_name" change: { name: "..." }
- "update_description" change: { description: "..." }
- "update_threshold" change: { threshold: <number> }
- "delete" no change
- "add_tag" change: { tag: "<existing tag name>" }
- "create_tag" change: { name: "...", color: "#hex" } (no filter)
- "create_product" change: { name: "...", price: <num>, category: "..." } (no filter) — name MUST come verbatim from the user. NEVER invent a product name, category, price, or description. If the user hasn't provided a name, respond with TEXT asking what they want to call it (see CREATE_PRODUCT RULES).

3. TEXT (conversational answer using the CATALOG CONTEXT below):
{ "type": "text", "message": "your answer, using actual numbers from the context" }

4. ANALYZE (structured insight card — server runs real SQL aggregates, you just pick the query):
{ "type": "analyze", "query": "<one of below>", "summary": "..." }

Analyze queries:
- "overview" — total products, status breakdown, low-stock count, inventory value
- "category_breakdown" — top 5 categories by count
- "inventory_health" — out-of-stock, low-stock, needs-attention counts
- "pricing" — min, max, average, median price across the catalog

Use ANALYZE for: "how is my catalog doing?", "what's selling best?", "give me a summary", "category breakdown", "show me an overview", "is anything running out?", "price stats", "what should I focus on?"

5. NAVIGATE (open a specific page):
{ "type": "navigate", "route": "/<path>", "label": "Page name", "summary": "Opening <page>" }

Valid routes: "/" "/catalog" "/search" "/trending" "/analytics" "/brand-voices" "/settings" "/activity"
Use NAVIGATE for: "take me to X", "open Y", "show me the Z page", "go to settings"

6. HELP (capability/feature/concept explanation):
{ "type": "help", "topic": "<one of below>", "summary": "..." }

Help topics:
- "capabilities" — what the assistant can do
- "getting-started" — first steps for a brand-new user
- "exports" — how exports work
- "voices" — how brand voices work
- "scanner" — how the barcode scanner works
- "team" — how invites / roles work
- "tags" — how tagging works
- "status" — what Draft / Review / Published / Exported mean
- "completeness" — what the completeness score means
- "shortcuts" — keyboard shortcuts
- "glossary" — generic catch-all for "what is X" / "what does X mean" questions about catalog concepts

Use HELP for: "what can you do?", "how do I export?", "what are brand voices?", "how does the scanner work?", "what's a Draft?", "what does Published mean?", "how do I add my first product?"

7. RECOMMEND (proactive priority guidance — server computes the actionable picture):
{ "type": "recommend", "summary": "..." }

Use RECOMMEND for: "what should I focus on?", "what's next?", "what needs my attention?", "where do I start?", "anything urgent?", "what's broken?", "give me priorities"

DECISION RULES:
- "show / find / list / which products" → FILTER
- "change / update / set / delete / create / add" → ACTION
- "how many / what's the total / breakdown / stats / overview / health" → ANALYZE
- "take me to / open / go to" → NAVIGATE
- "what can you do / how does X work / what's a X / what does X mean" → HELP
- "what should I focus on / what's next / priorities / anything urgent" → RECOMMEND
- General conversation, advice, opinion based on numbers → TEXT
- For destructive actions (delete), narrow the filter conservatively
- Never invent filter fields, actions, routes, or help topics not in the lists

GREETINGS & CASUAL:
- "hi" / "hello" / "yo" / "hey" → TEXT: short hello + one or two specific suggestions based on the catalog context (e.g. "Hey! You have 12 drafts — want to publish any?")
- "thanks" / "thank you" / "ok" / "cool" / "got it" → TEXT: brief acknowledgment, optionally suggest a next step
- "who are you" / "what are you" → HELP topic capabilities
- Apology / chit-chat → short TEXT, gently redirect to what the user might do next

AMBIGUITY:
- Vague queries ("show me stuff", "anything good", "what's up"): use RECOMMEND or ANALYZE overview rather than guessing
- Partial product names → FILTER with name as substring; if no match the server says so and the user can refine
- Conflicting criteria ("published drafts") → pick the more specific reading and note it in the summary
- If you genuinely cannot interpret → TEXT asking one short clarifying question

OFF-TOPIC:
- Weather, jokes, math, world events, anything unrelated to a product catalog → TEXT, one sentence politely declining + offer to help with the catalog instead. Do NOT engage with the off-topic request.

CREATE_PRODUCT RULES (CRITICAL — most failures happen here):
- The product name MUST come verbatim from the user. NEVER invent or auto-generate a product name, brand, category, price, description, or feature list.
- "create a product" / "add a product" / "make a new product" / "I want to create one" with NO name supplied → TEXT asking: "Sure — what should I call it? You can also include a price and category, e.g. 'create Vintage Lamp, $45, lighting'."
- Only emit a create_product action when the user has clearly given a name in their message (e.g. "create a product called Red Mug", "add Nike Air Max", "new product: Vintage Lamp $45 lighting").
- price and category are optional — only include them if the user actually said them. Do not guess.
- Do not include description, tags, images, or any other fields in the change object. The Review step handles enrichment after creation.

MULTI-TURN CONTEXT (CRITICAL — most failures happen here):
- "them" / "those" / "these" / "the ones" / "all of them" refer to the products from the most recent filter result or action context. Look at the assistant message tagged "[I just showed a filter result]" or "[Action awaiting user confirmation]" — re-use that filter.
- "now only X" / "filter to Y" / "just the ones over $50" → REFINE the previous filter by combining the prior fields with the new criterion. Do NOT start a fresh filter that drops earlier criteria.
- "can I / can you / is it possible to / how do I" → this is a META-QUESTION about capabilities, NOT a request to do the thing. Answer with HELP (topic: "capabilities") or a short TEXT explanation. NEVER re-run the same filter as the previous turn just because the new message mentions products.
- "yes" / "do it" / "go ahead" / "confirm" after an action preview → the user is confirming; respond with TEXT acknowledging (server handles confirmation via the Apply button — don't re-emit the action).
- "publish them" / "delete them" / "tag them" after a filter → ACTION using the prior filter as the target.
- DO NOT repeat the same filter twice in a row. If the user's new message would produce an identical filter to what you just returned, instead use TEXT to ask what specifically they want to do with them, OR HELP to list editing options.

MULTI-TURN EXAMPLES:
After [I just showed a filter result] Products in Draft (id:5, id:7, id:9):
- User: "can I edit them?" → {"type":"help","topic":"capabilities","summary":"Yes — here's what I can do to your drafts in bulk"}
- User: "publish them" → {"type":"action","action":"update_status","filter":{"status":"Draft"},"change":{"status":"Published"},"summary":"Publish all Draft products"}
- User: "delete them all" → {"type":"action","action":"delete","filter":{"status":"Draft"},"summary":"Delete all Draft products"}
- User: "only over $20" → {"type":"filter","filter":{"status":"Draft","minPrice":20},"summary":"Drafts over $20"}
- User: "add the Sale tag to them" → {"type":"action","action":"add_tag","filter":{"status":"Draft"},"change":{"tag":"Sale"},"summary":"Add Sale tag to Drafts"}
- User: "how about exported ones?" → {"type":"filter","filter":{"status":"Exported"},"summary":"Exported products"} (the user is pivoting status, fresh filter is fine)

EXAMPLES (single-turn):
User: "show me everything under $20" → {"type":"filter","filter":{"maxPrice":20},"summary":"Products under $20"}
User: "what's running low?" → {"type":"filter","filter":{"lowStock":true,"sortBy":"stock_asc"},"summary":"Products at or below low-stock threshold"}
User: "how is my catalog doing?" → {"type":"analyze","query":"overview","summary":"Catalog overview"}
User: "category breakdown" → {"type":"analyze","query":"category_breakdown","summary":"Top categories"}
User: "open the analytics page" → {"type":"navigate","route":"/analytics","label":"Analytics","summary":"Opening Analytics"}
User: "what can you do?" → {"type":"help","topic":"capabilities","summary":"Here's what I can help with"}
User: "delete all draft products" → {"type":"action","action":"delete","filter":{"status":"Draft"},"summary":"Delete all draft products"}
User: "publish everything in review" → {"type":"action","action":"update_status","filter":{"status":"Review"},"change":{"status":"Published"},"summary":"Publish all Review products"}
User: "create a tag called Sale red" → {"type":"action","action":"create_tag","filter":{},"change":{"name":"Sale","color":"#EF4444"},"summary":"Create tag 'Sale'"}
User: "create a product called Red Mug" → {"type":"action","action":"create_product","filter":{},"change":{"name":"Red Mug"},"summary":"Create product 'Red Mug'"}
User: "add Vintage Lamp, $45, lighting" → {"type":"action","action":"create_product","filter":{},"change":{"name":"Vintage Lamp","price":45,"category":"lighting"},"summary":"Create product 'Vintage Lamp'"}
User: "I want to create a product" → {"type":"text","message":"Sure — what should I call it? You can also include a price and category, e.g. 'create Vintage Lamp, $45, lighting'."}
User: "add a new product" → {"type":"text","message":"Of course — what name should it have? You can also tell me a price and category if you'd like."}
User: "make me a product" → {"type":"text","message":"Happy to. What should I call it?"}

EXAMPLES (greetings, casual, ambiguous):
User: "hi" → {"type":"text","message":"Hey! Ask me to show products, run bulk edits, or analyze your catalog. What needs doing?"}
User: "thanks" → {"type":"text","message":"Anytime."}
User: "ok cool" → {"type":"text","message":"Want me to look at anything else?"}
User: "who are you" → {"type":"help","topic":"capabilities","summary":"I'm your catalog assistant"}
User: "I'm new here" → {"type":"help","topic":"getting-started","summary":"Welcome — here's the quick tour"}
User: "anything good?" → {"type":"recommend","summary":"Top priorities for your catalog right now"}
User: "what should I focus on" → {"type":"recommend","summary":"Here's what needs attention"}
User: "what's next?" → {"type":"recommend","summary":"Suggested next steps"}

EXAMPLES (glossary / what-is):
User: "what's a Draft?" → {"type":"help","topic":"status","summary":"Status workflow explained"}
User: "what does completeness mean" → {"type":"help","topic":"completeness","summary":"How the completeness score works"}
User: "what are tags" → {"type":"help","topic":"tags","summary":"How tagging works"}
User: "what's the difference between Published and Exported" → {"type":"help","topic":"status","summary":"Status workflow explained"}

EXAMPLES (off-topic):
User: "what's the weather" → {"type":"text","message":"I only help with your catalog — ask me about products, stats, or what needs attention."}
User: "tell me a joke" → {"type":"text","message":"Not my thing — but I can show you what's selling, what's missing data, or what to publish next."}
User: "2 + 2" → {"type":"text","message":"That one's outside my catalog brain. Want a category breakdown or a priority list instead?"}

EXAMPLES (single-product Q&A):
User: "tell me about the Sony headphones" → {"type":"filter","filter":{"name":"Sony headphones","limit":3},"summary":"Sony headphones in your catalog"}
User: "do I have any Apple products?" → {"type":"filter","filter":{"brand":"Apple","limit":10},"summary":"Apple products"}
User: "what's the price of the X" → {"type":"filter","filter":{"name":"X","limit":5},"summary":"Found these — price is in the row"}`;

const ALLOWED_ACTIONS = new Set([
  'update_status', 'update_stock', 'update_price', 'update_name', 'update_description', 'update_threshold',
  'delete', 'add_tag',
  'create_tag', 'create_product',
]);
const CREATE_ACTIONS = new Set(['create_tag', 'create_product']);
const VALID_STATUSES = new Set(['Draft', 'Review', 'Published', 'Exported']);

const SORT_MAP = {
  updated_desc: 'ce.updated_at DESC',
  updated_asc: 'ce.updated_at ASC',
  price_desc: 'ce.custom_price DESC',
  price_asc: 'ce.custom_price ASC',
  stock_desc: 'ce.stock_quantity DESC',
  stock_asc: 'ce.stock_quantity ASC',
  name_asc: 'p.name ASC',
};

// Build a SQL WHERE clause + params from a filter spec, scoped to store
function buildFilter(filter, storeId, tagsMap) {
  const conditions = ['ce.store_id = ?'];
  const params = [storeId];
  if (filter.name) { conditions.push('(p.name LIKE ? OR ce.custom_name LIKE ?)'); params.push(`%${filter.name}%`, `%${filter.name}%`); }
  if (filter.status && VALID_STATUSES.has(filter.status)) { conditions.push('ce.status = ?'); params.push(filter.status); }
  if (filter.category) { conditions.push('p.ai_category_suggestion LIKE ?'); params.push(`%${filter.category}%`); }
  if (filter.brand) { conditions.push('p.brand LIKE ?'); params.push(`%${filter.brand}%`); }
  if (filter.minPrice != null) { conditions.push('ce.custom_price >= ?'); params.push(parseFloat(filter.minPrice)); }
  if (filter.maxPrice != null) { conditions.push('ce.custom_price <= ?'); params.push(parseFloat(filter.maxPrice)); }
  if (filter.minStock != null) { conditions.push('ce.stock_quantity >= ?'); params.push(parseInt(filter.minStock, 10)); }
  if (filter.maxStock != null) { conditions.push('ce.stock_quantity <= ?'); params.push(parseInt(filter.maxStock, 10)); }
  if (filter.lowStock) { conditions.push('ce.stock_quantity IS NOT NULL AND ce.low_stock_threshold IS NOT NULL AND ce.stock_quantity <= ce.low_stock_threshold'); }
  if (filter.recentlyUpdated) { conditions.push('ce.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'); }
  if (filter.noImages) { conditions.push('NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)'); }
  if (filter.noPrice) { conditions.push('(ce.custom_price IS NULL OR ce.custom_price = 0)'); }
  if (filter.needsAttention) {
    conditions.push(`(
      (ce.custom_price IS NULL OR ce.custom_price = 0)
      OR NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)
      OR (p.description IS NULL AND p.ai_description_professional IS NULL)
    )`);
  }
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
  const orderBy = SORT_MAP[filter.sortBy] || 'ce.updated_at DESC';
  const [rows] = await db.query(
    `SELECT ce.id, ce.product_id, ce.status, ce.custom_name, ce.custom_price, ce.stock_quantity, ce.low_stock_threshold,
            p.name, p.barcode, p.ai_category_suggestion AS category, p.brand,
            (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS image
     FROM catalog_entries ce
     JOIN products p ON ce.product_id = p.id
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT ?`,
    [...params, limit]
  );
  return rows;
}

// Server-side analyze handlers — run actual SQL aggregations so the model
// can't hallucinate numbers. Each returns a structured object the frontend
// renders as an insight card.
async function runAnalyze(query, storeId) {
  if (query === 'overview') {
    const [[s]] = await db.query(
      `SELECT COUNT(*) total,
              SUM(CASE WHEN status='Draft' THEN 1 ELSE 0 END) drafts,
              SUM(CASE WHEN status='Review' THEN 1 ELSE 0 END) review,
              SUM(CASE WHEN status='Published' THEN 1 ELSE 0 END) published,
              SUM(CASE WHEN status='Exported' THEN 1 ELSE 0 END) exported,
              SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) out_of_stock,
              SUM(CASE WHEN stock_quantity IS NOT NULL AND low_stock_threshold IS NOT NULL AND stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END) low_stock,
              COALESCE(SUM(custom_price * COALESCE(stock_quantity, 0)), 0) inventory_value
       FROM catalog_entries WHERE store_id = ?`, [storeId]);
    return {
      kind: 'overview',
      metrics: [
        { label: 'Total products', value: Number(s.total) || 0 },
        { label: 'Published', value: Number(s.published) || 0 },
        { label: 'Drafts', value: Number(s.drafts) || 0 },
        { label: 'In review', value: Number(s.review) || 0 },
        { label: 'Out of stock', value: Number(s.out_of_stock) || 0, tone: Number(s.out_of_stock) > 0 ? 'warn' : 'ok' },
        { label: 'Low stock', value: Number(s.low_stock) || 0, tone: Number(s.low_stock) > 0 ? 'warn' : 'ok' },
        { label: 'Inventory value', value: '$' + (Number(s.inventory_value) || 0).toFixed(2) },
      ],
    };
  }
  if (query === 'category_breakdown') {
    const [rows] = await db.query(
      `SELECT COALESCE(p.ai_category_suggestion, 'Uncategorized') category, COUNT(*) n
       FROM catalog_entries ce JOIN products p ON ce.product_id = p.id
       WHERE ce.store_id = ?
       GROUP BY category ORDER BY n DESC LIMIT 8`, [storeId]);
    const total = rows.reduce((a, r) => a + Number(r.n), 0) || 1;
    return {
      kind: 'breakdown',
      total,
      rows: rows.map(r => ({ label: r.category, value: Number(r.n), pct: Math.round((Number(r.n) / total) * 100) })),
    };
  }
  if (query === 'inventory_health') {
    const [[h]] = await db.query(
      `SELECT
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) out_of_stock,
        SUM(CASE WHEN stock_quantity IS NOT NULL AND low_stock_threshold IS NOT NULL AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END) low_stock,
        SUM(CASE WHEN custom_price IS NULL OR custom_price = 0 THEN 1 ELSE 0 END) no_price,
        COUNT(*) total
       FROM catalog_entries WHERE store_id = ?`, [storeId]);
    const [[na]] = await db.query(
      `SELECT COUNT(*) n FROM catalog_entries ce JOIN products p ON ce.product_id = p.id
       WHERE ce.store_id = ? AND (
         (ce.custom_price IS NULL OR ce.custom_price = 0)
         OR NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)
         OR (p.description IS NULL AND p.ai_description_professional IS NULL)
       )`, [storeId]);
    return {
      kind: 'health',
      metrics: [
        { label: 'Out of stock', value: Number(h.out_of_stock) || 0, tone: Number(h.out_of_stock) > 0 ? 'warn' : 'ok' },
        { label: 'Low stock', value: Number(h.low_stock) || 0, tone: Number(h.low_stock) > 0 ? 'warn' : 'ok' },
        { label: 'Missing price', value: Number(h.no_price) || 0, tone: Number(h.no_price) > 0 ? 'warn' : 'ok' },
        { label: 'Needs attention', value: Number(na.n) || 0, tone: Number(na.n) > 0 ? 'warn' : 'ok' },
        { label: 'Total products', value: Number(h.total) || 0 },
      ],
    };
  }
  if (query === 'pricing') {
    const [[p]] = await db.query(
      `SELECT MIN(custom_price) min_p, MAX(custom_price) max_p, AVG(custom_price) avg_p, COUNT(custom_price) priced
       FROM catalog_entries WHERE store_id = ? AND custom_price IS NOT NULL AND custom_price > 0`, [storeId]);
    return {
      kind: 'pricing',
      metrics: [
        { label: 'Priced products', value: Number(p.priced) || 0 },
        { label: 'Min price', value: p.min_p != null ? '$' + Number(p.min_p).toFixed(2) : '—' },
        { label: 'Max price', value: p.max_p != null ? '$' + Number(p.max_p).toFixed(2) : '—' },
        { label: 'Average price', value: p.avg_p != null ? '$' + Number(p.avg_p).toFixed(2) : '—' },
      ],
    };
  }
  return null;
}

// Compute a prioritized "what to do next" picture from the catalog state.
// Used by the RECOMMEND intent. Each item is actionable — title + count +
// suggested action so the frontend can render an interactive list.
async function runRecommendation(storeId) {
  const items = [];
  const [[oos]] = await db.query(
    `SELECT COUNT(*) n FROM catalog_entries WHERE store_id = ? AND stock_quantity = 0`, [storeId]);
  if (Number(oos.n) > 0) {
    items.push({ priority: 'urgent', title: `${oos.n} product${oos.n === 1 ? '' : 's'} out of stock`, why: 'Customers see them but can\'t buy', action: 'Show out-of-stock', filter: { maxStock: 0 } });
  }
  const [[lowStock]] = await db.query(
    `SELECT COUNT(*) n FROM catalog_entries
     WHERE store_id = ? AND stock_quantity IS NOT NULL AND low_stock_threshold IS NOT NULL
       AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold`, [storeId]);
  if (Number(lowStock.n) > 0) {
    items.push({ priority: 'high', title: `${lowStock.n} product${lowStock.n === 1 ? '' : 's'} below low-stock threshold`, why: 'Will run out soon', action: 'Show low stock', filter: { lowStock: true, sortBy: 'stock_asc' } });
  }
  const [[needsAttention]] = await db.query(
    `SELECT COUNT(*) n FROM catalog_entries ce JOIN products p ON ce.product_id = p.id
     WHERE ce.store_id = ? AND (
       (ce.custom_price IS NULL OR ce.custom_price = 0)
       OR NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)
       OR (p.description IS NULL AND p.ai_description_professional IS NULL)
     )`, [storeId]);
  if (Number(needsAttention.n) > 0) {
    items.push({ priority: 'high', title: `${needsAttention.n} product${needsAttention.n === 1 ? '' : 's'} need attention`, why: 'Missing price, image, or description', action: 'Show them', filter: { needsAttention: true } });
  }
  const [[drafts]] = await db.query(
    `SELECT COUNT(*) n FROM catalog_entries WHERE store_id = ? AND status = 'Draft'`, [storeId]);
  if (Number(drafts.n) > 5) {
    items.push({ priority: 'medium', title: `${drafts.n} drafts waiting`, why: 'Move them to Review or Published when ready', action: 'Show drafts', filter: { status: 'Draft' } });
  }
  const [[reviews]] = await db.query(
    `SELECT COUNT(*) n FROM catalog_entries WHERE store_id = ? AND status = 'Review'`, [storeId]);
  if (Number(reviews.n) > 0) {
    items.push({ priority: 'medium', title: `${reviews.n} product${reviews.n === 1 ? '' : 's'} in Review`, why: 'Approve to publish or send back to Draft', action: 'Show review queue', filter: { status: 'Review' } });
  }
  const [[noPrice]] = await db.query(
    `SELECT COUNT(*) n FROM catalog_entries WHERE store_id = ? AND (custom_price IS NULL OR custom_price = 0)`, [storeId]);
  if (Number(noPrice.n) > 0 && Number(noPrice.n) <= Number(needsAttention.n)) {
    // Don't duplicate — only surface if it's a distinct slice
  }
  if (items.length === 0) {
    items.push({ priority: 'info', title: 'Your catalog looks healthy', why: 'No urgent issues — try the Trending page for product ideas', action: null, filter: null });
  }
  return { items: items.slice(0, 6) };
}

// Build a rich context block the LLM sees on every turn. Without this the
// model has 4 numbers and guesses everything else.
async function buildCatalogContext(storeId) {
  const [[stats]] = await db.query(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN status='Draft' THEN 1 ELSE 0 END) drafts,
            SUM(CASE WHEN status='Published' THEN 1 ELSE 0 END) published,
            SUM(CASE WHEN status='Review' THEN 1 ELSE 0 END) review,
            SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) out_of_stock,
            SUM(CASE WHEN stock_quantity IS NOT NULL AND low_stock_threshold IS NOT NULL AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END) low_stock
     FROM catalog_entries WHERE store_id = ?`, [storeId]);
  const [tagRows] = await db.query('SELECT name FROM tags WHERE store_id = ? ORDER BY name LIMIT 30', [storeId]);
  const [catRows] = await db.query(
    `SELECT COALESCE(p.ai_category_suggestion, 'Uncategorized') category, COUNT(*) n
     FROM catalog_entries ce JOIN products p ON ce.product_id = p.id
     WHERE ce.store_id = ? GROUP BY category ORDER BY n DESC LIMIT 5`, [storeId]);
  const [voiceRows] = await db.query('SELECT name FROM brand_voices WHERE store_id = ? ORDER BY is_default DESC, name LIMIT 10', [storeId]);
  const [[needs]] = await db.query(
    `SELECT COUNT(*) n FROM catalog_entries ce JOIN products p ON ce.product_id = p.id
     WHERE ce.store_id = ? AND (
       (ce.custom_price IS NULL OR ce.custom_price = 0)
       OR NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)
       OR (p.description IS NULL AND p.ai_description_professional IS NULL)
     )`, [storeId]);
  return {
    stats: {
      total: Number(stats.total) || 0,
      drafts: Number(stats.drafts) || 0,
      published: Number(stats.published) || 0,
      review: Number(stats.review) || 0,
      out_of_stock: Number(stats.out_of_stock) || 0,
      low_stock: Number(stats.low_stock) || 0,
    },
    tags: tagRows.map(t => t.name),
    top_categories: catRows.map(r => ({ category: r.category, count: Number(r.n) })),
    brand_voices: voiceRows.map(v => v.name),
    needs_attention: Number(needs.n) || 0,
  };
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

const VALID_ROUTES = new Set([
  '/', '/dashboard', '/catalog', '/search', '/trending', '/analytics',
  '/brand-voices', '/settings', '/activity',
]);

const HELP_TOPICS = {
  capabilities: {
    title: 'What I can do',
    points: [
      'Find products by name, price, stock, status, tag, brand, or category',
      'Spot products that need attention (missing price, image, or description)',
      'Run actions: update price/stock/status, add tags, create products and tags, delete in bulk',
      'Show catalog analytics: overview, category breakdown, inventory health, pricing stats',
      'Recommend priorities — ask "what should I focus on?"',
      'Navigate to any page — just ask',
      'Explain how CatalogAI features work (exports, brand voices, scanner, team, tags, status, completeness)',
    ],
  },
  'getting-started': {
    title: 'Getting started',
    points: [
      'Add your first product: click "New Catalog" in the sidebar, then scan a barcode or upload a photo',
      'The AI fills in name, brand, description, and category — review and edit anything you want',
      'Save it as Draft (still editing), Review (ready for a teammate to check), or Published (live)',
      'Use the AI Catalog Chat (this thing) to bulk-edit, analyze, or jump around the app',
      'Invite team members in Settings → Team so multiple people can work on the same catalog',
    ],
  },
  exports: {
    title: 'How exports work',
    points: [
      'Pick a product → choose a format (Shopify CSV, Amazon, Google Shopping, Etsy, PDF)',
      'Shopify supports live sync — direct push to your store via API credentials in Settings → Integrations',
      'PDF exports include AI-generated description, specs, and image',
      'Export history is on the Export page; failed exports can be retried',
    ],
  },
  voices: {
    title: 'How brand voices work',
    points: [
      'A brand voice is a tone preset: name, style description, optional keywords, and an example',
      'When you generate a product description, the AI rewrites it in your chosen voice',
      'Three built-in voices ship out of the box: Professional, Friendly, Luxury',
      'You can create unlimited custom voices in the Brand Voices page',
    ],
  },
  scanner: {
    title: 'How the barcode scanner works',
    points: [
      'Open the Search step and click the camera icon',
      'Point the camera at a UPC/EAN — supports 1D and 2D barcodes',
      'Or switch to "Product photo" mode to identify a product without a barcode',
      'AI fills in name, brand, category, description automatically',
    ],
  },
  team: {
    title: 'Team and invites',
    points: [
      'Three roles: Admin (full), Editor (no delete or team mgmt), Viewer (read-only)',
      'Invite by email from Settings → Team; invitee gets a one-click signup link',
      'Each signup creates a store; team members join that store',
      'Invite emails fall back to a copyable link if SMTP fails',
    ],
  },
  tags: {
    title: 'How tagging works',
    points: [
      'Tags are colored labels you attach to any product (Sale, Featured, Summer, etc.)',
      'Create tags in the Tag Manager on the Dashboard, or via chat: "create a tag called Sale red"',
      'Apply tags to one or many products at once — drag-select or use bulk actions',
      'Filter the catalog by tag from the Dashboard or ask the assistant: "show me all Sale items"',
    ],
  },
  status: {
    title: 'Status workflow',
    points: [
      'Draft — still being edited; nobody sees it but you and your team',
      'Review — finished editing; flagged for a teammate to approve',
      'Published — live, ready to be exported to a sales channel',
      'Exported — has been sent to at least one platform (Shopify, Amazon, etc.)',
      'Change a status in the Dashboard or ask the assistant: "publish all drafts"',
    ],
  },
  completeness: {
    title: 'Completeness score',
    points: [
      'A 0–100% score showing how much of a product is filled in',
      'Counts: name, price, description, category, image, brand, barcode, specs',
      'Visible as a colored ring on Dashboard rows — green ≥80, yellow 40-79, red <40',
      'Ask "what needs attention?" to surface low-completeness items',
    ],
  },
  shortcuts: {
    title: 'Keyboard shortcuts',
    points: [
      'Ctrl/Cmd+K — open the AI Catalog Chat (this)',
      'Ctrl/Cmd+1..6 — jump to Dashboard / New Catalog / Trending / Analytics / Brand Voices / Settings',
      'Ctrl/Cmd+N — start a new catalog entry',
      '? — show the full shortcuts overlay',
      'Esc — close any open modal or dock',
    ],
  },
  glossary: {
    title: 'CatalogAI quick glossary',
    points: [
      'Catalog entry — one product line in your store; has a status, optional price, stock, tags',
      'Product — the underlying shared data (name, brand, AI descriptions) that a catalog entry references',
      'Brand voice — a tone preset that controls how the AI writes descriptions (Professional / Friendly / Luxury / custom)',
      'SEO tags — keywords the AI generates for findability, separate from your own tags',
      'Store — a multi-tenant workspace; each signup creates one, team members join it',
    ],
  },
};

// Robust JSON parse — strips backtick fences, retries.
function parseModelJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const cleaned = String(raw)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try to find the first {...} block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

// Build the system+history+user message array for Groq
function buildChatMessages({ context, role, history, message }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + `\n\nCATALOG CONTEXT (use these real numbers in TEXT answers; do not invent):\n${JSON.stringify(context)}\n\nUSER ROLE: ${role}` },
  ];
  if (Array.isArray(history)) {
    history.slice(-8).forEach(h => {
      if (h?.role && h?.content) messages.push({ role: h.role, content: String(h.content).slice(0, 1000) });
    });
  }
  messages.push({ role: 'user', content: String(message).slice(0, 1000) });
  return messages;
}

// Route a parsed model response → final payload (runs DB queries, validates, etc.)
async function buildChatPayload(parsed, raw, storeId) {
  if (!parsed) {
    const trimmed = String(raw || '').replace(/```/g, '').trim().slice(0, 500);
    return { type: 'text', message: trimmed || "I had trouble understanding. Try rephrasing?" };
  }

  if (parsed.type === 'filter') {
    const items = await runFilter(parsed.filter || {}, storeId);
    return { type: 'filter', summary: parsed.summary || 'Results', filter: parsed.filter, items };
  }

  if (parsed.type === 'analyze') {
    const insight = await runAnalyze(parsed.query, storeId);
    if (!insight) return { type: 'text', message: parsed.summary || "I'm not sure how to analyze that. Try 'overview', 'category breakdown', 'inventory health', or 'pricing'." };
    return { type: 'analyze', query: parsed.query, summary: parsed.summary || 'Insight', insight };
  }

  if (parsed.type === 'navigate') {
    const route = String(parsed.route || '').trim();
    if (!VALID_ROUTES.has(route)) {
      return { type: 'text', message: `I can open: ${[...VALID_ROUTES].join(', ')}. Where do you want to go?` };
    }
    return { type: 'navigate', route, label: parsed.label || route, summary: parsed.summary || `Opening ${parsed.label || route}` };
  }

  if (parsed.type === 'help') {
    const topic = HELP_TOPICS[parsed.topic] ? parsed.topic : 'capabilities';
    return { type: 'help', topic, summary: parsed.summary || HELP_TOPICS[topic].title, content: HELP_TOPICS[topic] };
  }

  if (parsed.type === 'recommend') {
    const rec = await runRecommendation(storeId);
    return { type: 'recommend', summary: parsed.summary || "Here's what to focus on", recommendations: rec.items };
  }

  if (parsed.type === 'action') {
    if (!ALLOWED_ACTIONS.has(parsed.action)) {
      return { type: 'text', message: `I don't know how to "${parsed.action}". Try a different phrasing.` };
    }
    if (CREATE_ACTIONS.has(parsed.action)) {
      return {
        type: 'action',
        action: parsed.action,
        filter: {},
        change: parsed.change || {},
        summary: parsed.summary || `Create a new ${parsed.action === 'create_tag' ? 'tag' : 'product'}`,
        affected: 1,
        preview: [],
      };
    }
    const previewItems = await runFilter(parsed.filter || {}, storeId);
    return {
      type: 'action',
      action: parsed.action,
      filter: parsed.filter || {},
      change: parsed.change || {},
      summary: parsed.summary || `${parsed.action} on ${previewItems.length} products`,
      affected: previewItems.length,
      preview: previewItems.slice(0, 10),
    };
  }

  return { type: 'text', message: parsed.message || 'Done.' };
}

// POST /api/chat — converse with catalog (non-streaming, fallback)
router.post('/', auth, async (req, res) => {
  const { message, history } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  try {
    const context = await buildCatalogContext(req.user.store_id);
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const messages = buildChatMessages({ context, role: req.user.role, history, message });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 700,
      temperature: 0.3,
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    const parsed = parseModelJson(raw);
    const payload = await buildChatPayload(parsed, raw, req.user.store_id);
    return res.json(payload);
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Chat failed. Please try again.' });
  }
});

// POST /api/chat/stream — SSE-streamed version. Forwards each Groq token as a
// `token` event so the client can show text appearing live, then emits a single
// `final` event with the fully-routed payload (same shape as POST /).
router.post('/stream', auth, async (req, res) => {
  const { message, history } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // If the client drops, abort the upstream Groq request.
  const abortCtrl = new AbortController();
  req.on('close', () => { try { abortCtrl.abort(); } catch {} });

  try {
    const context = await buildCatalogContext(req.user.store_id);
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const messages = buildChatMessages({ context, role: req.user.role, history, message });

    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 700,
      temperature: 0.3,
      stream: true,
    }, { signal: abortCtrl.signal });

    let raw = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        raw += delta;
        send('token', { delta });
      }
    }

    const parsed = parseModelJson(raw);
    const payload = await buildChatPayload(parsed, raw, req.user.store_id);
    send('final', payload);
    res.end();
  } catch (err) {
    // AbortError from client disconnect is silent — nothing to send.
    if (err?.name === 'AbortError') { try { res.end(); } catch {} return; }
    console.error('Chat stream error:', err.message);
    try { send('error', { error: 'Chat failed. Please try again.' }); res.end(); } catch {}
  }
});

// GET /api/chat/suggestions — dynamic empty-state prompts based on real state
router.get('/suggestions', auth, async (req, res) => {
  try {
    const ctx = await buildCatalogContext(req.user.store_id);
    const out = [];
    if (ctx.stats.total === 0) {
      out.push('Add a Premium Coffee Mug at $25');
      out.push('How does the scanner work?');
      out.push('What can you do?');
    } else {
      out.push('What should I focus on?');
      out.push('How is my catalog doing?');
      if (ctx.needs_attention > 0) out.push(`Show me the ${ctx.needs_attention} products that need attention`);
      if (ctx.stats.low_stock > 0) out.push(`What's running low? (${ctx.stats.low_stock})`);
      if (ctx.stats.drafts > 0) out.push(`Show my ${ctx.stats.drafts} drafts`);
      if (ctx.stats.out_of_stock > 0) out.push(`Find ${ctx.stats.out_of_stock} out-of-stock items`);
      if (ctx.top_categories[0]) out.push(`Category breakdown`);
    }
    // Always cap at 6 chips, dedupe
    const seen = new Set();
    const chips = out.filter(c => { if (seen.has(c)) return false; seen.add(c); return true; }).slice(0, 6);
    res.json({ chips });
  } catch (err) {
    console.error('Suggestions error:', err.message);
    res.json({ chips: ['How is my catalog doing?', 'Show products that need attention', 'What can you do?'] });
  }
});

// POST /api/chat/followups — given the last exchange, ask the model for 3 short
// next-prompt suggestions. Cheap secondary call (small max_tokens, fast model)
// so it doesn't slow the user's main turn.
router.post('/followups', auth, async (req, res) => {
  const { lastUser, lastAssistant } = req.body || {};
  if (!process.env.GROQ_API_KEY) return res.json({ chips: [] });
  if (!lastUser && !lastAssistant) return res.json({ chips: [] });
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const prompt = `The user is chatting with their e-commerce catalog assistant. Given the last exchange, propose THREE short, distinct, useful next prompts the user might want to send. Each one MUST:
- be under 8 words
- be a plausible thing a catalog owner would actually ask next (refine the result, take a follow-up action, dig deeper, change tack)
- NOT repeat the user's previous question
- be phrased as the user would type it (first person, casual, no quotes)

Return ONLY a JSON object: {"chips": ["...", "...", "..."]}

Last user message: ${String(lastUser || '').slice(0, 400)}
Last assistant response (summary): ${String(lastAssistant || '').slice(0, 600)}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0.6,
    });
    const raw = completion.choices?.[0]?.message?.content || '{}';
    const parsed = parseModelJson(raw) || {};
    const chips = Array.isArray(parsed.chips) ? parsed.chips.filter(c => typeof c === 'string' && c.trim()).slice(0, 3) : [];
    res.json({ chips });
  } catch (err) {
    console.warn('[chat] followups failed:', err.message);
    res.json({ chips: [] });
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
