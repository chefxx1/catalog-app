import React, { useState, useEffect } from "react";
import { getBrandVoices as apiGetBrandVoices, createBrandVoice as apiCreateBrandVoice, updateBrandVoice as apiUpdateBrandVoice, deleteBrandVoice as apiDeleteBrandVoice } from "../api";
import { Icon, TagInput, ConfirmDialog, InputField, safeJsonParse } from "../components/shared";
import { toast } from "../components/Toast";

const TONE_DESC = {
  Professional: "Precise · data-driven",
  Friendly: "Warm · conversational",
  Luxury: "Elevated · aspirational",
  Custom: "Your own rules",
};

const getExamplePreview = (tone) => {
  const previews = {
    Professional: "The Sony WH-1000XM5 redefines premium audio with industry-leading noise cancellation technology. Featuring dual processors and eight-microphone array, these headphones deliver exceptional acoustic performance for the discerning audiophile. With up to 30 hours of battery life and multi-point connectivity, they seamlessly integrate into any professional workflow.",
    Friendly: "Say goodbye to distractions with Sony's amazing WH-1000XM5! These headphones are like having your own personal sound bubble \u2014 crazy good noise cancellation keeps the world out while crystal-clear audio pulls you in. Plus, they're super comfy for all-day wear!",
    Luxury: "Transcend the ordinary with the Sony WH-1000XM5 \u2014 an opus of acoustic engineering that sets the benchmark for wireless audio excellence. Meticulously crafted for those who demand nothing less than perfection, these headphones envelop you in an intimate soundstage.",
    Custom: "High-performance wireless headphones with advanced noise cancellation. Features 30-hour battery life, multi-point connectivity, and premium build quality. Available in multiple colors."
  };
  return previews[tone] || previews.Custom;
};

const BrandVoices = ({ user }) => {
  const canEdit = user.role === "Admin" || user.role === "Editor";
  const [voices, setVoices] = useState([]);
  const [editingVoice, setEditingVoice] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(null);
  const [voicesLoading, setVoicesLoading] = useState(true);

  // Load voices on mount
  useEffect(() => {
    apiGetBrandVoices().then(dbVoices => {
      setVoices(dbVoices.map(v => {
        const meta = safeJsonParse(v.metadata, {}) || {};
        return { id: v.id, name: v.name, tone: v.tone || 'Professional', color: meta.color || '#3B82F6', audience: meta.audience || '', style: meta.style || '', includeKeywords: meta.includeKeywords || [], excludeKeywords: meta.excludeKeywords || [], description: v.description || '', isDefault: !!v.is_default, ownerId: v.user_id };
      }));
      setVoicesLoading(false);
    }).catch(() => { setVoicesLoading(false); toast.error("Failed to load brand voices"); });
  }, []);

  // Editor state
  const [editorName, setEditorName] = useState("");
  const [editorTone, setEditorTone] = useState("Professional");
  const [editorAudience, setEditorAudience] = useState("");
  const [editorStyle, setEditorStyle] = useState("");
  const [editorInclude, setEditorInclude] = useState([]);
  const [editorExclude, setEditorExclude] = useState([]);
  const [editorColor, setEditorColor] = useState("#3B82F6");

  const openEditor = (voice) => {
    setEditorName(voice.name); setEditorTone(voice.tone); setEditorAudience(voice.audience);
    setEditorStyle(voice.style); setEditorInclude([...voice.includeKeywords]); setEditorExclude([...voice.excludeKeywords]);
    setEditorColor(voice.color); setEditingVoice(voice); setIsCreating(false);
  };

  const openCreateNew = () => {
    setEditorName(""); setEditorTone("Professional"); setEditorAudience(""); setEditorStyle("");
    setEditorInclude([]); setEditorExclude([]); setEditorColor("#3B82F6"); setEditingVoice(null); setIsCreating(true);
  };

  const saveVoice = async () => {
    const desc = editorStyle.slice(0, 80) + (editorStyle.length > 80 ? "..." : "");
    const metadata = { audience: editorAudience, style: editorStyle, includeKeywords: editorInclude, excludeKeywords: editorExclude, color: editorColor };
    try {
      if (isCreating) {
        const created = await apiCreateBrandVoice({ name: editorName, tone: editorTone, description: desc, is_default: false, metadata });
        const meta = safeJsonParse(created.metadata, metadata) || metadata;
        // ownerId must be set so the creator can immediately edit/delete their
        // own voice — without it, isOwner is false and the new card wrongly
        // shows "Shared by teammate · view-only" until a reload.
        setVoices(prev => [...prev, { id: created.id, name: created.name, tone: created.tone, color: meta.color || editorColor, audience: meta.audience || '', style: meta.style || '', includeKeywords: meta.includeKeywords || [], excludeKeywords: meta.excludeKeywords || [], description: created.description || desc, isDefault: !!created.is_default, ownerId: created.user_id ?? user.id }]);
      } else {
        await apiUpdateBrandVoice(editingVoice.id, { name: editorName, tone: editorTone, description: desc, is_default: editingVoice.isDefault, metadata });
        setVoices(prev => prev.map(x => x.id === editingVoice.id ? { ...x, name: editorName, tone: editorTone, color: editorColor, audience: editorAudience, style: editorStyle, includeKeywords: editorInclude, excludeKeywords: editorExclude, description: desc } : x));
      }
    } catch (err) { toast.error("Failed to save voice: " + err.message); return; }
    setEditingVoice(null); setIsCreating(false);
  };

  const deleteVoice = async (id) => {
    try { await apiDeleteBrandVoice(id); } catch (err) { toast.error("Failed to delete voice"); return; }
    setVoices(prev => prev.filter(v => v.id !== id));
    setShowDeleteDialog(null);
    toast.success("Voice deleted");
  };
  const setDefault = async (id) => {
    try { await apiUpdateBrandVoice(id, { is_default: true }); } catch (err) { toast.error("Failed to set default"); return; }
    setVoices(prev => prev.map(v => ({ ...v, isDefault: v.id === id })));
    toast.success("Default voice updated");
  };

  // ── EDITOR VIEW ──
  if (editingVoice || isCreating) return (
    <div className="animate-fadeIn" style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button className="btn btn-ghost" onClick={() => { setEditingVoice(null); setIsCreating(false); }}><Icon name="arrowLeft" size={14} /> Back</button>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
            <span style={{ background: "linear-gradient(135deg,#3B82F6,#8B5CF6,#EC4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{isCreating ? "Create" : "Edit"}</span> {isCreating ? "Brand Voice" : editingVoice.name}
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3 }}>Define a tone, audience, and vocabulary the AI follows on every description.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Left: Form */}
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <InputField label="Voice Name" placeholder="e.g. Main Store" icon="tag" value={editorName} onChange={e => setEditorName(e.target.value)} />

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, display: "block" }}>Voice Color</label>
            <div style={{ display: "flex", gap: 10 }}>
              {["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6"].map(c => (
                <div key={c} onClick={() => setEditorColor(c)} title={c} style={{
                  width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: editorColor === c ? `0 0 0 2px var(--card-bg), 0 0 0 4px ${c}` : "none",
                  transition: "all 0.15s",
                }}>
                  {editorColor === c && <Icon name="check" size={14} color="white" />}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, display: "block" }}>Tone</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["Professional", "Friendly", "Luxury", "Custom"].map(t => {
                const active = editorTone === t;
                return (
                  <div key={t} onClick={() => setEditorTone(t)} style={{
                    flex: 1, padding: "9px 6px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                    border: `1.5px solid ${active ? editorColor : "var(--border)"}`,
                    background: active ? `color-mix(in oklab, ${editorColor} 12%, transparent)` : "transparent",
                    transition: "all 0.18s",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: active ? editorColor : "var(--text-dim)" }}>{t}</div>
                    <div style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: "0.02em", color: active ? `color-mix(in oklab, ${editorColor} 75%, var(--text-dim))` : "var(--text-dim)", marginTop: 2, opacity: active ? 1 : 0.6 }}>{TONE_DESC[t]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <InputField label="Target Audience" placeholder="e.g. B2B buyers, 25-45 age range" icon="user" value={editorAudience} onChange={e => setEditorAudience(e.target.value)} />

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5, display: "block" }}>Writing Style</label>
            <textarea className="input" placeholder="Describe the writing style, vocabulary, and tone..." value={editorStyle} onChange={e => setEditorStyle(e.target.value)} rows={4} style={{ resize: "vertical", minHeight: 80 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5, display: "block" }}>Keywords to Include</label>
              <TagInput tags={editorInclude} onTagsChange={setEditorInclude} placeholder="Type + Enter..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5, display: "block" }}>Keywords to Avoid</label>
              <TagInput tags={editorExclude} onTagsChange={setEditorExclude} placeholder="Type + Enter..." />
            </div>
          </div>

        </div>

        {/* Right: Preview */}
        <div>
          <div className="card" style={{ padding: 0, position: "sticky", top: 20, overflow: "hidden", borderTop: `3px solid ${editorColor}` }}>
            <div style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Icon name="sparkle" size={16} color={editorColor} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Live Preview</span>
              <span className="badge badge-ai">AI</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 8 }}>SAMPLE PRODUCT DESCRIPTION</div>
            <div style={{ padding: 16, background: `color-mix(in oklab, ${editorColor} 5%, var(--hover-bg))`, borderRadius: 8, border: `1px solid color-mix(in oklab, ${editorColor} 20%, var(--border))` }}>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-sec)" }}>{getExamplePreview(editorTone)}</p>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: editorColor }} />
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{editorName || "Untitled"} / {editorTone}</span>
            </div>

            {editorInclude.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 6 }}>INCLUDE KEYWORDS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {editorInclude.map((k, i) => <span key={i} style={{ padding: "2px 8px", background: "rgba(16,185,129,0.15)", borderRadius: 12, fontSize: 11, color: "#34D399" }}>{k}</span>)}
                </div>
              </div>
            )}
            {editorExclude.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 6 }}>AVOID KEYWORDS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {editorExclude.map((k, i) => <span key={i} style={{ padding: "2px 8px", background: "rgba(239,68,68,0.15)", borderRadius: 12, fontSize: 11, color: "#FCA5A5" }}>{k}</span>)}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={() => { setEditingVoice(null); setIsCreating(false); }}>Cancel</button>
        <button className="btn" onClick={saveVoice} disabled={!editorName.trim()} style={{
          padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "white", border: "none",
          background: editorName.trim() ? `linear-gradient(135deg, ${editorColor}, color-mix(in oklab, ${editorColor} 65%, #000))` : "var(--border)",
          boxShadow: editorName.trim() ? `0 4px 16px color-mix(in oklab, ${editorColor} 38%, transparent)` : "none",
          cursor: editorName.trim() ? "pointer" : "not-allowed",
          opacity: editorName.trim() ? 1 : 0.6, transition: "all 0.18s",
        }}><Icon name="check" size={14} color="white" /> {isCreating ? "Create Voice" : "Save Changes"}</button>
      </div>
    </div>
  );

  // ── LIST VIEW ──
  return (
    <div className="animate-fadeIn" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>
            <span style={{ background: "linear-gradient(135deg,#3B82F6,#8B5CF6,#EC4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Brand Voices</span>
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Tone, vocabulary, and style presets that shape every AI-generated description.
            {voices.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 9px", borderRadius: 999, background: "var(--hover-bg)", color: "var(--text-muted)", fontWeight: 600 }}>{voices.length} {voices.length === 1 ? "voice" : "voices"}</span>}
          </p>
        </div>
        {canEdit && (
          <button className="btn" onClick={openCreateNew} style={{
            padding: "9px 16px", fontSize: 13, fontWeight: 700,
            background: "linear-gradient(135deg,#3B82F6,#8B5CF6,#EC4899)",
            color: "white", border: "none",
            boxShadow: "0 4px 16px rgba(139,92,246,0.32)",
            transition: "all 0.18s",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(139,92,246,0.45)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(139,92,246,0.32)"; }}>
            <Icon name="plus" size={14} color="white" /> New Voice
          </button>
        )}
      </div>

      {voicesLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-card" style={{ height: 200 }} />
          ))}
        </div>
      ) : voices.length === 0 ? (
        <div className="card" style={{ position: "relative", textAlign: "center", padding: 48, overflow: "hidden" }}>
          <div className="modal-modern-blobs" style={{ borderRadius: "inherit" }} />
          <div style={{ position: "relative" }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12), rgba(236,72,153,0.12))", border: "1px solid rgba(139,92,246,0.25)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Icon name="tag" size={28} color="#8B5CF6" />
            </div>
            <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No Brand Voices Yet</h3>
            <p style={{ color: "var(--text-dim)", fontSize: 13, maxWidth: 320, margin: "0 auto", lineHeight: 1.5 }}>Create your first voice profile to give every AI description a consistent tone and vocabulary.</p>
            {canEdit && <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={openCreateNew}><Icon name="plus" size={14} /> Create Your First Voice</button>}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
          {voices.map((voice, i) => {
            const c = voice.color;
            const totalKw = (voice.includeKeywords?.length || 0) + (voice.excludeKeywords?.length || 0);
            const isOwner = voice.ownerId === user.id;
            const canModify = canEdit && isOwner;
            return (
              <div key={voice.id} className="animate-slideUp"
                style={{
                  position: "relative", borderRadius: 14, overflow: "hidden",
                  background: "var(--card-bg)",
                  border: "1px solid var(--border-light)",
                  backdropFilter: "blur(10px)",
                  cursor: canModify ? "pointer" : "default",
                  animationDelay: `${i * 0.05}s`,
                  display: "flex", flexDirection: "column",
                  transition: "transform 0.22s cubic-bezier(0.16,1,0.3,1), box-shadow 0.22s, border-color 0.22s",
                }}
                onClick={() => canModify && openEditor(voice)}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow = `0 14px 32px color-mix(in oklab, ${c} 22%, transparent)`;
                  e.currentTarget.style.borderColor = `color-mix(in oklab, ${c} 50%, var(--border-light))`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor = "var(--border-light)";
                }}>
                {/* Color gradient header strip */}
                <div style={{ position: "relative", height: 64, background: `linear-gradient(135deg, ${c}33, ${c}11)`, borderBottom: `1px solid color-mix(in oklab, ${c} 18%, var(--border-light))`, overflow: "hidden" }}>
                  {/* Decorative blob */}
                  <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: `radial-gradient(circle, ${c}55, transparent 70%)`, filter: "blur(20px)" }} />
                  {/* Voice initial badge */}
                  <div style={{
                    position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                    width: 38, height: 38, borderRadius: 11,
                    background: `linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 60%, #000))`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 16, color: "white",
                    boxShadow: `0 3px 12px ${c}66`,
                    fontFamily: "'Sora',sans-serif",
                  }}>
                    {(voice.name || "V")[0].toUpperCase()}
                  </div>
                  {voice.isDefault && (
                    <div style={{
                      position: "absolute", top: 10, right: 10, padding: "3px 9px", borderRadius: 999,
                      background: "rgba(16,185,129,0.95)", color: "white",
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                      display: "inline-flex", alignItems: "center", gap: 4,
                      boxShadow: "0 2px 8px rgba(16,185,129,0.4)",
                    }}>
                      <Icon name="check" size={10} color="white" /> DEFAULT
                    </div>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", marginBottom: 4 }}>{voice.name}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 999, background: `${c}1a`, color: c, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em" }}>
                        <Icon name="sparkle" size={9} color={c} />
                        {voice.tone}
                      </span>
                      {totalKw > 0 && (
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "var(--hover-bg)", color: "var(--text-muted)", fontSize: 10.5, fontWeight: 600 }}>
                          {totalKw} keyword{totalKw === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  {voice.description ? (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{voice.description}</p>
                  ) : voice.audience ? (
                    <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>For: {voice.audience}</p>
                  ) : null}

                  {/* Sample keywords inline */}
                  {voice.includeKeywords?.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {voice.includeKeywords.slice(0, 4).map((k, idx) => (
                        <span key={idx} style={{ padding: "1.5px 7px", borderRadius: 6, background: "rgba(16,185,129,0.1)", color: "#10B981", fontSize: 10, fontWeight: 600 }}>+ {k}</span>
                      ))}
                      {voice.includeKeywords.length > 4 && (
                        <span style={{ padding: "1.5px 7px", borderRadius: 6, background: "var(--hover-bg)", color: "var(--text-dim)", fontSize: 10, fontWeight: 600 }}>+{voice.includeKeywords.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {canModify ? (
                    <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", gap: 6, alignItems: "center", borderTop: "1px solid var(--border-light)" }}>
                      {!voice.isDefault ? (
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }}
                          onClick={e => { e.stopPropagation(); setDefault(voice.id); }}>
                          <Icon name="check" size={11} /> Set Default
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Active default</span>
                      )}
                      <button className="btn btn-ghost" title="Edit" style={{ fontSize: 11, padding: "4px 8px", marginLeft: "auto" }}
                        onClick={e => { e.stopPropagation(); openEditor(voice); }}>
                        <Icon name="edit" size={11} />
                      </button>
                      <button className="btn btn-ghost" title="Delete" style={{ fontSize: 11, padding: "4px 8px" }}
                        onClick={e => { e.stopPropagation(); setShowDeleteDialog(voice.id); }}>
                        <Icon name="trash" size={11} color="#EF4444" />
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: "auto", paddingTop: 8, fontSize: 11, color: "var(--text-dim)", fontWeight: 500, borderTop: "1px solid var(--border-light)" }}>
                      Shared by teammate · view-only
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showDeleteDialog && <ConfirmDialog title="Delete Brand Voice" message="This will permanently delete this brand voice profile. Any products using this voice will need a new voice assigned."
        confirmLabel="Delete Voice" confirmColor="#EF4444" onCancel={() => setShowDeleteDialog(null)} onConfirm={() => deleteVoice(showDeleteDialog)} />}
    </div>
  );
};

export default BrandVoices;
