import React, { useState, useEffect } from "react";
import { Icon, LoadingDots } from "../components/shared";
import { toast } from "../components/Toast";
import { getStats, getSourcePerformance, getSearchHistory, clearSearchHistory, getCompleteness, getActivity, getPriceAlerts, getLowStock } from "../api";

// ── Section label ──
const SectionLabel = ({ children, accent = "var(--text-dim)" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
    <div style={{ width: 3, height: 14, borderRadius: 2, background: accent }} />
    <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>{children}</span>
    <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, var(--border-light), transparent)" }} />
  </div>
);

// ── KPI tile ──
const KpiTile = ({ label, value, sublabel, icon, color, gradient }) => (
  <div style={{
    position: "relative", padding: "16px 18px", borderRadius: 12,
    background: "var(--card-bg)",
    border: "1px solid var(--border-light)",
    backdropFilter: "blur(10px)",
    overflow: "hidden",
    transition: "all 0.18s",
  }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = `color-mix(in oklab, ${color} 35%, var(--border))`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 22px color-mix(in oklab, ${color} 14%, transparent)`; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-light)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
    {/* Accent bar on left */}
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: gradient, opacity: 0.85 }} />
    {/* Icon in corner */}
    <div style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 9, background: `color-mix(in oklab, ${color} 12%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={14} color={color} />
    </div>
    <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--text-dim)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
    <div className="mono" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, background: gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.02em" }}>{value}</div>
    {sublabel && <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 6, fontWeight: 500 }}>{sublabel}</div>}
  </div>
);

const Analytics = () => {
  const [stats, setStats] = useState(null);
  const [sources, setSources] = useState([]);
  const [history, setHistory] = useState([]);
  const [completenessData, setCompletenessData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const REFRESH_INTERVAL_MS = 30_000;

  const loadAll = async () => {
    const [s, src, h, comp, act, pa, ls] = await Promise.all([
      getStats().catch(() => ({})),
      getSourcePerformance().catch(() => ({ sources: [] })),
      getSearchHistory().catch(() => ({ history: [] })),
      getCompleteness().catch(() => null),
      getActivity(15).catch(() => ({ activity: [] })),
      getPriceAlerts().catch(() => ({ alerts: [] })),
      getLowStock().catch(() => ({ items: [] })),
    ]);
    setStats(s);
    setSources(src.sources || []);
    setHistory(h.history || []);
    setCompletenessData(comp);
    setActivity(act.activity || []);
    setPriceAlerts(pa.alerts || []);
    setLowStock(ls.items || []);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAll().finally(() => setLoading(false)); }, []);

  // Silent auto-refresh — page stays live without any UI fanfare
  useEffect(() => {
    const t = setInterval(() => { loadAll().catch(() => {}); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const sourceColors = { "Amazon": "#FF9900", "Open Food Facts": "#10B981", "UPC Database": "#6366F1", "Alibaba": "#FF6A00", "Google": "#4285F4", "Barcode Spider": "#F97316" };


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── HEADER ── */}
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>Operations Dashboard</h2>
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>Performance, catalog health, and team activity at a glance.</p>
      </div>

      {loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-card" style={{ height: 110 }} />)}
          </div>
          <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="skeleton-card" style={{ height: 220 }} />
            <div className="skeleton-card" style={{ height: 220 }} />
          </div>
          <div className="skeleton-card" style={{ height: 180 }} />
        </>
      )}

      {/* ── KPI TILES ── */}
      {!loading && stats && (
        <div>
          <SectionLabel accent="#3B82F6">Overview</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            <KpiTile label="Total Searches" value={(stats?.total_searches || 0).toLocaleString()} sublabel="all time" icon="search" color="#3B82F6" gradient="linear-gradient(135deg,#3B82F6,#8B5CF6)" />
            <KpiTile label="Cache Hit Rate" value={`${stats?.cache_hit_rate || 0}%`} sublabel={(stats?.cache_hit_rate || 0) >= 50 ? "healthy" : "warming up"} icon="zap" color="#10B981" gradient="linear-gradient(135deg,#10B981,#3B82F6)" />
            <KpiTile label="Avg Response" value={`${stats?.avg_response_time || 0}ms`} sublabel={(stats?.avg_response_time || 0) < 500 ? "fast" : "slow"} icon="clock" color="#8B5CF6" gradient="linear-gradient(135deg,#8B5CF6,#EC4899)" />
            <KpiTile label="Products" value={(stats?.total_products || 0).toLocaleString()} sublabel="in catalog" icon="package" color="#F59E0B" gradient="linear-gradient(135deg,#F59E0B,#EF4444)" />
          </div>
        </div>
      )}

      {/* ── CATALOG HEALTH (donut + completeness breakdown) ── */}
      {!loading && (
        <div>
          <SectionLabel accent="#10B981">Catalog Health</SectionLabel>
          <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Completeness donut */}
            {completenessData && completenessData.total > 0 ? (() => {
              const { total, average, complete, good, needsWork, poor } = completenessData;
              const segments = [
                { label: "Complete", value: complete, color: "#10B981" },
                { label: "Good", value: good, color: "#3B82F6" },
                { label: "Needs Work", value: needsWork, color: "#F59E0B" },
                { label: "Poor", value: poor, color: "#EF4444" },
              ].filter(s => s.value > 0);
              const r = 50, cx = 60, cy = 60, stroke = 11;
              const circumference = 2 * Math.PI * r;
              let offset = 0;
              return (
                <div className="card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg,#10B981,#3B82F6)" }} />
                  <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="check" size={14} color="#10B981" /> Catalog Completeness
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                    <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
                      <svg width="120" height="120" viewBox="0 0 120 120" style={{ filter: "drop-shadow(0 0 12px rgba(16,185,129,0.18))" }}>
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
                        {segments.map((seg, i) => {
                          const pct = seg.value / total;
                          const dash = pct * circumference;
                          const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke}
                            strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset}
                            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
                            style={{ transition: "all 0.6s ease", filter: `drop-shadow(0 0 4px ${seg.color}99)` }} />;
                          offset += dash;
                          return el;
                        })}
                      </svg>
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                        <span className="mono" style={{ fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg,#10B981,#34D399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{average}%</span>
                        <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>avg score</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                      {[
                        { label: "Complete", value: complete, color: "#10B981" },
                        { label: "Good", value: good, color: "#3B82F6" },
                        { label: "Needs Work", value: needsWork, color: "#F59E0B" },
                        { label: "Poor", value: poor, color: "#EF4444" },
                      ].map((row, i) => {
                        const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, boxShadow: `0 0 6px ${row.color}80`, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: "var(--text-sec)", flex: 1, fontWeight: 500 }}>{row.label}</span>
                            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: row.color, minWidth: 28, textAlign: "right" }}>{row.value}</span>
                            <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)", minWidth: 36, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text-dim)" }}>
                <Icon name="check" size={28} color="var(--text-dim)" />
                <p style={{ fontSize: 13, marginTop: 8 }}>No catalog data yet</p>
              </div>
            )}

            {/* Source performance — leaderboard style */}
            <div className="card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg,#3B82F6,#8B5CF6)" }} />
              <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="chart" size={14} color="#3B82F6" /> Data Source Trust
              </h3>
              {sources.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <Icon name="chart" size={26} color="var(--text-dim)" />
                  <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>No source data yet</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {sources.map((s, i) => {
                    const baseColor = sourceColors[s.source_name] || "#3B82F6";
                    const score = Math.round(s.avg_trust || 0);
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 5, background: `${baseColor}22`, color: baseColor, fontSize: 10, fontWeight: 800 }}>
                            {i + 1}
                          </span>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: baseColor, boxShadow: `0 0 8px ${baseColor}99` }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{s.source_name}</span>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: baseColor }}>{score}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: "var(--hover-bg)", overflow: "hidden" }}>
                          <div style={{
                            width: `${score}%`, height: "100%",
                            background: `linear-gradient(90deg, ${baseColor}, ${baseColor}cc)`,
                            boxShadow: `0 0 12px ${baseColor}80`,
                            borderRadius: 999, transition: "width 0.6s ease",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ALERTS (low stock + price alerts) — only render section if either has data ── */}
      {!loading && (lowStock.length > 0 || priceAlerts.length > 0) && (
        <div>
          <SectionLabel accent="#F59E0B">Alerts</SectionLabel>
          <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: lowStock.length > 0 && priceAlerts.length > 0 ? "1fr 1fr" : "1fr", gap: 16 }}>
            {lowStock.length > 0 && (
              <div className="card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg,#F59E0B,#EF4444)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={{ fontWeight: 700, margin: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="warning" size={14} color="#F59E0B" /> Low Stock
                  </h3>
                  <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: "rgba(245,158,11,0.14)", color: "#F59E0B", fontWeight: 700 }}>{lowStock.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 280, overflowY: "auto" }}>
                  {lowStock.slice(0, 8).map((it, i) => {
                    const isOut = it.stock === 0;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "var(--hover-bg)", borderRadius: 8, borderLeft: `2px solid ${isOut ? "#EF4444" : "#F59E0B"}` }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                          <div className="mono" style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{it.barcode || "—"}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 10 }}>
                          <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: isOut ? "#EF4444" : "#F59E0B" }}>{it.stock}</span>
                          <span style={{ fontSize: 9.5, padding: "2px 7px", borderRadius: 999, background: isOut ? "rgba(239,68,68,0.18)" : "rgba(245,158,11,0.18)", color: isOut ? "#EF4444" : "#F59E0B", fontWeight: 800, letterSpacing: "0.04em" }}>{isOut ? "OUT" : "LOW"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {priceAlerts.length > 0 && (
              <div className="card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg,#EC4899,#EF4444)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={{ fontWeight: 700, margin: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="warning" size={14} color="#EC4899" /> Price Alerts
                  </h3>
                  <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: "rgba(236,72,153,0.14)", color: "#EC4899", fontWeight: 700 }}>{priceAlerts.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 280, overflowY: "auto" }}>
                  {priceAlerts.map((a, i) => {
                    const diff = a.current_price - a.previous_price;
                    const isUp = diff > 0;
                    const c = isUp ? "#EF4444" : "#10B981";
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "var(--hover-bg)", borderRadius: 8, borderLeft: `2px solid ${c}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, background: `${c}22`, color: c, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{isUp ? "↑" : "↓"}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                            <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{a.source_name}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", marginLeft: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)", textDecoration: "line-through" }}>${parseFloat(a.previous_price).toFixed(2)}</span>
                            <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: c }}>${parseFloat(a.current_price).toFixed(2)}</span>
                          </div>
                          <span className="mono" style={{ fontSize: 10, color: c, fontWeight: 700 }}>{isUp ? "+" : ""}{((diff / a.previous_price) * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ACTIVITY (recent searches + activity feed) ── */}
      {!loading && (
        <div>
          <SectionLabel accent="#8B5CF6">Activity</SectionLabel>
          <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Recent searches */}
            <div className="card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg,#3B82F6,#06B6D4)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontWeight: 700, margin: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="search" size={14} color="#3B82F6" /> Recent Searches
                </h3>
                {history.length > 0 && (
                  <button className="btn btn-ghost" style={{ fontSize: 10.5, color: "#EF4444", padding: "3px 8px" }} onClick={async () => {
                    try { await clearSearchHistory(); setHistory([]); toast.success("Search history cleared"); } catch (err) { toast.error(err.message); }
                  }}><Icon name="trash" size={11} color="#EF4444" /> Clear</button>
                )}
              </div>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <Icon name="search" size={26} color="var(--text-dim)" />
                  <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>No searches yet</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                  {history.slice(0, 15).map((h, i) => {
                    const isFast = (h.response_time_ms || 0) < 200;
                    return (
                      <div key={h.id || i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--hover-bg)", borderRadius: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                          <Icon name="barcode" size={13} color="var(--text-dim)" />
                          <span className="mono" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.barcode}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {h.cache_hit
                            ? <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: "rgba(16,185,129,0.14)", color: "#10B981", fontWeight: 800, letterSpacing: "0.04em" }}>CACHE</span>
                            : <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: "rgba(59,130,246,0.14)", color: "#3B82F6", fontWeight: 800, letterSpacing: "0.04em" }}>API</span>}
                          <span className="mono" style={{ fontSize: 10.5, color: isFast ? "#10B981" : "var(--text-dim)", fontWeight: 600, minWidth: 38, textAlign: "right" }}>{h.response_time_ms}ms</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Activity feed */}
            <div className="card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg,#8B5CF6,#EC4899)" }} />
              <h3 style={{ fontWeight: 700, marginBottom: 14, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="clock" size={14} color="#8B5CF6" /> Recent Activity
              </h3>
              {activity.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <Icon name="clock" size={26} color="var(--text-dim)" />
                  <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>No activity yet</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 320, overflowY: "auto" }}>
                  {activity.slice(0, 15).map((a, i) => {
                    const actionIcons = { saved: "package", created: "plus", updated: "edit", deleted: "trash", exported: "download", imported: "upload" };
                    const actionColors = { saved: "#3B82F6", created: "#10B981", updated: "#F59E0B", deleted: "#EF4444", exported: "#8B5CF6", imported: "#3B82F6" };
                    const entityLabels = { product: "product", catalog_entry: "entry", brand_voice: "voice", export: "", bulk_import: "", tag: "tag" };
                    const timeAgo = (date) => {
                      const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
                      if (s < 60) return "just now";
                      if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                      if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
                      return `${Math.floor(s / 86400)}d ago`;
                    };
                    const c = actionColors[a.action] || "#3B82F6";
                    return (
                      <div key={a.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < Math.min(activity.length, 15) - 1 ? "1px solid var(--border-light)" : "none" }}>
                        <div style={{ width: 24, height: 24, borderRadius: 7, background: `${c}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 0 8px ${c}33` }}>
                          <Icon name={actionIcons[a.action] || "edit"} size={11} color={c} />
                        </div>
                        <div style={{ flex: 1, fontSize: 12, color: "var(--text-sec)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 700 }}>{a.user_name || "User"}</span>
                          {" "}<span style={{ color: c, fontWeight: 600 }}>{a.action}</span>{" "}
                          {a.entity_type === "bulk_import" ? (
                            <span>{a.details?.imported || 0} products</span>
                          ) : (
                            <>{entityLabels[a.entity_type] || a.entity_type}{a.entity_name ? <span style={{ fontWeight: 600 }}> {a.entity_name}</span> : ""}</>
                          )}
                        </div>
                        <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)", whiteSpace: "nowrap", flexShrink: 0 }}>{timeAgo(a.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
