// One-off backfill: fetch a real image for trending/chat-added products that
// have no row in product_images. Earlier adds either ran before the Serper
// Images fallback shipped, or the fallback silently failed (no API key,
// network timeout, no results). Safe to re-run — only touches products with
// zero existing image rows.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const SERPER_TIMEOUT_MS = 8000;

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

(async () => {
  if (!process.env.SERPER_API_KEY) {
    console.error('SERPER_API_KEY missing — set it in server/.env');
    process.exit(1);
  }

  const [rows] = await db.query(
    `SELECT p.id, p.name
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id
      WHERE (p.barcode LIKE 'TREND-%' OR p.barcode LIKE 'CHAT-%')
      GROUP BY p.id
     HAVING COUNT(pi.id) = 0
      ORDER BY p.id`
  );
  console.log(`Found ${rows.length} trending/chat products with no image\n`);

  let ok = 0, skip = 0;
  for (const row of rows) {
    process.stdout.write(`[${row.id}] ${row.name.slice(0, 60)} ... `);
    const url = await fetchProductImageUrl(row.name);
    if (url) {
      await db.query(
        'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
        [row.id, 'Serper Images (backfill)', url, 70, 0]
      );
      console.log('OK');
      ok++;
    } else {
      console.log('SKIP (no result)');
      skip++;
    }
    // Light throttle — Serper free tier is generous but be polite
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\nDone — ${ok} backfilled, ${skip} skipped`);
  process.exit(0);
})();
