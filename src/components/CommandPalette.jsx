import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./shared";
import { toast } from "./Toast";
import BrandOrb from "./BrandOrb";
import { chatSend, chatExecute } from "../api";

const CHIPS = [
  "Show products under $20",
  "What needs attention?",
  "Out-of-stock items",
  "How is my catalog doing?",
  "Find products in Draft",
  "Add a Premium Coffee Mug at $25",
  "Create a tag called Sale",
];

const ROTATING_EXAMPLES = [
  "“Show me everything under $20...”",
  "“Add a product called Red Sneakers at $80...”",
  "“What's my best-selling category?”",
  "“Publish all draft products...”",
  "“Create a tag called Summer...”",
  "“Set stock to 0 for Beauty items...”",
];

const CommandPalette = ({ open, onClose, user, onApplyFilter, onCatalogChanged }) => {
  const canWrite = user?.role === "Admin" || user?.role === "Editor";
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [history, pendingAction]);

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
    setHistory(h => [...h, { role: "user", content: message }]);
    setLoading(true);
    try {
      const result = await chatSend(message, history);
      if (result.type === "filter") {
        setHistory(h => [...h, { role: "assistant", type: "filter", content: result.summary, items: result.items, filter: result.filter }]);
      } else if (result.type === "action") {
        setHistory(h => [...h, { role: "assistant", type: "action-preview", content: result.summary, action: result }]);
        setPendingAction(result);
      } else {
        setHistory(h => [...h, { role: "assistant", type: "text", content: result.message }]);
      }
    } catch (err) {
      setHistory(h => [...h, { role: "assistant", type: "error", content: err?.message || "Something went wrong" }]);
    }
    setLoading(false);
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

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-card" onClick={e => e.stopPropagation()}>
        <div className="palette-blobs" />

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
                {CHIPS.map((c, i) => (
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
              ) : h.type === "filter" ? (
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
            </div>
          ))}

          {loading && (
            <div className="msg-row" style={{ justifyContent: "flex-start" }}>
              <div className="msg-thinking">
                <span className="dot-bounce" />
                <span className="dot-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="dot-bounce" style={{ animationDelay: "0.3s" }} />
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

        <div className="palette-input-row">
          <div className="palette-input-wrap">
            <Icon name="sparkle" size={14} color="var(--text-dim)" />
            <input
              ref={inputRef}
              placeholder="Ask anything about your catalog..."
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
