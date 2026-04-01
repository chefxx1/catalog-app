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
    const { name, brand, category, description, specs, brandVoice, customInstructions: rawInstructions } = req.body;

    if (!name) return res.status(400).json({ error: 'Product name is required' });
    const customInstructions = rawInstructions ? sanitize(rawInstructions).slice(0, 500) : null;

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
${voiceContext}

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
  "metaDescription": "SEO-optimized meta description under 155 characters"
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
