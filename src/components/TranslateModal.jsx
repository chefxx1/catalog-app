import React, { useEffect, useState } from "react";
import { Icon } from "./shared";
import { toast } from "./Toast";
import { translateProduct, listProductTranslations, deleteProductTranslation } from "../api";

const LANGUAGES = [
  { code: "Arabic",     flag: "🇸🇦", rtl: true },
  { code: "French",     flag: "🇫🇷" },
  { code: "Spanish",    flag: "🇪🇸" },
  { code: "German",     flag: "🇩🇪" },
  { code: "Italian",    flag: "🇮🇹" },
  { code: "Portuguese", flag: "🇵🇹" },
  { code: "Turkish",    flag: "🇹🇷" },
  { code: "Chinese",    flag: "🇨🇳" },
  { code: "Japanese",   flag: "🇯🇵" },
  { code: "English",    flag: "🇬🇧" },
];

const TranslateModal = ({ entry, onClose, canEdit }) => {
  const [selectedLang, setSelectedLang] = useState(null);
  const [translation, setTranslation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    if (!entry) return;
    listProductTranslations(entry.id).then(r => setSaved(r.translations || [])).catch(() => {});
  }, [entry]);

  const onPickLanguage = async (language, { force = false } = {}) => {
    setSelectedLang(language);
    setTranslation(null);
    setLoading(true);
    try {
      const result = await translateProduct(entry.id, language, { force });
      setTranslation(result);
      if (!force) {
        // refresh saved list
        const r = await listProductTranslations(entry.id);
        setSaved(r.translations || []);
      }
    } catch (err) {
      toast.error(err.message || "Translation failed");
    }
    setLoading(false);
  };

  const onDelete = async (language) => {
    try {
      await deleteProductTranslation(entry.id, language);
      setSaved(s => s.filter(t => t.language !== language));
      if (selectedLang === language) { setSelectedLang(null); setTranslation(null); }
      toast.success(`${language} translation removed`);
    } catch (err) { toast.error(err.message); }
  };

  const copyAll = () => {
    if (!translation) return;
    const text = [
      translation.name,
      "",
      translation.description,
      "",
      translation.metaTitle && `Title: ${translation.metaTitle}`,
      translation.metaDescription && `Meta: ${translation.metaDescription}`,
      Array.isArray(translation.seoTags) && translation.seoTags.length > 0 && `Tags: ${translation.seoTags.join(", ")}`,
    ].filter(Boolean).join("\n");
    try { navigator.clipboard.writeText(text); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  if (!entry) return null;
  const langMeta = LANGUAGES.find(l => l.code === selectedLang);
  const isRTL = !!langMeta?.rtl;
  const productName = entry.custom_name || entry.name || "Untitled";

  return (
    <div className="modal-modern-overlay" onClick={onClose}>
      <div className="modal-modern-card size-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-modern-blobs" />
        <div className="modal-modern-header">
          <div>
            <h3>Translate this product</h3>
            <p style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{productName}</p>
          </div>
          <button className="modal-modern-close" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-modern-body">
          {!canEdit && (
            <div style={{ padding: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#F59E0B" }}>
              Viewer role — you can view saved translations but not generate new ones.
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.05em", marginBottom: 10 }}>PICK A LANGUAGE</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 18 }}>
            {LANGUAGES.map(l => {
              const isSaved = saved.some(s => s.language === l.code);
              const active = selectedLang === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  className="translate-lang-tile"
                  data-active={active}
                  onClick={() => canEdit ? onPickLanguage(l.code) : (isSaved ? onPickLanguage(l.code) : toast.warning("Generate requires Admin or Editor"))}
                  disabled={loading && active}
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{l.flag}</span>
                  <span style={{ flex: 1, textAlign: "left", fontSize: 12, fontWeight: 600 }}>{l.code}</span>
                  {isSaved && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }} title="Cached" />}
                </button>
              );
            })}
          </div>

          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "30px 0" }}>
              <div className="dot-bounce" />
              <div className="dot-bounce" style={{ animationDelay: "0.15s" }} />
              <div className="dot-bounce" style={{ animationDelay: "0.3s" }} />
              <span style={{ fontSize: 13, color: "var(--text-dim)", marginLeft: 8 }}>Translating to {selectedLang}…</span>
            </div>
          )}

          {translation && !loading && (
            <div style={{ border: "1px solid var(--border-light)", borderRadius: 12, padding: 18, background: "var(--card-bg-alt, rgba(255,255,255,0.03))", direction: isRTL ? "rtl" : "ltr" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, direction: "ltr" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{langMeta?.flag}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{selectedLang}</span>
                  {translation.cached && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(16,185,129,0.12)", color: "#10B981", fontWeight: 600 }}>CACHED</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={copyAll}>
                    <Icon name="copy" size={11} /> Copy
                  </button>
                  {canEdit && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => onPickLanguage(selectedLang, { force: true })}>
                      <Icon name="refresh" size={11} /> Regenerate
                    </button>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 8, lineHeight: 1.3 }}>{translation.name}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 14 }}>{translation.description}</div>

              {(translation.metaTitle || translation.metaDescription) && (
                <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.05em", marginBottom: 6 }}>SEO</div>
                  {translation.metaTitle && <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>{translation.metaTitle}</div>}
                  {translation.metaDescription && <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>{translation.metaDescription}</div>}
                </div>
              )}

              {Array.isArray(translation.seoTags) && translation.seoTags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {translation.seoTags.map((t, i) => (
                    <span key={i} style={{ padding: "3px 9px", borderRadius: 10, fontSize: 10.5, background: "rgba(124,58,237,0.12)", color: "#A78BFA", fontWeight: 600 }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {!translation && !loading && saved.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14, marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.05em", marginBottom: 10 }}>SAVED TRANSLATIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {saved.map(s => {
                  const meta = LANGUAGES.find(l => l.code === s.language);
                  return (
                    <div key={s.language} className="saved-translation-row">
                      <span style={{ fontSize: 14 }}>{meta?.flag || "🏳"}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 80 }}>{s.language}</span>
                      <span style={{ flex: 1, fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 9px" }} onClick={() => onPickLanguage(s.language)}>View</button>
                      {canEdit && (
                        <button className="msg-action-btn" onClick={() => onDelete(s.language)} title="Delete translation">
                          <Icon name="trash" size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!translation && !loading && saved.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 10px", fontSize: 12.5, color: "var(--text-dim)" }}>
              No translations yet. Pick a language above to generate one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TranslateModal;
