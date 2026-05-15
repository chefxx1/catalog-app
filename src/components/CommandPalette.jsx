import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./shared";
import { toast } from "./Toast";
import BrandOrb from "./BrandOrb";
import { chatSend, chatExecute, chatSuggestions } from "../api";

// Server route → App.jsx view name
const ROUTE_TO_VIEW = {
  "/": "dashboard", "/dashboard": "dashboard",
  "/catalog": "catalog", "/search": "catalog",
  "/trending": "trending", "/analytics": "analytics",
  "/brand-voices": "voices", "/settings": "settings",
};

const FALLBACK_CHIPS = [
  "How is my catalog doing?",
  "What needs attention?",
  "What can you do?",
];

const ROTATING_EXAMPLES = [
  "“Show me everything under $20...”",
  "“What's running low on stock?”",
  "“Category breakdown”",
  "“Open the analytics page”",
  "“Publish all draft products...”",
  "“How do exports work?”",
  "“Create a tag called Summer...”",
];

const CommandPalette = ({ open, onClose, user, onApplyFilter, onCatalogChanged, onNavigate }) => {
  const canWrite = user?.role === "Admin" || user?.role === "Editor";
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [chips, setChips] = useState(FALLBACK_CHIPS);
  const [pinned, setPinned] = useState([]); // products dragged into chat
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [history, pendingAction]);

  // Load dynamic suggestion chips when the palette opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    chatSuggestions().then(r => { if (!cancelled && r?.chips?.length) setChips(r.chips); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // Rotating example queries — only when empty
  useEffect(() => {
    if (!open || history.length > 0) return;
    const interval = setInterval(() => setExampleIdx(i => (i + 1) % ROTATING_EXAMPLES.length), 3200);
    return () => clearInterval(interval);
  }, [open, history.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput("");
    // Render the user message with pinned chips inline (UX) — server sees the
    // pinned IDs separately so it can fetch real product context.
    const displayMessage = pinned.length > 0
      ? `${message} — context: ${pinned.map(p => p.name).join(", ")}`
      : message;
    setHistory(h => [...h, { role: "user", content: displayMessage }]);
    setLoading(true);
    try {
      const result = await chatSend(message, history, { pinned: pinned.map(p => ({ id: p.id, product_id: p.product_id, name: p.name })) });
      if (result.type === "filter") {
        setHistory(h => [...h, { role: "assistant", type: "filter", content: result.summary, items: result.items, filter: result.filter }]);
      } else if (result.type === "action") {
        setHistory(h => [...h, { role: "assistant", type: "action-preview", content: result.summary, action: result }]);
        setPendingAction(result);
      } else if (result.type === "analyze") {
        setHistory(h => [...h, { role: "assistant", type: "analyze", content: result.summary, insight: result.insight }]);
      } else if (result.type === "navigate") {
        setHistory(h => [...h, { role: "assistant", type: "navigate", content: result.summary, route: result.route, label: result.label }]);
      } else if (result.type === "help") {
        setHistory(h => [...h, { role: "assistant", type: "help", content: result.summary, help: result.content }]);
      } else {
        setHistory(h => [...h, { role: "assistant", type: "text", content: result.message }]);
      }
    } catch (err) {
      setHistory(h => [...h, { role: "assistant", type: "error", content: err?.message || "Something went wrong" }]);
    }
    setLoading(false);
  };

  const goRoute = (route) => {
    const view = ROUTE_TO_VIEW[route];
    if (view && onNavigate) { onNavigate(view); onClose(); }
    else toast.error(`Don't know how to open ${route}`);
  };

  // Plain-text summary of a message for the Copy hover action
  const messageToText = (h) => {
    if (h.type === "filter") return `${h.content}\n${(h.items || []).map(it => `• ${it.custom_name || it.name}${it.custom_price ? ` ($${it.custom_price})` : ""}`).join("\n")}`;
    if (h.type === "analyze") {
      if (h.insight?.kind === "breakdown") return `${h.content}\n${h.insight.rows.map(r => `• ${r.label}: ${r.value} (${r.pct}%)`).join("\n")}`;
      return `${h.content}\n${(h.insight?.metrics || []).map(m => `• ${m.label}: ${m.value}`).join("\n")}`;
    }
    if (h.type === "help") return `${h.help?.title || h.content}\n${(h.help?.points || []).map(p => `• ${p}`).join("\n")}`;
    if (h.type === "navigate") return `${h.content} (${h.route})`;
    return h.content || "";
  };
  const copyMessage = (h) => {
    try { navigator.clipboard.writeText(messageToText(h)); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  // Re-fire the last user message as a new turn
  const regenerateLast = () => {
    const lastUser = [...history].reverse().find(h => h.role === "user");
    if (!lastUser || loading) return;
    send(lastUser.content);
  };

  const confirmAction = async () => {
    if (!pendingAction || !canWrite) return;
    setExecuting(true);
    try {
      const result = await chatExecute({ action: pendingAction.action, filter: pendingAction.filter, change: pendingAction.change });
      const isCreate = pendingAction.action === "create_product" || pendingAction.action === "create_tag";
      const noun = pendingAction.action === "create_tag" ? "tag" : "product";
      const verb = isCreate ? "created" : "updated";
      setHistory(h => [...h, { role: "assistant", type: "success", content: `${result.affected} ${result.affected === 1 ? noun : noun + "s"} ${verb}` }]);
      toast.success(`${result.affected} ${noun}${result.affected === 1 ? "" : "s"} ${verb}`);
      setPendingAction(null);
      onCatalogChanged?.();
    } catch (err) { toast.error(err?.message || "Action failed"); }
    setExecuting(false);
  };

  const cancelAction = () => {
    setPendingAction(null);
    setHistory(h => [...h, { role: "assistant", type: "text", content: "Cancelled." }]);
  };

  const reset = () => { setHistory([]); setPendingAction(null); setInput(""); };

  // Drop-zone handlers for drag-product-into-chat
  const onDropProducts = (e) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const raw = e.dataTransfer.getData("application/x-catalogai-product");
      if (!raw) return;
      const incoming = JSON.parse(raw);
      if (!Array.isArray(incoming)) return;
      setPinned(prev => {
        const seen = new Set(prev.map(p => p.id));
        const merged = [...prev];
        incoming.forEach(p => { if (p?.id && !seen.has(p.id)) { merged.push(p); seen.add(p.id); } });
        return merged;
      });
      const added = incoming.length;
      if (added > 0) toast.success(`Pinned ${added} product${added === 1 ? "" : "s"} to context`);
      setTimeout(() => inputRef.current?.focus(), 60);
    } catch {}
  };
  const onDragOverPalette = (e) => {
    if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes("application/x-catalogai-product")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!dragOver) setDragOver(true);
    }
  };
  const onDragLeavePalette = (e) => {
    // Only clear if we actually left the card, not when crossing inner elements
    if (e.currentTarget === e.target) setDragOver(false);
  };
  const removePinned = (id) => setPinned(p => p.filter(x => x.id !== id));
  const clearPinned = () => setPinned([]);

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className={`palette-card ${dragOver ? "drop-active" : ""}`}
        onClick={e => e.stopPropagation()}
        onDragOver={onDragOverPalette}
        onDragLeave={onDragLeavePalette}
        onDrop={onDropProducts}
      >
        <div className="palette-blobs" />
        {dragOver && (
          <div className="palette-drop-overlay">
            <div className="palette-drop-inner">
              <Icon name="plus" size={20} color="#A78BFA" />
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>Drop to pin as context</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>Then ask me anything about these products</div>
            </div>
          </div>
        )}

        <div className="palette-header">
          <div className="palette-header-title">
            <span className="status-dot" />
            <span>Catalog Assistant</span>
            <span style={{ color: "var(--text-dim)", fontWeight: 500, fontSize: 11 }}>· Llama 3.3</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {history.length > 0 && (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={reset} title="New chat">
                <Icon name="plus" size={11} /> New
              </button>
            )}
            <kbd className="palette-kbd">Esc</kbd>
          </div>
        </div>

        <div ref={scrollRef} className="palette-body">
          {history.length === 0 && (
            <>
              <div className="palette-hero">
                <BrandOrb size="lg" floating />
                <div>
                  <div className="palette-hero-title">Ask your catalog</div>
                  <div className="palette-hero-subtitle">
                    <span key={exampleIdx} className="example-rotate" style={{ animation: "exampleFade 3.2s ease-in-out" }}>
                      {ROTATING_EXAMPLES[exampleIdx]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="palette-chips">
                {chips.map((c, i) => (
                  <button key={i} onClick={() => send(c)} className="palette-chip">
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}

          {history.map((h, i) => (
            <div key={i} className="msg-row" style={{ justifyContent: h.role === "user" ? "flex-end" : "flex-start" }}>
              {h.role === "user" ? (
                <div className="msg-user">{h.content}</div>
              ) : (
                <>
                  <div className="msg-avatar" />
                  <div className="msg-content">
                    {h.type === "filter" ? (
                <div className="msg-card">
                  <div className="msg-card-summary">{h.content}</div>
                  {h.items.length === 0 ? (
                    <div className="msg-empty">No products matched.</div>
                  ) : (
                    <>
                      <div className="msg-list">
                        {h.items.slice(0, 8).map((it, j) => (
                          <div key={j} className="msg-item">
                            {it.image ? (
                              <img src={it.image} loading="lazy" onError={e => { e.target.style.display = "none"; e.target.nextSibling && (e.target.nextSibling.style.display = "flex"); }} />
                            ) : null}
                            <div className="msg-item-thumb-fallback" style={{ display: it.image ? "none" : "flex" }}>
                              <Icon name="package" size={13} color="var(--text-dim)" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.custom_name || it.name}</div>
                              <div style={{ fontSize: 10.5, color: "var(--text-dim)", display: "flex", gap: 8, marginTop: 2, alignItems: "center" }}>
                                {it.custom_price && <span>${it.custom_price}</span>}
                                {it.stock_quantity != null && <span>· {it.stock_quantity} in stock</span>}
                                {it.status && <span className={`pill-status pill-${it.status?.toLowerCase()}`}>{it.status}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="msg-card-footer">
                        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {h.items.length} {h.items.length === 1 ? "result" : "results"}{h.items.length > 8 ? ` · showing first 8` : ""}
                        </span>
                        {onApplyFilter && (
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => { onApplyFilter(h.filter); onClose(); }}>
                            <Icon name="search" size={11} /> Open in Catalog
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : h.type === "action-preview" ? (
                <div className="msg-action">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span className="action-badge">CONFIRM</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>{h.content}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Will affect <strong style={{ color: "#F59E0B" }}>{h.action.affected}</strong> {h.action.affected === 1 ? "product" : "products"}
                  </div>
                  {h.action.preview?.length > 0 && (
                    <div className="action-preview-list">
                      {h.action.preview.slice(0, 5).map((it, j) => (
                        <div key={j} className="action-preview-item">
                          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#F59E0B" }} />
                          <span>{it.custom_name || it.name}</span>
                          {it.status && <span style={{ color: "var(--text-dim)" }}>· {it.status}</span>}
                        </div>
                      ))}
                      {h.action.affected > 5 && (
                        <div className="action-preview-item" style={{ fontStyle: "italic", color: "var(--text-dim)" }}>
                          + {h.action.affected - 5} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : h.type === "analyze" ? (
                <div className="msg-card">
                  <div className="msg-card-summary">{h.content}</div>
                  {h.insight?.kind === "breakdown" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 2px" }}>
                      {h.insight.rows.map((r, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontSize: 12, color: "var(--text)", minWidth: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                          <div style={{ flex: 1, height: 6, background: "var(--card-bg-alt, rgba(255,255,255,0.05))", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${r.pct}%`, height: "100%", background: "linear-gradient(90deg, #3B82F6, #A78BFA)" }} />
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", minWidth: 56, textAlign: "right" }}>{r.value} · {r.pct}%</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                      {h.insight?.metrics?.map((m, j) => (
                        <div key={j} style={{ padding: "10px 12px", background: "var(--card-bg-alt, rgba(255,255,255,0.03))", border: "1px solid var(--border, rgba(255,255,255,0.06))", borderRadius: 8 }}>
                          <div style={{ fontSize: 10.5, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{m.label}</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: m.tone === "warn" ? "#F59E0B" : "var(--text)" }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : h.type === "navigate" ? (
                <div className="msg-card" style={{ cursor: "pointer" }} onClick={() => goRoute(h.route)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #3B82F6, #A78BFA)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="chevronRight" size={14} color="white" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{h.content}</div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Click to open {h.label}</div>
                    </div>
                  </div>
                </div>
              ) : h.type === "help" ? (
                <div className="msg-card">
                  <div className="msg-card-summary">{h.help?.title || h.content}</div>
                  <ul style={{ margin: 0, padding: "4px 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {(h.help?.points || []).map((p, j) => (
                      <li key={j} style={{ fontSize: 12.5, color: "var(--text-sec)", lineHeight: 1.5 }}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : h.type === "success" ? (
                <div className="msg-success">
                  <Icon name="check" size={12} color="#10B981" />
                  <span>{h.content}</span>
                </div>
              ) : h.type === "error" ? (
                <div className="msg-error">{h.content}</div>
              ) : (
                <div className="msg-assistant">{h.content}</div>
              )}
                    {h.type !== "success" && h.type !== "error" && (
                      <div className="msg-actions">
                        <button className="msg-action-btn" onClick={() => copyMessage(h)} title="Copy">
                          <Icon name="copy" size={11} />
                        </button>
                        {i === history.length - 1 && (
                          <button className="msg-action-btn" onClick={regenerateLast} disabled={loading} title="Regenerate">
                            <Icon name="refresh" size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {loading && (
            <div className="msg-row" style={{ justifyContent: "flex-start", alignItems: "center" }}>
              <div className="msg-avatar thinking" />
              <div className="msg-thinking">
                <span className="dot-bounce" />
                <span className="dot-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="dot-bounce" style={{ animationDelay: "0.3s" }} />
                <span className="msg-thinking-label">Thinking…</span>
              </div>
            </div>
          )}
        </div>

        {pendingAction && (
          <div className="palette-action-bar">
            <div style={{ flex: 1, fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="warning" size={12} color="#F59E0B" /> Review and confirm to apply
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={cancelAction} disabled={executing}>Cancel</button>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 16px" }} onClick={confirmAction} disabled={executing || !canWrite} title={!canWrite ? "Viewers cannot run actions" : ""}>
              {executing ? "Running..." : <><Icon name="check" size={11} /> Apply ({pendingAction.affected})</>}
            </button>
          </div>
        )}

        {pinned.length > 0 && (
          <div className="palette-pinned-row">
            <div className="palette-pinned-label">
              <Icon name="tag" size={11} color="#A78BFA" />
              <span>{pinned.length === 1 ? "1 product pinned" : `${pinned.length} products pinned · bulk mode`}</span>
              <button className="palette-pinned-clear" onClick={clearPinned} title="Clear all">Clear</button>
            </div>
            <div className="palette-pinned-chips">
              {pinned.slice(0, 8).map(p => (
                <div key={p.id} className="palette-pinned-chip">
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{p.name}</span>
                  <button onClick={() => removePinned(p.id)} title="Remove" className="palette-pinned-chip-x">×</button>
                </div>
              ))}
              {pinned.length > 8 && <span style={{ fontSize: 11, color: "var(--text-dim)", padding: "0 4px" }}>+ {pinned.length - 8} more</span>}
            </div>
          </div>
        )}

        <div className="palette-input-row">
          <div className="palette-input-wrap">
            <Icon name="sparkle" size={14} color="var(--text-dim)" />
            <input
              ref={inputRef}
              placeholder={pinned.length > 0 ? `Ask about ${pinned.length === 1 ? "this product" : "these products"}...` : "Ask anything about your catalog..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={loading}
            />
            <button className="palette-send" onClick={() => send()} disabled={loading || !input.trim()} title="Send">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="palette-footer">
          <kbd>↵</kbd> to send · <kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
