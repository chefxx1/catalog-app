import React, { useEffect, useState } from "react";
import { Icon } from "../components/shared";
import { toast } from "../components/Toast";
import BrandOrb from "../components/BrandOrb";
import { getTrending, getTrendingCategories, addTrendingToCatalog } from "../api";

const COUNTRIES = [
  { code: "", label: "Worldwide" },
  { code: "US", label: "United States" },
  { code: "LB", label: "Lebanon" },
  { code: "GB", label: "United Kingdom" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "AE", label: "UAE" },
  { code: "JP", label: "Japan" },
];

const Trending = ({ user }) => {
  const canWrite = user?.role === "Admin" || user?.role === "Editor";
  const [country, setCountry] = useState("US");
  const [category, setCategory] = useState("Electronics");
  const [categories, setCategories] = useState(["Electronics", "Beauty", "Home", "Fashion", "Food", "Toys", "Fitness"]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);
  const [warning, setWarning] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [added, setAdded] = useState(new Set());

  useEffect(() => {
    getTrendingCategories().then(r => setCategories(r.categories || categories)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    setWarning(null);
    getTrending(country || "", category)
      .then((r) => { setItems(r.items || []); setCached(!!r.cached); setWarning(r.warning || null); })
      .catch((err) => toast.error(err?.message || "Failed to load trends"))
      .finally(() => setLoading(false));
  }, [country, category]);

  const addItem = async (item) => {
    if (!canWrite) return toast.warning("Viewers cannot add to catalog");
    setAddingId(item.query);
    try {
      await addTrendingToCatalog({ query: item.query, category: item.category, image: item.image, price: item.price, source: item.source });
      toast.success(`Added "${item.query}" to catalog`);
      setAdded(prev => new Set(prev).add(item.query));
    } catch (err) {
      toast.error(err?.message || "Failed to add");
    }
    setAddingId(null);
  };

  const scoreColor = (s) => s === "Breakout" ? "#EF4444" : s?.startsWith("+") ? "#10B981" : "#3B82F6";
  const scoreEmoji = (s) => s === "Breakout" ? "🔥" : s?.startsWith("+") ? "📈" : "✨";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>
            <span style={{ background: "linear-gradient(135deg,#F59E0B,#EF4444,#EC4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Trending</span> Products
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Best-selling products from Google Shopping — ready to add to your catalog
            {cached && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 7px", borderRadius: 8, background: "var(--hover-bg)", color: "var(--text-dim)" }}>cached</span>}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 6 }}>COUNTRY</div>
          <select className="input" style={{ padding: "6px 30px 6px 12px", fontSize: 12, width: "auto" }} value={country} onChange={e => setCountry(e.target.value)}>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 6 }}>CATEGORY</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {categories.map(c => (
              <button key={c} onClick={() => setCategory(c)} style={{
                padding: "6px 14px", borderRadius: 18, fontSize: 12, fontWeight: 600,
                border: `1px solid ${category === c ? "var(--primary)" : "var(--border-light)"}`,
                background: category === c ? "rgba(124,58,237,0.12)" : "transparent",
                color: category === c ? "var(--primary-light,#A78BFA)" : "var(--text-muted)",
                cursor: "pointer", fontFamily: "'Sora',sans-serif", transition: "all 0.15s",
              }}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {warning && !loading && items.length > 0 && (
        <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, fontSize: 12, color: "#F59E0B", display: "flex", gap: 8, alignItems: "center" }}>
          <Icon name="warning" size={14} color="#F59E0B" /> {warning}
        </div>
      )}

      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton-card" style={{ height: 260 }} />)}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state-modern">
            <BrandOrb size="lg" floating />
            <div className="es-title">No trends right now</div>
            <div className="es-subtitle">Try a different country or category — Google Shopping doesn't have data for every region.</div>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {items.map((item, i) => {
            const isAdded = added.has(item.query);
            const isAdding = addingId === item.query;
            const sColor = scoreColor(item.score);
            const isBreakout = item.score === "Breakout";
            return (
              <div key={i} className="card" style={{
                padding: 0, overflow: "hidden", display: "flex", flexDirection: "column",
                transition: "transform 0.22s cubic-bezier(0.16,1,0.3,1), box-shadow 0.22s, border-color 0.22s",
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow = `0 12px 30px color-mix(in oklab, ${sColor} 18%, transparent)`;
                  e.currentTarget.style.borderColor = `color-mix(in oklab, ${sColor} 45%, var(--border))`;
                  const img = e.currentTarget.querySelector("img");
                  if (img) img.style.transform = "scale(1.06)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "";
                  e.currentTarget.style.borderColor = "";
                  const img = e.currentTarget.querySelector("img");
                  if (img) img.style.transform = "scale(1)";
                }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", background: "var(--hover-bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {item.image ? (
                    <img src={item.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1)" }} onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <Icon name="package" size={36} color="var(--text-dim)" />
                  )}
                  {/* Subtle bottom fade for legibility */}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 65%, rgba(0,0,0,0.25) 100%)", pointerEvents: "none" }} />
                  <span style={{
                    position: "absolute", top: 8, left: 8, padding: "3px 9px", borderRadius: 999,
                    fontSize: 10, fontWeight: 800, letterSpacing: "0.02em",
                    background: isBreakout ? "rgba(239,68,68,0.95)" : "rgba(0,0,0,0.78)",
                    color: isBreakout ? "white" : sColor,
                    backdropFilter: "blur(6px)",
                    border: `1px solid ${isBreakout ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.06)"}`,
                    boxShadow: isBreakout ? "0 3px 12px rgba(239,68,68,0.45)" : `0 2px 8px ${sColor}33`,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ fontSize: 11 }}>{scoreEmoji(item.score)}</span>
                    {item.score}
                  </span>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, minHeight: 34, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.query}</div>
                  {item.price && (
                    <div style={{ fontSize: 15, fontWeight: 800, background: "linear-gradient(135deg,#10B981,#34D399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.01em" }}>
                      {item.price}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--text-dim)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {item.source && <span style={{ padding: "2px 7px", borderRadius: 8, background: "var(--hover-bg)" }}>{item.source}</span>}
                    {item.rating && <span style={{ padding: "2px 7px", borderRadius: 8, background: "rgba(245,158,11,0.12)", color: "#F59E0B", fontWeight: 600 }}>★ {item.rating}{item.reviews ? ` (${item.reviews})` : ""}</span>}
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", gap: 6 }}>
                    {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 11, padding: "6px 10px", flexShrink: 0 }} title="View source"><Icon name="search" size={11} /></a>}
                    <button
                      disabled={!canWrite || isAdding || isAdded}
                      onClick={() => addItem(item)}
                      style={{
                        flex: 1, justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 11, fontWeight: 700, padding: "7px 10px", borderRadius: 8,
                        fontFamily: "'Sora',sans-serif", border: "none",
                        cursor: (!canWrite || isAdding || isAdded) ? "default" : "pointer",
                        background: isAdded ? "rgba(16,185,129,0.12)"
                          : (canWrite && !isAdding ? "linear-gradient(135deg,#F59E0B,#EF4444,#EC4899)" : "var(--hover-bg)"),
                        color: isAdded ? "#10B981"
                          : (canWrite && !isAdding ? "white" : "var(--text-dim)"),
                        boxShadow: (canWrite && !isAdding && !isAdded) ? "0 3px 10px rgba(239,68,68,0.28)" : "none",
                        opacity: (!canWrite || isAdding) && !isAdded ? 0.7 : 1,
                        transition: "all 0.18s",
                      }}
                      onMouseEnter={e => { if (canWrite && !isAdding && !isAdded) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(239,68,68,0.42)"; } }}
                      onMouseLeave={e => { if (canWrite && !isAdding && !isAdded) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 3px 10px rgba(239,68,68,0.28)"; } }}>
                      {isAdded ? <><Icon name="check" size={11} color="#10B981" /> Added</>
                       : isAdding ? "Adding..."
                       : <><Icon name="plus" size={11} color={canWrite ? "white" : "var(--text-dim)"} /> Add to Catalog</>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Trending;
