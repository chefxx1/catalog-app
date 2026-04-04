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
          if (url && !url.startsWith('data:')) {
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
      content = generateCSV(exportProduct, desc, imageUrls, seoTags, price, weight, platform);
      contentType = 'text/csv';
      filename = `${product.barcode || 'product'}_${platform.toLowerCase()}.csv`;
    } else if (format === 'JSON') {
      content = generateJSON(exportProduct, desc, imageUrls, seoTags, price, weight, platform);
      contentType = 'application/json';
      filename = `${product.barcode || 'product'}_${platform.toLowerCase()}.json`;
    } else if (format === 'XML') {
      content = generateXML(exportProduct, desc, imageUrls, seoTags, price, weight, platform);
      contentType = 'application/xml';
      filename = `${product.barcode || 'product'}_${platform.toLowerCase()}.xml`;
    } else {
      return res.status(400).json({ error: 'Unsupported format' });
    }

    // Create catalog entry if not already exists
    try {
      const [existingEntry] = await db.query(
        'SELECT id FROM catalog_entries WHERE store_id = ? AND product_id = ?',
        [req.user.store_id, product.id]
      );
      if (existingEntry.length === 0) {
        await db.query(
          `INSERT INTO catalog_entries (store_id, user_id, product_id, status, custom_name, custom_description, custom_price)
           VALUES (?, ?, ?, 'Exported', ?, ?, ?)`,
          [req.user.store_id, req.user.id, product.id, product.name, desc.slice(0, 500), price || null]
        );
      } else {
        await db.query(
          "UPDATE catalog_entries SET status = 'Exported', updated_at = NOW() WHERE id = ?",
          [existingEntry[0].id]
        );
      }
    } catch (catErr) {
      console.error('Failed to save catalog entry:', catErr.message);
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

function generateCSV(product, desc, images, tags, price, weight, platform) {
  const esc = v => {
    let s = String(v || '');
    // Prevent CSV formula injection — prefix dangerous first characters
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };

  if (platform === 'Shopify') {
    const headers = ['Handle','Title','Body (HTML)','Vendor','Type','Tags','Published','Option1 Name','Option1 Value','Variant SKU','Variant Grams','Variant Price','Variant Barcode','Image Src','Image Position','SEO Title','SEO Description'];
    const handle = (product.name || '').toLowerCase().replace(/\s+/g, '-');

    // First row: full product data + first image
    const mainRow = [
      handle, product.name || '', `<p>${desc}</p>`, product.brand || '',
      product.ai_category_suggestion || '', tags.join(', '), 'TRUE',
      'Title', 'Default Title', product.barcode || '',
      weight ? String(parseFloat(weight) * 1000) : '', price || '',
      product.barcode || '', images[0] || '', '1',
      product.name || '', desc.slice(0, 155),
    ];

    let csv = headers.join(',') + '\n' + mainRow.map(esc).join(',');

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

function generateJSON(product, desc, images, tags, price, weight, platform) {
  if (platform === 'Shopify') {
    return JSON.stringify({
      product: {
        title: product.name,
        body_html: `<p>${desc}</p>`,
        vendor: product.brand || '',
        product_type: product.ai_category_suggestion || '',
        tags: tags,
        variants: [{
          sku: product.barcode || '',
          price: price || '0.00',
          barcode: product.barcode || '',
          grams: weight ? Math.round(parseFloat(weight) * 1000) : 0,
        }],
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

module.exports = router;
