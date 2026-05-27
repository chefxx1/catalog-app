import React, { useState, useEffect, useMemo } from "react";
import { toast } from "../components/Toast";
import { Icon } from "../components/shared";
import BrandOrb from "../components/BrandOrb";
import VisualPreview from "../components/VisualPreview";
import { exportProduct, getExportHistory, downloadExport, getGoogleMerchantFeed, saveForLater } from "../api";
import { generateProductPdf } from "../utils/pdfExport";

const PLATFORMS = [
  { name: "Shopify",         color: "#96BF48", desc: "CSV / JSON optimized for Shopify imports",    iconLetter: "S" },
  { name: "WooCommerce",     color: "#7F54B3", desc: "Compatible with WooCommerce CSV importer",     iconLetter: "W" },
  { name: "Magento",         color: "#EE672F", desc: "Standard Magento product CSV format",          iconLetter: "M" },
  { name: "BigCommerce",     color: "#34313F", desc: "BigCommerce-formatted CSV",                    iconLetter: "B" },
  { name: "Google Shopping", color: "#4285F4", desc: "XML product feed for Merchant Center",         iconLetter: "G" },
  { name: "PDF Catalog",     color: "#DC2626", desc: "Branded PDF datasheet, demo-ready",            iconLetter: "P" },
];

const ExportStep = ({ onComplete, productData, user }) => {
  const canWrite = user?.role === "Admin" || user?.role === "Editor";
  const [fmt, setFmt] = useState("CSV");
  const [plat, setPlat] = useState("Shopify");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportedFile, setExportedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [previewTab, setPreviewTab] = useState("visual"); // "visual" | "raw"
  const [historySearch, setHistorySearch] = useState("");
  const [historyPlatformFilter, setHistoryPlatformFilter] = useState(null);

  const product = productData?.product || {};
  const productName = product.name || "Product";
  const platMeta = PLATFORMS.find(p => p.name === plat) || PLATFORMS[0];

  useEffect(() => { getExportHistory().then(setHistory).catch(() => { toast.warning("Could not load export history"); }); }, [done]);

  const handleExport = async () => {
    setExporting(true); setExportError(null); setProgress(0); setShowPreview(false);
    const progressInterval = setInterval(() => setProgress(p => Math.min(p + 8, 90)), 100);
    try {
      let result;
      if (plat === "Google Shopping") {
        const r = await getGoogleMerchantFeed();
        if (r.productCount === 0) throw new Error("No published products to export");
        result = { content: r.content, filename: r.filename, contentType: "application/xml" };
      } else if (plat === "PDF Catalog") {
        try {
          await saveForLater(productData);
        } catch (e) {
          // Surface the failure — silent skip made users think the PDF was
          // saved to their catalog when it wasn't.
          toast.warning("PDF generated, but could not save to catalog: " + (e?.message || "unknown error"));
        }
        const blob = await generateProductPdf({
          ...product,
          image_url: productData?.images?.[0]?.image_url,
          price: productData?.enriched?.price || product.price,
          description: product.ai_description_professional || product.edited_description || product.description,
        }, user?.store_name);
        const safe = (productName || "product").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
        result = { content: blob, filename: `${safe}.pdf`, contentType: "application/pdf", isBlob: true };
      } else {
        result = await exportProduct(fmt, plat, product.barcode, productData);
      }
      setProgress(100);
      setExportedFile(result);
      setTimeout(() => { setExporting(false); setDone(true); toast.success("Export complete!"); }, 400);
    } catch (err) {
      setExporting(false);
      setExportError(err.message);
      toast.error("Export failed: " + err.message);
    } finally {
      clearInterval(progressInterval);
    }
  };

  const handleDownload = () => {
    if (!exportedFile) return;
    const blob = exportedFile.isBlob ? exportedFile.content : new Blob([exportedFile.content], { type: exportedFile.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = exportedFile.filename; a.click();
    // Some browsers (Safari, older Firefox) abort the download if the URL
    // is revoked synchronously after click. Defer revoke to the next tick.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePreview = async () => {
    setExportError(null);
    setShowPreview(true);
    // Visual preview is always available; only fetch raw when raw tab is shown or for non-PDF/non-GS platforms
    if (plat !== "PDF Catalog" && plat !== "Google Shopping" && !preview) {
      try {
        const result = await exportProduct(fmt, plat, product.barcode, productData);
        setPreview(result.content);
      } catch (err) { setExportError(err.message); }
    }
  };

  // Refetch raw preview when format/platform changes while preview is open
  useEffect(() => { setPreview(null); }, [fmt, plat]);

  // Filter history
  const filteredHistory = useMemo(() => {
    let h = history;
    if (historyPlatformFilter) h = h.filter(e => e.platform === historyPlatformFilter);
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      h = h.filter(e => (e.product_name || "").toLowerCase().includes(q) || (e.barcode || "").toLowerCase().includes(q));
    }
    return h;
  }, [history, historySearch, historyPlatformFilter]);
  const historyPlatforms = useMemo(() => Array.from(new Set(history.map(h => h.platform))), [history]);

  const handleRedownload = async (exp) => {
    try {
      const data = await downloadExport(exp.id);
      const blob = new Blob([data.content], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { toast.error("Download failed: " + err.message); }
  };

  // ── DONE STATE ──
  if (done) return (
    <div className="animate-fadeIn" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, padding: "60px 20px", textAlign: "center" }}>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", inset: -20, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.25), transparent 70%)", filter: "blur(20px)", animation: "pulseGlow 2s ease-in-out infinite" }} />
        <div className="animate-scaleIn" style={{ position: "relative", width: 88, height: 88, borderRadius: "50%", background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))", border: "1.5px solid rgba(16,185,129,0.5)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px rgba(16,185,129,0.3)" }}>
          <Icon name="check" size={42} color="#10B981" />
        </div>
      </div>
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6, background: "linear-gradient(135deg, var(--text), var(--text-muted))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Export Complete</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 420, fontSize: 13, lineHeight: 1.5 }}>
          Exported to <span style={{ color: platMeta.color, fontWeight: 700 }}>{plat}</span> as <span className="mono" style={{ color: "var(--text)", fontWeight: 600 }}>{fmt}</span>. Ready to import.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 480, width: "100%" }}>
        {[
          { l: "Products", v: "1", c: "#10B981" },
          { l: "Platform", v: plat, c: platMeta.color },
          { l: "Format", v: fmt, c: "#7C3AED" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "16px 10px", background: "var(--card-bg)", border: "1px solid var(--border-light)", borderRadius: 12, backdropFilter: "blur(10px)", textAlign: "center" }}>
            <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: s.c, lineHeight: 1.2 }}>{s.v}</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button className="btn btn-success" onClick={handleDownload} style={{ padding: "10px 20px", boxShadow: "0 4px 16px rgba(16,185,129,0.35)" }}>
          <Icon name="download" size={15} /> Download
        </button>
        <button className="btn btn-ghost" onClick={onComplete}>
          <Icon name="plus" size={15} /> New Product
        </button>
      </div>
    </div>
  );

  // ── MAIN VIEW ──
  return (
    <div className="animate-fadeIn" style={{ maxWidth: 640, margin: "0 auto", padding: "20px 20px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header with brand orb */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <BrandOrb size="sm" floating />
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 2 }}>Export Catalog</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 12.5 }}>Choose your format and destination platform</p>
        </div>
      </div>

      {exportError && (
        <div style={{ padding: "11px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, fontSize: 13, color: "#FCA5A5", display: "flex", gap: 10, alignItems: "center", backdropFilter: "blur(8px)" }}>
          <Icon name="warning" size={14} color="#EF4444" /> {exportError}
        </div>
      )}

      {/* Format selector */}
      <div>
        <div className="export-section-label">
          FORMAT {plat === "PDF Catalog" && <span style={{ color: "var(--text-dim)", fontWeight: 400, textTransform: "none" }}>· PDF (fixed)</span>}
        </div>
        <div style={{ display: "flex", gap: 8, opacity: plat === "PDF Catalog" ? 0.4 : 1, pointerEvents: plat === "PDF Catalog" ? "none" : "auto" }}>
          {["CSV", "JSON", "XML"].map(f => {
            const icons = { CSV: "download", JSON: "code", XML: "code" };
            const active = fmt === f;
            return (
              <button key={f} onClick={() => { setFmt(f); setShowPreview(false); }} className={`fmt-pill ${active ? "active" : ""}`}>
                <Icon name={icons[f] || "code"} size={15} color={active ? "white" : "var(--text-dim)"} />
                <span className="mono">{f}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform grid */}
      <div>
        <div className="export-section-label">PLATFORM</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {PLATFORMS.map(pl => {
            const selected = plat === pl.name;
            return (
              <div
                key={pl.name}
                className={`platform-tile ${selected ? "selected" : ""}`}
                onClick={() => {
                  setPlat(pl.name);
                  if (pl.name === "Google Shopping") setFmt("XML");
                  else if (pl.name === "PDF Catalog") setFmt("PDF");
                  else if (fmt === "PDF" || (fmt === "XML" && plat === "Google Shopping")) setFmt("CSV");
                  setShowPreview(false);
                }}
                style={{ "--plat-c": pl.color }}
              >
                <div className="platform-tile-bar" />
                <div className="platform-tile-content">
                  <div className="platform-tile-row">
                    <div className="platform-tile-badge">{pl.iconLetter}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{pl.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.3 }}>{pl.desc}</div>
                    </div>
                  </div>
                  {selected && (
                    <div className="platform-tile-check">
                      <Icon name="check" size={11} color="white" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div style={{ padding: 14, background: "var(--card-bg)", borderRadius: 12, border: "1px solid var(--border-light)", backdropFilter: "blur(10px)" }}>
        <div className="export-section-label" style={{ marginBottom: 10 }}>SUMMARY</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 18px" }}>
          {[
            ["Product", productName],
            ["Format", fmt],
            ["Platform", plat],
            ["Barcode", product.barcode || "N/A"],
            ["Description", (product.ai_description_professional || product.edited_description) ? "AI-Generated" : "Standard"],
            ["Price", productData?.enriched?.price || "Not set"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0", gap: 8, minWidth: 0 }}>
              <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{k}</span>
              <span className={k === "Format" ? "mono" : ""} title={String(v)} style={{ color: "var(--text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preview pane with Visual / Raw tabs */}
      {showPreview && (
        <div className="export-preview">
          <div className="export-preview-header" style={{ gap: 10, justifyContent: "space-between" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-dim)", letterSpacing: "0.1em" }}>PREVIEW</span>
            <div className="preview-tabs">
              <button className={`preview-tab ${previewTab === "visual" ? "active" : ""}`} onClick={() => setPreviewTab("visual")}>
                <Icon name="eye" size={11} /> Visual
              </button>
              <button
                className={`preview-tab ${previewTab === "raw" ? "active" : ""}`}
                onClick={async () => {
                  setPreviewTab("raw");
                  if (plat !== "PDF Catalog" && plat !== "Google Shopping" && !preview) {
                    try {
                      const result = await exportProduct(fmt, plat, product.barcode, productData);
                      setPreview(result.content);
                    } catch (err) { setExportError(err.message); }
                  }
                }}
                disabled={plat === "PDF Catalog"}
                title={plat === "PDF Catalog" ? "PDF has no raw text view" : ""}
              >
                <Icon name="code" size={11} /> Raw
              </button>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 9px" }} onClick={() => setShowPreview(false)}>
              <Icon name="x" size={11} />
            </button>
          </div>
          {previewTab === "visual" ? (
            <VisualPreview platform={plat} productData={productData} />
          ) : preview ? (
            <pre className="mono export-preview-pre">{preview}</pre>
          ) : (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              {plat === "Google Shopping" ? "Generating Merchant Center XML feed..." : "Loading raw preview..."}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {exporting && (
        <div style={{ padding: 14, background: "color-mix(in oklab, var(--surface) 70%, transparent)", borderRadius: 12, border: "1px solid var(--border-light)", backdropFilter: "blur(10px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, alignItems: "center" }}>
            <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="typing-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: platMeta.color }} />
              Generating {fmt} for {plat}...
            </span>
            <span className="mono" style={{ color: platMeta.color, fontWeight: 700 }}>{progress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--hover-bg)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, #3B82F6, #7C3AED, ${platMeta.color})`, transition: "width 0.3s ease", boxShadow: `0 0 10px ${platMeta.color}80` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost" style={{ justifyContent: "center", fontSize: 13, padding: 14 }} onClick={handlePreview} disabled={exporting}>
          <Icon name="eye" size={15} /> Preview
        </button>
        <button
          className="btn"
          style={{
            flex: 1, justifyContent: "center", fontSize: 14, padding: 14, fontWeight: 700,
            background: `linear-gradient(135deg, #3B82F6, #7C3AED, ${platMeta.color})`,
            color: "white", border: "none",
            boxShadow: `0 4px 18px ${platMeta.color}55`,
            opacity: (exporting || !canWrite) ? 0.6 : 1,
            cursor: (exporting || !canWrite) ? "not-allowed" : "pointer",
          }}
          onClick={handleExport}
          disabled={exporting || !canWrite}
          title={!canWrite ? "Viewers cannot export products" : ""}
        >
          {exporting ? <><Icon name="refresh" size={15} color="white" /> Generating...</> : <><Icon name="download" size={15} color="white" /> Export to {plat}</>}
        </button>
      </div>

      {/* History */}
      <div style={{ padding: "12px 14px", background: "var(--card-bg)", borderRadius: 12, border: "1px solid var(--border-light)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }} onClick={() => setShowHistory(!showHistory)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="clock" size={12} color="var(--text-dim)" />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em" }}>EXPORT HISTORY</span>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 8, background: "var(--hover-bg)", color: "var(--text-muted)", fontWeight: 700 }}>{history.length}</span>
          </div>
          <Icon name={showHistory ? "chevronDown" : "chevronRight"} size={14} color="var(--text-dim)" />
        </div>
        {showHistory && (
          <>
            {history.length > 0 && (
              <>
                <div className="history-search-wrap">
                  <div className="history-search-input">
                    <Icon name="search" size={12} color="var(--text-dim)" />
                    <input placeholder="Search by product name or barcode..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
                    {historySearch && <button onClick={() => setHistorySearch("")} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}><Icon name="x" size={11} color="var(--text-dim)" /></button>}
                  </div>
                </div>
                {historyPlatforms.length > 1 && (
                  <div className="history-filter-chips" style={{ marginBottom: 10 }}>
                    <button className={`history-filter-chip ${!historyPlatformFilter ? "active" : ""}`} onClick={() => setHistoryPlatformFilter(null)}>All</button>
                    {historyPlatforms.map(p => {
                      const meta = PLATFORMS.find(x => x.name === p);
                      return (
                        <button key={p} className={`history-filter-chip ${historyPlatformFilter === p ? "active" : ""}`} onClick={() => setHistoryPlatformFilter(historyPlatformFilter === p ? null : p)}>
                          {meta && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: meta.color, marginRight: 5, verticalAlign: "middle" }} />}
                          {p}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflow: "auto" }}>
              {history.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 14 }}>No exports yet</div>}
              {history.length > 0 && filteredHistory.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 14 }}>No matching exports</div>
              )}
              {filteredHistory.map(exp => {
                const meta = PLATFORMS.find(p => p.name === exp.platform);
                return (
                  <div key={exp.id} className="export-history-item">
                    {meta && <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${meta.color}, color-mix(in oklab, ${meta.color} 70%, #000))`, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0, boxShadow: `0 2px 6px ${meta.color}40` }}>{meta.iconLetter}</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exp.product_name || exp.barcode}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                        <span>{exp.platform}</span>
                        <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--text-dim)" }} />
                        <span className="mono">{exp.format}</span>
                        <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--text-dim)" }} />
                        <span>{new Date(exp.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => handleRedownload(exp)} title="Download again">
                      <Icon name="download" size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ExportStep;
