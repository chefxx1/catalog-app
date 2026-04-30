const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dns = require('dns').promises;
const net = require('net');
const auth = require('../middleware/auth');
const db = require('../db');

const requireRole = require('../middleware/requireRole');
const { sanitize } = require('../middleware/validate');

const router = express.Router();

// Reject IPs in private/loopback/link-local/CGNAT/multicast/reserved ranges (SSRF guard)
function isPrivateIp(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local (incl. AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (fam === 6) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // ULA
    if (norm.startsWith('fe80')) return true; // link-local
    if (norm.startsWith('::ffff:')) return isPrivateIp(norm.slice(7)); // IPv4-mapped
    return false;
  }
  return false;
}

// Throws if the URL is not safe to fetch (SSRF guard for image URLs)
async function assertSafeImageUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Invalid image URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) image URLs allowed');
  }
  const host = parsed.hostname;
  if (!host) throw new Error('Invalid image URL');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Image host not allowed');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Image host not allowed');
    return;
  }
  const records = await dns.lookup(host, { all: true }).catch(() => []);
  if (records.length === 0) throw new Error('Could not resolve image host');
  if (records.some(r => isPrivateIp(r.address))) throw new Error('Image host resolves to private network');
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
    res.status(500).json({ error: 'AI generation failed: ' + err.message });
  }
});

// POST /api/ai/stream-description — stream all 3 tones in one call via SSE.
// Output is parsed live for [PROFESSIONAL], [FRIENDLY], [LUXURY] markers and
// each chunk is routed to the right tone box on the frontend.
router.post('/stream-description', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  const { name, brand, category, description, specs, brandVoice, customInstructions: rawInstructions, language } = req.body;

  if (!name) return res.status(400).json({ error: 'Product name is required' });
  const customInstructions = rawInstructions ? sanitize(rawInstructions).slice(0, 500) : null;
  const langInstruction = language ? `\n\nWrite all three descriptions in ${language}, not English.` : '';
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

  const prompt = `You are an expert e-commerce product copywriter.
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
    send('error', { error: err.message });
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
    {"name": "Store Name", "trustScore": 85, "price": "$XX.XX", "url": "https://..."}
  ]
}

IMPORTANT for specs: Generate 5-8 specifications that are RELEVANT to this specific product type. Examples:
- Chair/Furniture: Material, Dimensions, Weight Capacity, Color, Assembly Required, Style
- Clothing/Shoes: Material, Size Range, Color, Care Instructions, Season, Fit Type
- Electronics/TV: Screen Size, Resolution, Connectivity, Weight, Dimensions, Processor
- Food/Beverage: Ingredients, Weight/Volume, Nutrition, Allergens, Origin
- Headphones/Audio: Driver Size, Frequency Response, Battery Life, Connectivity, Weight
Do NOT include specs from other product types (e.g. no "Battery Life" for a chair).

For sources: Suggest 3-5 real retailers where this type of product is commonly sold (e.g. Amazon, IKEA, Walmart, Wayfair, Best Buy, Target, etc). Estimate realistic prices and trust scores (60-95).

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

    res.json(parsed);
  } catch (err) {
    console.error('AI identify error:', err.message);
    if (err.message.includes('GEMINI_API_KEY')) {
      return res.status(400).json({ error: 'AI API key not configured.' });
    }
    res.status(500).json({ error: 'Image identification failed: ' + err.message });
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

// POST /api/ai/optimize-title — generate platform-optimized titles
router.post('/optimize-title', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { name, brand, category, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });

    const model = getModel();

    const prompt = `You are an e-commerce SEO expert. Generate optimized product titles for different platforms.

Product: ${name}
${brand ? `Brand: ${brand}` : ''}
${category ? `Category: ${category}` : ''}
${description ? `Description: ${description}` : ''}

Return a JSON object (no markdown fences, just raw JSON):
{
  "shopify": "Shopify-optimized title (clear, brand-first, 70 chars max)",
  "amazon": "Amazon-optimized title (keyword-rich, specific, 200 chars max, format: Brand + Model + Key Feature + Size/Color)",
  "woocommerce": "WooCommerce title (clean, SEO-friendly, 60 chars max)",
  "google": "Google Shopping title (specific, 150 chars max, include brand + product type + key attributes)",
  "social": "Social media title (catchy, emoji-friendly, 50 chars max)"
}

IMPORTANT: Do NOT include the platform name in the title text. The title should be a clean product title optimized for that platform's algorithm, not mentioning the platform itself.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    let parsed;
    try {
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }
    res.json({ titles: parsed });
  } catch (err) {
    console.error('AI title optimizer error:', err.message);
    res.status(500).json({ error: 'Title optimization failed: ' + err.message });
  }
});

// POST /api/ai/extract-attributes — extract product attributes from image
router.post('/extract-attributes', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { image } = req.body;
    const imgErr = validateBase64Image(image);
    if (imgErr) return res.status(400).json({ error: imgErr });

    const model = getModel();

    const prompt = `You are a product attribute extraction expert. Analyze this product image and extract visible attributes.

Return a JSON object (no markdown fences, just raw JSON):
{
  "color": "Primary color(s) visible",
  "material": "Material if identifiable (leather, cotton, metal, plastic, wood, etc.)",
  "pattern": "Pattern if any (solid, striped, plaid, floral, etc.)",
  "size": "Approximate size if determinable (small, medium, large, or dimensions)",
  "shape": "Shape description (round, rectangular, slim, compact, etc.)",
  "condition": "new",
  "style": "Design style (modern, classic, vintage, minimalist, etc.)",
  "additional": {
    "key": "value for any other notable attributes"
  }
}

Only include attributes you can actually see or confidently infer from the image. Set to null if not determinable.`;

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
    res.json({ attributes: parsed });
  } catch (err) {
    console.error('AI attribute extraction error:', err.message);
    res.status(500).json({ error: 'Attribute extraction failed: ' + err.message });
  }
});

// POST /api/ai/alt-text — generate SEO-friendly alt text for product images
router.post('/alt-text', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { images, productName, brand } = req.body;
    if (!images || !Array.isArray(images) || images.length === 0) return res.status(400).json({ error: 'Images array is required' });

    const model = getModel();

    const prompt = `You are an SEO and accessibility expert. Generate alt text for ${images.length} product image(s).

Product: ${productName || 'Unknown product'}
${brand ? `Brand: ${brand}` : ''}

Return a JSON array of strings (no markdown fences, just raw JSON). Each string is SEO-friendly alt text for the corresponding image:
- Describe what's visible in the image
- Include product name and brand if relevant
- Keep each under 125 characters
- Be specific and descriptive, not generic
- Good for both screen readers and Google Image SEO

Example: ["Sony WH-1000XM5 wireless headphones in black with premium ear cushions", "Side view of Sony WH-1000XM5 showing slim folding design"]`;

    // If images have base64 data, send them to the model
    const parts = [prompt];
    const hasImageData = images.some(img => img.startsWith && img.startsWith('data:'));

    if (hasImageData) {
      images.slice(0, 4).forEach(img => {
        const base64Data = img.replace(/^data:image\/\w+;base64,/, '');
        const mimeMatch = img.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        parts.push({ inlineData: { data: base64Data, mimeType } });
      });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text().trim();
    let parsed;
    try {
      const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }
    res.json({ altTexts: Array.isArray(parsed) ? parsed : [] });
  } catch (err) {
    console.error('AI alt-text error:', err.message);
    res.status(500).json({ error: 'Alt text generation failed: ' + err.message });
  }
});

// Shared helper: call Gemini image model with an image + prompt, return data URL
async function generateImageEdit(imageUrl, prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  await assertSafeImageUrl(imageUrl);
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) throw new Error('Failed to fetch source image');
  const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
  const base64Image = imgBuffer.toString('base64');
  const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: contentType, data: base64Image } },
            { text: prompt }
          ]
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    }
  );

  const result = await response.json();
  if (!response.ok) {
    console.error('Gemini image edit error:', JSON.stringify(result));
    throw new Error(result.error?.message || 'Image edit failed');
  }

  const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!imagePart) throw new Error('AI did not return an image');

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
}

// POST /api/ai/recolor — recolor a product image
router.post('/recolor', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { imageUrl, color, productName } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Image URL is required' });
    if (!color) return res.status(400).json({ error: 'Target color is required' });

    const prompt = `Change the color of this ${productName || 'product'} to ${color}. Keep everything else exactly the same — same angle, same background, same product shape and details. Only change the color to ${color}.`;
    const image = await generateImageEdit(imageUrl, prompt);
    res.json({ image, color });
  } catch (err) {
    console.error('AI recolor error:', err.message);
    res.status(500).json({ error: 'Image recoloring failed: ' + err.message });
  }
});

// POST /api/ai/studio — AI studio: background removal, extra angles, lifestyle scenes
router.post('/studio', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { imageUrl, mode, productName } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Image URL is required' });
    if (!mode) return res.status(400).json({ error: 'Mode is required' });

    const name = productName || 'product';
    let prompt;

    switch (mode) {
      case 'remove-bg':
        prompt = `Remove the background from this ${name} image completely. Keep the product exactly as is — same colors, same angle, same lighting, same details. Replace the background with pure solid white (#FFFFFF). The output should be a clean, professional e-commerce catalog image with the ${name} centered on a pure white background.`;
        break;
      case 'angle-back':
        prompt = `Generate a back view of this ${name}. Show what the product looks like from behind while keeping the exact same product — same colors, same materials, same design, same lighting and background. The output should look like a photo of the same product taken from the back.`;
        break;
      case 'angle-side':
        prompt = `Generate a side/profile view of this ${name}. Show what the product looks like from the side while keeping the exact same product — same colors, same materials, same design, same lighting and background. The output should look like a photo of the same product taken from the side at a 90 degree angle.`;
        break;
      case 'angle-top':
        prompt = `Generate a top-down view of this ${name}. Show what the product looks like from directly above while keeping the exact same product — same colors, same materials, same design. The output should look like a flat-lay photo of the same product taken from above.`;
        break;
      case 'angle-45':
        prompt = `Generate a 3/4 angle view of this ${name}. Show the product rotated about 45 degrees while keeping the exact same product — same colors, same materials, same design, same lighting. The output should look like a photo of the same product at a slight angle showing more depth and dimension.`;
        break;
      case 'lifestyle':
        prompt = `Place this ${name} in a realistic lifestyle scene. Keep the product itself exactly the same — same colors, design, materials, and details. Show it in a natural context where someone would actually use it (e.g. on a wooden kitchen counter for food items, on a modern desk for electronics, in a styled living room for furniture, worn by a person for clothing). Make it look like a professional lifestyle marketing photo. The product should be the clear focal point.`;
        break;
      case 'studio':
        prompt = `Place this ${name} in a clean professional product studio setting. Keep the product exactly the same — same colors, design, materials, shape, and details. Put it on a clean seamless background (soft gradient from white to light gray) with professional studio lighting, subtle shadows, and a premium commercial look. The output should look like a high-end e-commerce product photo.`;
        break;
      case 'enhance':
        prompt = `Enhance and upscale this ${name} image. Sharpen details, improve clarity, fix any blurriness or noise, and improve colors and lighting. Keep the product and background exactly the same — do not change anything about the composition, angle, or subject. Just improve the visual quality as if it were shot with a better camera.`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid mode' });
    }

    const image = await generateImageEdit(imageUrl, prompt);
    res.json({ image, mode });
  } catch (err) {
    console.error('AI studio error:', err.message);
    res.status(500).json({ error: 'AI studio failed: ' + err.message });
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
