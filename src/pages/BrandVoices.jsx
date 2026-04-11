import React, { useState, useEffect } from "react";
import { getBrandVoices as apiGetBrandVoices, createBrandVoice as apiCreateBrandVoice, updateBrandVoice as apiUpdateBrandVoice, deleteBrandVoice as apiDeleteBrandVoice } from "../api";
import { Icon, TagInput, ConfirmDialog, InputField, safeJsonParse } from "../components/shared";
import { toast } from "../components/Toast";

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
        const meta = safeJsonParse(v.metadata, {});
        return { id: v.id, name: v.name, tone: v.tone || 'Professional', color: meta.color || '#3B82F6', audience: meta.audience || '', style: meta.style || '', includeKeywords: meta.includeKeywords || [], excludeKeywords: meta.excludeKeywords || [], description: v.description || '', isDefault: !!v.is_default };
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
        const meta = safeJsonParse(created.metadata, metadata);
        setVoices(prev => [...prev, { id: created.id, name: created.name, tone: created.tone, color: meta.color || editorColor, audience: meta.audience || '', style: meta.style || '', includeKeywords: meta.includeKeywords || [], excludeKeywords: meta.excludeKeywords || [], description: created.description || desc, isDefault: !!created.is_default }]);
      } else {
        await apiUpdateBrandVoice(editingVoice.id, { name: editorName, tone: editorTone, description: desc, is_default: editingVoice.isDefault, metadata });
        setVoices(prev => prev.map(x => x.id === editingVoice.id ? { ...x, name: editorName, tone: editorTone, color: editorColor, audience: editorAudience, style: editorStyle, includeKeywords: editorInclude, excludeKeywords: editorExclude, description: desc } : x));
      }
    } catch (err) { toast.error("Failed to save voice: " + err.message); return; }
    setEditingVoice(null); setIsCreating(false);
  };

  const deleteVoice = async (id) => {
    try { await apiDeleteBrandVoice(id); } catch (err) { toast.error("Failed to delete voice"); return; }
    setVoices(prev => prev.filter(v => v.id !== id)); setShowDeleteDialog(null);
  };
  const setDefault = async (id) => {
    try { await apiUpdateBrandVoice(id, { is_default: true }); } catch (err) { toast.error("Failed to set default"); return; }
    setVoices(prev => prev.map(v => ({ ...v, isDefault: v.id === id })));
  };

  // ── EDITOR VIEW ──
  if (editingVoice || isCreating) return (
    <div className="animate-fadeIn" style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-ghost" onClick={() => { setEditingVoice(null); setIsCreating(false); }}><Icon name="arrowLeft" size={14} /> Back</button>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>{isCreating ? "Create Brand Voice" : `Edit: ${editingVoice.name}`}</h3>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Left: Form */}
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <InputField label="Voice Name" placeholder="e.g. Main Store" icon="tag" value={editorName} onChange={e => setEditorName(e.target.value)} />

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, display: "block" }}>Tone</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["Professional", "Friendly", "Luxury", "Custom"].map(t => (
                <div key={t} onClick={() => setEditorTone(t)} style={{
                  flex: 1, padding: "8px 6px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                  border: `1.5px solid ${editorTone === t ? "#3B82F6" : "var(--border)"}`,
                  background: editorTone === t ? "rgba(37,99,235,0.1)" : "transparent", transition: "all 0.2s"
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: editorTone === t ? "#3B82F6" : "var(--text-dim)" }}>{t}</div>
                </div>
              ))}
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

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, display: "block" }}>Voice Color</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6"].map(c => (
                <div key={c} onClick={() => setEditorColor(c)} style={{
                  width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                  border: editorColor === c ? "3px solid var(--text)" : "3px solid transparent", transition: "all 0.2s"
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div>
          <div className="card" style={{ padding: 24, position: "sticky", top: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Icon name="sparkle" size={16} color="#10B981" />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Live Preview</span>
              <span className="badge badge-ai">AI</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 8 }}>SAMPLE PRODUCT DESCRIPTION</div>
            <div style={{ padding: 16, background: "var(--hover-bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
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

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={() => { setEditingVoice(null); setIsCreating(false); }}>Cancel</button>
        <button className="btn btn-success" onClick={saveVoice} disabled={!editorName.trim()}><Icon name="check" size={14} /> {isCreating ? "Create Voice" : "Save Changes"}</button>
      </div>
    </div>
  );

  // ── LIST VIEW ──
  return (
    <div className="animate-fadeIn" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>Brand Voice Profiles</h3>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>Manage tone and vocabulary presets for AI-generated descriptions</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={openCreateNew}><Icon name="plus" size={14} /> New Voice</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {voices.map((voice, i) => (
          <div key={voice.id} className="card animate-slideUp" style={{ cursor: canEdit ? "pointer" : "default", animationDelay: `${i * 0.06}s`, padding: 18, borderLeft: `3px solid ${voice.color}` }}
            onClick={() => canEdit && openEditor(voice)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{voice.name}</span>
              {voice.isDefault && <span className="badge badge-success" style={{ fontSize: 10, padding: "2px 7px" }}>Default</span>}
            </div>
            <span className="badge badge-primary" style={{ marginBottom: 8, fontSize: 10, padding: "2px 8px" }}>{voice.tone}</span>
            {voice.description && <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 10 }}>{voice.description}</p>}
            {canEdit && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: "auto" }}>
                {!voice.isDefault && <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={e => { e.stopPropagation(); setDefault(voice.id); }}>Set Default</button>}
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 6px", marginLeft: "auto" }} onClick={e => { e.stopPropagation(); setShowDeleteDialog(voice.id); }}>
                  <Icon name="trash" size={12} color="#EF4444" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {voices.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{width:64,height:64,borderRadius:16,background:"rgba(139,92,246,0.08)",border:"1px solid rgba(139,92,246,0.15)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
            <Icon name="tag" size={28} color="#8B5CF6" />
          </div>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No Brand Voices</h3>
          <p style={{ color: "var(--text-dim)", fontSize: 13, maxWidth: 300, margin: "0 auto", lineHeight: 1.5 }}>Create your first voice profile to customize AI-generated descriptions</p>
          {canEdit && <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={openCreateNew}><Icon name="plus" size={14} /> Create Voice</button>}
        </div>
      )}

      {showDeleteDialog && <ConfirmDialog title="Delete Brand Voice" message="This will permanently delete this brand voice profile. Any products using this voice will need a new voice assigned."
        confirmLabel="Delete Voice" confirmColor="#EF4444" onCancel={() => setShowDeleteDialog(null)} onConfirm={() => deleteVoice(showDeleteDialog)} />}
    </div>
  );
};

export default BrandVoices;
