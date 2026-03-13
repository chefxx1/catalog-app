const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// POST /api/ai/generate — generate descriptions, category, and SEO tags
router.post('/generate', auth, async (req, res) => {
  try {
    const { name, brand, category, description, specs, brandVoice, customInstructions } = req.body;

    if (!name) return res.status(400).json({ error: 'Product name is required' });

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

module.exports = router;
