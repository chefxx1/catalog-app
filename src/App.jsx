import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// ICONS
// ============================================================
const Icon = ({ name, size = 16, color = "currentColor" }) => {
  const icons = {
    search: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
    barcode: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v14"/></svg>,
    upload: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
    camera: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    warning: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
    refresh: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>,
    download: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    sparkle: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>,
    tag: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>,
    package: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
    grid: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>,
    chart: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    settings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
    plus: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>,
    x: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
    chevronRight: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
    chevronDown: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
    logout: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    eye: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
    edit: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    database: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>,
    clock: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    cpu: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>,
    shield: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    zap: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    moon: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>,
    sun: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-8-10H2m20 0h-2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"/></svg>,
    eyeOff: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
    user: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    mail: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
    arrowLeft: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
    store: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>,
  };
  return icons[name] || <span>{name}</span>;
};

// ============================================================
// MOCK DATA
// ============================================================
const MOCK_PRODUCT = {
  upc: "012345678901", name: "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
  brand: "Sony", category: "Electronics > Audio > Headphones",
  price: { amazon: "$349.99", alibaba: "$298.00" }, weight: "250g", dimensions: "7.5 x 3.3 x 9.6 inches",
  sources: [
    { name: "Amazon", icon: "package", trustScore: 92, color: "#FF9900", data: { price: "$349.99", inStock: "true", rating: "4.4/5", reviews: "12,847" } },
    { name: "Open Food Facts", icon: "database", trustScore: 78, color: "#10B981", data: { category: "Electronics", format: "Over-ear", brand: "Sony" } },
    { name: "UPC Database", icon: "barcode", trustScore: 88, color: "#6366F1", data: { upc: "012345678901", ean: "4548736120693", format: "EAN-13" } },
    { name: "Alibaba", icon: "package", trustScore: 71, color: "#FF6A00", data: { price: "$298.00", minOrder: "5 units", supplier: "Verified" } },
    { name: "Google Search", icon: "search", trustScore: 65, color: "#4285F4", data: { snippets: "12", results: "847,000", topResult: "Sony.com" } },
  ],
  images: [
    { id: 1, url: "https://picsum.photos/seed/sony1/400/400", qualityScore: 9.2, selected: true, label: "Front view, white bg" },
    { id: 2, url: "https://picsum.photos/seed/sony2/400/400", qualityScore: 8.7, selected: true, label: "Side profile" },
    { id: 3, url: "https://picsum.photos/seed/sony3/400/400", qualityScore: 8.1, selected: true, label: "Lifestyle shot" },
    { id: 4, url: "https://picsum.photos/seed/sony4/400/400", qualityScore: 7.4, selected: false, label: "Box contents" },
    { id: 5, url: "https://picsum.photos/seed/sony5/400/400", qualityScore: 6.8, selected: false, label: "Folded view" },
    { id: 6, url: "https://picsum.photos/seed/sony6/400/400", qualityScore: 6.1, selected: false, label: "In-use photo" },
  ],
  conflicts: [
    { field: "Price", values: { Amazon: "$349.99", Alibaba: "$298.00" }, severity: "medium" },
    { field: "Weight", values: { Amazon: "250g", UPC: "255g" }, severity: "low" },
  ],
  seoTags: ["wireless headphones", "noise canceling", "sony wh1000xm5", "premium audio", "bluetooth headphones", "over-ear"],
  aiDescriptions: [
    { tone: "Professional", text: "The Sony WH-1000XM5 redefines premium audio with industry-leading noise cancellation technology. Featuring dual processors and eight-microphone array, these headphones deliver exceptional acoustic performance for the discerning audiophile. With up to 30 hours of battery life and multi-point connectivity, they seamlessly integrate into any professional workflow." },
    { tone: "Friendly", text: "Say goodbye to distractions with Sony's amazing WH-1000XM5! These headphones are like having your own personal sound bubble — crazy good noise cancellation keeps the world out while crystal-clear audio pulls you in. Plus, they're super comfy for all-day wear, and the 30-hour battery means you won't be reaching for the charger anytime soon!" },
    { tone: "Luxury", text: "Transcend the ordinary with the Sony WH-1000XM5 — an opus of acoustic engineering that sets the benchmark for wireless audio excellence. Meticulously crafted for those who demand nothing less than perfection, these headphones envelop you in an intimate soundstage while proprietary HD Noise Canceling Processor QN1 silences the world's intrusions." },
  ],
  specs: { "Driver Unit": "30mm", "Frequency Response": "4Hz-40,000Hz", "Battery Life": "30 hours", "Charging Time": "3.5 hours", "Bluetooth": "5.2", "Weight": "250g", "Foldable": "No", "Microphones": "8 built-in" },
};

const SAMPLE_CATALOG = [
  { id: 1, name: "Sony WH-1000XM5 Headphones", upc: "012345678901", status: "Published", category: "Electronics", date: "2025-02-15", sources: 5, image: "https://picsum.photos/seed/product1/60/60" },
  { id: 2, name: "Apple AirPods Pro (2nd Gen)", upc: "194253378693", status: "Review", category: "Electronics", date: "2025-02-14", sources: 4, image: "https://picsum.photos/seed/product2/60/60" },
  { id: 3, name: "Organic Green Tea 100g", upc: "748927401832", status: "Draft", category: "Food & Beverage", date: "2025-02-13", sources: 3, image: "https://picsum.photos/seed/product3/60/60" },
  { id: 4, name: "Nike Air Max 270 Sneakers", upc: "887791153846", status: "Exported", category: "Footwear", date: "2025-02-12", sources: 4, image: "https://picsum.photos/seed/product4/60/60" },
  { id: 5, name: "Instant Pot Duo 7-in-1", upc: "853236004885", status: "Published", category: "Home & Kitchen", date: "2025-02-11", sources: 5, image: "https://picsum.photos/seed/product5/60/60" },
];

// ============================================================
// GLOBAL STYLES (Theme-aware via CSS custom properties)
// ============================================================
const GlobalStyles = ({ dark }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: #2563EB; --primary-light: #3B82F6; --primary-dark: #1D4ED8;
      --success: #10B981; --success-light: #34D399; --warning: #F59E0B; --warning-light: #FCD34D;
      --danger: #EF4444; --danger-light: #FCA5A5;
      ${dark ? `
      --bg: #0F172A; --bg-sidebar: #080F1A; --surface: #1E293B; --surface-light: #334155;
      --border: rgba(71,85,105,0.6); --border-light: rgba(71,85,105,0.3);
      --text: #F8FAFC; --text-sec: #E2E8F0; --text-muted: #94A3B8; --text-dim: #64748B;
      --input-bg: rgba(15,23,42,0.8); --hover-bg: rgba(30,41,59,0.5);
      --glass: rgba(8,15,26,0.8); --card-shadow: none;
      ` : `
      --bg: #F1F5F9; --bg-sidebar: #FFFFFF; --surface: #FFFFFF; --surface-light: #F1F5F9;
      --border: rgba(203,213,225,0.8); --border-light: rgba(226,232,240,0.6);
      --text: #0F172A; --text-sec: #1E293B; --text-muted: #64748B; --text-dim: #94A3B8;
      --input-bg: #FFFFFF; --hover-bg: rgba(241,245,249,0.8);
      --glass: rgba(255,255,255,0.9); --card-shadow: 0 1px 3px rgba(0,0,0,0.06);
      `}
    }
    body, #root { font-family: 'Sora', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; transition: background 0.35s ease, color 0.35s ease; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    .mono { font-family: 'DM Mono', monospace; }

    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideIn { from { opacity:0; transform:translateX(-16px); } to { opacity:1; transform:translateX(0); } }
    @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    @keyframes spin { to { transform:rotate(360deg); } }
    @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
    @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
    @keyframes glow { 0%,100% { box-shadow:0 0 20px rgba(37,99,235,0.3); } 50% { box-shadow:0 0 40px rgba(37,99,235,0.6); } }
    @keyframes confetti { 0% { transform:translateY(-20px) rotate(0deg); opacity:1; } 100% { transform:translateY(100vh) rotate(720deg); opacity:0; } }
    @keyframes bounceDot { 0%,80%,100% { transform:scale(0); } 40% { transform:scale(1); } }
    @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
    @keyframes themeSwitch { 0% { opacity:0.5; filter:blur(2px); } 100% { opacity:1; filter:blur(0); } }

    .animate-fadeIn { animation: fadeIn 0.35s ease-out both; }
    .animate-slideIn { animation: slideIn 0.3s ease-out both; }
    .animate-slideUp { animation: slideUp 0.4s ease-out both; }
    .animate-pulse { animation: pulse 2s infinite; }
    .animate-spin { animation: spin 1s linear infinite; }
    .animate-float { animation: float 3s ease-in-out infinite; }
    .animate-glow { animation: glow 2s ease-in-out infinite; }
    .animate-scaleIn { animation: scaleIn 0.35s ease-out both; }
    .animate-theme { animation: themeSwitch 0.4s ease-out; }

    .skeleton { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-light) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; }

    .btn { display:inline-flex; align-items:center; gap:8px; padding:8px 18px; border-radius:8px; font-family:'Sora',sans-serif; font-weight:600; font-size:13px; cursor:pointer; border:none; transition:all 0.2s; white-space:nowrap; }
    .btn:hover { transform:translateY(-1px); } .btn:active { transform:translateY(0); }
    .btn-primary { background:var(--primary); color:white; } .btn-primary:hover { background:var(--primary-light); box-shadow:0 0 20px rgba(37,99,235,0.4); }
    .btn-success { background:var(--success); color:white; } .btn-success:hover { background:var(--success-light); box-shadow:0 0 20px rgba(16,185,129,0.4); }
    .btn-ghost { background:transparent; color:var(--text-muted); border:1px solid var(--border); } .btn-ghost:hover { background:var(--surface); color:var(--text); }

    .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; box-shadow:var(--card-shadow); transition:background 0.35s, border-color 0.35s; }

    .badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; letter-spacing:0.02em; }
    .badge-success { background:rgba(16,185,129,0.15); color:var(--success-light); }
    .badge-warning { background:rgba(245,158,11,0.15); color:var(--warning-light); }
    .badge-primary { background:rgba(37,99,235,0.15); color:#60A5FA; }
    .badge-neutral { background:rgba(100,116,139,0.2); color:var(--text-muted); }
    .badge-ai { background:rgba(16,185,129,0.1); color:var(--success-light); border:1px solid rgba(16,185,129,0.3); }

    .input { background:var(--input-bg); border:1px solid var(--border); border-radius:8px; color:var(--text); font-family:'Sora',sans-serif; font-size:14px; padding:10px 14px; outline:none; transition:all 0.2s; width:100%; }
    .input:focus { border-color:var(--primary); box-shadow:0 0 0 3px rgba(37,99,235,0.15); }
    .input::placeholder { color:var(--text-dim); }
    textarea.input { resize:vertical; min-height:80px; }
    select.input { appearance:none; background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:36px; }
    select.input option { background:var(--surface); }

    .progress-bar { height:4px; background:var(--surface-light); border-radius:2px; overflow:hidden; }
    .progress-fill { height:100%; border-radius:2px; transition:width 0.5s ease; }

    .nav-item { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; cursor:pointer; transition:all 0.2s; color:var(--text-muted); font-size:13px; font-weight:500; }
    .nav-item:hover { background:var(--surface); color:var(--text); }
    .nav-item.active { background:rgba(37,99,235,0.15); color:var(--primary-light); }

    .export-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:16px; cursor:pointer; transition:all 0.2s; position:relative; }
    .export-card:hover { border-color:var(--primary); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.15); }
    .export-card.selected { border-color:var(--primary); background:rgba(37,99,235,0.1); }

    .drop-zone { border:2px dashed var(--border); border-radius:12px; padding:32px; text-align:center; cursor:pointer; transition:all 0.2s; }
    .drop-zone:hover, .drop-zone.dragging { border-color:var(--primary); background:rgba(37,99,235,0.05); }

    .highlight-warning { background:rgba(245,158,11,0.08); border-left:3px solid var(--warning); }
    .description-card { border:1px solid var(--border); border-radius:10px; padding:14px; transition:all 0.2s; cursor:pointer; }
    .description-card:hover { border-color:var(--primary-light); }
    .description-card.selected { border-color:var(--success); background:rgba(16,185,129,0.05); }

    .split-panel { overflow-y:auto; max-height:calc(100vh - 280px); }
    .hero-bg { background: radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.06) 0%, transparent 50%), radial-gradient(ellipse at 60% 80%, rgba(139,92,246,0.04) 0%, transparent 50%); }
    .confetti-piece { position:fixed; width:8px; height:8px; border-radius:2px; animation:confetti 3s ease-in both; z-index:9999; }
    .dot-1 { animation:bounceDot 1.4s infinite ease-in-out; animation-delay:-0.32s; }
    .dot-2 { animation:bounceDot 1.4s infinite ease-in-out; animation-delay:-0.16s; }
    .dot-3 { animation:bounceDot 1.4s infinite ease-in-out; }
  `}</style>
);

// ============================================================
// SMALL COMPONENTS
// ============================================================
const Confetti = ({ active }) => { if (!active) return null; return <>{Array.from({length:60},(_,i)=><div key={i} className="confetti-piece" style={{left:Math.random()*100+"vw",top:"-20px",background:["#2563EB","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"][i%6],width:Math.random()*8+6,height:Math.random()*8+6,animationDelay:Math.random()*0.8+"s",animationDuration:(Math.random()*2+2)+"s"}}/>)}</>; };
const LoadingDots = () => <div style={{display:"flex",gap:6,alignItems:"center"}}>{[0,1,2].map(i=><div key={i} className={`dot-${i+1}`} style={{width:8,height:8,borderRadius:"50%",background:"#3B82F6"}}/>)}</div>;
const ConfidenceScore = ({ score }) => { const c = score>=85?"#10B981":score>=65?"#F59E0B":"#EF4444"; return <div style={{display:"inline-flex",alignItems:"center",gap:4}}><div style={{width:48,height:4,background:"rgba(100,116,139,0.3)",borderRadius:2,overflow:"hidden"}}><div style={{width:`${score}%`,height:"100%",background:c,borderRadius:2,transition:"width 0.6s ease"}}/></div><span className="mono" style={{fontSize:11,color:c,fontWeight:600}}>{score}%</span></div>; };

const ThemeToggle = ({ dark, onToggle }) => (
  <div onClick={onToggle} style={{ position:"relative", width:48, height:26, borderRadius:13, cursor:"pointer", border:"1px solid var(--border)", background: dark ? "var(--surface)" : "#E2E8F0", transition:"all 0.3s" }}>
    <div style={{ position:"absolute", top:2, left: dark ? 24 : 2, width:20, height:20, borderRadius:"50%", background: dark ? "#334155" : "#FFFFFF", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"all 0.3s cubic-bezier(0.68,-0.55,0.27,1.55)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Icon name={dark ? "moon" : "sun"} size={12} color="#F59E0B" />
    </div>
  </div>
);

// ============================================================
// STEP INDICATOR
// ============================================================
const StepIndicator = ({ currentStep }) => {
  const steps = ["Search","Review","Export"];
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,padding:"20px 0"}}>
      {steps.map((step,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:i<currentStep?"#10B981":i===currentStep?"#2563EB":"rgba(71,85,105,0.3)",border:`2px solid ${i<currentStep?"#10B981":i===currentStep?"#3B82F6":"var(--border)"}`,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.4s ease",boxShadow:i===currentStep?"0 0 16px rgba(37,99,235,0.5)":"none"}}>
              {i<currentStep?<Icon name="check" size={16} color="white"/>:<span style={{fontSize:13,fontWeight:700,color:i===currentStep?"white":"var(--text-dim)"}}>{i+1}</span>}
            </div>
            <span style={{fontSize:11,fontWeight:600,color:i===currentStep?"#3B82F6":i<currentStep?"#10B981":"var(--text-dim)",letterSpacing:"0.05em"}}>{step.toUpperCase()}</span>
          </div>
          {i<2&&<div style={{width:80,height:2,background:i<currentStep?"#10B981":"var(--border)",margin:"0 4px",marginBottom:20,transition:"background 0.4s"}}/>}
        </div>
      ))}
    </div>
  );
};

// ============================================================
// STEP 1: SEARCH
// ============================================================
const SearchStep = ({ onSearch }) => {
  const [upc,setUpc]=useState(""); const [loading,setLoading]=useState(false); const [loadingStep,setLoadingStep]=useState(0); const [dragOver,setDragOver]=useState(false); const fileRef=useRef(null);
  const msgs=["Querying Amazon Product API...","Checking Open Food Facts...","Scanning UPC Database...","Searching Alibaba...","Searching Google..."];
  const handleSearch=()=>{if(!upc.trim()&&!loading)return;setLoading(true);setLoadingStep(0);let s=0;const iv=setInterval(()=>{s++;if(s>=msgs.length){clearInterval(iv);setTimeout(()=>{setLoading(false);onSearch();},600);}else setLoadingStep(s);},800);};

  if(loading) return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:30,padding:"60px 20px",minHeight:400}}>
      <div className="animate-glow" style={{position:"relative",width:120,height:120}}>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"3px solid rgba(37,99,235,0.2)",borderTop:"3px solid #2563EB",animation:"spin 1s linear infinite"}}/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="cpu" size={36} color="#2563EB"/></div>
      </div>
      <div style={{textAlign:"center"}}>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:8}}>Aggregating Data</h2>
        <p style={{color:"var(--text-muted)",marginBottom:20}}>{msgs[loadingStep]}</p>
        <div style={{display:"flex",flexDirection:"column",gap:8,width:320}}>
          {MOCK_PRODUCT.sources.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,opacity:i<=loadingStep?1:0.3,transition:"opacity 0.3s"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:i<loadingStep?"#10B981":i===loadingStep?"#2563EB":"var(--text-dim)",flexShrink:0}}/>
              <span style={{fontSize:13,color:i<=loadingStep?"var(--text)":"var(--text-dim)"}}>{s.name}</span>
              {i<loadingStep&&<Icon name="check" size={12} color="#10B981"/>}
              {i===loadingStep&&<LoadingDots/>}
              <span className="mono" style={{marginLeft:"auto",fontSize:11,color:"#10B981",opacity:i<loadingStep?1:0}}>✓ {s.trustScore}%</span>
            </div>
          ))}
        </div>
        <div className="progress-bar" style={{marginTop:20,width:320}}><div className="progress-fill" style={{width:`${((loadingStep+1)/msgs.length)*100}%`,background:"linear-gradient(90deg,#2563EB,#10B981)"}}/></div>
      </div>
    </div>
  );

  return (
    <div className="animate-fadeIn hero-bg" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:24,padding:"48px 20px 40px"}}>
      <div style={{textAlign:"center",maxWidth:560}}>
        <div className="badge badge-ai" style={{marginBottom:16}}><Icon name="sparkle" size={11}/> AI-Powered Catalog Intelligence</div>
        <h1 style={{fontSize:36,fontWeight:800,marginBottom:10,lineHeight:1.15,letterSpacing:"-0.02em"}}>Scan once, catalog{" "}<span style={{background:"linear-gradient(135deg,#3B82F6,#10B981)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>everywhere</span></h1>
        <p style={{color:"var(--text-muted)",fontSize:15,lineHeight:1.6}}>Enter a barcode or upload a product image. We'll instantly query 5 data sources and generate AI-optimized catalog content.</p>
      </div>
      <div style={{width:"100%",maxWidth:560,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{position:"relative"}}>
          <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--text-dim)"}}><Icon name="barcode" size={18}/></div>
          <input className="input" style={{paddingLeft:44,fontSize:16,padding:"14px 18px 14px 44px"}} placeholder="UPC, EAN, GTIN, ISBN (e.g. 012345678901)" value={upc} onChange={e=>setUpc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSearch()}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-primary" style={{flex:1,justifyContent:"center",fontSize:15,padding:"12px 0"}} onClick={handleSearch}><Icon name="search" size={16}/> Search Product</button>
          <button className="btn btn-ghost" onClick={()=>fileRef.current?.click()}><Icon name="camera" size={16}/> Scan</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,color:"var(--text-dim)"}}><div style={{flex:1,height:1,background:"var(--border)"}}/><span style={{fontSize:12,fontWeight:600}}>OR UPLOAD IMAGE</span><div style={{flex:1,height:1,background:"var(--border)"}}/></div>
        <div className={`drop-zone ${dragOver?"dragging":""}`} onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);setUpc("uploaded_image");handleSearch();}}>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={()=>{setUpc("uploaded_image");handleSearch();}}/>
          <div style={{color:"var(--text-dim)",marginBottom:8}}><Icon name="upload" size={28} color={dragOver?"#3B82F6":"var(--text-dim)"}/></div>
          <p style={{fontWeight:600,color:dragOver?"#3B82F6":"var(--text-muted)",fontSize:14}}>Drop product image here</p>
          <p style={{fontSize:12,color:"var(--text-dim)",marginTop:4}}>JPG, PNG up to 10MB</p>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
        <span style={{fontSize:12,color:"var(--text-dim)"}}>Try demo:</span>
        {["012345678901","194253378693","748927401832"].map(c=><button key={c} className="btn btn-ghost mono" style={{fontSize:11,padding:"4px 12px"}} onClick={()=>{setUpc(c);setTimeout(handleSearch,50);}}>{c}</button>)}
      </div>
    </div>
  );
};

// ============================================================
// STEP 2: REVIEW
// ============================================================
const ReviewStep = ({ onExport }) => {
  const [selectedDesc,setSelectedDesc]=useState(0); const [editedDesc,setEditedDesc]=useState(MOCK_PRODUCT.aiDescriptions[0].text);
  const [expandedSource,setExpandedSource]=useState("Amazon"); const [resolvedConflicts,setResolvedConflicts]=useState({});
  const [images,setImages]=useState(MOCK_PRODUCT.images); const [activeTab,setActiveTab]=useState("overview"); const [regenerating,setRegenerating]=useState(false);
  const tabs=["overview","sources","images","seo"];
  const handleRegenerate=async()=>{setRegenerating(true);await new Promise(r=>setTimeout(r,1800));setRegenerating(false);};
  const p=MOCK_PRODUCT;

  return (
    <div className="animate-fadeIn" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,height:"calc(100vh - 200px)",minHeight:500}}>
      {/* LEFT */}
      <div style={{display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--hover-bg)",borderRadius:12,border:"1px solid var(--border)"}}>
        <div style={{display:"flex",borderBottom:"1px solid var(--border)",padding:"0 16px"}}>
          {tabs.map(t=><button key={t} onClick={()=>setActiveTab(t)} style={{background:"none",border:"none",cursor:"pointer",padding:"12px 14px",fontSize:12,fontWeight:600,fontFamily:"'Sora',sans-serif",color:activeTab===t?"#3B82F6":"var(--text-dim)",borderBottom:activeTab===t?"2px solid #2563EB":"2px solid transparent",textTransform:"capitalize",letterSpacing:"0.04em",transition:"all 0.2s"}}>{t}</button>)}
        </div>
        <div className="split-panel" style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
          {activeTab==="overview"&&<>
            {p.conflicts.filter(c=>!resolvedConflicts[c.field]).length>0&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6,color:"var(--warning-light)",fontSize:12,fontWeight:700,letterSpacing:"0.06em"}}><Icon name="warning" size={14} color="#F59E0B"/> CONFLICTS DETECTED</div>
              {p.conflicts.filter(c=>!resolvedConflicts[c.field]).map((c,i)=><div key={i} className="highlight-warning" style={{borderRadius:8,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,fontWeight:700,color:"var(--warning-light)"}}>{c.field}</span><span className="badge badge-warning">{c.severity}</span></div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{Object.entries(c.values).map(([s,v])=><button key={s} className="btn btn-ghost" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>setResolvedConflicts(prev=>({...prev,[c.field]:v}))}>{s}: {v}</button>)}</div>
              </div>)}
            </div>}
            {Object.keys(resolvedConflicts).length>0&&<div style={{fontSize:12,color:"var(--success-light)",display:"flex",alignItems:"center",gap:4}}><Icon name="check" size={12} color="#10B981"/>{Object.keys(resolvedConflicts).length} conflict(s) resolved</div>}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:2}}>PRODUCT DATA</div>
              {[{l:"Name",v:p.name,c:94},{l:"Brand",v:p.brand,c:96},{l:"UPC",v:p.upc,c:100},{l:"Category",v:p.category,c:88},{l:"Weight",v:p.weight,c:78},{l:"Dimensions",v:p.dimensions,c:83}].map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"var(--hover-bg)",borderRadius:6}}>
                <span style={{fontSize:12,color:"var(--text-dim)",width:80,flexShrink:0}}>{f.l}</span>
                <span className={f.l==="UPC"?"mono":""} style={{fontSize:12,flex:1,color:"var(--text-sec)"}}>{f.v}</span>
                <ConfidenceScore score={f.c}/>
              </div>)}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em"}}>SPECIFICATIONS</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                {Object.entries(p.specs).map(([k,v])=><div key={k} style={{padding:"6px 10px",background:"var(--hover-bg)",borderRadius:6}}>
                  <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:1}}>{k}</div>
                  <div className="mono" style={{fontSize:12,color:"var(--text-sec)"}}>{v}</div>
                </div>)}
              </div>
            </div>
          </>}
          {activeTab==="sources"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {p.sources.map((s,i)=><div key={i} style={{background:"var(--hover-bg)",borderRadius:8,border:"1px solid var(--border)",overflow:"hidden",transition:"all 0.3s"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",cursor:"pointer"}} onClick={()=>setExpandedSource(expandedSource===s.name?null:s.name)}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:28,height:28,borderRadius:6,background:s.color+"20",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name={s.icon} size={14} color={s.color}/></div>
                  <div><div style={{fontSize:13,fontWeight:600}}>{s.name}</div><ConfidenceScore score={s.trustScore}/></div>
                </div>
                <Icon name={expandedSource===s.name?"chevronDown":"chevronRight"} size={14} color="var(--text-dim)"/>
              </div>
              {expandedSource===s.name&&<div className="animate-slideUp" style={{padding:"0 14px 12px",display:"flex",flexDirection:"column",gap:4}}>
                {Object.entries(s.data).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"var(--text-dim)"}}>{k}</span><span className="mono" style={{color:"var(--text-sec)"}}>{String(v)}</span></div>)}
              </div>}
            </div>)}
          </div>}
          {activeTab==="images"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {images.map(img=><div key={img.id} onClick={()=>setImages(prev=>prev.map(im=>im.id===img.id?{...im,selected:!im.selected}:im))} style={{position:"relative",borderRadius:8,overflow:"hidden",cursor:"pointer",border:`2px solid ${img.selected?"#10B981":"transparent"}`,transition:"all 0.2s",opacity:img.selected?1:0.5}}>
              <img src={img.url} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover"}}/>
              <div className="mono" style={{position:"absolute",top:6,right:6,background:img.qualityScore>=8.5?"#10B981":img.qualityScore>=7?"#F59E0B":"#EF4444",borderRadius:4,padding:"2px 6px",fontSize:11,fontWeight:700,color:"white"}}>{img.qualityScore}</div>
              {img.selected&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(16,185,129,0.8)",padding:"4px 6px",textAlign:"center",fontSize:10,fontWeight:600,color:"white"}}>✓ SELECTED</div>}
              <div style={{padding:"4px 6px",background:"var(--hover-bg)",fontSize:10,color:"var(--text-muted)"}}>{img.label}</div>
            </div>)}
          </div>}
          {activeTab==="seo"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>AI-GENERATED SEO TAGS</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{p.seoTags.map((t,i)=><span key={i} style={{padding:"4px 12px",background:"rgba(37,99,235,0.15)",border:"1px solid rgba(37,99,235,0.3)",borderRadius:20,fontSize:12,color:"#60A5FA"}}>#{t}</span>)}</div></div>
            <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>META TITLE</div><div style={{padding:10,background:"var(--hover-bg)",borderRadius:6,fontSize:13,color:"var(--text-sec)"}}>Sony WH-1000XM5 Wireless Noise Canceling Headphones | Premium Audio</div></div>
            <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>META DESCRIPTION</div><div style={{padding:10,background:"var(--hover-bg)",borderRadius:6,fontSize:13,color:"var(--text-sec)",lineHeight:1.5}}>Shop the Sony WH-1000XM5 with industry-leading noise cancellation, 30hr battery, and premium audio quality. Free shipping available.</div></div>
          </div>}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--hover-bg)",borderRadius:12,border:"1px solid var(--border)"}}>
        <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><Icon name="sparkle" size={16} color="#10B981"/><span style={{fontWeight:700,fontSize:14}}>AI-Generated Content</span><span className="badge badge-ai">AI</span></div>
          <button className="btn btn-ghost" style={{fontSize:11,padding:"4px 12px"}} onClick={handleRegenerate}><Icon name="refresh" size={12}/> {regenerating?"Regenerating...":"Regenerate"}</button>
        </div>
        <div className="split-panel" style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
          <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>BRAND TONE</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["Professional","Friendly","Luxury","Technical","Casual"].map((t,i)=><button key={t} onClick={()=>{setSelectedDesc(Math.min(i,p.aiDescriptions.length-1));setEditedDesc(p.aiDescriptions[Math.min(i,p.aiDescriptions.length-1)].text);}} className={`btn ${i===selectedDesc?"btn-primary":"btn-ghost"}`} style={{fontSize:11,padding:"5px 14px",borderRadius:20}}>{t}</button>)}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em"}}>DESCRIPTION VARIANTS</div>
            {p.aiDescriptions.map((d,i)=><div key={i} className={`description-card ${selectedDesc===i?"selected":""}`} onClick={()=>{setSelectedDesc(i);setEditedDesc(d.text);}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span className="badge badge-neutral">{d.tone}</span>{selectedDesc===i&&<Icon name="check" size={12} color="#10B981"/>}</div>
                <ConfidenceScore score={92-i*7}/>
              </div>
              <p style={{fontSize:13,lineHeight:1.6,color:"var(--text-muted)"}}>{d.text.slice(0,120)}...</p>
            </div>)}
          </div>
          <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>FINAL DESCRIPTION <span className="badge badge-ai" style={{marginLeft:6}}>Editable</span></div>
            <textarea className="input" value={editedDesc} onChange={e=>setEditedDesc(e.target.value)} rows={5} style={{lineHeight:1.6}}/>
          </div>
          <div style={{padding:12,background:"var(--hover-bg)",borderRadius:8,border:"1px solid var(--border)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:8}}>PRE-PUBLISH CHECKLIST</div>
            {[{t:"AI description reviewed for accuracy",ok:true},{t:"Pricing verified across sources",ok:Object.keys(resolvedConflicts).length>0},{t:"Product images selected",ok:images.filter(i=>i.selected).length>0},{t:"SEO tags generated",ok:true}].map((item,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"center",fontSize:12,marginBottom:4,color:item.ok?"var(--text-muted)":"#F87171"}}><Icon name={item.ok?"check":"x"} size={12} color={item.ok?"#10B981":"#EF4444"}/> {item.t}</div>)}
          </div>
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid var(--border)",display:"flex",gap:10}}>
          <button className="btn btn-success" style={{flex:1,justifyContent:"center"}} onClick={onExport}><Icon name="download" size={15}/> Proceed to Export</button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// STEP 3: EXPORT
// ============================================================
const ExportStep = ({ onComplete }) => {
  const [fmt,setFmt]=useState("CSV"); const [plat,setPlat]=useState("Shopify"); const [exporting,setExporting]=useState(false); const [progress,setProgress]=useState(0); const [done,setDone]=useState(false); const [showConfetti,setShowConfetti]=useState(false);
  const platforms=[{name:"Shopify",color:"#96BF48"},{name:"WooCommerce",color:"#7F54B3"},{name:"Magento",color:"#EE672F"},{name:"BigCommerce",color:"#34313F"}];
  const handleExport=async()=>{setExporting(true);for(let i=0;i<=100;i+=3){await new Promise(r=>setTimeout(r,50));setProgress(i);}setProgress(100);setExporting(false);setDone(true);setShowConfetti(true);setTimeout(()=>setShowConfetti(false),4000);};

  if(done) return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:24,padding:"60px 20px",textAlign:"center"}}>
      <Confetti active={showConfetti}/>
      <div className="animate-scaleIn" style={{width:80,height:80,borderRadius:"50%",background:"rgba(16,185,129,0.15)",border:"2px solid #10B981",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="check" size={36} color="#10B981"/></div>
      <div><h2 style={{fontSize:28,fontWeight:800,marginBottom:8}}>Export Complete! 🎉</h2><p style={{color:"var(--text-muted)",maxWidth:400}}>Your product catalog has been exported to {plat} as {fmt}. Ready to import!</p></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,maxWidth:480}}>
        {[{l:"Products Exported",v:"1"},{l:"Time Saved",v:"~2 hrs"},{l:"Format",v:fmt}].map((s,i)=><div key={i} className="card" style={{textAlign:"center"}}><div className="mono" style={{fontSize:24,fontWeight:800,color:"#10B981"}}>{s.v}</div><div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>{s.l}</div></div>)}
      </div>
      <div style={{display:"flex",gap:12}}><button className="btn btn-success"><Icon name="download" size={15}/> Download File</button><button className="btn btn-ghost" onClick={onComplete}><Icon name="plus" size={15}/> New Product</button></div>
    </div>
  );

  return (
    <div className="animate-fadeIn" style={{maxWidth:600,margin:"0 auto",padding:"24px 20px",display:"flex",flexDirection:"column",gap:24}}>
      <div><h2 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Export Catalog</h2><p style={{color:"var(--text-muted)",fontSize:14}}>Choose your export format and destination platform</p></div>
      <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:10}}>EXPORT FORMAT</div>
        <div style={{display:"flex",gap:10}}>{["CSV","JSON","XML"].map(f=><button key={f} onClick={()=>setFmt(f)} className="mono" style={{flex:1,padding:14,borderRadius:10,border:`2px solid ${fmt===f?"#3B82F6":"var(--border)"}`,background:fmt===f?"rgba(37,99,235,0.1)":"var(--hover-bg)",color:fmt===f?"#60A5FA":"var(--text-muted)",fontSize:16,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>{f}</button>)}</div>
      </div>
      <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:10}}>PLATFORM TEMPLATE</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{platforms.map(pl=><div key={pl.name} className={`export-card ${plat===pl.name?"selected":""}`} onClick={()=>setPlat(pl.name)}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:10,height:10,borderRadius:"50%",background:pl.color}}/><span style={{fontSize:14,fontWeight:600}}>{pl.name}</span></div>
          <div style={{fontSize:11,color:"var(--text-dim)",marginTop:4}}>{fmt} template optimized</div>
          {plat===pl.name&&<div style={{position:"absolute",top:10,right:10}}><Icon name="check" size={14} color="#10B981"/></div>}
        </div>)}</div>
      </div>
      <div style={{padding:16,background:"var(--hover-bg)",borderRadius:10,border:"1px solid var(--border)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--text-dim)",marginBottom:10,letterSpacing:"0.06em"}}>EXPORT SUMMARY</div>
        {[["Product","Sony WH-1000XM5 Headphones"],["Format",fmt],["Platform",plat],["Images","3 selected (top quality)"],["Description","AI-Generated (Professional)"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:13}}><span style={{color:"var(--text-dim)"}}>{k}</span><span className={k==="Format"?"mono":""} style={{color:"var(--text-sec)"}}>{v}</span></div>)}
      </div>
      {exporting&&<div><div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}><span style={{color:"var(--text-muted)"}}>Generating {fmt}...</span><span className="mono" style={{color:"#10B981"}}>{progress}%</span></div><div className="progress-bar" style={{height:6}}><div className="progress-fill" style={{width:`${progress}%`,background:"linear-gradient(90deg,#2563EB,#10B981)"}}/></div></div>}
      <button className="btn btn-success" style={{justifyContent:"center",fontSize:15,padding:14}} onClick={handleExport} disabled={exporting}>{exporting?<><Icon name="refresh" size={15}/> Generating...</>:<><Icon name="download" size={15}/> Export to {plat}</>}</button>
    </div>
  );
};

// ============================================================
// DASHBOARD
// ============================================================
const Dashboard = ({ onNew }) => {
  const stats=[{label:"Products Processed",value:"847",icon:"package",color:"#3B82F6"},{label:"Hours Saved",value:"~127",icon:"clock",color:"#10B981"},{label:"Catalogs Exported",value:"34",icon:"download",color:"#8B5CF6"},{label:"Active Sources",value:"5",icon:"database",color:"#F59E0B"}];
  const sc={Published:"badge-success",Review:"badge-warning",Draft:"badge-neutral",Exported:"badge-primary"};
  return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",gap:24}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
        {stats.map((s,i)=><div key={i} className="card animate-slideUp" style={{position:"relative",overflow:"hidden",animationDelay:`${i*0.06}s`}}>
          <div style={{position:"absolute",top:-12,right:-12,width:60,height:60,borderRadius:"50%",background:s.color+"15"}}/>
          <div style={{marginBottom:8}}><Icon name={s.icon} size={20} color={s.color}/></div>
          <div className="mono" style={{fontSize:26,fontWeight:800,color:s.color}}>{s.value}</div>
          <div style={{fontSize:12,color:"var(--text-dim)",marginTop:2}}>{s.label}</div>
        </div>)}
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid var(--border)"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}><h3 style={{fontSize:16,fontWeight:700}}>Catalog Entries</h3><span className="badge badge-neutral">{SAMPLE_CATALOG.length}</span></div>
          <div style={{display:"flex",gap:10}}>
            <div style={{position:"relative"}}><div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><Icon name="search" size={13} color="var(--text-dim)"/></div><input className="input" placeholder="Search..." style={{paddingLeft:32,width:180,fontSize:13,padding:"7px 12px 7px 30px"}}/></div>
            <button className="btn btn-primary" onClick={onNew}><Icon name="plus" size={14}/> New Product</button>
          </div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{borderBottom:"1px solid var(--border)"}}>{["Product","UPC","Category","Sources","Status","Date","Actions"].map(h=><th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em"}}>{h.toUpperCase()}</th>)}</tr></thead>
          <tbody>{SAMPLE_CATALOG.map((item,i)=><tr key={i} style={{borderBottom:"1px solid var(--border-light)",transition:"background 0.15s",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="var(--hover-bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <td style={{padding:"12px 16px"}}><div style={{display:"flex",alignItems:"center",gap:10}}><img src={item.image} alt="" style={{width:36,height:36,borderRadius:6,objectFit:"cover"}}/><span style={{fontSize:13,fontWeight:600}}>{item.name}</span></div></td>
            <td style={{padding:"12px 16px"}}><span className="mono" style={{fontSize:12,color:"var(--text-muted)"}}>{item.upc}</span></td>
            <td style={{padding:"12px 16px"}}><span style={{fontSize:12,color:"var(--text-muted)"}}>{item.category}</span></td>
            <td style={{padding:"12px 16px"}}><div style={{display:"flex",gap:2}}>{Array.from({length:item.sources},(_,j)=><div key={j} style={{width:6,height:6,borderRadius:"50%",background:"#3B82F6"}}/>)}</div></td>
            <td style={{padding:"12px 16px"}}><span className={`badge ${sc[item.status]}`}>{item.status}</span></td>
            <td style={{padding:"12px 16px"}}><span style={{fontSize:12,color:"var(--text-dim)"}}>{item.date}</span></td>
            <td style={{padding:"12px 16px"}}><div style={{display:"flex",gap:6}}>{["eye","edit","download"].map(ic=><button key={ic} className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11}}><Icon name={ic} size={12}/></button>)}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><h3 style={{fontSize:15,fontWeight:700}}>Brand Voice Profiles</h3><p style={{fontSize:12,color:"var(--text-dim)",marginTop:2}}>Saved tone & vocabulary presets for AI generation</p></div>
          <button className="btn btn-ghost" style={{fontSize:12}}><Icon name="plus" size={13}/> New Profile</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[{name:"Main Store",tone:"Professional",vocab:"B2B",color:"#3B82F6"},{name:"Consumer",tone:"Friendly",vocab:"Casual",color:"#10B981"},{name:"Premium Line",tone:"Luxury",vocab:"High-end",color:"#F59E0B"}].map((pr,i)=><div key={i} style={{padding:14,background:"var(--hover-bg)",borderRadius:8,border:"1px solid var(--border)",transition:"all 0.35s"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><div style={{width:8,height:8,borderRadius:"50%",background:pr.color}}/><span style={{fontWeight:700,fontSize:13}}>{pr.name}</span></div>
            <div style={{fontSize:11,color:"var(--text-dim)"}}> Tone: {pr.tone} • Style: {pr.vocab}</div>
          </div>)}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// ANALYTICS
// ============================================================
const Analytics = () => (
  <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",gap:20}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
      {[{l:"Avg Time per Product",v:"3.2 min",t:"-40%",i:"clock"},{l:"Success Rate",v:"94.7%",t:"+2.1%",i:"check"},{l:"AI Descriptions Used",v:"89%",t:"+5%",i:"sparkle"}].map((s,idx)=><div key={idx} className="card" style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><Icon name={s.i} size={18} color="#3B82F6"/><span style={{fontSize:11,color:"#10B981",fontWeight:700}}>{s.t}</span></div>
        <div className="mono" style={{fontSize:28,fontWeight:800}}>{s.v}</div>
        <div style={{fontSize:12,color:"var(--text-dim)"}}>{s.l}</div>
      </div>)}
    </div>
    <div className="card" style={{padding:24}}>
      <h3 style={{fontWeight:700,marginBottom:20}}>Data Source Performance</h3>
      {MOCK_PRODUCT.sources.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
        <div style={{width:100,fontSize:13,fontWeight:600}}>{s.name}</div>
        <div style={{flex:1}}><div className="progress-bar" style={{height:8}}><div className="progress-fill" style={{width:`${s.trustScore}%`,background:s.color}}/></div></div>
        <span className="mono" style={{width:44,textAlign:"right",fontSize:13,color:s.color}}>{s.trustScore}%</span>
      </div>)}
    </div>
  </div>
);

// ============================================================
// PASSWORD STRENGTH
// ============================================================
const getPasswordStrength = (pwd) => {
  if (!pwd) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { score, label: "Weak", color: "#EF4444" };
  if (score <= 2) return { score, label: "Fair", color: "#F59E0B" };
  if (score <= 3) return { score, label: "Good", color: "#3B82F6" };
  return { score, label: "Strong", color: "#10B981" };
};

const PasswordStrengthBar = ({ password }) => {
  const strength = getPasswordStrength(password);
  if (!password) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= strength.score ? strength.color : "var(--border)",
            transition: "background 0.3s"
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: strength.color, fontWeight: 600 }}>{strength.label} password</span>
    </div>
  );
};

// ============================================================
// AUTH PAGE (Sign In / Sign Up / Forgot Password)
// ============================================================
const AuthPage = ({ onLogin, dark }) => {
  const [mode, setMode] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Sign In
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [remember, setRemember] = useState(false);

  // Sign Up
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suRole, setSuRole] = useState("Editor");
  const [suStore, setSuStore] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Forgot
  const [forgotEmail, setForgotEmail] = useState("");

  const clear = () => { setError(""); setSuccess(""); };
  const switchMode = (m) => { clear(); setMode(m); };

  // ── SIGN IN ──
  const handleSignIn = async () => {
    clear();
    if (!siEmail.trim()) return setError("Please enter your email address.");
    if (!siPassword) return setError("Please enter your password.");
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));

    if (siEmail === "demo@catalogai.com" && siPassword === "demo1234") {
      setLoading(false);
      return onLogin({ email: "demo@catalogai.com", name: "Demo User", role: "Admin", store: "Demo Store" });
    }

    try {
      const res = await window.storage.get("catalogai:users");
      const users = res ? JSON.parse(res.value) : {};
      const key = siEmail.toLowerCase().trim();
      const user = users[key];
      if (!user) { setLoading(false); return setError("No account found with this email. Please sign up first."); }
      if (user.passwordHash !== btoa(siPassword)) { setLoading(false); return setError("Incorrect password. Please try again."); }
      setLoading(false);
      onLogin({ email: user.email, name: user.name, role: user.role, store: user.store });
    } catch {
      setLoading(false);
      onLogin({ email: siEmail, name: siEmail.split("@")[0], role: "Admin", store: "My Store" });
    }
  };

  // ── SIGN UP ──
  const handleSignUp = async () => {
    clear();
    if (!suName.trim()) return setError("Please enter your full name.");
    if (!suEmail.trim()) return setError("Please enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suEmail)) return setError("Please enter a valid email address.");
    if (!suPassword) return setError("Please choose a password.");
    if (suPassword.length < 8) return setError("Password must be at least 8 characters.");
    if (suPassword !== suConfirm) return setError("Passwords do not match.");
    if (!agreedTerms) return setError("Please agree to the Terms of Service.");
    setLoading(true);
    await new Promise(r => setTimeout(r, 1400));

    try {
      const res = await window.storage.get("catalogai:users");
      const users = res ? JSON.parse(res.value) : {};
      const key = suEmail.toLowerCase().trim();
      if (users[key]) { setLoading(false); return setError("An account with this email already exists."); }
      users[key] = {
        email: suEmail.toLowerCase().trim(), name: suName.trim(),
        passwordHash: btoa(suPassword), role: suRole,
        store: suStore.trim() || "My Store", createdAt: new Date().toISOString(),
      };
      await window.storage.set("catalogai:users", JSON.stringify(users));
      setLoading(false);
      onLogin({ email: users[key].email, name: users[key].name, role: users[key].role, store: users[key].store });
    } catch {
      setLoading(false);
      onLogin({ email: suEmail, name: suName, role: suRole, store: suStore || "My Store" });
    }
  };

  // ── FORGOT PASSWORD ──
  const handleForgot = async () => {
    clear();
    if (!forgotEmail.trim()) return setError("Please enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) return setError("Please enter a valid email.");
    setLoading(true);
    await new Promise(r => setTimeout(r, 1400));
    setLoading(false);
    setSuccess(`If an account exists for ${forgotEmail}, a reset link has been sent. Check your inbox.`);
  };

  // ── SHARED COMPONENTS ──
  const LoadingDots = () => (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "white", animation: "bounceDot 1.4s infinite ease-in-out", animationDelay: `${-0.32 + i * 0.16}s` }} />
      ))}
    </div>
  );

  const InputField = ({ label, type = "text", placeholder, value, onChange, onKeyDown, icon, rightEl, hint }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.02em" }}>{label}</label>
      <div style={{ position: "relative" }}>
        {icon && <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}><Icon name={icon} size={15} /></div>}
        <input
          className="input"
          type={type} placeholder={placeholder} value={value}
          onChange={onChange} onKeyDown={onKeyDown}
          style={{ paddingLeft: icon ? 38 : 14, paddingRight: rightEl ? 44 : 14 }}
        />
        {rightEl && <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}>{rightEl}</div>}
      </div>
      {hint && <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{hint}</p>}
    </div>
  );

  const ErrorBanner = () => error ? (
    <div className="animate-fadeIn" style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#FCA5A5", display: "flex", gap: 8, alignItems: "flex-start" }}>
      <Icon name="warning" size={14} color="#EF4444" />{error}
    </div>
  ) : null;

  return (
    <div className="hero-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      {/* Dot grid background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "radial-gradient(rgba(37,99,235,0.06) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      <div style={{ width: "100%", maxWidth: 460, position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #2563EB, #10B981)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px rgba(37, 99, 235, 0.4)" }}>
              <Icon name="cpu" size={24} color="white" />
            </div>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>CatalogAI</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>AI-Powered Product Data Intelligence</p>
        </div>

        {/* ═══════════ SIGN IN ═══════════ */}
        {mode === "signin" && (
          <div className="card animate-fadeIn" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Welcome back</h2>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Sign in to your merchant account</p>
            </div>

            <ErrorBanner />

            <InputField label="Email address" type="email" placeholder="you@example.com" icon="mail"
              value={siEmail} onChange={e => { setSiEmail(e.target.value); clear(); }}
              onKeyDown={e => e.key === "Enter" && handleSignIn()} />

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Password</label>
                <button onClick={() => switchMode("forgot")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#3B82F6", fontFamily: "'Sora',sans-serif", fontWeight: 600 }}>Forgot password?</button>
              </div>
              <div style={{ position: "relative" }}>
                <input className="input" type={showPassword ? "text" : "password"} placeholder="Enter your password"
                  value={siPassword} onChange={e => { setSiPassword(e.target.value); clear(); }}
                  onKeyDown={e => e.key === "Enter" && handleSignIn()} style={{ paddingRight: 44 }} />
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}
                  onClick={() => setShowPassword(p => !p)}>
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </div>
              </div>
            </div>

            {/* Remember me */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div onClick={() => setRemember(r => !r)} style={{
                width: 16, height: 16, borderRadius: 4, cursor: "pointer", flexShrink: 0,
                background: remember ? "#2563EB" : "transparent",
                border: `2px solid ${remember ? "#2563EB" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s"
              }}>{remember && <Icon name="check" size={10} color="white" />}</div>
              <span style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }} onClick={() => setRemember(r => !r)}>Remember me for 30 days</span>
            </div>

            <button className="btn btn-primary" style={{ justifyContent: "center", padding: "13px 0", fontSize: 14, width: "100%" }}
              onClick={handleSignIn} disabled={loading}>
              {loading ? <LoadingDots /> : <><Icon name="zap" size={15} /> Sign In</>}
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {/* Social placeholder */}
            <button className="btn btn-ghost" style={{ justifyContent: "center", width: "100%", padding: "11px 0", fontSize: 13 }}>
              <svg width={16} height={16} viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>

            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>
              Don't have an account?{" "}
              <button onClick={() => switchMode("signup")} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 13 }}>Sign up</button>
            </p>
          </div>
        )}

        {/* ═══════════ SIGN UP ═══════════ */}
        {mode === "signup" && (
          <div className="card animate-fadeIn" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Create your account</h2>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Start cataloging smarter in minutes</p>
            </div>

            <ErrorBanner />

            {/* Name + Store side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <InputField label="Full name" placeholder="Jane Smith" icon="user"
                value={suName} onChange={e => { setSuName(e.target.value); clear(); }} />
              <InputField label="Store name" placeholder="My Store" icon="store"
                value={suStore} onChange={e => { setSuStore(e.target.value); clear(); }} />
            </div>

            <InputField label="Email address" type="email" placeholder="you@example.com" icon="mail"
              value={suEmail} onChange={e => { setSuEmail(e.target.value); clear(); }} />

            {/* Role selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Account role</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { role: "Admin", desc: "Full access", color: "#3B82F6" },
                  { role: "Editor", desc: "Create & edit", color: "#10B981" },
                  { role: "Viewer", desc: "View only", color: "#94A3B8" },
                ].map(r => (
                  <div key={r.role} onClick={() => setSuRole(r.role)} style={{
                    flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                    border: `2px solid ${suRole === r.role ? r.color : "var(--border)"}`,
                    background: suRole === r.role ? r.color + "12" : "transparent",
                    transition: "all 0.2s"
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: suRole === r.role ? r.color : "var(--text-dim)" }}>{r.role}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Password</label>
              <div style={{ position: "relative" }}>
                <input className="input" type={showPassword ? "text" : "password"} placeholder="Min. 8 characters"
                  value={suPassword} onChange={e => { setSuPassword(e.target.value); clear(); }} style={{ paddingRight: 44 }} />
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}
                  onClick={() => setShowPassword(p => !p)}>
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </div>
              </div>
              <PasswordStrengthBar password={suPassword} />
            </div>

            {/* Confirm */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Confirm password</label>
              <div style={{ position: "relative" }}>
                <input className="input" type={showConfirmPassword ? "text" : "password"} placeholder="Re-enter password"
                  value={suConfirm} onChange={e => { setSuConfirm(e.target.value); clear(); }}
                  onKeyDown={e => e.key === "Enter" && handleSignUp()}
                  style={{
                    paddingRight: 44,
                    borderColor: suConfirm && suPassword !== suConfirm ? "#EF4444" : suConfirm && suPassword === suConfirm ? "#10B981" : undefined
                  }} />
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}
                  onClick={() => setShowConfirmPassword(p => !p)}>
                  <Icon name={showConfirmPassword ? "eyeOff" : "eye"} size={16} />
                </div>
              </div>
              {suConfirm && suPassword !== suConfirm && <p style={{ fontSize: 11, color: "#EF4444" }}>Passwords don't match</p>}
              {suConfirm && suPassword === suConfirm && <p style={{ fontSize: 11, color: "#10B981", display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={11} color="#10B981" /> Passwords match</p>}
            </div>

            {/* Terms */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div onClick={() => setAgreedTerms(v => !v)} style={{
                width: 18, height: 18, borderRadius: 4, cursor: "pointer", flexShrink: 0, marginTop: 1,
                background: agreedTerms ? "#2563EB" : "transparent",
                border: `2px solid ${agreedTerms ? "#2563EB" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s"
              }}>{agreedTerms && <Icon name="check" size={11} color="white" />}</div>
              <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, cursor: "pointer" }} onClick={() => setAgreedTerms(v => !v)}>
                I agree to the <span style={{ color: "#3B82F6", fontWeight: 600 }}>Terms of Service</span> and <span style={{ color: "#3B82F6", fontWeight: 600 }}>Privacy Policy</span>
              </span>
            </div>

            <button className="btn btn-success" style={{ justifyContent: "center", padding: "13px 0", fontSize: 14, width: "100%" }}
              onClick={handleSignUp} disabled={loading}>
              {loading ? <LoadingDots /> : <><Icon name="sparkle" size={15} /> Create Account</>}
            </button>

            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>
              Already have an account?{" "}
              <button onClick={() => switchMode("signin")} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 13 }}>Sign in</button>
            </p>
          </div>
        )}

        {/* ═══════════ FORGOT PASSWORD ═══════════ */}
        {mode === "forgot" && (
          <div className="card animate-fadeIn" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <button onClick={() => switchMode("signin")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontFamily: "'Sora',sans-serif", fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: 0 }}>
                <Icon name="arrowLeft" size={14} /> Back to sign in
              </button>
              <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Reset your password</h2>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Enter your email and we'll send a reset link</p>
            </div>

            <ErrorBanner />

            {success ? (
              <div style={{ padding: 20, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, textAlign: "center" }}>
                <div style={{ marginBottom: 10 }}><Icon name="mail" size={36} color="#10B981" /></div>
                <p style={{ fontSize: 13, color: "#34D399", fontWeight: 600, marginBottom: 4 }}>Check your inbox!</p>
                <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>{success}</p>
                <button onClick={() => switchMode("signin")} className="btn btn-ghost" style={{ marginTop: 14, width: "100%", justifyContent: "center", fontSize: 13 }}>Return to sign in</button>
              </div>
            ) : (
              <>
                <InputField label="Email address" type="email" placeholder="you@example.com" icon="mail"
                  value={forgotEmail} onChange={e => { setForgotEmail(e.target.value); clear(); }}
                  onKeyDown={e => e.key === "Enter" && handleForgot()} />
                <button className="btn btn-primary" style={{ justifyContent: "center", padding: "13px 0", fontSize: 14, width: "100%" }}
                  onClick={handleForgot} disabled={loading}>
                  {loading ? <LoadingDots /> : "Send Reset Link"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Feature pills */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { icon: "shield", text: "256-bit encryption", color: "#3B82F6" },
            { icon: "zap", text: "5 data sources", color: "#F59E0B" },
            { icon: "sparkle", text: "AI-powered", color: "#10B981" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", background: "rgba(30,41,59,0.6)", border: "1px solid rgba(71,85,105,0.3)", borderRadius: 20 }}>
              <Icon name={f.icon} size={11} color={f.color} />
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Demo hint */}
        <div style={{ textAlign: "center", padding: "10px 16px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8 }}>
          <p style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Demo: <span className="mono" style={{ color: "#F59E0B" }}>demo@catalogai.com</span>{" / "}
            <span className="mono" style={{ color: "#F59E0B" }}>demo1234</span>
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [dark, setDark] = useState(true);
  const [view, setView] = useState("dashboard");
  const [step, setStep] = useState(0);

  const handleLogout = () => setUser(null);

  const navItems = [
    { id: "dashboard", icon: "grid", label: "Dashboard" },
    { id: "catalog", icon: "package", label: "New Catalog" },
    { id: "analytics", icon: "chart", label: "Analytics" },
    { id: "voices", icon: "tag", label: "Brand Voices" },
    { id: "settings", icon: "settings", label: "Settings" },
  ];

  // ── UNAUTHENTICATED ──
  if (!user) return (
    <>
      <GlobalStyles dark={dark} />
      <AuthPage onLogin={setUser} dark={dark} />
    </>
  );

  // ── AUTHENTICATED ──
  return (
    <>
      <GlobalStyles dark={dark} />
      <div className="animate-theme" key={dark ? "dark" : "light"} style={{ display: "flex", minHeight: "100vh", background: "var(--bg)", transition: "background 0.35s" }}>
        {/* Sidebar */}
        <div style={{ width: 200, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border-light)", padding: "20px 12px", display: "flex", flexDirection: "column", flexShrink: 0, transition: "background 0.35s, border-color 0.35s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px", marginBottom: 28 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#2563EB,#10B981)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="cpu" size={15} color="white" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>CatalogAI</span>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            {navItems.map(item => (
              <div key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => { setView(item.id); if (item.id === "catalog") setStep(0); }}>
                <Icon name={item.icon} size={15} /> {item.label}
              </div>
            ))}
          </nav>

          {/* Theme Toggle */}
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border-light)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>{dark ? "Dark" : "Light"}</span>
            <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
          </div>

          {/* User info */}
          <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "linear-gradient(135deg,#2563EB,#8B5CF6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0
              }}>
                {(user.name || user.email || "U")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name || user.email.split("@")[0]}
                </div>
                <div style={{ fontSize: 10, color: "#3B82F6" }}>{user.role}</div>
              </div>
            </div>
            <div className="nav-item" onClick={handleLogout}>
              <Icon name="logout" size={14} /> Sign Out
            </div>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ background: "var(--glass)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--border-light)", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, transition: "background 0.35s" }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>
                {view === "dashboard" ? "Merchant Dashboard" : view === "catalog" ? "New Catalog Entry" : view === "analytics" ? "Analytics" : view === "voices" ? "Brand Voice Profiles" : "Settings"}
              </h2>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 1 }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} className="animate-pulse" />
                <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>5 sources active</span>
              </div>
              <span className="badge badge-primary">{user.role}</span>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
            {view === "dashboard" && <Dashboard onNew={() => { setStep(0); setView("catalog"); }} />}
            {view === "catalog" && (
              <div>
                <StepIndicator currentStep={step} />
                {step === 0 && <SearchStep onSearch={() => setStep(1)} />}
                {step === 1 && <ReviewStep onExport={() => setStep(2)} />}
                {step === 2 && <ExportStep onComplete={() => { setStep(0); setView("dashboard"); }} />}
              </div>
            )}
            {view === "analytics" && <Analytics />}
            {(view === "voices" || view === "settings") && (
              <div className="animate-fadeIn card" style={{ maxWidth: 500 }}>
                <div style={{ textAlign: "center", padding: 40 }}>
                  <Icon name={view === "voices" ? "tag" : "settings"} size={40} color="var(--text-dim)" />
                  <h3 style={{ marginTop: 16, fontWeight: 700 }}>{view === "voices" ? "Brand Voice Manager" : "Settings"}</h3>
                  <p style={{ color: "var(--text-dim)", marginTop: 8, fontSize: 14 }}>This section is fully functional in the production build.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
