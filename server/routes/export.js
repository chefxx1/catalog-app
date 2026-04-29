const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const db = require('../db');
const logActivity = require('../helpers/activity');

const router = express.Router();

// GET /api/export/history — get user's export history
router.get('/history', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const [exports] = await db.query(
      `SELECT id, format, platform, product_name, barcode, filename, created_at
       FROM exports WHERE store_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.store_id]
    );
    res.json({ exports });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch export history' });
  }
});

// GET /api/export/history/:id/download — re-download a past export
router.get('/history/:id/download', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM exports WHERE id = ? AND store_id = ?',
      [req.params.id, req.user.store_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Export not found' });
    const exp = rows[0];
    res.json({
      content: exp.file_content,
      contentType: exp.format === 'CSV' ? 'text/csv' : exp.format === 'JSON' ? 'application/json' : 'application/xml',
      filename: exp.filename
    });
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// POST /api/export — generate export file
router.post('/', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { format, platform, productId, barcode, productData } = req.body;

    if (!format || !platform) {
      return res.status(400).json({ error: 'Format and platform are required' });
    }

    const validFormats = ['CSV', 'JSON', 'XML'];
    const validPlatforms = ['Shopify', 'WooCommerce', 'Magento', 'BigCommerce'];
    if (!validFormats.includes(format)) return res.status(400).json({ error: 'Invalid export format' });
    if (!validPlatforms.includes(platform)) return res.status(400).json({ error: 'Invalid platform' });

    // Fetch product data from DB (verify store ownership via catalog_entries)
    let product;
    if (barcode) {
      const [rows] = await db.query(
        `SELECT p.* FROM products p
         LEFT JOIN catalog_entries ce ON ce.product_id = p.id AND ce.store_id = ?
         WHERE p.barcode = ? AND (ce.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM catalog_entries WHERE product_id = p.id))`,
        [req.user.store_id, barcode]
      );
      product = rows[0];
    } else if (productId) {
      const [rows] = await db.query(
        `SELECT p.* FROM products p
         LEFT JOIN catalog_entries ce ON ce.product_id = p.id AND ce.store_id = ?
         WHERE p.id = ? AND (ce.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM catalog_entries WHERE product_id = p.id))`,
        [req.user.store_id, productId]
      );
      product = rows[0];
    }

    // If not in DB, auto-save from frontend productData
    if (!product && productData?.product) {
      const p = productData.product;
      const generatedBarcode = p.barcode || `AI-${Date.now()}`;
      const cacheExpiry = new Date();
      cacheExpiry.setDate(cacheExpiry.getDate() + 30);

      const [result] = await db.query(
        `INSERT INTO products (barcode, name, brand, description,
         ai_description_professional, ai_description_friendly, ai_description_luxury,
         ai_category_suggestion, ai_attributes, seo_tags, cache_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generatedBarcode, p.name, p.brand, p.description,
         p.ai_description_professional || null, p.ai_description_friendly || null, p.ai_description_luxury || null,
         p.ai_category_suggestion || null, p.attributes ? JSON.stringify(p.attributes) : null,
         p.seo_tags ? JSON.stringify(p.seo_tags) : null, cacheExpiry]
      );
      const newProductId = result.insertId;

      // Save sources
      if (productData.sources?.length > 0) {
        for (const src of productData.sources) {
          if (!src.source_name) continue;
          try {
            await db.query(
              `INSERT INTO product_sources (product_id, source_name, source_url, price, currency, weight, description, trust_score, specs)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [newProductId, src.source_name, src.source_url || null, src.price || null, src.currency || 'USD',
               src.weight || null, src.description || null, src.trust_score || 0, src.specs ? (typeof src.specs === 'string' ? src.specs : JSON.stringify(src.specs)) : null]
            );
          } catch {}
        }
      }

      // Save images (skip base64 uploaded photos, only save URLs)
      if (productData.images?.length > 0) {
        for (let i = 0; i < productData.images.length; i++) {
          const img = productData.images[i];
          const url = img.image_url || img.url;
          if (url && /^https?:\/\//i.test(url)) {
            await db.query(
              'INSERT INTO product_images (product_id, source_name, image_url, quality_score, sort_order) VALUES (?, ?, ?, ?, ?)',
              [newProductId, img.source_name || 'Web', url, img.quality_score || 80, i]
            );
          }
        }
      }

      const [saved] = await db.query('SELECT * FROM products WHERE id = ?', [newProductId]);
      product = saved[0];
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Fetch sources and images from DB
    const [sources] = await db.query('SELECT * FROM product_sources WHERE product_id = ?', [product.id]);
    const [dbImages] = await db.query('SELECT * FROM product_images WHERE product_id = ?', [product.id]);

    // Fetch variants for this store's catalog entry (if one exists)
    const [variantRows] = await db.query(
      `SELECT pv.* FROM product_variants pv
       JOIN catalog_entries ce ON ce.id = pv.catalog_entry_id
       WHERE ce.store_id = ? AND ce.product_id = ?`,
      [req.user.store_id, product.id]
    );
    const variants = variantRows.map(v => ({
      ...v,
      option_values: typeof v.option_values === 'string' ? (JSON.parse(v.option_values || '{}')) : (v.option_values || {}),
    }));

    // Prefer enriched frontend data over DB data
    const enriched = productData?.enriched || {};
    const frontendProduct = productData?.product || {};

    const desc = frontendProduct.edited_description || frontendProduct.ai_description_professional || product.ai_description_professional || product.description || '';
    const price = enriched.price || sources.find(s => s.price)?.price || '';
    const weight = enriched.weight || sources.find(s => s.weight)?.weight || '';
    const imageUrls = (enriched.selectedImages?.length > 0 ? enriched.selectedImages : dbImages.map(img => img.image_url)).filter(Boolean);

    let seoTags = [];
    try {
      seoTags = frontendProduct.seo_tags || (product.seo_tags ? JSON.parse(product.seo_tags) : []);
      if (typeof seoTags === 'string') seoTags = JSON.parse(seoTags);
    } catch {}

    // Overlay AI category
    const exportProduct = { ...product };
    if (frontendProduct.ai_category_suggestion) exportProduct.ai_category_suggestion = frontendProduct.ai_category_suggestion;

    let content, contentType, filename;

    if (format === 'CSV') {
      content = generateCSV(exportProduct, desc, imageUrls, seoTags, price, weight, platform, variants);
      contentType = 'text/csv';
      filename = `${product.barcode || 'product'}_${platform.toLowerCase()}.csv`;
    } else if (format === 'JSON') {
      content = generateJSON(exportProduct, desc, imageUrls, seoTags, price, weight, platform, variants);
      contentType = 'application/json';
      filename = `${product.barcode || 'product'}_${platform.toLowerCase()}.json`;
    } else if (format === 'XML') {
      content = generateXML(exportProduct, desc, imageUrls, seoTags, price, weight, platform);
      contentType = 'application/xml';
      filename = `${product.barcode || 'product'}_${platform.toLowerCase()}.xml`;
    } else {
      return res.status(400).json({ error: 'Unsupported format' });
    }

    // Sanitize price — strip $, commas, currency symbols, whitespace
    const cleanPrice = (() => {
      if (!price) return null;
      const cleaned = String(price).replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    })();

    // Clamp name length to fit VARCHAR(255)
    const safeName = (product.name || 'Untitled').slice(0, 255);

    // Create or update catalog entry — failures are surfaced, not swallowed
    try {
      const [existingEntry] = await db.query(
        'SELECT id FROM catalog_entries WHERE store_id = ? AND product_id = ?',
        [req.user.store_id, product.id]
      );
      if (existingEntry.length === 0) {
        await db.query(
          `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_description, custom_price)
           VALUES (?, ?, ?, 'Exported', ?, ?, ?)`,
          [req.user.store_id, req.user.id, product.id, safeName, desc.slice(0, 500), cleanPrice]
        );
      } else {
        await db.query(
          "UPDATE catalog_entries SET status = 'Exported', updated_at = NOW() WHERE id = ?",
          [existingEntry[0].id]
        );
      }
    } catch (catErr) {
      console.error('Failed to save catalog entry:', catErr.message, { price, cleanPrice, safeName });
      return res.status(500).json({ error: 'Export saved to file but failed to add to catalog: ' + catErr.message });
    }

    // Save to export history
    try {
      await db.query(
        `INSERT INTO exports (store_id, user_id, format, platform, product_name, barcode, filename, file_content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.store_id, req.user.id, format, platform, product.name, product.barcode, filename, content]
      );
    } catch (saveErr) {
      console.error('Failed to save export history:', saveErr.message);
    }

    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'exported', entity_type: 'export', entity_name: product.name, details: { format, platform, filename } });
    res.json({ content, contentType, filename });
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'Export failed: ' + err.message });
  }
});

function generateCSV(product, desc, images, tags, price, weight, platform, variants = []) {
  const esc = v => {
    let s = String(v || '');
    // Prevent CSV formula injection — prefix dangerous first characters
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };

  if (platform === 'Shopify') {
    const headers = ['Handle','Title','Body (HTML)','Vendor','Type','Tags','Published','Option1 Name','Option1 Value','Variant SKU','Variant Grams','Variant Price','Variant Barcode','Variant Inventory Qty','Image Src','Image Position','SEO Title','SEO Description'];
    const handle = (product.name || '').toLowerCase().replace(/\s+/g, '-');

    const hasVariants = Array.isArray(variants) && variants.length > 0;
    const optionName = hasVariants ? (Object.keys(variants[0].option_values || {})[0] || 'Title') : 'Title';

    const rows = [];
    if (hasVariants) {
      variants.forEach((v, idx) => {
        const optVal = Object.values(v.option_values || {})[0] || v.variant_name;
        const isFirst = idx === 0;
        rows.push([
          handle,
          isFirst ? (product.name || '') : '',
          isFirst ? `<p>${desc}</p>` : '',
          isFirst ? (product.brand || '') : '',
          isFirst ? (product.ai_category_suggestion || '') : '',
          isFirst ? tags.join(', ') : '',
          isFirst ? 'TRUE' : '',
          optionName, optVal,
          v.sku || '', weight ? String(parseFloat(weight) * 1000) : '',
          v.price != null ? String(v.price) : (price || ''),
          product.barcode || '',
          v.stock_quantity != null ? String(v.stock_quantity) : '',
          isFirst ? (images[0] || '') : '',
          isFirst ? '1' : '',
          isFirst ? (product.name || '') : '',
          isFirst ? desc.slice(0, 155) : '',
        ]);
      });
    } else {
      rows.push([
        handle, product.name || '', `<p>${desc}</p>`, product.brand || '',
        product.ai_category_suggestion || '', tags.join(', '), 'TRUE',
        'Title', 'Default Title', product.barcode || '',
        weight ? String(parseFloat(weight) * 1000) : '', price || '',
        product.barcode || '', '', images[0] || '', '1',
        product.name || '', desc.slice(0, 155),
      ]);
    }

    let csv = headers.join(',') + '\n' + rows.map(r => r.map(esc).join(',')).join('\n');

    // Additional rows for extra images (Shopify multi-image format)
    for (let i = 1; i < images.length; i++) {
      const imgRow = new Array(headers.length).fill('');
      imgRow[0] = handle;
      imgRow[headers.indexOf('Image Src')] = images[i];
      imgRow[headers.indexOf('Image Position')] = String(i + 1);
      csv += '\n' + imgRow.map(esc).join(',');
    }

    return csv;
  }

  if (platform === 'BigCommerce') {
    const headers = ['Product Name','Product Type','Brand','Description','Price','Weight','UPC/EAN','Search Keywords','Image URL','Category'];
    const row = [product.name, 'physical', product.brand || '', desc, price, weight, product.barcode || '', tags.join(', '), images.join('|'), product.ai_category_suggestion || ''];
    return headers.join(',') + '\n' + row.map(esc).join(',');
  }

  // WooCommerce / Magento CSV
  const headers = ['SKU','Name','Description','Price','Weight','Categories','Tags','Images','Barcode'];
  const row = [product.barcode || '', product.name, desc, price, weight, product.ai_category_suggestion || '', tags.join(', '), images.join('|'), product.barcode || ''];
  return headers.join(',') + '\n' + row.map(esc).join(',');
}

function generateJSON(product, desc, images, tags, price, weight, platform, variants = []) {
  if (platform === 'Shopify') {
    const hasVariants = Array.isArray(variants) && variants.length > 0;
    const shopifyVariants = hasVariants ? variants.map(v => ({
      title: v.variant_name,
      sku: v.sku || product.barcode || '',
      price: v.price != null ? String(v.price) : (price || '0.00'),
      barcode: product.barcode || '',
      inventory_quantity: v.stock_quantity ?? 0,
      option1: Object.values(v.option_values || {})[0] || v.variant_name,
    })) : [{
      sku: product.barcode || '',
      price: price || '0.00',
      barcode: product.barcode || '',
      grams: weight ? Math.round(parseFloat(weight) * 1000) : 0,
    }];
    return JSON.stringify({
      product: {
        title: product.name,
        body_html: `<p>${desc}</p>`,
        vendor: product.brand || '',
        product_type: product.ai_category_suggestion || '',
        tags: tags,
        options: hasVariants ? [{ name: Object.keys(variants[0].option_values || {})[0] || 'Title' }] : undefined,
        variants: shopifyVariants,
        images: images.map((url, i) => ({ src: url, position: i + 1 })),
      }
    }, null, 2);
  }

  if (platform === 'WooCommerce') {
    return JSON.stringify({
      name: product.name,
      type: 'simple',
      description: desc,
      short_description: desc.slice(0, 200),
      sku: product.barcode || '',
      regular_price: price || '',
      weight: weight || '',
      categories: [{ name: product.ai_category_suggestion || '' }],
      tags: tags.map(t => ({ name: t })),
      images: images.map((url, i) => ({ src: url, position: i + 1 })),
    }, null, 2);
  }

  // Magento / BigCommerce
  return JSON.stringify({
    product: {
      sku: product.barcode || '',
      name: product.name,
      description: desc,
      price: price || 0,
      weight: weight || '',
      brand: product.brand || '',
      category: product.ai_category_suggestion || '',
      barcode: product.barcode || '',
      tags: tags,
      images: images.map((url, i) => ({ src: url, position: i + 1 })),
    }
  }, null, 2);
}

function generateXML(product, desc, images, tags, price, weight, platform) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (platform === 'WooCommerce') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <sku>${esc(product.barcode)}</sku>
    <name>${esc(product.name)}</name>
    <description><![CDATA[${desc}]]></description>
    <short_description><![CDATA[${desc.slice(0, 200)}]]></short_description>
    <regular_price>${esc(price)}</regular_price>
    <weight>${esc(weight)}</weight>
    <categories><category>${esc(product.ai_category_suggestion)}</category></categories>
    <tags>${tags.map(t => `<tag>${esc(t)}</tag>`).join('')}</tags>
    <images>${images.map((url, i) => `<image><src>${esc(url)}</src><position>${i + 1}</position></image>`).join('')}</images>
  </product>
</products>`;
  }

  // Generic XML for Shopify/Magento/BigCommerce
  return `<?xml version="1.0" encoding="UTF-8"?>
<products>
  <product>
    <name>${esc(product.name)}</name>
    <brand>${esc(product.brand)}</brand>
    <sku>${esc(product.barcode)}</sku>
    <barcode>${esc(product.barcode)}</barcode>
    <description><![CDATA[${desc}]]></description>
    <price>${esc(price)}</price>
    <weight>${esc(weight)}</weight>
    <category>${esc(product.ai_category_suggestion)}</category>
    <tags>${tags.map(t => `<tag>${esc(t)}</tag>`).join('')}</tags>
    <images>${images.map((url, i) => `<image><src>${esc(url)}</src><position>${i + 1}</position></image>`).join('')}</images>
    <seo>
      <title>${esc(product.name)}</title>
      <description>${esc(desc.slice(0, 155))}</description>
    </seo>
  </product>
</products>`;
}

// ── GOOGLE MERCHANT CENTER FEED ──
router.get('/google-merchant-feed', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const [entries] = await db.query(
      `SELECT ce.*, p.barcode, p.name, p.brand, p.description,
              p.ai_description_professional, p.ai_category_suggestion, p.seo_tags
       FROM catalog_entries ce
       JOIN products p ON ce.product_id = p.id
       WHERE ce.store_id = ? AND (ce.status = 'Published' OR ce.status = 'Exported')
       ORDER BY ce.updated_at DESC`,
      [req.user.store_id]
    );

    // Get images for each product
    const productIds = entries.map(e => e.product_id);
    let imageMap = {};
    if (productIds.length > 0) {
      const [images] = await db.query(
        `SELECT product_id, image_url FROM product_images WHERE product_id IN (?) ORDER BY sort_order LIMIT 1000`,
        [productIds]
      );
      images.forEach(img => {
        if (!imageMap[img.product_id]) imageMap[img.product_id] = [];
        imageMap[img.product_id].push(img.image_url);
      });
    }

    // Get store info
    const [stores] = await db.query('SELECT name FROM stores WHERE id = ?', [req.user.store_id]);
    const storeName = stores[0]?.name || 'My Store';

    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const items = entries.map(e => {
      const title = esc(e.custom_name || e.name || 'Product');
      const desc = esc((e.ai_description_professional || e.custom_description || e.description || '').slice(0, 5000));
      const price = e.custom_price ? `${parseFloat(e.custom_price).toFixed(2)} USD` : '';
      const category = esc(e.ai_category_suggestion || '');
      const barcode = e.barcode || '';
      const brand = esc(e.brand || '');
      const imgs = imageMap[e.product_id] || [];
      const mainImage = imgs[0] || '';
      const additionalImages = imgs.slice(1, 10).map(url => `      <g:additional_image_link>${esc(url)}</g:additional_image_link>`).join('\n');

      return `    <item>
      <g:id>${e.product_id}</g:id>
      <g:title>${title}</g:title>
      <g:description>${desc}</g:description>
      <g:link>https://store.example.com/product/${e.product_id}</g:link>
      ${mainImage ? `<g:image_link>${esc(mainImage)}</g:image_link>` : ''}
${additionalImages}
      <g:availability>in_stock</g:availability>
      ${price ? `<g:price>${price}</g:price>` : ''}
      ${brand ? `<g:brand>${brand}</g:brand>` : ''}
      ${barcode ? `<g:gtin>${esc(barcode)}</g:gtin>` : ''}
      ${category ? `<g:google_product_category>${category}</g:google_product_category>` : ''}
      <g:condition>new</g:condition>
    </item>`;
    }).join('\n');

    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(storeName)} Product Feed</title>
    <link>https://store.example.com</link>
    <description>Google Merchant Center product feed</description>
${items}
  </channel>
</rss>`;

    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'exported', entity_type: 'google_merchant', details: { products: entries.length } });

    res.json({ content: feed, filename: `google-merchant-feed-${Date.now()}.xml`, contentType: 'application/xml', productCount: entries.length });
  } catch (err) {
    console.error('Google Merchant feed error:', err.message);
    res.status(500).json({ error: 'Feed generation failed: ' + err.message });
  }
});

// ── SHOPIFY SYNC ──

// Exchange client credentials for a short-lived access token
async function getShopifyToken(shop, clientId, clientSecret) {
  const response = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Shopify auth failed (${response.status}): ${err}`);
  }
  const { access_token } = await response.json();
  return access_token;
}

router.post('/shopify-sync', auth, requireRole('Admin', 'Editor'), async (req, res) => {
  try {
    const { shopifyDomain, clientId, clientSecret, productIds } = req.body;
    if (!shopifyDomain || !clientId || !clientSecret) return res.status(400).json({ error: 'Shopify domain, Client ID, and Client Secret are required' });

    // Extract shop name from domain
    const shop = shopifyDomain.replace(/^https?:\/\//, '').replace(/\.myshopify\.com.*$/, '').replace(/\/$/, '');
    // Get access token via client credentials
    const accessToken = await getShopifyToken(shop, clientId, clientSecret);

    // Fetch catalog entries to sync
    let query = `SELECT ce.*, p.barcode, p.name, p.brand, p.description,
                        p.ai_description_professional, p.ai_category_suggestion
                 FROM catalog_entries ce
                 JOIN products p ON ce.product_id = p.id
                 WHERE ce.store_id = ?`;
    const params = [req.user.store_id];

    if (productIds && Array.isArray(productIds) && productIds.length > 0) {
      query += ' AND ce.id IN (?)';
      params.push(productIds);
    } else {
      query += " AND ce.status IN ('Review', 'Published', 'Exported')";
    }

    const [entries] = await db.query(query, params);

    // Get images
    const pids = entries.map(e => e.product_id);
    let imageMap = {};
    if (pids.length > 0) {
      const [images] = await db.query('SELECT product_id, image_url FROM product_images WHERE product_id IN (?) ORDER BY sort_order', [pids]);
      images.forEach(img => { if (!imageMap[img.product_id]) imageMap[img.product_id] = []; imageMap[img.product_id].push(img.image_url); });
    }

    const domain = `${shop}.myshopify.com`;
    const results = { synced: 0, failed: 0, skipped: 0, errors: [] };

    // Fetch existing Shopify products to detect duplicates (by title).
    // Surface auth failures explicitly — silently breaking made it look like
    // every push failed for unrelated reasons.
    const existingTitles = new Set();
    try {
      let pageUrl = `https://${domain}/admin/api/2025-01/products.json?limit=250&fields=id,title`;
      while (pageUrl) {
        const listRes = await fetch(pageUrl, { headers: { 'X-Shopify-Access-Token': accessToken } });
        if (listRes.status === 401 || listRes.status === 403) {
          return res.status(401).json({ error: 'Shopify rejected the credentials. Verify your Client ID, Client Secret, and that the app has the products write scope.' });
        }
        if (!listRes.ok) break;
        const { products } = await listRes.json();
        products.forEach(p => existingTitles.add(p.title.toLowerCase().trim()));
        // Check for pagination
        const link = listRes.headers.get('link');
        const next = link && link.match(/<([^>]+)>;\s*rel="next"/);
        pageUrl = next ? next[1] : null;
      }
    } catch (e) { console.log('[Shopify Sync] Could not fetch existing products:', e.message); }

    for (const entry of entries) {
      try {
        const title = entry.custom_name || entry.name;

        // Skip duplicates
        if (existingTitles.has(title.toLowerCase().trim())) {
          results.skipped++;
          continue;
        }

        const desc = entry.ai_description_professional || entry.custom_description || entry.description || '';
        const imgs = (imageMap[entry.product_id] || []).map(url => ({ src: url }));
        const price = entry.custom_price ? parseFloat(entry.custom_price).toFixed(2) : '0.00';

        const productData = {
          product: {
            title,
            body_html: `<p>${desc}</p>`,
            vendor: entry.brand || '',
            product_type: entry.ai_category_suggestion || '',
            variants: [{ price, barcode: entry.barcode || '', inventory_management: 'shopify' }],
            images: imgs.slice(0, 10),
          }
        };

        const response = await fetch(`https://${domain}/admin/api/2025-01/products.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
          body: JSON.stringify(productData),
        });

        if (response.ok) {
          results.synced++;
          existingTitles.add(title.toLowerCase().trim());
          await db.query("UPDATE catalog_entries SET status = 'Exported', updated_at = NOW() WHERE id = ?", [entry.id]);
        } else {
          const err = await response.json().catch(() => ({}));
          results.failed++;
          results.errors.push({ product: title, error: err.errors ? JSON.stringify(err.errors) : `HTTP ${response.status}` });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ product: entry.custom_name || entry.name, error: err.message });
      }
    }

    logActivity({ store_id: req.user.store_id, user_id: req.user.id, action: 'exported', entity_type: 'shopify_sync', details: { synced: results.synced, failed: results.failed } });

    res.json(results);
  } catch (err) {
    console.error('Shopify sync error:', err.message);
    res.status(500).json({ error: 'Shopify sync failed: ' + err.message });
  }
});

// ── PRICE MONITORING ──

// Get price history for a product
router.get('/price-history/:productId', auth, async (req, res) => {
  try {
    const [history] = await db.query(
      `SELECT source_name, price, currency, recorded_at
       FROM price_history
       WHERE product_id = ? AND store_id = ?
       ORDER BY recorded_at DESC LIMIT 50`,
      [req.params.productId, req.user.store_id]
    );
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get price alerts — products where price changed since last check
router.get('/price-alerts', auth, async (req, res) => {
  try {
    const [alerts] = await db.query(
      `SELECT ph1.product_id, p.name, p.barcode, ph1.source_name,
              ph1.price AS current_price, ph2.price AS previous_price,
              ph1.currency, ph1.recorded_at
       FROM price_history ph1
       JOIN products p ON p.id = ph1.product_id
       JOIN price_history ph2 ON ph2.product_id = ph1.product_id
         AND ph2.source_name = ph1.source_name
         AND ph2.recorded_at < ph1.recorded_at
       WHERE ph1.store_id = ?
         AND ph1.recorded_at = (
           SELECT MAX(recorded_at) FROM price_history
           WHERE product_id = ph1.product_id AND source_name = ph1.source_name AND store_id = ?
         )
         AND ph2.recorded_at = (
           SELECT MAX(recorded_at) FROM price_history
           WHERE product_id = ph1.product_id AND source_name = ph1.source_name AND store_id = ?
             AND recorded_at < ph1.recorded_at
         )
         AND ph1.price != ph2.price
       ORDER BY ph1.recorded_at DESC
       LIMIT 20`,
      [req.user.store_id, req.user.store_id, req.user.store_id]
    );
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
