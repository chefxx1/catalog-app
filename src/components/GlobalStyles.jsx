import React from "react";

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
      --bg: #09090B; --bg-sidebar: #09090B; --surface: #131316; --surface-light: #1C1C21;
      --border: rgba(255,255,255,0.08); --border-light: rgba(255,255,255,0.05);
      --text: #F5F5F5; --text-sec: #D4D4D4; --text-muted: #A3A3A3; --text-dim: #737373;
      --input-bg: #0C0C0E; --hover-bg: rgba(255,255,255,0.04);
      --glass: rgba(9,9,11,0.85); --card-shadow: none;
      ` : `
      --bg: #F5F5F4; --bg-sidebar: #FFFFFF; --surface: #FFFFFF; --surface-light: #F5F5F4;
      --border: rgba(0,0,0,0.12); --border-light: rgba(0,0,0,0.06);
      --text: #171717; --text-sec: #262626; --text-muted: #525252; --text-dim: #737373;
      --input-bg: #FFFFFF; --hover-bg: rgba(0,0,0,0.03);
      --glass: rgba(255,255,255,0.95); --card-shadow: 0 1px 3px rgba(0,0,0,0.08);
      `}
    }
    body, #root { font-family: 'Sora', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; transition: background 0.35s ease, color 0.35s ease; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; transition: background 0.2s; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }
    .mono { font-family: 'DM Mono', monospace; }

    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes slideIn { from { opacity:0; transform:translateX(-16px); } to { opacity:1; transform:translateX(0); } }
    @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    @keyframes spin { to { transform:rotate(360deg); } }
    @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
    @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
    @keyframes glow { 0%,100% { box-shadow:0 0 20px rgba(37,99,235,0.3); } 50% { box-shadow:0 0 40px rgba(37,99,235,0.6); } }
    @keyframes bounceDot { 0%,80%,100% { transform:scale(0); } 40% { transform:scale(1); } }
    @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
    @keyframes themeSwitch { 0% { opacity:0.5; filter:blur(2px); } 100% { opacity:1; filter:blur(0); } }

    .animate-fadeIn { animation: fadeIn 0.2s ease-out both; }
    .animate-slideIn { animation: slideIn 0.3s ease-out both; }
    .animate-slideUp { animation: slideUp 0.4s ease-out both; }
    .animate-pulse { animation: pulse 2s infinite; }
    .animate-spin { animation: spin 1s linear infinite; }
    .spinner-gradient { width: 32px; height: 32px; border-radius: 50%; position: relative; }
    .spinner-gradient::before { content: ''; position: absolute; inset: 0; border-radius: 50%; padding: 2.5px; background: conic-gradient(from 0deg, transparent, #3B82F6, #8B5CF6, #10B981, transparent); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: spin 1s linear infinite; }
    .spinner-gradient.sm { width: 18px; height: 18px; }
    .spinner-gradient.sm::before { padding: 2px; }
    .spinner-gradient.lg { width: 48px; height: 48px; }
    .spinner-gradient.lg::before { padding: 3px; }
    .animate-float { animation: float 3s ease-in-out infinite; }
    .animate-glow { animation: glow 2s ease-in-out infinite; }
    .animate-scaleIn { animation: scaleIn 0.35s ease-out both; }
    .animate-theme { animation: themeSwitch 0.4s ease-out; }
    tr:hover .row-check { opacity:1 !important; }
    .catalog-row { transition:background 0.15s; }
    .catalog-row > td:first-child { box-shadow:inset 3px 0 0 transparent; transition:box-shadow 0.2s; }
    .catalog-row:hover > td:first-child,
    .catalog-row.selected > td:first-child { box-shadow:inset 3px 0 0 #8B5CF6; }

    .skeleton { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-light) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; display:block; }
    .skeleton-text { height:14px; margin-bottom:6px; }
    .skeleton-heading { height:28px; width:60%; margin-bottom:8px; }
    .skeleton-circle { border-radius:50%; }
    .skeleton-card { height:80px; border-radius:12px; }

    .copy-btn { opacity:0; transition:opacity 0.15s; cursor:pointer; padding:2px; border:none; background:none; }
    .copy-btn:hover { color:#3B82F6; }
    *:hover > .copy-btn, .copy-btn:focus { opacity:1; }

    @media (max-width: 768px) {
      .sidebar { display:none !important; }
      .sidebar.open { display:flex !important; position:fixed; z-index:9999; inset:0; width:240px; }
      .sidebar-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9998; }
      .sidebar-overlay.open { display:block; }
      .mobile-menu-btn { display:flex !important; }
      .main-content { padding:16px !important; }
      .stat-grid { grid-template-columns:repeat(2,1fr) !important; }
      .analytics-grid { grid-template-columns:1fr !important; }
    }
    @media (min-width: 769px) {
      .mobile-menu-btn { display:none !important; }
    }

    .btn { display:inline-flex; align-items:center; gap:8px; padding:8px 18px; border-radius:8px; font-family:'Sora',sans-serif; font-weight:600; font-size:13px; cursor:pointer; border:none; transition:all 0.2s; white-space:nowrap; }
    .btn:hover { transform:translateY(-1px); } .btn:active { transform:translateY(0); }
    .btn-primary { background:linear-gradient(135deg,#2563EB,#7C3AED); color:white; } .btn-primary:hover { box-shadow:0 0 24px rgba(37,99,235,0.4),0 0 48px rgba(124,58,237,0.15); }
    .btn-success { background:linear-gradient(135deg,#7C3AED,#10B981); color:white; } .btn-success:hover { box-shadow:0 0 24px rgba(16,185,129,0.4),0 0 48px rgba(124,58,237,0.15); }
    .btn-ghost { background:transparent; color:var(--text-muted); border:1px solid var(--border); } .btn-ghost:hover { background:var(--surface); color:var(--text); }

    .card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:20px; box-shadow:var(--card-shadow); transition:background 0.35s, border-color 0.35s; }

    .badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; letter-spacing:0.02em; }
    .badge-success { background:rgba(16,185,129,0.15); color:var(--success-light); }
    .badge-warning { background:rgba(245,158,11,0.15); color:var(--warning-light); }
    .badge-primary { background:rgba(37,99,235,0.15); color:#60A5FA; }
    .badge-neutral { background:rgba(100,116,139,0.2); color:var(--text-muted); }
    .badge-ai { background:rgba(16,185,129,0.1); color:var(--success-light); border:1px solid rgba(16,185,129,0.3); }

    .input { background:var(--input-bg); border:1px solid var(--border); border-radius:8px; color:var(--text); font-family:'Sora',sans-serif; font-size:14px; padding:10px 14px; outline:none; transition:all 0.2s ease; width:100%; }
    .input:focus { border-color:#7C3AED; box-shadow:0 0 0 3px rgba(124,58,237,0.12); }
    .input:hover:not(:focus) { border-color:var(--text-dim); }
    .input::placeholder { color:var(--text-dim); }
    textarea.input { resize:vertical; min-height:80px; }
    select.input { appearance:none; background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:36px; }
    select.input option { background:var(--surface); }
    .input[type="number"]::-webkit-inner-spin-button, .input[type="number"]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
    .input[type="number"] { -moz-appearance:textfield; }
    .stepper-btn { width:22px; height:22px; border-radius:6px; border:1px solid var(--border); background:var(--surface); color:var(--text-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; padding:0; transition:all 0.15s; }
    .stepper-btn:hover { border-color:var(--primary); color:var(--primary); background:rgba(124,58,237,0.08); }
    @keyframes cursorBlink { 0%, 49% { opacity:1; } 50%, 100% { opacity:0; } }
    .cursor-blink { animation: cursorBlink 0.9s step-end infinite; }
    @keyframes typingPulse { 0%, 100% { opacity:0.4; transform:scale(0.9); } 50% { opacity:1; transform:scale(1.1); } }
    .typing-pulse { animation: typingPulse 0.8s ease-in-out infinite; }

    /* Ask AI command bar — search-style trigger */
    .ask-ai-bar { display:inline-flex; align-items:center; gap:9px; padding:6px 8px 6px 13px; min-width:240px; border-radius:10px; border:1px solid var(--border); background: var(--hover-bg); cursor:pointer; font-family:'Sora',sans-serif; color:var(--text-dim); transition: all 0.18s ease; backdrop-filter: blur(8px); position:relative; overflow:hidden; }
    .ask-ai-bar::before { content:""; position:absolute; inset:0; background: linear-gradient(120deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08), rgba(16,185,129,0.08)); opacity:0; transition: opacity 0.2s; pointer-events:none; }
    .ask-ai-bar:hover { border-color: rgba(124,58,237,0.4); color: var(--text-muted); }
    .ask-ai-bar:hover::before { opacity:1; }
    .ask-ai-bar-text { flex:1; text-align:left; font-size:12px; font-weight:500; }
    .ask-ai-bar kbd { padding:2px 7px; border-radius:6px; font-size:10px; font-family: 'SF Mono','Menlo',monospace; background:var(--surface); color:var(--text-dim); border:1px solid var(--border-light); font-weight:600; letter-spacing:0.04em; }
    @media (max-width: 768px) { .ask-ai-bar { min-width:auto; padding:6px 10px; } .ask-ai-bar-text { display:none; } }

    /* Command Palette — modern AI-native redesign */
    @keyframes paletteFadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes paletteScaleIn { from { opacity:0; transform: translateY(8px) scale(0.97); } to { opacity:1; transform: translateY(0) scale(1); } }
    @keyframes dotBounce { 0%, 80%, 100% { transform: translateY(0); opacity:0.4; } 40% { transform: translateY(-5px); opacity:1; } }
    @keyframes statusPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); } 50% { box-shadow: 0 0 0 5px rgba(16,185,129,0); } }
    @keyframes orbFloat { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-6px) scale(1.05); } }
    @keyframes orbRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes exampleFade { 0%, 30% { opacity:0; transform: translateY(6px); } 8%, 22% { opacity:1; transform: translateY(0); } }
    @keyframes blobShift { 0%, 100% { transform: translate(0,0) scale(1); } 33% { transform: translate(20px,-15px) scale(1.1); } 66% { transform: translate(-15px,10px) scale(0.95); } }

    .palette-overlay { position:fixed; inset:0; z-index:10000; display:flex; align-items:flex-start; justify-content:center; padding-top:7vh; background:rgba(0,0,0,0.6); backdrop-filter:blur(12px); animation: paletteFadeIn 0.2s ease-out; }
    .palette-card { width:100%; max-width:720px; max-height:84vh; background: color-mix(in oklab, var(--card-bg) 90%, transparent); border:1px solid var(--border); border-radius:20px; overflow:hidden; display:flex; flex-direction:column; box-shadow: 0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 1px 0 rgba(255,255,255,0.08) inset; position:relative; animation: paletteScaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); backdrop-filter: blur(20px); }
    .palette-blobs { position:absolute; inset:0; pointer-events:none; overflow:hidden; opacity:0.45; }
    .palette-blobs::before, .palette-blobs::after { content:""; position:absolute; width:300px; height:300px; border-radius:50%; filter: blur(80px); }
    .palette-blobs::before { top:-100px; left:-50px; background: radial-gradient(circle, rgba(124,58,237,0.5), transparent 70%); animation: blobShift 14s ease-in-out infinite; }
    .palette-blobs::after { top:-50px; right:-80px; background: radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%); animation: blobShift 18s ease-in-out infinite reverse; }

    .palette-header { position:relative; padding:14px 20px; border-bottom:1px solid color-mix(in oklab, var(--border) 60%, transparent); display:flex; align-items:center; justify-content:space-between; z-index:1; }
    .palette-header-title { font-size:13px; font-weight:600; color:var(--text); display:flex; align-items:center; gap:8px; }
    .status-dot { width:6px; height:6px; border-radius:50%; background:#10B981; animation: statusPulse 2s ease-in-out infinite; }
    .palette-kbd { padding:3px 8px; border-radius:6px; font-size:10px; font-family:'SF Mono','Menlo',monospace; background: var(--hover-bg); border:1px solid var(--border-light); color:var(--text-dim); font-weight:600; letter-spacing:0.04em; }

    .palette-body { flex:1; overflow:auto; padding:18px 20px; display:flex; flex-direction:column; gap:14px; position:relative; scroll-behavior:smooth; z-index:1; }
    .palette-body::-webkit-scrollbar { width:6px; }
    .palette-body::-webkit-scrollbar-thumb { background: var(--border); border-radius:3px; }

    /* Hero empty state — animated orb + rotating examples */
    .palette-hero { display:flex; flex-direction:column; align-items:center; gap:16px; padding:30px 20px 22px; text-align:center; }
    .palette-orb { position:relative; width:72px; height:72px; }
    .palette-orb::before { content:""; position:absolute; inset:0; border-radius:50%; background: conic-gradient(from 0deg, #3B82F6, #8B5CF6, #10B981, #3B82F6); animation: orbRotate 8s linear infinite; filter: blur(2px); }
    .palette-orb::after { content:""; position:absolute; inset:6px; border-radius:50%; background: var(--card-bg); display:flex; align-items:center; justify-content:center; }
    .palette-orb-inner { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:2; animation: orbFloat 4s ease-in-out infinite; }
    .palette-hero-title { font-size:22px; font-weight:800; letter-spacing:-0.02em; background: linear-gradient(135deg, var(--text), var(--text-muted)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .palette-hero-subtitle { font-size:13px; color:var(--text-dim); line-height:1.5; max-width:380px; min-height:38px; display:flex; align-items:center; justify-content:center; }
    .palette-hero-subtitle span { display:inline-block; }
    .example-rotate { color:var(--text-muted); font-style:italic; }

    .palette-chips { display:flex; flex-wrap:wrap; gap:6px; padding:0 4px; justify-content:center; }
    .palette-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:999px; border:1px solid var(--border-light); background: color-mix(in oklab, var(--hover-bg) 60%, transparent); cursor:pointer; font-size:11.5px; font-weight:500; color:var(--text-muted); font-family:'Sora',sans-serif; transition: all 0.15s; backdrop-filter: blur(6px); }
    .palette-chip:hover { border-color: rgba(124,58,237,0.5); background: rgba(124,58,237,0.08); color: var(--text); }

    /* Chat messages — minimalist */
    .msg-row { display:flex; gap:10px; align-items:flex-start; }
    .msg-user { padding:9px 14px; background: var(--surface); border:1px solid var(--border-light); color:var(--text); border-radius:14px; border-bottom-right-radius:5px; font-size:13px; line-height:1.5; max-width:80%; }
    .msg-assistant { padding:9px 14px; background: transparent; font-size:13.5px; line-height:1.55; color:var(--text-muted); max-width:88%; }
    .msg-error { padding:9px 14px; background: rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); border-radius:12px; font-size:13px; color:#EF4444; max-width:80%; }
    .msg-success { padding:7px 14px; background: rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:999px; font-size:12.5px; color:#10B981; display:inline-flex; align-items:center; gap:8px; font-weight:600; }
    .msg-thinking { padding:10px 14px; display:inline-flex; align-items:center; gap:5px; }
    .dot-bounce { width:6px; height:6px; border-radius:50%; background:var(--text-dim); animation: dotBounce 1.2s ease-in-out infinite; display:inline-block; }

    .msg-card { background: color-mix(in oklab, var(--surface) 70%, transparent); border:1px solid var(--border-light); border-radius:14px; padding:13px; max-width:100%; flex:1; backdrop-filter: blur(8px); }
    .msg-card-summary { font-size:12.5px; color:var(--text); margin-bottom:11px; line-height:1.4; font-weight:500; }
    .msg-list { display:flex; flex-direction:column; gap:5px; max-height:300px; overflow:auto; padding-right:4px; }
    .msg-list::-webkit-scrollbar { width:4px; }
    .msg-list::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
    .msg-item { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:9px; background: color-mix(in oklab, var(--bg) 70%, transparent); border:1px solid transparent; transition: all 0.15s; }
    .msg-item:hover { border-color: var(--border-light); background: var(--hover-bg); }
    .msg-item img { width:32px; height:32px; border-radius:7px; object-fit:cover; flex-shrink:0; }
    .msg-item-thumb-fallback { width:32px; height:32px; border-radius:7px; background: var(--hover-bg); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .msg-empty { font-size:12px; color:var(--text-dim); font-style:italic; padding:14px 0; text-align:center; }
    .msg-card-footer { display:flex; justify-content:space-between; align-items:center; margin-top:11px; padding-top:11px; border-top:1px solid var(--border-light); }

    .pill-status { padding:1px 7px; border-radius:8px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; }
    .pill-draft { background:rgba(148,163,184,0.15); color:#94A3B8; }
    .pill-review { background:rgba(245,158,11,0.15); color:#F59E0B; }
    .pill-published { background:rgba(16,185,129,0.15); color:#10B981; }
    .pill-exported { background:rgba(124,58,237,0.15); color:#A78BFA; }

    .msg-action { background: color-mix(in oklab, rgba(245,158,11,0.07) 100%, var(--surface) 0%); border:1px solid rgba(245,158,11,0.25); border-radius:14px; padding:13px; max-width:100%; flex:1; }
    .action-badge { display:inline-block; padding:2px 8px; border-radius:6px; background: rgba(245,158,11,0.15); color:#F59E0B; font-size:9.5px; font-weight:800; letter-spacing:0.1em; }
    .action-preview-list { margin-top:9px; padding-top:9px; border-top:1px dashed rgba(245,158,11,0.2); display:flex; flex-direction:column; gap:5px; }
    .action-preview-item { display:flex; align-items:center; gap:8px; font-size:11.5px; color:var(--text-muted); padding:1px 0; }

    .palette-action-bar { padding:11px 18px; border-top:1px solid var(--border); background: rgba(245,158,11,0.04); display:flex; gap:8px; align-items:center; z-index:1; }

    .palette-input-row { padding:14px 18px; border-top:1px solid var(--border); position:relative; z-index:1; }
    .palette-input-wrap { position:relative; display:flex; align-items:center; gap:10px; padding:0 6px 0 14px; background: var(--surface); border:1.5px solid var(--border); border-radius:14px; transition: border-color 0.2s, box-shadow 0.2s, background 0.2s; }
    .palette-input-wrap:focus-within { border-color: rgba(124,58,237,0.55); box-shadow: 0 0 0 4px rgba(124,58,237,0.1); background: var(--card-bg); }
    .palette-input-wrap input { flex:1; border:none; background:transparent; color:var(--text); font-family:'Sora',sans-serif; font-size:14px; padding:11px 0; outline:none; }
    .palette-input-wrap input::placeholder { color:var(--text-dim); }
    .palette-send { width:34px; height:34px; border-radius:10px; border:none; background: linear-gradient(135deg,#3B82F6,#7C3AED); cursor:pointer; display:flex; align-items:center; justify-content:center; transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s; flex-shrink:0; box-shadow: 0 4px 14px rgba(124,58,237,0.35); }
    .palette-send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124,58,237,0.55); }
    .palette-send:disabled { opacity:0.25; cursor:not-allowed; box-shadow:none; }

    .palette-footer { padding:8px 18px 12px; display:flex; justify-content:center; align-items:center; gap:6px; font-size:10px; color:var(--text-dim); z-index:1; }
    .palette-footer kbd { padding:1px 5px; border-radius:4px; font-size:9px; font-family:'SF Mono','Menlo',monospace; background:var(--hover-bg); border:1px solid var(--border-light); color:var(--text-dim); }

    /* ============ MODERN PRIMITIVES (shared across app) ============ */

    /* BrandOrb — reusable spinning gem with subtle conic ring */
    .brand-orb-wrap { position:relative; display:inline-block; flex-shrink:0; }
    .brand-orb-ring { position:absolute; inset:0; border-radius:50%; background: conic-gradient(from 0deg, rgba(59,130,246,0.55), rgba(139,92,246,0.55), rgba(16,185,129,0.55), rgba(59,130,246,0.55)); filter: blur(3px); opacity:0.7; }
    .brand-orb-spinning .brand-orb-ring { animation: orbRotate 12s linear infinite; }
    .brand-orb-core { position:absolute; border-radius:50%; background: var(--card-bg); }
    .brand-orb-icon { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:2; opacity:0.9; }
    .brand-orb-floating { animation: orbFloat 5s ease-in-out infinite; }

    /* Modern modal (frosted glass + drift blobs + soft shadow) */
    .modal-modern-overlay { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; background: rgba(0,0,0,0.55); backdrop-filter: blur(10px); animation: paletteFadeIn 0.18s ease-out; }
    .modal-modern-card { position:relative; width:100%; max-width:480px; max-height:88vh; background: color-mix(in oklab, var(--card-bg) 92%, transparent); border:1px solid var(--border); border-radius:18px; padding:0; overflow:hidden; display:flex; flex-direction:column; box-shadow: 0 25px 70px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 1px 0 rgba(255,255,255,0.06) inset; backdrop-filter: blur(18px); animation: paletteScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
    .modal-modern-card.size-sm { max-width:380px; }
    .modal-modern-card.size-lg { max-width:620px; }
    .modal-modern-card.size-xl { max-width:780px; }
    .modal-modern-blobs { position:absolute; inset:0; pointer-events:none; overflow:hidden; opacity:0.4; }
    .modal-modern-blobs::before, .modal-modern-blobs::after { content:""; position:absolute; width:240px; height:240px; border-radius:50%; filter: blur(70px); }
    .modal-modern-blobs::before { top:-90px; left:-50px; background: radial-gradient(circle, rgba(124,58,237,0.45), transparent 70%); animation: blobShift 16s ease-in-out infinite; }
    .modal-modern-blobs::after { top:-40px; right:-70px; background: radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%); animation: blobShift 20s ease-in-out infinite reverse; }

    .modal-modern-header { position:relative; padding:16px 20px 14px; border-bottom:1px solid color-mix(in oklab, var(--border) 50%, transparent); display:flex; align-items:flex-start; justify-content:space-between; gap:12px; z-index:1; }
    .modal-modern-header h3 { font-size:15px; font-weight:700; letter-spacing:-0.01em; margin:0 0 2px; }
    .modal-modern-header p { font-size:12px; color:var(--text-dim); margin:0; line-height:1.4; }
    .modal-modern-close { width:28px; height:28px; border-radius:8px; background:transparent; border:1px solid transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text-dim); transition: all 0.15s; flex-shrink:0; }
    .modal-modern-close:hover { background: var(--hover-bg); border-color: var(--border-light); color: var(--text); }
    .modal-modern-body { position:relative; padding:18px 20px; overflow:auto; flex:1; z-index:1; }
    .modal-modern-footer { position:relative; padding:12px 20px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px; z-index:1; background: color-mix(in oklab, var(--bg) 30%, transparent); }

    /* Empty state — centered orb + title + subtitle */
    .empty-state-modern { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:48px 24px; text-align:center; }
    .empty-state-modern .es-title { font-size:17px; font-weight:700; letter-spacing:-0.01em; }
    .empty-state-modern .es-subtitle { font-size:13px; color:var(--text-dim); max-width:340px; line-height:1.55; margin-top:-6px; }
    .empty-state-modern .es-actions { display:flex; gap:8px; margin-top:8px; }

    /* Glass toasts — modern slide-in from top-right */
    @keyframes toastSlideIn { from { opacity:0; transform: translateX(20px) scale(0.96); } to { opacity:1; transform: translateX(0) scale(1); } }
    .toast-glass { display:flex; align-items:center; gap:11px; padding:11px 12px 11px 11px; background: color-mix(in oklab, var(--card-bg) 88%, transparent); backdrop-filter: blur(20px); border:1px solid var(--border); border-radius:12px; box-shadow: 0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 24px color-mix(in oklab, var(--toast-c, #3B82F6) 10%, transparent); animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); position:relative; overflow:hidden; }
    .toast-glass::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background: var(--toast-c, #3B82F6); border-radius:0 2px 2px 0; box-shadow: 0 0 12px var(--toast-c, #3B82F6); }
    .toast-glass-icon { width:26px; height:26px; border-radius:8px; background: color-mix(in oklab, var(--toast-c, #3B82F6) 15%, transparent); border:1px solid color-mix(in oklab, var(--toast-c, #3B82F6) 30%, transparent); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .toast-glass-close { width:22px; height:22px; border-radius:6px; border:none; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0.5; transition: all 0.15s; flex-shrink:0; }
    .toast-glass-close:hover { opacity:1; background: var(--hover-bg); }

    /* Catalog row hover — gradient border accent */
    .catalog-row { position:relative; transition: background 0.18s; }
    .catalog-row::after { content:""; position:absolute; left:0; top:0; bottom:0; width:2px; background: linear-gradient(180deg, #3B82F6, #8B5CF6, #10B981); opacity:0; transition: opacity 0.2s; }
    .catalog-row:hover::after { opacity:0.7; }
    .catalog-row.selected::after { opacity:1; }

    /* Step indicator polish — active glow */
    .step-pill-active { box-shadow: 0 0 0 3px rgba(124,58,237,0.15), 0 4px 16px rgba(124,58,237,0.25); }

    /* Welcome row orb spacing helper */
    .welcome-row { display:flex; align-items:center; gap:14px; }

    /* Export step modernization */
    @keyframes pulseGlow { 0%, 100% { opacity:0.6; transform:scale(1); } 50% { opacity:1; transform:scale(1.1); } }
    .export-section-label { font-size:10.5px; font-weight:700; color:var(--text-dim); letter-spacing:0.1em; margin-bottom:10px; text-transform:uppercase; }

    .fmt-pill { flex:1; padding:13px 8px; border-radius:11px; border:1.5px solid var(--border); background: color-mix(in oklab, var(--surface) 50%, transparent); color:var(--text-muted); cursor:pointer; transition: all 0.2s ease; display:flex; flex-direction:column; align-items:center; gap:5px; font-family:'Sora',sans-serif; backdrop-filter: blur(6px); }
    .fmt-pill:hover { border-color: rgba(124,58,237,0.4); transform: translateY(-1px); }
    .fmt-pill.active { border:none; background: linear-gradient(135deg, #3B82F6, #7C3AED); color:white; box-shadow: 0 4px 18px rgba(124,58,237,0.35); transform: translateY(-1px); }
    .fmt-pill .mono { font-size:13px; font-weight:800; letter-spacing:0.04em; }

    .platform-tile { position:relative; padding:0; border-radius:12px; border:1.5px solid var(--border); background: color-mix(in oklab, var(--surface) 60%, transparent); cursor:pointer; transition: all 0.2s ease; overflow:hidden; backdrop-filter: blur(8px); }
    .platform-tile:hover { border-color: color-mix(in oklab, var(--plat-c, #8B5CF6) 50%, var(--border)); transform: translateY(-2px); box-shadow: 0 8px 24px color-mix(in oklab, var(--plat-c, #8B5CF6) 18%, transparent); }
    .platform-tile.selected { border-color: var(--plat-c, #8B5CF6); background: color-mix(in oklab, var(--plat-c, #8B5CF6) 8%, var(--surface)); box-shadow: 0 0 0 3px color-mix(in oklab, var(--plat-c, #8B5CF6) 18%, transparent), 0 8px 24px color-mix(in oklab, var(--plat-c, #8B5CF6) 22%, transparent); }
    .platform-tile-bar { position:absolute; left:0; top:0; bottom:0; width:3px; background: var(--plat-c, #8B5CF6); opacity:0.7; }
    .platform-tile.selected .platform-tile-bar { opacity:1; box-shadow: 0 0 12px var(--plat-c, #8B5CF6); }
    .platform-tile-content { padding:14px 14px 14px 16px; position:relative; }
    .platform-tile-row { display:flex; align-items:center; gap:11px; }
    .platform-tile-badge { width:32px; height:32px; border-radius:9px; background: linear-gradient(135deg, var(--plat-c, #8B5CF6), color-mix(in oklab, var(--plat-c, #8B5CF6) 70%, #000)); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; flex-shrink:0; box-shadow: 0 2px 8px color-mix(in oklab, var(--plat-c, #8B5CF6) 40%, transparent); }
    .platform-tile-check { position:absolute; top:8px; right:8px; width:18px; height:18px; border-radius:50%; background: var(--plat-c, #8B5CF6); display:flex; align-items:center; justify-content:center; box-shadow: 0 2px 8px color-mix(in oklab, var(--plat-c, #8B5CF6) 50%, transparent); }

    .export-preview { background: color-mix(in oklab, var(--card-bg) 70%, transparent); border:1px solid var(--border-light); border-radius:12px; overflow:hidden; backdrop-filter: blur(12px); }
    .export-preview-header { padding:10px 14px; border-bottom:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center; background: linear-gradient(90deg, transparent, rgba(124,58,237,0.04), transparent); }
    .export-preview-pre { font-size:11px; color:var(--text-muted); white-space:pre-wrap; word-break:break-all; line-height:1.55; margin:0; padding:14px; max-height:260px; overflow:auto; }
    .export-preview-pre::-webkit-scrollbar { width:6px; }
    .export-preview-pre::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }

    .export-history-item { display:flex; align-items:center; gap:10px; padding:10px 12px; background: color-mix(in oklab, var(--surface) 60%, transparent); border-radius:9px; border:1px solid transparent; transition: all 0.15s; }
    .export-history-item:hover { border-color: var(--border-light); background: var(--hover-bg); }

    /* Visual platform previews — standalone mockup cards */
    .vp-shop-card { width:280px; background:#fff; border:1px solid #E5E7EB; border-radius:8px; overflow:hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .vp-shop-img { aspect-ratio: 1/1; background:#F9FAFB; overflow:hidden; }
    .vp-shop-img img { width:100%; height:100%; object-fit:cover; }
    .vp-shop-img-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
    .vp-shop-body { padding:16px; }
    .vp-shop-btn { width:100%; padding:11px; border:none; border-radius:6px; background:#000; color:#fff; font-weight:700; font-size:13px; cursor:default; }

    .vp-google-card { width:200px; background:#fff; border:1px solid #DADCE0; border-radius:8px; overflow:hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .vp-google-img { aspect-ratio: 1/1; background:#F8F9FA; }
    .vp-google-img img { width:100%; height:100%; object-fit:contain; padding:8px; }
    .vp-google-img-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }

    .vp-woo-card { width:240px; background:#fff; border:1px solid #E5E7EB; border-radius:4px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .vp-woo-img { aspect-ratio: 1/1; background:#F9FAFB; position:relative; }
    .vp-woo-img img { width:100%; height:100%; object-fit:cover; }
    .vp-woo-img-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
    .vp-woo-sale-tag { position:absolute; top:10px; left:10px; padding:3px 9px; background:#7F54B3; color:#fff; font-size:11px; font-weight:700; border-radius:50%; }
    .vp-woo-btn { width:100%; padding:9px; border:1px solid #7F54B3; border-radius:3px; background:transparent; color:#7F54B3; font-weight:700; font-size:12px; cursor:default; transition: all 0.15s; }

    .vp-generic-card { width:240px; background:#fff; border:1px solid #E5E7EB; border-radius:10px; overflow:hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .vp-generic-img { aspect-ratio: 4/3; background:#F9FAFB; border-bottom:1px solid #F3F4F6; }
    .vp-generic-img img { width:100%; height:100%; object-fit:cover; }
    .vp-generic-img-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
    .vp-generic-btn { width:100%; padding:10px; border:none; border-radius:6px; background: var(--accent, #3B82F6); color:#fff; font-weight:700; font-size:12.5px; cursor:default; }

    .vp-pdf-card { padding:8px; background: linear-gradient(135deg, #94A3B8, #64748B); border-radius:6px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
    .vp-pdf-page { width:280px; background:#fff; border-radius:2px; overflow:hidden; box-shadow: 0 1px 0 rgba(0,0,0,0.1); position:relative; }
    .vp-pdf-strip { display:flex; height:3px; }
    .vp-pdf-strip-block:nth-child(1) { flex:1; background:#3B82F6; }
    .vp-pdf-strip-block:nth-child(2) { flex:1; background:#7C3AED; }
    .vp-pdf-strip-block:nth-child(3) { flex:1; background:#10B981; }
    .vp-pdf-img { width:64px; height:64px; border-radius:4px; background:#F3F4F6; overflow:hidden; flex-shrink:0; }
    .vp-pdf-img img { width:100%; height:100%; object-fit:cover; }
    .vp-pdf-img-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }

    /* Preview tab strip */
    .preview-tabs { display:flex; gap:4px; padding:4px; background: var(--hover-bg); border-radius:8px; border:1px solid var(--border-light); }
    .preview-tab { padding:5px 12px; border-radius:6px; border:none; background:transparent; color:var(--text-dim); font-size:11.5px; font-weight:600; cursor:pointer; font-family:'Sora',sans-serif; transition: all 0.15s; display:flex; align-items:center; gap:5px; }
    .preview-tab.active { background: var(--card-bg); color:var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .preview-tab:hover:not(.active) { color:var(--text-muted); }

    /* History search + filter */
    .history-search-wrap { display:flex; gap:8px; align-items:center; margin-top:10px; margin-bottom:10px; }
    .history-search-input { flex:1; display:flex; align-items:center; gap:8px; padding:6px 12px; background: var(--hover-bg); border:1px solid var(--border-light); border-radius:8px; transition: all 0.15s; }
    .history-search-input:focus-within { border-color: rgba(124,58,237,0.4); }
    .history-search-input input { flex:1; border:none; background:transparent; color:var(--text); font-family:'Sora',sans-serif; font-size:12px; outline:none; padding:3px 0; }
    .history-search-input input::placeholder { color:var(--text-dim); }
    .history-filter-chips { display:flex; gap:5px; flex-wrap:wrap; }
    .history-filter-chip { padding:4px 10px; border-radius:999px; border:1px solid var(--border-light); background: transparent; cursor:pointer; font-size:10.5px; font-weight:600; color:var(--text-dim); font-family:'Sora',sans-serif; transition: all 0.15s; }
    .history-filter-chip:hover { color:var(--text-muted); }
    .history-filter-chip.active { background: rgba(124,58,237,0.12); border-color: rgba(124,58,237,0.5); color: var(--primary-light, #A78BFA); }

    .progress-bar { height:4px; background:var(--surface-light); border-radius:2px; overflow:hidden; }
    .progress-fill { height:100%; border-radius:2px; transition:width 0.5s ease; }

    .section-label { font-size:11px; font-weight:600; color:var(--text-dim); letter-spacing:0.06em; text-transform:uppercase; }
    h3 { font-size:15px; font-weight:700; color:var(--text); }

    .nav-item { display:flex; align-items:center; gap:11px; padding:9px 14px; border-radius:8px; cursor:pointer; transition:all 0.15s; color:var(--text-muted); font-size:13px; font-weight:500; position:relative; }
    .nav-item:hover { background:var(--surface); color:var(--text); }
    .nav-item.active { background:rgba(37,99,235,0.1); color:var(--primary-light); font-weight:600; }
    .nav-item.active::before { content:''; position:absolute; left:0; top:6px; bottom:6px; width:3px; border-radius:0 3px 3px 0; background:linear-gradient(180deg,#3B82F6,#8B5CF6,#10B981); transition:all 0.2s; }
    .nav-label { font-size:10px; font-weight:700; letter-spacing:0.08em; color:var(--text-dim); padding:16px 14px 6px; text-transform:uppercase; }

    .export-card { background:var(--surface); border:1.5px solid var(--border); border-radius:10px; padding:16px; cursor:pointer; transition:all 0.2s ease; position:relative; }
    .export-card:hover { border-color:#8B5CF6; box-shadow:0 4px 16px rgba(124,58,237,0.12); }
    .export-card.selected { border-color:#8B5CF6; background:rgba(124,58,237,0.06); box-shadow:0 0 0 3px rgba(124,58,237,0.1); }

    .drop-zone { border:2px dashed var(--border); border-radius:12px; padding:32px; text-align:center; cursor:pointer; transition:all 0.25s ease; background:transparent; }
    .drop-zone:hover { border-color:var(--primary); background:rgba(37,99,235,0.04); }
    .drop-zone.dragging { border-color:var(--primary); background:rgba(37,99,235,0.08); border-style:solid; box-shadow:0 0 0 4px rgba(37,99,235,0.1); }

    .highlight-warning { background:rgba(245,158,11,0.08); border-left:3px solid var(--warning); }
    .description-card { border:1px solid var(--border); border-radius:10px; padding:14px; transition:all 0.2s; cursor:pointer; }
    .description-card:hover { border-color:var(--primary-light); }
    .description-card.selected { border-color:var(--success); background:rgba(16,185,129,0.05); }

    .split-panel { overflow-y:auto; max-height:calc(100vh - 280px); }
    .hero-bg { background: radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.06) 0%, transparent 50%), radial-gradient(ellipse at 60% 80%, rgba(139,92,246,0.04) 0%, transparent 50%); }

    @keyframes logoSpin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

    @keyframes gradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
    @keyframes floatOrb { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-50px) scale(1.1)} 66%{transform:translate(-20px,20px) scale(0.9)} 100%{transform:translate(0,0) scale(1)} }
    @keyframes particleFloat { 0%{transform:translateY(100vh) rotate(0deg); opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(-10vh) rotate(720deg); opacity:0} }
    @keyframes orbitSlow { 0%{transform:rotate(0deg) translateX(150px) rotate(0deg)} 100%{transform:rotate(360deg) translateX(150px) rotate(-360deg)} }
    @keyframes dashboardFloat { 0%{transform:perspective(1000px) rotateX(2deg) rotateY(-2deg) translateY(0)} 50%{transform:perspective(1000px) rotateX(-1deg) rotateY(1deg) translateY(-10px)} 100%{transform:perspective(1000px) rotateX(2deg) rotateY(-2deg) translateY(0)} }

    .dot-1 { animation:bounceDot 1.4s infinite ease-in-out; animation-delay:-0.32s; }
    .dot-2 { animation:bounceDot 1.4s infinite ease-in-out; animation-delay:-0.16s; }
    .dot-3 { animation:bounceDot 1.4s infinite ease-in-out; }
  `}</style>
);

export default GlobalStyles;
