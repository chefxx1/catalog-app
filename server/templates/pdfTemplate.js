// HTML templates for server-side PDF generation via Puppeteer.
// Editorial / magazine layout — large hero image, big typography, gradient brand
// accent. Chrome handles Arabic/RTL/CJK/bidi natively so we don't need per-language
// shaping or font embedding hacks.

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// RTL detection — Arabic + Persian + Hebrew Unicode blocks
const dir = (text) => /[֐-׿؀-ۿݐ-ݿ]/.test(text || '') ? 'rtl' : 'ltr';

const FONT_LINKS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Arabic:wght@400;700&family=Noto+Sans+SC:wght@400;700&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">`;

const BASE_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  font-family: 'Inter', 'Noto Sans Arabic', 'Noto Sans SC', 'Noto Sans JP', system-ui, sans-serif;
  color: #18181b; line-height: 1.5;
}
.page {
  width: 210mm; min-height: 297mm; position: relative;
  page-break-after: always;
}
.page:last-child { page-break-after: auto; }

.strip {
  height: 6mm;
  background: linear-gradient(90deg, #2563EB 0%, #7C3AED 50%, #10B981 100%);
}

.header {
  padding: 12mm 18mm 8mm;
  display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1px solid #E5E7EB;
}
.logo { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.logo .ai {
  background: linear-gradient(135deg, #2563EB, #7C3AED, #10B981);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.store-name { font-size: 11px; color: #71717A; font-weight: 500; }

.hero {
  padding: 18mm 18mm 12mm;
  display: grid; grid-template-columns: 70mm 1fr; gap: 14mm;
  align-items: center;
}
.hero-image {
  width: 70mm; height: 70mm; border-radius: 4mm;
  background: #F4F4F5 center/contain no-repeat;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}
.brand-label {
  font-size: 9px; color: #7C3AED; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase;
  margin-bottom: 4mm;
}
.product-name {
  font-size: 28px; font-weight: 800; line-height: 1.15;
  letter-spacing: -0.02em; margin-bottom: 8mm;
}
.price { font-size: 24px; font-weight: 700; color: #10B981; }

.section { padding: 0 18mm 8mm; }
.section-label {
  font-size: 9px; color: #71717A; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase;
  padding-top: 6mm; border-top: 1px solid #E5E7EB;
  margin-bottom: 4mm;
}
.description {
  font-size: 11px; color: #3F3F46; line-height: 1.7;
  max-width: 165mm; white-space: pre-wrap;
  /* Don't leave 1-2 stray lines at the top/bottom of a page break */
  orphans: 3; widows: 3;
}

/* Each spec row is its own break-protected block so a key/value pair (or a
   value that wraps to 2 lines like "Proteins (100g): ...") never splits
   across pages. */
.specs { display: flex; flex-direction: column; gap: 2mm; font-size: 11px; }
.spec-row {
  display: grid; grid-template-columns: 60mm 1fr; gap: 6mm;
  break-inside: avoid; page-break-inside: avoid;
}
.spec-key { font-weight: 600; color: #52525B; }
.spec-val { color: #18181b; }

.meta {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 6mm; font-size: 10px;
}
.meta-item {
  padding: 3mm 0; border-top: 1px solid #F4F4F5;
  break-inside: avoid; page-break-inside: avoid;
}
.meta-label {
  font-size: 8px; color: #A1A1AA; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  margin-bottom: 1mm;
}
.meta-value { color: #18181b; font-weight: 500; }

.footer {
  position: absolute; bottom: 0; left: 18mm; right: 18mm;
  padding: 6mm 0; border-top: 1px solid #E5E7EB;
  display: flex; justify-content: space-between;
  font-size: 9px; color: #A1A1AA;
}

[dir="rtl"] { text-align: right; direction: rtl; }
.specs[dir="rtl"] .spec-row { grid-template-columns: 1fr 60mm; }
.specs[dir="rtl"] .spec-key { text-align: right; }

/* Hero block stays on one page. Section labels stay glued to their first
   content (no orphaned "DESCRIPTION" header alone at the bottom). */
.hero { break-inside: avoid; page-break-inside: avoid; }
.section-label { break-after: avoid; page-break-after: avoid; }
.empty { color: #A1A1AA; font-size: 11px; font-style: italic; }
`;

function parseSpecs(raw) {
  if (!raw) return null;
  let parsed = raw;
  for (let i = 0; i < 3 && typeof parsed === 'string'; i++) {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const cleaned = Object.fromEntries(
    Object.entries(parsed).filter(([k, v]) => k && v && v !== 'null')
  );
  return Object.keys(cleaned).length ? cleaned : null;
}

function renderProductPage(product, storeName, pageInfo) {
  const name = product.custom_name || product.name || 'Untitled';
  const brand = product.brand || '';
  const desc = product.custom_description || product.ai_description_professional || product.description || '';
  const price = product.custom_price || product.price;
  const specs = parseSpecs(product.ai_attributes);
  const image = product.image_url || '';
  const category = product.ai_category_suggestion || product.category;
  const barcode = product.barcode;
  const stock = product.stock_quantity;

  const specsHtml = specs
    ? `<div class="specs" dir="${dir(Object.keys(specs).join(' '))}">${
        Object.entries(specs).map(([k, v]) =>
          `<div class="spec-row"><div class="spec-key">${escapeHtml(k)}</div><div class="spec-val" dir="${dir(String(v))}">${escapeHtml(v)}</div></div>`
        ).join('')
      }</div>`
    : '<p class="empty">No specifications available.</p>';

  const metaItems = [];
  if (barcode) metaItems.push(`<div class="meta-item"><div class="meta-label">Barcode</div><div class="meta-value">${escapeHtml(barcode)}</div></div>`);
  if (category) metaItems.push(`<div class="meta-item"><div class="meta-label">Category</div><div class="meta-value" dir="${dir(category)}">${escapeHtml(category)}</div></div>`);
  if (stock != null) metaItems.push(`<div class="meta-item"><div class="meta-label">Stock</div><div class="meta-value">${escapeHtml(stock)}</div></div>`);

  return `
    <div class="page">
      <div class="strip"></div>
      <div class="header">
        <div class="logo">Catalog<span class="ai">AI</span></div>
        <div class="store-name" dir="${dir(storeName)}">${escapeHtml(storeName || 'Product Catalog')}</div>
      </div>
      <div class="hero">
        <div class="hero-image"${image ? ` style="background-image:url('${escapeHtml(image)}');"` : ''}></div>
        <div>
          ${brand ? `<div class="brand-label" dir="${dir(brand)}">${escapeHtml(brand)}</div>` : ''}
          <div class="product-name" dir="${dir(name)}">${escapeHtml(name)}</div>
          ${price ? `<div class="price">$${escapeHtml(price)}</div>` : ''}
        </div>
      </div>
      ${metaItems.length ? `<div class="section"><div class="section-label">Details</div><div class="meta">${metaItems.join('')}</div></div>` : ''}
      <div class="section">
        <div class="section-label">Description</div>
        ${desc ? `<p class="description" dir="${dir(desc)}">${escapeHtml(desc)}</p>` : '<p class="empty">No description available.</p>'}
      </div>
      <div class="section">
        <div class="section-label">Specifications</div>
        ${specsHtml}
      </div>
      <div class="footer">
        <span>Generated by CatalogAI · ${new Date().toLocaleDateString()}</span>
        <span>${pageInfo || ''}</span>
      </div>
    </div>`;
}

function wrap(body) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_LINKS}<style>${BASE_CSS}</style></head><body>${body}</body></html>`;
}

function renderProductPdf(product, storeName) {
  return wrap(renderProductPage(product, storeName));
}

function renderCatalogPdf(entries, storeName) {
  const pages = entries.map((e, i) =>
    renderProductPage(e, storeName, `Page ${i + 1} of ${entries.length}`)
  ).join('');
  return wrap(pages);
}

module.exports = { renderProductPdf, renderCatalogPdf };
