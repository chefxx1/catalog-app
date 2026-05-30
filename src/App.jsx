import React, { useState, useEffect } from "react";
import { getMe, setOnUnauthorized, getProductById, logout } from "./api";
import GlobalStyles from "./components/GlobalStyles";
import { Icon, StepIndicator } from "./components/shared";
import ThemeToggle from "./components/ThemeToggle";
import { toast, ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import SearchStep from "./pages/SearchStep";
import ReviewStep from "./pages/ReviewStep";
import ExportStep from "./pages/ExportStep";
import BulkImportView from "./pages/BulkImportView";
import Analytics from "./pages/Analytics";
import BrandVoices from "./pages/BrandVoices";
import Settings from "./pages/Settings";
import Trending from "./pages/Trending";
import CommandPalette from "./components/CommandPalette";
import SparklesBg from "./components/SparklesBg";

export default function App() {
  const [user, setUser] = useState(null);
  const [dark, setDark] = useState(true);
  const [view, setView] = useState("dashboard");
  const [step, setStep] = useState(0);
  const [catalogMode, setCatalogMode] = useState("single");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [productData, setProductData] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [pendingDashboardFilter, setPendingDashboardFilter] = useState(null);

  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
      toast.error("Session expired. Please sign in again.");
    });
  }, []);

  useEffect(() => {
    getMe().then(u => {
      if (u) setUser({ id: u.id, email: u.email, name: u.name, role: u.role, store_id: u.store_id, store_name: u.store_name });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const handleKey = (e) => {
      // Ctrl+K opens palette regardless of input focus
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen(o => !o);
        return;
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      const views = ["dashboard","catalog","trending","analytics","voices","settings"];
      if (e.ctrlKey || e.metaKey) {
        if (e.key >= "1" && e.key <= "6") { e.preventDefault(); setView(views[parseInt(e.key)-1]); if(e.key==="2") setStep(0); }
        if (e.key === "n" || e.key === "N") { e.preventDefault(); setView("catalog"); setStep(0); setProductData(null); }
      }
      if (e.key === "?" && !e.ctrlKey) setShowShortcuts(s => !s);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [user]);

  const handleLogout = async () => { await logout(); setUser(null); };

  if (loading) return null;

  const navItems = [
    { id: "dashboard", icon: "grid", label: "Dashboard" },
    { id: "catalog", icon: "package", label: "New Catalog" },
    { id: "trending", icon: "sparkle", label: "Trending" },
    { id: "analytics", icon: "chart", label: "Analytics" },
    { id: "voices", icon: "tag", label: "Brand Voices" },
    { id: "settings", icon: "settings", label: "Settings" },
  ];

  if (!user) return (
    <>
      <GlobalStyles dark={dark} />
      <ToastContainer />
      <AuthPage onLogin={setUser} />
    </>
  );

  return (
    <ErrorBoundary>
      <GlobalStyles dark={dark} />
      <ToastContainer />
      {/* Ambient layer: subtle dark purple glow + drifting sparkle particles */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: "-20%", left: "-10%",
          width: "60vw", height: "60vw", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(40,20,90,0.025), transparent 65%)",
          filter: "blur(60px)",
          animation: "ambientBreathe1 22s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-25%", right: "-15%",
          width: "55vw", height: "55vw", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(30,15,80,0.02), transparent 65%)",
          filter: "blur(60px)",
          animation: "ambientBreathe2 28s ease-in-out infinite",
        }} />
        {(view === "catalog" || view === "dashboard") && <SparklesBg />}
      </div>
      <div style={{ display: "flex", minHeight: "100vh", background: "transparent", transition: "background 0.35s, color 0.35s", position: "relative", zIndex: 1 }}>
        <div className={`sidebar-overlay${sidebarOpen?" open":""}`} onClick={()=>setSidebarOpen(false)}/>

        {/* Sidebar */}
        <div className={`sidebar${sidebarOpen?" open":""}`} style={{ width: sidebarCollapsed ? 68 : 230, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border-light)", padding: "0", display: "flex", flexDirection: "column", flexShrink: 0, transition: "width 0.25s ease, background 0.35s, border-color 0.35s", overflow: "hidden" }}>
          <div style={{ padding: sidebarCollapsed ? "22px 0 18px" : "22px 20px 18px", borderBottom: "1px solid var(--border-light)", transition: "padding 0.25s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
              <div style={{ position: "relative", width: 32, height: 32, cursor: "pointer", flexShrink: 0 }} onClick={() => setSidebarCollapsed(c => !c)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
                <div style={{ position: "absolute", inset: -1, borderRadius: 10, background: "conic-gradient(from 0deg, #2563EB, #7C3AED, #10B981, #2563EB)", opacity: 0.6, animation: "logoSpin 6s linear infinite" }} />
                <div style={{ position: "relative", width: 32, height: 32, borderRadius: 9, background: "var(--bg-sidebar)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke="url(#sidebarGrad)" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M12 22V12" stroke="url(#sidebarGrad)" strokeWidth="1.5" />
                    <path d="M2 7l10 5 10-5" stroke="url(#sidebarGrad)" strokeWidth="1.5" />
                    <circle cx="12" cy="12" r="2.5" fill="url(#sidebarGrad)" opacity="0.9" />
                    <defs>
                      <linearGradient id="sidebarGrad" x1="2" y1="2" x2="22" y2="22">
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="50%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#10B981" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
              {!sidebarCollapsed && <div>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", display: "block", lineHeight: 1 }}>
                  <span>Catalog</span><span style={{ background: "linear-gradient(135deg, #3B82F6, #8B5CF6, #10B981)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AI</span>
                </span>
                <span style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 500 }}>{user.store_name || "My Store"}</span>
              </div>}
            </div>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", flex: 1, padding: sidebarCollapsed ? "8px 8px" : "8px 10px", overflowY: "auto", transition: "padding 0.25s" }}>
            {!sidebarCollapsed && (
              <div className="nav-section-label">
                <span className="dot" style={{ color: "#3B82F6", background: "#3B82F6" }} />
                <span className="text">Main</span>
                <span className="line" />
              </div>
            )}
            {navItems.slice(0, 3).map(item => {
              const isActive = view === item.id;
              return (
                <div key={item.id} className={`nav-item ${isActive ? "active" : ""}`}
                  style={sidebarCollapsed ? { justifyContent: "center", padding: "10px 0" } : {}}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => { setView(item.id); if (item.id === "catalog") setStep(0); setSidebarOpen(false); }}>
                  <Icon name={item.icon} size={15} color={isActive ? "var(--primary-light, #A78BFA)" : undefined} /> {!sidebarCollapsed && item.label}
                </div>
              );
            })}
            {!sidebarCollapsed && (
              <div className="nav-section-label">
                <span className="dot" style={{ color: "#10B981", background: "#10B981" }} />
                <span className="text">Workspace</span>
                <span className="line" />
              </div>
            )}
            {sidebarCollapsed && <div style={{ height: 1, background: "var(--border-light)", margin: "6px 4px" }} />}
            {navItems.slice(3).map(item => {
              const isActive = view === item.id;
              return (
                <div key={item.id} className={`nav-item ${isActive ? "active" : ""}`}
                  style={sidebarCollapsed ? { justifyContent: "center", padding: "10px 0" } : {}}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => { setView(item.id); if (item.id === "catalog") setStep(0); setSidebarOpen(false); }}>
                  <Icon name={item.icon} size={15} color={isActive ? "var(--primary-light, #A78BFA)" : undefined} /> {!sidebarCollapsed && item.label}
                </div>
              );
            })}
          </nav>

          <div style={{ padding: sidebarCollapsed ? "10px 8px" : "10px 10px", borderTop: "1px solid var(--border-light)", transition: "padding 0.25s" }}>
            {!sidebarCollapsed && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>{dark ? "Dark" : "Light"} mode</span>
                <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
              </div>
            )}
            {sidebarCollapsed && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
              </div>
            )}
            <div className="user-card"
              style={sidebarCollapsed ? { justifyContent: "center", padding: "8px 0", background: "transparent", border: "none" } : {}}
              onClick={() => setView("settings")}
              title={sidebarCollapsed ? user.name || user.email : undefined}>
              <div className="user-avatar-ring">
                <div className="user-avatar-inner">
                  {(user.name || user.email || "U")[0].toUpperCase()}
                </div>
              </div>
              {!sidebarCollapsed && <>
                <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.name || user.email.split("@")[0]}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span className={`role-pill ${user.role.toLowerCase()}`}>
                      {user.role.toUpperCase()}
                    </span>
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ padding: "5px 6px", border: "none", borderRadius: 6 }} title="Sign Out" onClick={(e) => { e.stopPropagation(); handleLogout(); }}>
                  <Icon name="logout" size={14} color="var(--text-dim)" />
                </button>
              </>}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ borderBottom: "1px solid var(--border-light)", padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, transition: "border-color 0.35s" }}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button className="mobile-menu-btn btn btn-ghost" style={{padding:6}} onClick={()=>setSidebarOpen(true)}><Icon name="menu" size={20}/></button>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                  {view === "dashboard" ? "Dashboard" : view === "catalog" ? "New Entry" : view === "trending" ? "Trending" : view === "analytics" ? "Analytics" : view === "voices" ? "Brand Voices" : "Settings"}
                </h2>
                <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                  {view === "dashboard" ? "Overview & quick actions" : view === "catalog" ? "Search, review, and export products" : view === "trending" ? "What's hot worldwide — add with one click" : view === "analytics" ? "Performance metrics & insights" : view === "voices" ? "AI tone & vocabulary presets" : "Account & store configuration"}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button
                onClick={() => setPaletteOpen(true)}
                className="ask-ai-bar"
                title="Ask the catalog assistant (Ctrl+K)"
              >
                <Icon name="sparkle" size={13} />
                <span className="ask-ai-bar-text">Ask anything...</span>
                <kbd>⌘ K</kbd>
              </button>
              <span className="header-date" style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 500 }}>
                {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </div>
          </div>

          <div className="main-content" style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
              {view === "dashboard" && <Dashboard user={user} refreshKey={catalogRefreshKey} pendingFilter={pendingDashboardFilter} onPendingFilterConsumed={() => setPendingDashboardFilter(null)} onNew={() => { setStep(0); setProductData(null); setView("catalog"); }} onViewVoices={() => setView("voices")}
                onViewProduct={async (productId, step) => {
                  try {
                    const data = await getProductById(productId);
                    setProductData(data);
                    setStep(step || 1);
                    setView("catalog");
                  } catch (err) { toast.error(err.message || "Failed to load product"); }
                }}
                onExportProduct={async (productId) => {
                  try {
                    const data = await getProductById(productId);
                    setProductData(data);
                    setStep(2);
                    setView("catalog");
                  } catch (err) { toast.error(err.message || "Failed to load product"); }
                }}
              />}
              {view === "catalog" && (
                <div>
                  {step === 0 && catalogMode === "single" && (
                    <>
                      <StepIndicator currentStep={step} />
                      <SearchStep onSearch={(data) => { setProductData(data); setStep(1); }} />
                      <div style={{display:"flex",justifyContent:"center",marginTop:16}}>
                        <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>setCatalogMode("bulk")}><Icon name="upload" size={13}/> Bulk Import from CSV</button>
                      </div>
                    </>
                  )}
                  {step === 0 && catalogMode === "bulk" && (
                    <>
                      <div style={{display:"flex",justifyContent:"center",padding:"8px 0"}}>
                        <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>setCatalogMode("single")}><Icon name="arrowLeft" size={13}/> Back to Single Search</button>
                      </div>
                      <BulkImportView user={user} onDone={() => { setCatalogMode("single"); setView("dashboard"); }} />
                    </>
                  )}
                  {step === 1 && <><StepIndicator currentStep={step} /><ReviewStep onExport={(enrichedData) => { setProductData(enrichedData); setStep(2); }} onSave={() => { setStep(0); setProductData(null); setView("dashboard"); setCatalogRefreshKey(k => k + 1); }} productData={productData} user={user} /></>}
                  {step === 2 && <><StepIndicator currentStep={step} /><ExportStep onComplete={() => { setStep(0); setView("dashboard"); setCatalogRefreshKey(k => k + 1); }} productData={productData} user={user} /></>}
                </div>
              )}
              {view === "trending" && <Trending user={user} />}
              {view === "analytics" && <Analytics />}
              {view === "voices" && <BrandVoices user={user} />}
              {view === "settings" && <Settings user={user} onUserUpdate={setUser} />}
          </div>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)} user={user} onCatalogChanged={()=>setCatalogRefreshKey(k=>k+1)} onApplyFilter={(f)=>{ setPendingDashboardFilter(f); setView("dashboard"); }} onNavigate={(v)=>{ setView(v); if (v === "catalog") setStep(0); }} />

      {showShortcuts && (
        <div className="modal-modern-overlay" onClick={()=>setShowShortcuts(false)}>
          <div className="modal-modern-card size-sm" onClick={e=>e.stopPropagation()}>
            <div className="modal-modern-blobs" />
            <div className="modal-modern-header">
              <div>
                <h3>Keyboard Shortcuts</h3>
                <p>Move faster with the keyboard</p>
              </div>
              <button className="modal-modern-close" onClick={()=>setShowShortcuts(false)}><Icon name="x" size={14}/></button>
            </div>
            <div className="modal-modern-body" style={{padding:"14px 20px"}}>
              {[
                {keys:"⌘ K",desc:"Ask catalog assistant"},
                {keys:"⌘ 1-6",desc:"Navigate to page"},
                {keys:"⌘ N",desc:"New product"},
                {keys:"?",desc:"Toggle this menu"},
              ].map((s,i,arr)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<arr.length-1?"1px solid var(--border-light)":"none"}}>
                  <span style={{fontSize:13,color:"var(--text-muted)"}}>{s.desc}</span>
                  <kbd style={{padding:"3px 9px",borderRadius:6,fontSize:10.5,fontFamily:"'SF Mono','Menlo',monospace",background:"var(--hover-bg)",border:"1px solid var(--border-light)",color:"var(--text-dim)",fontWeight:600,letterSpacing:"0.04em"}}>{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
