const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const auth = require('../middleware/auth');
const db = require('../db');

const requireRole = require('../middleware/requireRole');
const { sanitize } = require('../middleware/validate');

const router = express.Router();

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// POST /api/ai/generate — generate descriptions, category, and SEO tags
router.post('/generate', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { name, brand, category, description, specs, brandVoice, customInstructions: rawInstructions, language } = req.body;

    if (!name) return res.status(400).json({ error: 'Product name is required' });
    const customInstructions = rawInstructions ? sanitize(rawInstructions).slice(0, 500) : null;
    const langInstruction = language ? `\n\nIMPORTANT: Generate ALL content (descriptions, category, SEO tags, meta title, meta description) in ${language}. The output must be entirely in ${language}, not English. Also translate the product specifications/attributes into ${language} and return them in a "translatedSpecs" field as a key-value object.` : '';

    const model = getModel();

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

    const result = await model.generateContent(prompt);
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

// POST /api/ai/identify — identify product from image
router.post('/identify', auth, async (req, res) => {
  try {
    const { image } = req.body; // base64 image data
    if (!image) return res.status(400).json({ error: 'Image data is required' });

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
    if (!image) return res.status(400).json({ error: 'Image data is required' });

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
