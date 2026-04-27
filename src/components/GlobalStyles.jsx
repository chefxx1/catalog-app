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
