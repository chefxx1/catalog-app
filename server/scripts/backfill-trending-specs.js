// One-off backfill: re-enrich chat/trending products whose AI enrichment
// originally returned no specs (Gemini intermittently omits the specs field).
// Safe to re-run — only touches rows where ai_attributes IS NULL.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

function validSpecs(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  const entries = Object.entries(s).filter(([k, v]) =>
    k && v && v !== 'null' && !/^Key\d+$/i.test(k) && !/^Value\d+$/i.test(String(v))
  );
  return entries.length >= 3;
}

async function callGeminiJson(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const models = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
  let lastErr;
  for (const modelName of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        return JSON.parse(text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim());
      } catch (err) {
        lastErr = err;
        const msg = err?.message || '';
        const overloaded = /503|overload|UNAVAILABLE|high demand/i.test(msg);
        if (!overloaded) break; // non-503 → try next model
        const wait = 800 * Math.pow(2, attempt);
        process.stdout.write(`(503, retrying ${modelName} in ${wait}ms) `);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

async function enrichOne(name, category) {
  const prompt = `Return ONLY a JSON object with 5-7 real, concrete specifications for this product. Real attribute names and real values only — no "Key1/Value1" placeholders.

Product: ${name}
Category: ${category || 'general'}

Format: { "<attribute>": "<value>", ... }`;
  try {
    const out = await callGeminiJson(prompt);
    if (validSpecs(out)) return out;
    if (out?.specs && validSpecs(out.specs)) return out.specs;
  } catch (err) {
    console.warn(`  ! Gemini call failed: ${err.message}`);
  }
  return null;
}

(async () => {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY missing — set it in server/.env');
    process.exit(1);
  }

  const [rows] = await db.query(
    "SELECT id, name, ai_category_suggestion FROM products WHERE ai_attributes IS NULL AND (barcode LIKE 'TREND-%' OR barcode LIKE 'CHAT-%') ORDER BY id"
  );
  console.log(`Found ${rows.length} products needing specs backfill\n`);

  let ok = 0, skip = 0;
  for (const row of rows) {
    process.stdout.write(`[${row.id}] ${row.name.slice(0, 60)} ... `);
    const specs = await enrichOne(row.name, row.ai_category_suggestion);
    if (specs) {
      await db.query('UPDATE products SET ai_attributes = ? WHERE id = ?', [JSON.stringify(specs), row.id]);
      console.log(`OK (${Object.keys(specs).length} specs)`);
      ok++;
    } else {
      console.log('SKIP (could not generate)');
      skip++;
    }
    // Light throttle so we don't hammer the API
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone — ${ok} backfilled, ${skip} skipped`);
  process.exit(0);
})();
