// Generate real export files from a fresh test user, save to disk, then
// validate each with proper parsers. Catches things code review misses
// (BOM presence, slug validity, quoting correctness, XML escaping, etc.).
// Re-run after future export changes: `node server/scripts/validate-exports.js`
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { parse: csvParse } = require('csv-parse/sync');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const db = require('../db');

const API = process.env.API_URL || 'http://localhost:3000/api';
const OUT_DIR = path.join(__dirname, '..', '..', 'export-validation');

// Edge-case product designed to break naive code:
//  - Arabic in name + brand exercises Unicode round-trip
//  - "70%" in title exercises slug/handle generation
//  - "&" and "<" in name exercise XML escaping
//  - Newlines in description exercise CSV quoting
//  - Description starting with "=" exercises CSV formula-injection guard
const TEST_PRODUCT = {
  barcode: 'VALIDATE-' + Date.now(),
  name: 'حقيبة Gucci & Friends — 70% OFF <Limited>',
  brand: 'Gucci & Co',
  category: 'Fashion > حقائب & Accessories',
  // Multi-line + comma + quotes + leading = (formula injection)
  description: '=cmd|" /C calc"!A1\nPremium "limited edition" bag, with comma, and\nmulti-line text.\nThird line.',
  price: '299.99',
  weight: '0.5',
  attributes: { 'Material': 'حلد طبيعي', 'Size': '30cm × 20cm', 'Color': 'Black & Gold' },
  seoTags: ['luxury', 'حقيبة', '70%-off', 'gucci & friends'],
  images: [
    'https://example.com/bag-front.jpg',
    'https://example.com/bag-back.jpg',
  ],
};

const results = [];
const failures = {};

function pass(suite, check) {
  results.push({ suite, check, status: 'PASS', detail: '' });
}
function fail(suite, check, detail) {
  results.push({ suite, check, status: 'FAIL', detail });
  if (!failures[suite]) failures[suite] = [];
  failures[suite].push(`${check}: ${detail}`);
}
function check(suite, name, cond, detail = '') {
  cond ? pass(suite, name) : fail(suite, name, detail || 'assertion failed');
}

// ─────────────────────────────────────────────────────────────────────────
// Setup: fresh user, fresh product
// ─────────────────────────────────────────────────────────────────────────

async function setup() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const email = `validate-${Date.now()}@test.local`;
  const password = 'TestPassword123!';

  const r = await fetch(`${API}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Validator', email, password,
      store_name: 'Validation Store',
    }),
  });
  if (!r.ok) throw new Error('signup failed: ' + (await r.text()));
  const cookieRaw = r.headers.get('set-cookie') || '';
  const cookie = cookieRaw.split(';')[0]; // just the token part
  const { user } = await r.json();

  // Insert test product directly via DB so we control the bytes
  const cacheExpiry = new Date(); cacheExpiry.setDate(cacheExpiry.getDate() + 30);
  const [pr] = await db.query(
    `INSERT INTO products (barcode, name, brand, description, ai_description_professional,
       ai_category_suggestion, ai_attributes, seo_tags, cache_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      TEST_PRODUCT.barcode, TEST_PRODUCT.name, TEST_PRODUCT.brand,
      TEST_PRODUCT.description, TEST_PRODUCT.description,
      TEST_PRODUCT.category,
      JSON.stringify(TEST_PRODUCT.attributes),
      JSON.stringify(TEST_PRODUCT.seoTags),
      cacheExpiry,
    ]
  );
  const productId = pr.insertId;

  // Image
  for (let i = 0; i < TEST_PRODUCT.images.length; i++) {
    await db.query(
      'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
      [productId, 'Test', TEST_PRODUCT.images[i], 80, i]
    );
  }

  // Source so price + weight flow through
  await db.query(
    `INSERT INTO product_sources (product_id, source_name, source_url, price, currency, weight, trust_score)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [productId, 'Test', 'https://example.com', TEST_PRODUCT.price, 'USD', TEST_PRODUCT.weight, 90]
  );

  // Catalog entry, Published so Google Merchant picks it up
  await db.query(
    `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_price)
     VALUES (?, ?, ?, 'Published', ?, ?)`,
    [user.store_id, user.id, productId, TEST_PRODUCT.name, parseFloat(TEST_PRODUCT.price)]
  );

  return { cookie, user, productId };
}

// ─────────────────────────────────────────────────────────────────────────
// Hit each export endpoint, save the raw content
// ─────────────────────────────────────────────────────────────────────────

async function fetchExport(cookie, format, platform) {
  const r = await fetch(`${API}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      format, platform, barcode: TEST_PRODUCT.barcode,
      productData: {
        product: {
          name: TEST_PRODUCT.name,
          brand: TEST_PRODUCT.brand,
          barcode: TEST_PRODUCT.barcode,
          ai_description_professional: TEST_PRODUCT.description,
          ai_category_suggestion: TEST_PRODUCT.category,
          seo_tags: TEST_PRODUCT.seoTags,
          attributes: TEST_PRODUCT.attributes,
          edited_description: TEST_PRODUCT.description,
        },
        enriched: { price: TEST_PRODUCT.price, selectedImages: TEST_PRODUCT.images },
        sources: [{ source_name: 'Test', price: TEST_PRODUCT.price, weight: TEST_PRODUCT.weight, currency: 'USD' }],
        images: TEST_PRODUCT.images.map((url) => ({ image_url: url, source_name: 'Test' })),
      },
    }),
  });
  if (!r.ok) throw new Error(`export ${format}/${platform} failed: ${r.status} ${await r.text()}`);
  const { content } = await r.json();
  return content;
}

async function fetchGoogleMerchant(cookie) {
  const r = await fetch(`${API}/export/google-merchant-feed`, { headers: { cookie } });
  if (!r.ok) throw new Error(`google merchant failed: ${r.status} ${await r.text()}`);
  const { content } = await r.json();
  return content;
}

async function generateAllFiles(cookie) {
  const jobs = [
    { fmt: 'CSV',  plat: 'Shopify',     file: 'shopify.csv' },
    { fmt: 'JSON', plat: 'Shopify',     file: 'shopify.json' },
    { fmt: 'CSV',  plat: 'WooCommerce', file: 'woocommerce.csv' },
    { fmt: 'CSV',  plat: 'Magento',     file: 'magento.csv' },
    { fmt: 'CSV',  plat: 'BigCommerce', file: 'bigcommerce.csv' },
  ];
  for (const j of jobs) {
    const content = await fetchExport(cookie, j.fmt, j.plat);
    fs.writeFileSync(path.join(OUT_DIR, j.file), content, 'utf8');
    j.path = path.join(OUT_DIR, j.file);
  }
  const gmContent = await fetchGoogleMerchant(cookie);
  const gmPath = path.join(OUT_DIR, 'google-merchant.xml');
  fs.writeFileSync(gmPath, gmContent, 'utf8');
  jobs.push({ fmt: 'XML', plat: 'Google Shopping', file: 'google-merchant.xml', path: gmPath });
  return jobs;
}

// ─────────────────────────────────────────────────────────────────────────
// Validation per format
// ─────────────────────────────────────────────────────────────────────────

const SLUG_OK = /^[a-z0-9-]+$/;

// Each platform has a different expected header. These are the canonical
// import schemas (Shopify Products CSV, WooCommerce Product CSV, etc.).
const EXPECTED_HEADERS = {
  Shopify: ['Handle','Title','Body (HTML)','Vendor','Type','Tags','Published','Option1 Name','Option1 Value','Variant SKU','Variant Grams','Variant Price','Variant Barcode','Variant Inventory Qty','Image Src','Image Position','SEO Title','SEO Description'],
  WooCommerce: ['SKU','Name','Description','Price','Weight','Categories','Tags','Images','Barcode'],
  Magento: ['SKU','Name','Description','Price','Weight','Categories','Tags','Images','Barcode'],
  BigCommerce: ['Product Name','Product Type','Brand','Description','Price','Weight','UPC/EAN','Search Keywords','Image URL','Category'],
};

function validateCsv(suite, filePath, platform) {
  const buf = fs.readFileSync(filePath);
  const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;

  // Our current behavior: BOM on every CSV. Strictly speaking the platform-
  // ingested CSVs (Shopify/Woo/Magento/BigCommerce) shouldn't have one because
  // importers can choke on it. Excel-facing CSV should. We flag it.
  check(suite, 'no BOM on platform-ingested CSV', !hasBom,
    `BOM present (EF BB BF) — Shopify/Woo importers may reject; intended for Excel users`);

  // Parse with a real CSV parser
  let records;
  try {
    records = csvParse(buf, { columns: true, skip_empty_lines: false, relax_column_count: true });
    pass(suite, 'parses as valid CSV (RFC 4180)');
  } catch (e) {
    fail(suite, 'parses as valid CSV (RFC 4180)', e.message);
    return;
  }

  // Header schema check
  const actualHeader = Object.keys(records[0] || {});
  const expected = EXPECTED_HEADERS[platform];
  const missing = expected.filter((h) => !actualHeader.includes(h));
  const extra = actualHeader.filter((h) => !expected.includes(h));
  check(suite, `header matches ${platform} schema`,
    missing.length === 0 && extra.length === 0,
    `missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);

  // Per-platform handle/slug check (Shopify only)
  if (platform === 'Shopify') {
    const handles = records.map((r) => r.Handle).filter(Boolean);
    const uniqueHandles = [...new Set(handles)];
    check(suite, 'every row has a Handle', handles.length === records.length,
      `${records.length - handles.length} row(s) without Handle`);
    check(suite, 'Handle is valid slug ([a-z0-9-])',
      handles.every((h) => SLUG_OK.test(h)),
      `invalid handles: ${handles.filter((h) => !SLUG_OK.test(h)).slice(0, 3).join(' | ')}`);
    check(suite, 'Handle non-empty', handles.every((h) => h.length > 0),
      'one or more empty handles');
    check(suite, 'image rows share parent Handle',
      uniqueHandles.length === 1,
      `expected 1 unique handle, got ${uniqueHandles.length}: ${uniqueHandles.join(', ')}`);

    // Variant Barcode should be a real GTIN (8/12/13/14 digits), not the
    // internal SKU/AI-prefixed identifier we use as a synthetic barcode.
    const barcodes = records.map((r) => r['Variant Barcode']).filter(Boolean);
    const gtinShape = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/;
    const nonGtins = barcodes.filter((b) => !gtinShape.test(b));
    check(suite, 'Variant Barcode is a real GTIN (8/12/13/14 digits)',
      nonGtins.length === 0,
      `non-GTIN values: ${[...new Set(nonGtins)].slice(0, 3).join(' | ')}`);
  }

  // Round-trip Arabic — parsed name field must equal source bytes
  const nameField = platform === 'Shopify' ? 'Title' : platform === 'BigCommerce' ? 'Product Name' : 'Name';
  const firstRow = records[0] || {};
  const parsedName = firstRow[nameField] || '';
  if (parsedName) {
    check(suite, 'Arabic name round-trips',
      parsedName.includes('حقيبة'),
      `expected name to contain "حقيبة", got "${parsedName.slice(0, 50)}…"`);
    check(suite, 'symbol (70%) round-trips',
      parsedName.includes('70%'),
      `expected name to contain "70%", got "${parsedName.slice(0, 80)}…"`);
    check(suite, 'special chars (&, <) round-trip',
      parsedName.includes('&') && parsedName.includes('<'),
      `expected & and < in name, got "${parsedName.slice(0, 80)}…"`);
  }

  // Formula injection check — no field may start with = + - @ unescaped
  const dangerous = /^[=+\-@\t\r]/;
  const unsafe = [];
  for (const row of records) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && dangerous.test(v)) {
        unsafe.push(`${k}=${JSON.stringify(v.slice(0, 30))}`);
      }
    }
  }
  check(suite, 'no field starts with = + - @ unescaped',
    unsafe.length === 0,
    `unsafe fields: ${unsafe.slice(0, 3).join('; ')}`);
}

function validateJson(suite, filePath) {
  const buf = fs.readFileSync(filePath);
  const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  check(suite, 'no BOM (RFC 8259 forbids it)', !hasBom,
    'JSON file has UTF-8 BOM — strict parsers will reject');

  let parsed;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
    pass(suite, 'parses as strict JSON');
  } catch (e) {
    fail(suite, 'parses as strict JSON', e.message);
    return;
  }

  // Round-trip the Arabic name
  const name = parsed?.product?.title || parsed?.product?.name || parsed?.name || '';
  check(suite, 'Arabic name round-trips',
    name.includes('حقيبة'),
    `expected "حقيبة" in name, got "${name.slice(0, 60)}…"`);
  check(suite, 'name not over-escaped (no \\u sequences)',
    !/\\u[0-9a-fA-F]{4}/.test(JSON.stringify(name)) || name.includes('حقيبة'),
    'Arabic characters appear over-escaped');
  check(suite, 'symbol (70%) round-trips',
    name.includes('70%'),
    `expected "70%" in name, got "${name.slice(0, 80)}…"`);
}

function validateXml(suite, filePath, isGoogleMerchant) {
  const buf = fs.readFileSync(filePath);
  const text = buf.toString('utf8');

  // Encoding declaration must match actual bytes (UTF-8 expected)
  const encMatch = text.match(/encoding=["']([^"']+)["']/);
  const declared = encMatch ? encMatch[1].toUpperCase() : null;
  check(suite, 'XML declares UTF-8 encoding',
    declared === 'UTF-8',
    `declared encoding: ${declared || '(none)'}`);

  // No illegal control characters (XML 1.0: only #x9, #xA, #xD, then #x20+ allowed)
  const illegal = text.match(/[ --]/);
  check(suite, 'no illegal control characters', !illegal,
    `found char U+${illegal && illegal[0].charCodeAt(0).toString(16).padStart(4, '0')}`);

  // Strict XML validation — broken escaping fails here
  const v = XMLValidator.validate(text);
  check(suite, 'parses as well-formed XML (strict)',
    v === true,
    typeof v === 'object' ? JSON.stringify(v.err) : String(v));

  if (v !== true) return;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: false,
  });
  const doc = parser.parse(text);

  if (isGoogleMerchant) {
    // Google Shopping spec: rss/channel/item[*]
    const items = doc?.rss?.channel?.item;
    const arr = Array.isArray(items) ? items : items ? [items] : [];
    check(suite, 'has at least one <item>', arr.length > 0,
      'no items in feed');
    if (arr.length === 0) return;

    const item = arr[0];
    const required = ['g:id', 'g:title', 'g:description', 'g:link', 'g:image_link', 'g:availability', 'g:price', 'g:condition'];
    const missing = required.filter((k) => !(k in item));
    check(suite, 'all required Google Shopping attrs present',
      missing.length === 0,
      `missing: ${missing.join(', ')}`);

    // Price must include currency code
    const price = item['g:price'];
    check(suite, 'g:price includes currency code (e.g. "5.25 USD")',
      typeof price === 'string' && /^\d+(\.\d+)?\s+[A-Z]{3}$/.test(price),
      `g:price = ${JSON.stringify(price)}`);

    // Arabic round-trip in title
    const title = item['g:title'];
    check(suite, 'Arabic title round-trips',
      typeof title === 'string' && title.includes('حقيبة'),
      `g:title = ${JSON.stringify(title?.slice(0, 80))}…`);
    check(suite, 'special chars (& <) survive XML escaping',
      typeof title === 'string' && title.includes('&') && title.includes('<'),
      `g:title = ${JSON.stringify(title?.slice(0, 80))}…`);
  } else {
    // Generic XML — just round-trip the name
    const name = doc?.products?.product?.name;
    check(suite, 'product name round-trips through XML',
      typeof name === 'string' && name.includes('حقيبة') && name.includes('&'),
      `name = ${JSON.stringify(name?.slice(0, 80))}…`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────

(async () => {
  let cookie;
  try {
    const setup_ = await setup();
    cookie = setup_.cookie;
    console.log(`\nTest user signed up, test product inserted.`);
    console.log(`Output dir: ${OUT_DIR}\n`);

    const jobs = await generateAllFiles(cookie);
    console.log(`Generated ${jobs.length} export files.\n`);

    for (const j of jobs) {
      const suite = `${j.plat} ${j.fmt}`;
      if (j.fmt === 'CSV') validateCsv(suite, j.path, j.plat);
      else if (j.fmt === 'JSON') validateJson(suite, j.path);
      else if (j.fmt === 'XML') validateXml(suite, j.path, j.plat === 'Google Shopping');
    }

    // Per-format pass/fail summary
    console.log('─'.repeat(78));
    console.log('PASS/FAIL TABLE');
    console.log('─'.repeat(78));
    const suites = [...new Set(results.map((r) => r.suite))];
    for (const s of suites) {
      const rows = results.filter((r) => r.suite === s);
      const passed = rows.filter((r) => r.status === 'PASS').length;
      const total = rows.length;
      const verdict = passed === total ? 'PASS' : 'FAIL';
      console.log(`\n${verdict.padEnd(5)} ${s}  (${passed}/${total})`);
      for (const r of rows) {
        const mark = r.status === 'PASS' ? '  ✓' : '  ✗';
        console.log(`${mark} ${r.check}${r.detail ? `\n      → ${r.detail}` : ''}`);
      }
    }

    console.log('\n' + '─'.repeat(78));
    const totalChecks = results.length;
    const totalFails = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\n${totalFails === 0 ? 'ALL PASS' : `${totalFails} of ${totalChecks} checks FAILED`}\n`);
    console.log(`Inspect raw files in: ${OUT_DIR}\n`);

    process.exit(totalFails === 0 ? 0 : 1);
  } catch (e) {
    console.error('\nValidation script crashed:', e.message);
    console.error(e.stack);
    process.exit(2);
  }
})();
