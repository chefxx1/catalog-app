import React from "react";
import { Icon } from "./shared";

const formatPrice = (p) => {
  if (!p) return null;
  const n = parseFloat(String(p).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : `$${n.toFixed(2)}`;
};

// Shopify-style product card
const ShopifyMock = ({ product, image, price, description }) => (
  <div className="vp-shop-card">
    <div className="vp-shop-img">
      {image ? <img src={image} alt="" /> : <div className="vp-shop-img-fallback"><Icon name="package" size={36} color="#9CA3AF" /></div>}
    </div>
    <div className="vp-shop-body">
      <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{product.brand || "Your store"}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", lineHeight: 1.3, marginBottom: 8 }}>{product.name || "Product Name"}</div>
      {price && <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 10 }}>{price}</div>}
      <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 14, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{description || "—"}</div>
      <button className="vp-shop-btn">Add to cart</button>
    </div>
  </div>
);

// Google Shopping ad-style result
const GoogleShoppingMock = ({ product, image, price }) => (
  <div className="vp-google-card">
    <div className="vp-google-img">
      {image ? <img src={image} alt="" /> : <div className="vp-google-img-fallback"><Icon name="package" size={28} color="#9CA3AF" /></div>}
    </div>
    <div style={{ padding: "10px 12px" }}>
      <div style={{ fontSize: 13, color: "#1A0DAB", lineHeight: 1.3, marginBottom: 4, fontWeight: 400 }}>{product.name || "Product Name"}</div>
      {price && <div style={{ fontSize: 14, color: "#202124", fontWeight: 700, marginBottom: 4 }}>{price}</div>}
      <div style={{ fontSize: 11, color: "#5F6368", display: "flex", alignItems: "center", gap: 4 }}>
        <span>{product.brand || "Your Store"}</span>
        <span>·</span>
        <span style={{ color: "#188038" }}>Free shipping</span>
      </div>
      <div style={{ fontSize: 10, color: "#FFC107", marginTop: 4 }}>★★★★★ <span style={{ color: "#5F6368" }}>(124)</span></div>
    </div>
  </div>
);

// WooCommerce-style storefront card
const WooMock = ({ product, image, price, description }) => (
  <div className="vp-woo-card">
    <div className="vp-woo-img">
      {image ? <img src={image} alt="" /> : <div className="vp-woo-img-fallback"><Icon name="package" size={32} color="#9CA3AF" /></div>}
      <span className="vp-woo-sale-tag">Sale!</span>
    </div>
    <div style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#23282D", textAlign: "center", marginBottom: 6 }}>{product.name || "Product Name"}</div>
      {price && <div style={{ fontSize: 15, fontWeight: 700, color: "#7F54B3", textAlign: "center", marginBottom: 10 }}>{price}</div>}
      <button className="vp-woo-btn">Add to basket</button>
    </div>
  </div>
);

// Generic Magento / BigCommerce style — clean grid card
const GenericMock = ({ product, image, price, accentColor = "#3B82F6" }) => (
  <div className="vp-generic-card" style={{ "--accent": accentColor }}>
    <div className="vp-generic-img">
      {image ? <img src={image} alt="" /> : <div className="vp-generic-img-fallback"><Icon name="package" size={32} color="#9CA3AF" /></div>}
    </div>
    <div style={{ padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 6 }}>{product.name || "Product Name"}</div>
      {product.brand && <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>by {product.brand}</div>}
      {price && <div style={{ fontSize: 16, fontWeight: 800, color: accentColor, marginBottom: 10 }}>{price}</div>}
      <button className="vp-generic-btn">View Details</button>
    </div>
  </div>
);

// PDF preview — looks like a document
const PdfMock = ({ product, image, price }) => (
  <div className="vp-pdf-card">
    <div className="vp-pdf-page">
      <div className="vp-pdf-strip">
        <div className="vp-pdf-strip-block" />
        <div className="vp-pdf-strip-block" />
        <div className="vp-pdf-strip-block" />
      </div>
      <div style={{ padding: "20px 22px 14px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>Catalog</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#7C3AED" }}>AI</span>
          <span style={{ marginLeft: "auto", fontSize: 9, color: "#9CA3AF" }}>{new Date().toLocaleDateString()}</span>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <div className="vp-pdf-img">
            {image ? <img src={image} alt="" /> : <div className="vp-pdf-img-fallback"><Icon name="package" size={24} color="#9CA3AF" /></div>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em", marginBottom: 3 }}>{product.name || "Product"}</div>
            {product.brand && <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 6 }}>{product.brand}</div>}
            {price && <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>{price}</div>}
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #E5E7EB", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ height: 4, background: "#F3F4F6", borderRadius: 2, width: "92%" }} />
          <div style={{ height: 4, background: "#F3F4F6", borderRadius: 2, width: "78%" }} />
          <div style={{ height: 4, background: "#F3F4F6", borderRadius: 2, width: "84%" }} />
        </div>
      </div>
    </div>
  </div>
);

const VisualPreview = ({ platform, productData }) => {
  const product = productData?.product || {};
  const image = productData?.images?.[0]?.image_url || null;
  const price = formatPrice(productData?.enriched?.price || product.price);
  const description = product.ai_description_professional || product.edited_description || product.description || "";

  const wrap = (content) => (
    <div style={{ padding: 24, display: "flex", justifyContent: "center", background: "linear-gradient(180deg, color-mix(in oklab, var(--bg) 60%, transparent), color-mix(in oklab, var(--surface) 60%, transparent))" }}>
      {content}
    </div>
  );

  switch (platform) {
    case "Shopify":         return wrap(<ShopifyMock product={product} image={image} price={price} description={description} />);
    case "Google Shopping": return wrap(<GoogleShoppingMock product={product} image={image} price={price} />);
    case "WooCommerce":     return wrap(<WooMock product={product} image={image} price={price} description={description} />);
    case "Magento":         return wrap(<GenericMock product={product} image={image} price={price} accentColor="#EE672F" />);
    case "BigCommerce":     return wrap(<GenericMock product={product} image={image} price={price} accentColor="#34313F" />);
    case "PDF Catalog":     return wrap(<PdfMock product={product} image={image} price={price} />);
    default:                return wrap(<GenericMock product={product} image={image} price={price} />);
  }
};

export default VisualPreview;
