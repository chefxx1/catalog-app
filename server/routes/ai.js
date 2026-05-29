const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const auth = require('../middleware/auth');
const db = require('../db');

const requireRole = require('../middleware/requireRole');
const { sanitize } = require('../middleware/validate');

const router = express.Router();

// Map a retailer name (as Gemini returns it) to its canonical domain so we can
// build a real Google search URL instead of relying on Gemini-hallucinated
// product URLs (which 404 in front of demo judges).
const RETAILER_DOMAINS = {
  'amazon': 'amazon.com',
  'ebay': 'ebay.com',
  'walmart': 'walmart.com',
  'target': 'target.com',
  'best buy': 'bestbuy.com',
  'bestbuy': 'bestbuy.com',
  'home depot': 'homedepot.com',
  'lowes': 'lowes.com',
  "lowe's": 'lowes.com',
  'wayfair': 'wayfair.com',
  'ikea': 'ikea.com',
  'costco': 'costco.com',
  'sams club': 'samsclub.com',
  "sam's club": 'samsclub.com',
  'etsy': 'etsy.com',
  'rei': 'rei.com',
  'newegg': 'newegg.com',
  'b&h': 'bhphotovideo.com',
  'micro center': 'microcenter.com',
  'apple': 'apple.com',
  'nike': 'nike.com',
  'adidas': 'adidas.com',
  'sephora': 'sephora.com',
  'ulta': 'ulta.com',
  'shopify': 'shopify.com',
  'aliexpress': 'aliexpress.com',
};

function buildSourceUrl(retailerName, productName) {
  const q = (productName || '').trim();
  if (!q) return 'https://www.google.com/search';
  const domain = RETAILER_DOMAINS[String(retailerName || '').toLowerCase().trim()];
  const query = domain ? `site:${domain} ${q}` : q;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// Map raw Gemini SDK errors to short user-facing strings. Gemini returns a
// stringified blob with quota/rate-limit details that we don't want to render
// directly in the AI description card.
function friendlyAiError(err) {
  const msg = String(err?.message || err || '');
  if (/429|too many requests|quota|rate.?limit/i.test(msg)) {
    return 'AI is temporarily unavailable — try again in a minute.';
  }
  if (/api.?key|invalid.?key|permission.?denied|unauthor/i.test(msg)) {
    return 'AI service is not configured. Please contact support.';
  }
  if (/network|fetch failed|timeout|ECONNRESET|ENOTFOUND/i.test(msg)) {
    return 'Could not reach the AI service. Check your connection and try again.';
  }
  if (/safety|blocked/i.test(msg)) {
    return 'The AI declined to generate content for this product.';
  }
  return 'AI generation failed. Please try again.';
}

// Validate base64 image: MIME type whitelist + size limit
function validateBase64Image(data) {
  if (!data || typeof data !== 'string') return 'Image data is required';
  const match = data.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/);
  if (!match) return 'Invalid image format. Only JPEG, PNG, WEBP, or GIF allowed';
  const base64 = match[2];
  // Rough size check: base64 is ~1.37x the binary size
  const sizeBytes = (base64.length * 3) / 4;
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (sizeBytes > MAX_SIZE) return 'Image too large. Max 10 MB';
  return null;
}

function getModel(modelName = 'gemini-2.5-flash') {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: modelName });
}

// Retry wrapper: tries primary model with exponential backoff, then falls back to secondary models on 503/overload
// Quota-conscious retry: 0 retries per model + 2 models total = 2 max attempts.
// Was 2 retries × 3 models = 9 max — burned daily quota fast on flaky 503s.
async function generateWithRetry(generateFn, { maxRetries = 0 } = {}) {
  const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr;
  for (const modelName of fallbackModels) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const model = getModel(modelName);
        return await generateFn(model);
      } catch (err) {
        lastErr = err;
        const msg = err.message || '';
        const isOverload = msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand') || msg.includes('Service Unavailable');
        if (!isOverload) throw err; // not a retryable error
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 800));
        }
      }
    }
    // Exhausted retries for this model — fall through to next fallback
  }
  throw lastErr || new Error('All model fallbacks failed');
}

// POST /api/ai/generate — generate descriptions, category, and SEO tags
router.post('/generate', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { name, brand, category, description, specs, brandVoice, customInstructions: rawInstructions, language } = req.body;

    if (!name) return res.status(400).json({ error: 'Product name is required' });
    const customInstructions = rawInstructions ? sanitize(rawInstructions).slice(0, 500) : null;
    const langInstruction = language ? `\n\nIMPORTANT: Generate ALL content (descriptions, category, SEO tags, meta title, meta description) in ${language}. The output must be entirely in ${language}, not English. Also translate the product specifications/attributes into ${language} and return them in a "translatedSpecs" field as a key-value object.` : '';

    // Build product context
    const productInfo = [
      `Product: ${name}`,
      brand ? `Brand: ${brand}` : null,
      category ? `Category: ${category}` : null,
      description ? `Description: ${description}` : null,
      specs ? `Specifications: ${JSON.stringify(specs)}` : null,
    ].filter(Boolean).join('\n');

    // Brand voice / custom instructions context
    const voiceContext = customInstructions
      ? `\nCustom instructions from the user: ${customInstructions}`
      : brandVoice ? `\nBrand voice guidelines:\n- Tone: ${brandVoice.tone || 'Professional'}\n- Audience: ${brandVoice.audience || 'General consumers'}\n- Style: ${brandVoice.style || 'Clear and informative'}\n- Include keywords: ${(brandVoice.includeKeywords || []).join(', ') || 'none'}\n- Exclude keywords: ${(brandVoice.excludeKeywords || []).join(', ') || 'none'}` : '';

    const prompt = `You are an expert e-commerce product copywriter. Given the following product information, generate marketing content.

${productInfo}
${voiceContext}${langInstruction}

Return a JSON object with exactly this structure (no markdown, no code fences, just raw JSON):
{
  "descriptions": {
    "professional": "A professional, data-driven product description (2-3 sentences). Focus on specifications, value, and credibility.",
    "friendly": "A warm, conversational product description (2-3 sentences). Use casual language, contractions, and enthusiasm.",
    "luxury": "An elevated, aspirational product description (2-3 sentences). Emphasize craftsmanship, exclusivity, and sensory experience."
  },
  "category": "Suggested category path like: Main Category > Subcategory > Type",
  "seoTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "metaTitle": "SEO-optimized title under 60 characters",
  "metaDescription": "SEO-optimized meta description under 155 characters"${language ? `,
  "translatedSpecs": { "key in target language": "value in target language" },
  "translatedName": "Product name in target language"` : ''}
}`;

    const result = await generateWithRetry(m => m.generateContent(prompt));
    const text = result.response.text().trim();

    // Parse JSON from response (handle possible markdown fences)
    let parsed;
    try {
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Save to database if barcode provided
    const { barcode } = req.body;
    if (barcode) {
      await db.query(
        `UPDATE products SET
          ai_description_professional = ?,
          ai_description_friendly = ?,
          ai_description_luxury = ?,
          ai_category_suggestion = ?,
          seo_tags = ?,
          updated_at = NOW()
        WHERE barcode = ?`,
        [
          parsed.descriptions?.professional || null,
          parsed.descriptions?.friendly || null,
          parsed.descriptions?.luxury || null,
          parsed.category || null,
          JSON.stringify(parsed.seoTags || []),
          barcode,
        ]
      );
    }

    res.json({
      descriptions: parsed.descriptions || {},
      category: parsed.category || null,
      seoTags: parsed.seoTags || [],
      metaTitle: parsed.metaTitle || null,
      metaDescription: parsed.metaDescription || null,
      translatedSpecs: parsed.translatedSpecs || null,
      translatedName: parsed.translatedName || null,
    });
  } catch (err) {
    console.error('AI generate error:', err.message);
    if (err.message.includes('GEMINI_API_KEY')) {
      return res.status(400).json({ error: 'AI API key not configured. Add your Gemini API key in Settings.' });
    }
    res.status(500).json({ error: friendlyAiError(err) });
  }
});

// POST /api/ai/stream-description — stream all 3 tones in one call via SSE.
// Output is parsed live for [PROFESSIONAL], [FRIENDLY], [LUXURY] markers and
// each chunk is routed to the right tone box on the frontend.
router.post('/stream-description', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  const { name, brand, category, description, specs, brandVoice, customInstructions: rawInstructions, language } = req.body;

  if (!name) return res.status(400).json({ error: 'Product name is required' });
  const customInstructions = rawInstructions ? sanitize(rawInstructions).slice(0, 500) : null;
  const langInstruction = language ? `\n\nWrite all content in ${language}, not English.` : '';
  const productInfo = [
    `Product: ${name}`,
    brand ? `Brand: ${brand}` : null,
    category ? `Category: ${category}` : null,
    description ? `Description: ${description}` : null,
    specs ? `Specifications: ${JSON.stringify(specs)}` : null,
  ].filter(Boolean).join('\n');
  const voiceContext = customInstructions
    ? `\nCustom instructions: ${customInstructions}`
    : brandVoice ? `\nBrand voice:\n- Tone: ${brandVoice.tone || 'Professional'}\n- Audience: ${brandVoice.audience || 'General consumers'}\n- Style: ${brandVoice.style || 'Clear and informative'}\n- Include keywords: ${(brandVoice.includeKeywords || []).join(', ') || 'none'}\n- Exclude keywords: ${(brandVoice.excludeKeywords || []).join(', ') || 'none'}` : '';

  // Hybrid: a brand voice / custom instruction defines the tone → ONE description.
  // With neither, fan out to the 3 tone variants so the user can compare/pick.
  const single = !!(brandVoice || customInstructions);

  const directive = `Write ONE product description (2-4 sentences) that fully embodies the ${customInstructions ? 'custom instructions' : 'brand voice'} above${brandVoice?.tone ? ` in a ${brandVoice.tone} tone` : ''}.${(brandVoice?.includeKeywords || []).length ? ` Naturally weave in: ${brandVoice.includeKeywords.join(', ')}.` : ''}${(brandVoice?.excludeKeywords || []).length ? ` Avoid: ${brandVoice.excludeKeywords.join(', ')}.` : ''}`;

  const singlePrompt = `You are an expert e-commerce product copywriter.
${productInfo}
${voiceContext}${langInstruction}

${directive}

Output ONLY the description text. No preamble, no markers, no quotes.`;

  const threeTonePrompt = `You are an expert e-commerce product copywriter.
${productInfo}
${voiceContext}${langInstruction}

Write THREE product descriptions for the product, one per tone. Use this EXACT format with the bracketed markers, each on its own line:

[PROFESSIONAL]
A professional, data-driven description (2-3 sentences). Focus on specifications, value, and credibility.

[FRIENDLY]
A warm, conversational description (2-3 sentences). Use casual language, contractions, and enthusiasm.

[LUXURY]
An elevated, aspirational description (2-3 sentences). Emphasize craftsmanship, exclusivity, and sensory experience.

Output ONLY the three markers with their descriptions. No preamble, no closing text, no quotes around the descriptions.`;

  const prompt = single ? singlePrompt : threeTonePrompt;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // State machine: track which tone we're currently writing into.
  // null = haven't seen any marker yet (or between markers).
  let currentTone = null;
  let buffer = '';
  const accumulated = { Professional: '', Friendly: '', Luxury: '' };

  const TONE_MAP = {
    '[PROFESSIONAL]': 'Professional',
    '[FRIENDLY]':     'Friendly',
    '[LUXURY]':       'Luxury',
  };

  const flushBuffer = () => {
    // Look for any tone marker in the buffer
    while (buffer.length > 0) {
      const earliestIdx = Object.keys(TONE_MAP)
        .map(m => ({ m, i: buffer.indexOf(m) }))
        .filter(x => x.i !== -1)
        .sort((a, b) => a.i - b.i)[0];

      if (!earliestIdx) {
        // No marker in buffer — emit text up to last 20 chars (in case marker is split across chunks)
        const safeEnd = Math.max(0, buffer.length - 20);
        const emit = buffer.slice(0, safeEnd);
        buffer = buffer.slice(safeEnd);
        if (emit && currentTone) {
          accumulated[currentTone] += emit;
          send('tone-chunk', { tone: currentTone, text: emit });
        }
        break;
      }

      // Emit anything before the marker
      const before = buffer.slice(0, earliestIdx.i);
      if (before && currentTone) {
        accumulated[currentTone] += before;
        send('tone-chunk', { tone: currentTone, text: before });
      }
      // Switch to new tone
      currentTone = TONE_MAP[earliestIdx.m];
      buffer = buffer.slice(earliestIdx.i + earliestIdx.m.length);
      // Skip leading newlines after the marker
      buffer = buffer.replace(/^[\r\n]+/, '');
    }
  };

  try {
    const model = getModel();
    const result = await model.generateContentStream(prompt);

    // Single-voice mode: no markers, stream the whole thing under one 'Voice' key
    if (single) {
      let voiceText = '';
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) { voiceText += text; send('tone-chunk', { tone: 'Voice', text }); }
      }
      send('done', { tones: { Voice: voiceText.trim() }, single: true });
      res.end();
      return;
    }

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        buffer += text;
        flushBuffer();
      }
    }
    // Flush any remaining buffer at end of stream
    if (buffer && currentTone) {
      accumulated[currentTone] += buffer;
      send('tone-chunk', { tone: currentTone, text: buffer });
      buffer = '';
    }
    // Trim trailing whitespace per tone
    Object.keys(accumulated).forEach(k => { accumulated[k] = accumulated[k].trim(); });
    send('done', { tones: accumulated });
    res.end();
  } catch (err) {
    console.error('Stream error:', err.message);
    send('error', { error: friendlyAiError(err) });
    res.end();
  }
});

// POST /api/ai/identify — identify product from image
router.post('/identify', auth, async (req, res) => {
  try {
    const { image } = req.body; // base64 image data
    const imgErr = validateBase64Image(image);
    if (imgErr) return res.status(400).json({ error: imgErr });

    const model = getModel();

    const prompt = `You are a product identification expert. Analyze this product image and identify the product.

Return a JSON object with exactly this structure (no markdown, no code fences, just raw JSON):
{
  "name": "Full product name (be specific with model if identifiable)",
  "brand": "Brand name (or 'Unknown' if not identifiable)",
  "category": "Category path like: Main Category > Subcategory > Type",
  "description": "Brief product description (2-3 sentences)",
  "barcode": "Barcode/UPC if visible in image, otherwise null",
  "confidence": 85,
  "specs": {
    "key": "value"
  },
  "sources": [
    {"name": "Store Name", "trustScore": 85, "price": "$XX.XX"}
  ]
}

IMPORTANT for specs: Generate 5-8 specifications that are RELEVANT to this specific product type. Examples:
- Chair/Furniture: Material, Dimensions, Weight Capacity, Color, Assembly Required, Style
- Clothing/Shoes: Material, Size Range, Color, Care Instructions, Season, Fit Type
- Electronics/TV: Screen Size, Resolution, Connectivity, Weight, Dimensions, Processor
- Food/Beverage: Ingredients, Weight/Volume, Nutrition, Allergens, Origin
- Headphones/Audio: Driver Size, Frequency Response, Battery Life, Connectivity, Weight
Do NOT include specs from other product types (e.g. no "Battery Life" for a chair).

For sources: Suggest 3-5 real retailers where this type of product is commonly sold (e.g. Amazon, IKEA, Walmart, Wayfair, Best Buy, Target, etc). Estimate realistic prices and trust scores (60-95). Do NOT include URLs — the system generates them.

Be as specific as possible. If you can identify the exact product model, include it. Set confidence 0-100 based on how certain you are.`;

    // Strip data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType } },
    ]);
    const text = result.response.text().trim();

    let parsed;
    try {
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Replace any Gemini-suggested source URLs with real Google search URLs
    // scoped to each retailer's domain. Always-resolves > fake-product-page.
    if (Array.isArray(parsed.sources)) {
      parsed.sources = parsed.sources.map(s => ({
        ...s,
        url: buildSourceUrl(s?.name, parsed.name),
      }));
    }

    res.json(parsed);
  } catch (err) {
    console.error('AI identify error:', err.message);
    if (err.message.includes('GEMINI_API_KEY')) {
      return res.status(400).json({ error: 'AI API key not configured.' });
    }
    res.status(500).json({ error: friendlyAiError(err) });
  }
});

// POST /api/ai/quality-suggestions — AI-powered data quality tips for a product
router.post('/quality-suggestions', auth, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID is required' });

    // Fetch the product + catalog entry data
    const [products] = await db.query(
      `SELECT p.*, ce.custom_name, ce.custom_description, ce.custom_price, ce.selected_images
       FROM products p
       JOIN catalog_entries ce ON ce.product_id = p.id
       WHERE p.id = ? AND ce.store_id = ?
       LIMIT 1`,
      [productId, req.user.store_id]
    );
    if (products.length === 0) return res.status(404).json({ error: 'Product not found' });

    const p = products[0];
    const [images] = await db.query('SELECT COUNT(*) as count FROM product_images WHERE product_id = ?', [productId]);

    const model = getModel();

    const productSummary = [
      `Name: ${p.custom_name || p.name || 'MISSING'}`,
      `Brand: ${p.brand || 'MISSING'}`,
      `Description: ${p.custom_description || p.description || 'MISSING'}`,
      `Price: ${p.custom_price || 'MISSING'}`,
      `Category: ${p.ai_category_suggestion || 'MISSING'}`,
      `Image count: ${images[0].count}`,
      `Has AI descriptions: ${p.ai_description_professional ? 'Yes' : 'No'}`,
      `Has SEO tags: ${p.seo_tags && p.seo_tags !== '[]' ? 'Yes' : 'No'}`,
    ].join('\n');

    const prompt = `You are an e-commerce product data quality expert. Analyze this product listing and provide actionable suggestions to improve its completeness and quality for online selling.

Product Data:
${productSummary}

Return a JSON array of suggestions (no markdown fences, just raw JSON). Each suggestion:
{
  "priority": "high" | "medium" | "low",
  "field": "name" | "description" | "price" | "images" | "category" | "seo" | "general",
  "suggestion": "Brief actionable suggestion (1 sentence)"
}

Rules:
- Only suggest improvements for fields that are actually missing or weak
- If a field is present and good, don't suggest anything for it
- Max 6 suggestions, ordered by priority (high first)
- Be specific and actionable, not generic
- If the product data is excellent, return an empty array []`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    let suggestions;
    try {
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      suggestions = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    res.json({ suggestions: Array.isArray(suggestions) ? suggestions : [] });
  } catch (err) {
    console.error('AI quality suggestions error:', err.message);
    if (err.message.includes('GEMINI_API_KEY')) {
      return res.status(400).json({ error: 'AI API key not configured.' });
    }
    res.status(500).json({ error: 'Quality analysis failed: ' + err.message });
  }
});

// POST /api/ai/translate — generate product description in another language
router.post('/translate', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { name, brand, description, language } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });
    if (!language) return res.status(400).json({ error: 'Language is required' });

    const model = getModel();

    const prompt = `You are an expert e-commerce translator and copywriter. Translate and adapt the following product information into ${language}. Don't just translate literally — adapt it to sound natural and compelling for ${language}-speaking customers.

Product: ${name}
${brand ? `Brand: ${brand}` : ''}
${description ? `Description: ${description}` : ''}

Return a JSON object (no markdown fences, just raw JSON):
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
    res.json({ language, ...parsed });
  } catch (err) {
    console.error('AI translate error:', err.message);
    res.status(500).json({ error: 'Translation failed: ' + err.message });
  }
});

// POST /api/ai/search-images — find product images by name (Serper.dev)
router.post('/search-images', auth, async (req, res) => {
  try {
    const query = req.body.query ? sanitize(req.body.query).slice(0, 200) : null;
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query + ' product high quality', num: 8 }),
    });
    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({ error: data.message || 'Image search failed' });
    }

    const images = (data.images || []).map((item, i) => ({
      id: i + 1,
      url: item.imageUrl,
      thumbnail: item.thumbnailUrl || item.imageUrl,
      title: item.title || '',
      source: item.source || '',
      width: item.imageWidth || 0,
      height: item.imageHeight || 0,
    }));

    res.json({ images });
  } catch (err) {
    console.error('Image search error:', err.message);
    res.status(500).json({ error: 'Image search failed: ' + err.message });
  }
});

module.exports = router;
