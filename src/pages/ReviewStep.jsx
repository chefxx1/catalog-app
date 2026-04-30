import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icon, CopyButton, ConfidenceScore, safeJsonParse } from "../components/shared";
import { toast } from "../components/Toast";
import { resolveConflict, saveForLater, generateAIContent, getBrandVoices as apiGetBrandVoices, searchProductImages, streamDescription } from "../api";

// ============================================================
// REVIEW STEP — AI content review + export
// ============================================================
const ReviewStep = ({ onExport, onSave, productData, user }) => {
  const canWrite = user?.role === "Admin" || user?.role === "Editor";
  const pd = productData || {};
  const product = pd.product || {};
  const dbSources = pd.sources || [];
  const dbImages = pd.images || [];
  const dbConflicts = pd.conflicts || [];

  // Map DB data to display format
  const sourceColors = {"Amazon":"#FF9900","Open Food Facts":"#10B981","Walmart":"#0071CE","IKEA":"#0058A3","Target":"#CC0000","Best Buy":"#0046BE","Wayfair":"#7B189F","eBay":"#E53238","Etsy":"#F1641E","Home Depot":"#F96302"};
  const displaySources = dbSources.length > 0 ? dbSources.map(s => ({
    name: s.source_name, icon: s.source_name === "Open Food Facts" ? "database" : "store",
    trustScore: s.trust_score || 70, color: sourceColors[s.source_name] || "#3B82F6",
    data: { ...(s.price ? { price: `$${s.price}` } : {}), ...(s.weight ? { weight: s.weight } : {}), ...(s.description ? { url: s.description } : {}) }
  })) : [];

  const displayImages = dbImages.length > 0 ? dbImages.map((img, i) => ({
    id: img.id, url: img.image_url, qualityScore: (img.quality_score || 70) / 10, selected: i < 3, label: img.source_name || "Product image"
  })) : [];

  const displayConflicts = dbConflicts.length > 0 ? dbConflicts.map(c => ({
    id: c.id, field: c.field_name, values: safeJsonParse(c.source_values, {}), severity: "medium"
  })) : [];

  // Parse real specs from source data or AI-identified attributes
  const parseSpecs = (raw) => {
    if (!raw) return null;
    let parsed = raw;
    // Unwrap double/triple stringified JSON
    while (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { return null; }
    }
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) ? parsed : null;
  };

  const realSpecs = (() => {
    for (const s of dbSources) {
      if (s.specs) {
        const p = parseSpecs(s.specs);
        if (p) return p;
      }
    }
    return null;
  })();

  // Use AI-identified attributes if available (from frontend pass-through or DB)
  const aiAttrs = product.attributes || parseSpecs(product.ai_attributes) || null;
  const specs = realSpecs || (aiAttrs ? Object.fromEntries(Object.entries(aiAttrs).filter(([,v]) => v && v !== "null")) : null);

  const defaultDescs = [
    { tone: "Professional", text: "AI description will be generated." },
    { tone: "Friendly", text: "AI description will be generated." },
    { tone: "Luxury", text: "AI description will be generated." },
  ];

  const p = {
    name: product.name || "Unknown Product",
    brand: product.brand || "Unknown",
    upc: product.barcode || "N/A",
    category: product.ai_category_suggestion || product.category || realSpecs?.['Labels'] || "Uncategorized",
    weight: dbSources[0]?.weight || "",
    specs: specs,
    seoTags: safeJsonParse(product.seo_tags, []),
    aiDescriptions: product.ai_description_professional ? [
      { tone: "Professional", text: product.ai_description_professional },
      { tone: "Friendly", text: product.ai_description_friendly || "AI description will be generated." },
      { tone: "Luxury", text: product.ai_description_luxury || "AI description will be generated." },
    ] : defaultDescs,
    sources: displaySources,
    images: displayImages,
    conflicts: displayConflicts,
  };

  const [aiDescs, setAiDescs] = useState(p.aiDescriptions);
  const [seoTags, setSeoTags] = useState(p.seoTags);
  const [metaTitle, setMetaTitle] = useState(null);
  const [metaDescription, setMetaDescription] = useState(null);
  const [aiCategory, setAiCategory] = useState(null);
  const [brandVoices, setBrandVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [selectedDesc,setSelectedDesc]=useState(0); const [editedDesc,setEditedDesc]=useState(p.aiDescriptions[0].text);
  const [streamTones, setStreamTones] = useState({ Professional: "", Friendly: "", Luxury: "" });
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedSource,setExpandedSource]=useState(displaySources[0]?.name || "Amazon"); const [resolvedConflicts,setResolvedConflicts]=useState({});
  const [images,setImages]=useState(p.images); const [activeTab,setActiveTab]=useState("overview"); const [regenerating,setRegenerating]=useState(false);
  const [aiError, setAiError] = useState(null);
  const [editPrice, setEditPrice] = useState(dbSources.find(s => s.price)?.price || '');
  const [editFields, setEditFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomPos, setZoomPos] = useState({x:50,y:50});

  // Phase 18 — AI Language
  const [selectedLang, setSelectedLang] = useState("English");
  const [translatedSpecs, setTranslatedSpecs] = useState(null);
  const [translatedName, setTranslatedName] = useState(null);

  // Image Library modal
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryFilter, setLibraryFilter] = useState(null);
  const [libraryResults, setLibraryResults] = useState([]);
  const [librarySelected, setLibrarySelected] = useState(new Set());
  const [librarySearching, setLibrarySearching] = useState(false);
  const [pasteUrlMode, setPasteUrlMode] = useState(false);
  const [pasteUrlValue, setPasteUrlValue] = useState("");
  const [libraryPreview, setLibraryPreview] = useState(null);
  const libraryCache = useRef({}); // { query: results[] }
  const filterDebounce = useRef(null);

  // Lightbox keyboard controls
  useEffect(() => {
    if (lightbox === null) return;
    const handleKey = (e) => {
      if (e.key === "Escape") { setLightbox(null); setZoomLevel(1); }
      if (e.key === "ArrowLeft") { setLightbox(l => l <= 0 ? images.length - 1 : l - 1); setZoomLevel(1); }
      if (e.key === "ArrowRight") { setLightbox(l => l >= images.length - 1 ? 0 : l + 1); setZoomLevel(1); }
      if (e.key === "+" || e.key === "=") setZoomLevel(z => Math.min(4, z + 0.5));
      if (e.key === "-") setZoomLevel(z => Math.max(1, z - 0.5));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightbox, images.length]);
  const hasRealAI = !!product.ai_description_professional;
  const tabs=["overview","sources","images","seo"];

  // Load brand voices and find default
  useEffect(() => {
    apiGetBrandVoices().then(voices => {
      setBrandVoices(voices);
      const def = voices.find(v => v.is_default) || voices[0] || null;
      setSelectedVoice(def);
    }).catch(() => { toast.warning("Could not load brand voices"); });
  }, []);

  // Per-voice/language cache so switching tabs doesn't re-burn Gemini quota.
  // Keyed by `${voiceId}:${language}:${customPrompt}`. Force fresh via forceFresh=true.
  const descCacheRef = useRef({});

  const handleRegenerate=async(voice, lang, forceFresh = false)=>{
    const bv = voice || selectedVoice;
    const useLang = lang || selectedLang;
    const cacheKey = `${bv?.id || "none"}:${useLang}:${useCustom ? customPrompt.trim() : ""}`;

    // Cache hit — restore previously generated tones without calling the API
    if (!forceFresh && descCacheRef.current[cacheKey]) {
      const cached = descCacheRef.current[cacheKey];
      setAiDescs(cached.aiDescs);
      setEditedDesc(cached.aiDescs[selectedDesc]?.text || cached.aiDescs[0]?.text || "");
      if (cached.seoTags) setSeoTags(cached.seoTags);
      if (cached.metaTitle) setMetaTitle(cached.metaTitle);
      if (cached.metaDescription) setMetaDescription(cached.metaDescription);
      if (cached.aiCategory) setAiCategory(cached.aiCategory);
      setTranslatedSpecs(cached.translatedSpecs || null);
      setTranslatedName(cached.translatedName || null);
      return;
    }

    setRegenerating(true); setAiError(null);

    const basePayload = {
      name: product.name || p.name,
      brand: product.brand || p.brand,
      category: product.description || p.category,
      description: product.description || '',
      specs: p.specs || null,
      barcode: product.barcode || p.upc,
      language: useLang !== "English" ? useLang : undefined,
      ...(useCustom && customPrompt.trim()
        ? { customInstructions: customPrompt.trim() }
        : bv ? { brandVoice: {
            // tone lives on the top-level row; the rest is in the JSON metadata column
            tone: bv.tone || "Professional",
            audience: bv.metadata?.audience || "",
            style: bv.metadata?.style || "",
            includeKeywords: bv.metadata?.includeKeywords || [],
            excludeKeywords: bv.metadata?.excludeKeywords || [],
          } } : {}),
    };

    // Stream all 3 tones live — each box fills as Gemini writes
    setStreamTones({ Professional: "", Friendly: "", Luxury: "" });
    setIsStreaming(true);
    const streamPromise = new Promise((resolve) => {
      streamDescription(basePayload, {
        onToneChunk: (tone, text) => {
          setStreamTones(prev => ({ ...prev, [tone]: (prev[tone] || "") + text }));
        },
        onDone: (tones) => resolve(tones),
        onError: () => resolve(null),
      });
    });

    // Structured call in parallel for SEO/category/meta only
    const structuredPromise = generateAIContent(basePayload).catch(err => { setAiError(err.message); return null; });

    try {
      const [streamedTones, result] = await Promise.all([streamPromise, structuredPromise]);
      const descs = streamedTones || {
        Professional: result?.descriptions?.professional || '',
        Friendly: result?.descriptions?.friendly || '',
        Luxury: result?.descriptions?.luxury || '',
      };
      const newDescs = [
        { tone: "Professional", text: descs.Professional || result?.descriptions?.professional || '' },
        { tone: "Friendly",     text: descs.Friendly     || result?.descriptions?.friendly     || '' },
        { tone: "Luxury",       text: descs.Luxury       || result?.descriptions?.luxury       || '' },
      ];
      setAiDescs(newDescs);
      setEditedDesc(newDescs[selectedDesc]?.text || newDescs[0].text);
      if (result) {
        if (result.seoTags?.length) setSeoTags(result.seoTags);
        if (result.metaTitle) setMetaTitle(result.metaTitle);
        if (result.metaDescription) setMetaDescription(result.metaDescription);
        if (result.category) setAiCategory(result.category);
        setTranslatedSpecs(result.translatedSpecs || null);
        setTranslatedName(result.translatedName || null);
      }
      // Cache the result so switching back to this voice/language hits memory, not Gemini
      descCacheRef.current[cacheKey] = {
        aiDescs: newDescs,
        seoTags: result?.seoTags?.length ? result.seoTags : undefined,
        metaTitle: result?.metaTitle,
        metaDescription: result?.metaDescription,
        aiCategory: result?.category,
        translatedSpecs: result?.translatedSpecs || null,
        translatedName: result?.translatedName || null,
      };
    } catch (err) {
      setAiError(err.message);
      toast.error("AI generation failed: " + (err.message || "Unknown error"));
    }

    setIsStreaming(false);
    setStreamTones({ Professional: "", Friendly: "", Luxury: "" });
    setRegenerating(false);
  };

  // Auto-generate AI content on mount if no existing AI data.
  // Ref guard prevents StrictMode's double-invoke from kicking off two
  // parallel Gemini streams in dev.
  const autoGeneratedRef = useRef(false);
  useEffect(() => {
    if (autoGeneratedRef.current) return;
    autoGeneratedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasRealAI) { handleRegenerate(); }
  }, []);

  // ── IMAGE LIBRARY ──
  const openLibrary = () => {
    const base = `${p.brand && p.brand !== "Unknown" ? p.brand + " " : ""}${p.name}`.trim();
    setLibrarySearch(base);
    setLibraryFilter(null);
    setLibraryResults([]);
    setLibrarySelected(new Set());
    setPasteUrlMode(false);
    setPasteUrlValue("");
    setLibraryPreview(null);
    setLibraryOpen(true);
    // No auto-search — user clicks filter or Search
  };

  const runLibrarySearch = async (query) => {
    if (!query || !query.trim()) return;
    const key = query.trim().toLowerCase();

    // Cache hit — skip API call
    if (libraryCache.current[key]) {
      setLibraryResults(libraryCache.current[key]);
      return;
    }

    setLibrarySearching(true);
    setLibraryResults([]);
    try {
      const results = await searchProductImages(query.trim());
      const ranked = (results || [])
        .filter(r => (r.width || 0) * (r.height || 0) > 0 || !r.width)
        .sort((a, b) => {
          const aPx = (a.width || 0) * (a.height || 0);
          const bPx = (b.width || 0) * (b.height || 0);
          return bPx - aPx;
        });
      libraryCache.current[key] = ranked;
      setLibraryResults(ranked);
    } catch (err) {
      toast.error("Search failed: " + err.message);
    }
    setLibrarySearching(false);
  };

  const applyFilter = (filterKey) => {
    const base = `${p.brand && p.brand !== "Unknown" ? p.brand + " " : ""}${p.name}`.trim();
    const filterQueries = {
      front: base,
      back: `${base} back label`,
      side: `${base} side view`,
      top: `${base} top view`,
      label: `${base} nutrition label ingredients`,
      lifestyle: `${base} lifestyle in use`,
      closeup: `${base} close up detail`,
      packaging: `${base} packaging box`,
      multipack: `${base} multipack bulk`,
    };
    const newQuery = filterQueries[filterKey] || base;
    setLibraryFilter(filterKey);
    setLibrarySearch(newQuery);
    // Debounce — cancel pending search and schedule new one 400ms out
    if (filterDebounce.current) clearTimeout(filterDebounce.current);
    filterDebounce.current = setTimeout(() => runLibrarySearch(newQuery), 400);
  };

  const toggleLibrarySelect = (url) => {
    setLibrarySelected(prev => {
      const n = new Set(prev);
      if (n.has(url)) n.delete(url);
      else n.add(url);
      return n;
    });
  };

  const addFromLibrary = () => {
    if (librarySelected.size === 0) return toast.warning("Select at least one image");
    const selectedResults = libraryResults.filter(r => librarySelected.has(r.url));
    const newImgs = selectedResults.map((img, i) => ({
      id: `lib-${Date.now()}-${i}`,
      url: img.url,
      qualityScore: Math.min(10, Math.round(((img.width || 500) * (img.height || 500)) / 100000)),
      selected: false,
      label: libraryFilter || "Gallery",
      source: img.source,
      width: img.width,
      height: img.height,
    }));
    setImages(prev => [...prev, ...newImgs]);
    toast.success(`Added ${newImgs.length} image${newImgs.length !== 1 ? "s" : ""}`);
    setLibraryOpen(false);
  };

  const addPastedUrl = () => {
    const url = pasteUrlValue.trim();
    if (!url) return;
    if (!url.match(/^https?:\/\//)) return toast.error("URL must start with http:// or https://");
    const newImg = {
      id: `paste-${Date.now()}`,
      url,
      qualityScore: 7,
      selected: false,
      label: "Custom",
    };
    setImages(prev => [...prev, newImg]);
    toast.success("Image added from URL");
    setPasteUrlValue("");
    setPasteUrlMode(false);
    setLibraryOpen(false);
  };

  return (
    <div className="animate-fadeIn" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,height:"calc(100vh - 200px)",minHeight:500}}>
      {/* LEFT */}
      <div style={{display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--hover-bg)",borderRadius:12,border:"1px solid var(--border)"}}>
        <div style={{display:"flex",padding:"8px 12px",borderBottom:"1px solid var(--border)"}}>
          <div style={{display:"flex",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:3,gap:3}}>
            {tabs.map(t=><button key={t} onClick={()=>setActiveTab(t)} style={{background:activeTab===t?"linear-gradient(135deg,#2563EB,#7C3AED)":"transparent",border:"none",cursor:"pointer",padding:"6px 14px",fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",color:activeTab===t?"white":"var(--text-dim)",borderRadius:6,textTransform:"capitalize",letterSpacing:"0.03em",transition:"all 0.2s",boxShadow:activeTab===t?"0 0 12px rgba(124,58,237,0.25)":"none"}}>{t}</button>)}
          </div>
        </div>
        <div className="split-panel" style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
          {activeTab==="overview"&&<>
            {p.conflicts.filter(c=>!resolvedConflicts[c.field]).length>0&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6,color:"var(--warning-light)",fontSize:12,fontWeight:700,letterSpacing:"0.06em"}}><Icon name="warning" size={14} color="#F59E0B"/> CONFLICTS DETECTED</div>
              {p.conflicts.filter(c=>!resolvedConflicts[c.field]).map((c,i)=><div key={i} className="highlight-warning" style={{borderRadius:8,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:12,fontWeight:700,color:"var(--warning-light)"}}>{c.field}</span><span className="badge badge-warning">{c.severity}</span></div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{Object.entries(c.values).map(([s,v])=><button key={s} className="btn btn-ghost" style={{fontSize:11,padding:"4px 10px"}} onClick={async()=>{setResolvedConflicts(prev=>({...prev,[c.field]:v}));if(c.id)try{await resolveConflict(c.id,typeof v==='object'?v.join(', '):v);toast.success(`${c.field} resolved`);}catch(err){toast.error("Failed to resolve conflict");}}}>{s}: {typeof v==='object'?v.join(', '):v}</button>)}</div>
              </div>)}
            </div>}
            {Object.keys(resolvedConflicts).length>0&&<div style={{fontSize:12,color:"var(--success-light)",display:"flex",alignItems:"center",gap:4}}><Icon name="check" size={12} color="#10B981"/>{Object.keys(resolvedConflicts).length} conflict(s) resolved</div>}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:2}}>PRODUCT DATA</div>
              {[{l:"Name",v:p.name,c:94,edit:true,key:"name"},{l:"Brand",v:p.brand,c:96,edit:true,key:"brand"},{l:"UPC",v:p.upc,c:100},{l:"Category",v:aiCategory||p.category,c:88}].map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:f.ai?"rgba(37,99,235,0.06)":"var(--hover-bg)",borderRadius:6,border:f.ai?"1px solid rgba(37,99,235,0.15)":"none"}}>
                <span style={{fontSize:12,color:f.ai?"#3B82F6":"var(--text-dim)",width:80,flexShrink:0}}>{f.l}{f.ai&&<span className="badge badge-ai" style={{marginLeft:4,fontSize:9}}>AI</span>}</span>
                {f.edit?<input className="input" value={editFields[f.key]??f.v} onChange={e=>setEditFields(prev=>({...prev,[f.key]:e.target.value}))} style={{fontSize:12,flex:1,padding:"4px 8px",background:"transparent",border:"1px solid var(--border)",borderRadius:4}}/>:<span className={f.l==="UPC"?"mono":""} style={{fontSize:12,flex:1,color:"var(--text-sec)",display:"flex",alignItems:"center",gap:4}}>{f.v}<CopyButton text={f.v}/></span>}
              </div>)}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"var(--hover-bg)",borderRadius:6}}>
                <span style={{fontSize:12,color:"var(--text-dim)",width:80,flexShrink:0}}>Price</span>
                <input className="input" value={editPrice} onChange={e=>setEditPrice(e.target.value)} placeholder="e.g. 29.99" style={{fontSize:12,flex:1,padding:"4px 8px",background:"transparent",border:"1px solid var(--border)",borderRadius:4}}/>
              </div>
            </div>
            {(translatedSpecs || (p.specs&&Object.keys(p.specs).length>0))&&<div style={{display:"flex",flexDirection:"column",gap:4}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em"}}>SPECIFICATIONS</div>
                {translatedSpecs && selectedLang !== "English" && <span className="badge badge-primary" style={{fontSize:9,padding:"1px 6px"}}>{selectedLang}</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                {Object.entries(translatedSpecs || p.specs).map(([k,v])=><div key={k} style={{padding:"6px 10px",background:"var(--hover-bg)",borderRadius:6}}>
                  <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:1}}>{k}</div>
                  <div className="mono" style={{fontSize:12,color:"var(--text-sec)"}}>{v}</div>
                </div>)}
              </div>
            </div>}
          </>}
          {activeTab==="sources"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {p.sources.length===0&&<div style={{textAlign:"center",padding:"30px 20px",color:"var(--text-dim)"}}><Icon name="database" size={28} color="var(--text-dim)"/><p style={{marginTop:8,fontSize:13}}>No source data available</p><p style={{fontSize:11,color:"var(--text-dim)"}}>Product was identified by AI — no external sources queried</p></div>}
            {p.sources.map((s,i)=><div key={i} style={{background:"var(--hover-bg)",borderRadius:8,border:"1px solid var(--border)",overflow:"hidden",transition:"all 0.3s"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",cursor:"pointer"}} onClick={()=>setExpandedSource(expandedSource===s.name?null:s.name)}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:28,height:28,borderRadius:6,background:s.color+"20",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name={s.icon} size={14} color={s.color}/></div>
                  <div><div style={{fontSize:13,fontWeight:600}}>{s.name}</div><ConfidenceScore score={s.trustScore}/></div>
                </div>
                <Icon name={expandedSource===s.name?"chevronDown":"chevronRight"} size={14} color="var(--text-dim)"/>
              </div>
              {expandedSource===s.name&&<div className="animate-slideUp" style={{padding:"0 14px 12px",display:"flex",flexDirection:"column",gap:4}}>
                {Object.entries(s.data).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"var(--text-dim)"}}>{k}</span><span className="mono" style={{color:"var(--text-sec)"}}>{String(v)}</span></div>)}
              </div>}
            </div>)}
          </div>}
          {activeTab==="images"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
            {images.length===0&&<div style={{textAlign:"center",padding:"30px 20px",color:"var(--text-dim)"}}><Icon name="camera" size={28} color="var(--text-dim)"/><p style={{marginTop:8,fontSize:13}}>No product images available</p></div>}
            {images.length>0&&<>
              {/* Main carousel image */}
              <div style={{position:"relative",borderRadius:10,overflow:"hidden",background:"#000",cursor:"zoom-in"}} onClick={()=>{setLightbox(images.findIndex(im=>im.selected)||0);setZoomLevel(1);}}>
                <img src={(images.find(im=>im.selected)||images[0]).url} alt="" style={{width:"100%",aspectRatio:"4/3",objectFit:"contain",background:"rgba(255,255,255,0.03)"}}/>
                <div style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",display:"flex",gap:6}}>
                  {images.map((img,i)=><div key={img.id} onClick={e=>{e.stopPropagation();setImages(prev=>prev.map((im,j)=>({...im,selected:j===i})));}} style={{width:images.length>6?6:8,height:images.length>6?6:8,borderRadius:"50%",background:img.selected?"#3B82F6":"rgba(255,255,255,0.4)",cursor:"pointer",transition:"all 0.2s",border:img.selected?"2px solid white":"2px solid transparent"}}/>)}
                </div>
                <div style={{position:"absolute",top:8,right:8,display:"flex",gap:6}}>
                  <div style={{background:"rgba(0,0,0,0.6)",borderRadius:6,padding:"4px 8px",fontSize:11,color:"white",display:"flex",alignItems:"center",gap:4}}><Icon name="search" size={10} color="white"/>Click to zoom</div>
                </div>
                {images.length>1&&<>
                  <div onClick={e=>{e.stopPropagation();const cur=images.findIndex(im=>im.selected);const prev=cur<=0?images.length-1:cur-1;setImages(imgs=>imgs.map((im,j)=>({...im,selected:j===prev})));}} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",width:28,height:28,borderRadius:"50%",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><Icon name="arrowLeft" size={14} color="white"/></div>
                  <div onClick={e=>{e.stopPropagation();const cur=images.findIndex(im=>im.selected);const next=cur>=images.length-1?0:cur+1;setImages(imgs=>imgs.map((im,j)=>({...im,selected:j===next})));}} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",width:28,height:28,borderRadius:"50%",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><Icon name="chevronRight" size={14} color="white"/></div>
                </>}
              </div>
              {/* Thumbnail strip */}
              <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
                {images.map((img,i)=><div key={img.id} onClick={()=>setImages(prev=>prev.map((im,j)=>({...im,selected:j===i})))} style={{width:56,height:56,borderRadius:6,overflow:"hidden",cursor:"pointer",border:`2px solid ${img.selected?"#3B82F6":"transparent"}`,opacity:img.selected?1:0.5,transition:"all 0.2s",flexShrink:0}}>
                  <img src={img.url} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                </div>)}
              </div>
              <div style={{fontSize:11,color:"var(--text-dim)",textAlign:"center"}}>{images.length} image{images.length!==1?"s":""} · Click thumbnails to browse · Click main image to zoom</div>
              <button className="btn btn-primary" style={{justifyContent:"center",marginTop:4,padding:"10px 0",fontSize:12,fontWeight:700}} onClick={openLibrary}>
                <Icon name="sparkle" size={13}/> Browse More Images
              </button>
            </>}
            {images.length===0&&(
              <button className="btn btn-primary" style={{justifyContent:"center",padding:"10px 0",fontSize:12,fontWeight:700}} onClick={openLibrary}>
                <Icon name="sparkle" size={13}/> Browse Image Library
              </button>
            )}
          </div>}
          {activeTab==="seo"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>AI-GENERATED SEO TAGS</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{seoTags.map((t,i)=><span key={i} style={{padding:"4px 12px",background:"rgba(37,99,235,0.15)",border:"1px solid rgba(37,99,235,0.3)",borderRadius:20,fontSize:12,color:"#60A5FA"}}>#{t}</span>)}</div></div>
            <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>META TITLE</div><div style={{padding:10,background:"var(--hover-bg)",borderRadius:6,fontSize:13,color:"var(--text-sec)"}}>{metaTitle || `${p.name} | ${p.brand}`}</div></div>
            <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>META DESCRIPTION</div><div style={{padding:10,background:"var(--hover-bg)",borderRadius:6,fontSize:13,color:"var(--text-sec)",lineHeight:1.5}}>{metaDescription || `Shop ${p.name} from ${p.brand}. Find the best deals and product information.`}</div></div>
          </div>}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--hover-bg)",borderRadius:12,border:"1px solid var(--border)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Icon name="sparkle" size={16} color="#10B981"/><span style={{fontWeight:700,fontSize:14}}>AI-Generated Content</span><span className="badge badge-ai">AI</span></div>
            <button className="btn btn-ghost" style={{fontSize:11,padding:"4px 12px"}} onClick={()=>handleRegenerate(null, null, true)} disabled={regenerating}><Icon name="refresh" size={12}/> {regenerating?"Generating...":"Regenerate"}</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:10,color:"var(--text-dim)",fontWeight:600}}>Language:</span>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {["English","Arabic","French","Spanish","German","Chinese","Turkish","Portuguese"].map(lang=>(
                <button key={lang} onClick={()=>{setSelectedLang(lang);if(lang!==selectedLang&&!regenerating)handleRegenerate(null,lang);}} style={{fontSize:10,padding:"2px 8px",borderRadius:12,border:`1px solid ${selectedLang===lang?"var(--primary)":"var(--border-light)"}`,background:selectedLang===lang?"rgba(37,99,235,0.08)":"transparent",color:selectedLang===lang?"var(--primary-light)":"var(--text-dim)",cursor:"pointer",fontFamily:"'Sora',sans-serif",fontWeight:600,transition:"all 0.15s"}}>{lang}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="split-panel" style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
          {aiError&&<div style={{padding:"8px 12px",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,fontSize:12,color:"#F87171",display:"flex",alignItems:"center",gap:6}}><Icon name="warning" size={14} color="#EF4444"/>{aiError}</div>}
          <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>BRAND VOICE</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {brandVoices.map(v=><button key={v.id} onClick={()=>{setUseCustom(false);setSelectedVoice(v);if(!regenerating)handleRegenerate(v);}} className={`btn ${!useCustom&&selectedVoice?.id===v.id?"btn-primary":"btn-ghost"}`} style={{fontSize:11,padding:"5px 14px",borderRadius:20}}><Icon name="tag" size={10}/> {v.name}</button>)}
              <button onClick={()=>setUseCustom(!useCustom)} className={`btn ${useCustom?"btn-primary":"btn-ghost"}`} style={{fontSize:11,padding:"5px 14px",borderRadius:20}}><Icon name="edit" size={10}/> Custom</button>
            </div>
            {useCustom&&<div style={{marginTop:8,display:"flex",gap:6}}>
              <input className="input" value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} placeholder="e.g. Make it funny, target Gen Z, focus on health..." style={{flex:1,fontSize:12,padding:"8px 12px"}} onKeyDown={e=>e.key==="Enter"&&customPrompt.trim()&&!regenerating&&handleRegenerate()}/>
              <button className="btn btn-primary" style={{fontSize:11,padding:"6px 14px",flexShrink:0}} disabled={!customPrompt.trim()||regenerating} onClick={()=>handleRegenerate()}><Icon name="sparkle" size={12}/> Go</button>
            </div>}
          </div>
          <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8}}>BRAND TONE</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["Professional","Friendly","Luxury"].map((t,i)=><button key={t} onClick={()=>{setSelectedDesc(i);setEditedDesc(aiDescs[i].text);}} className={`btn ${i===selectedDesc?"btn-primary":"btn-ghost"}`} style={{fontSize:11,padding:"5px 14px",borderRadius:20}}>{t}</button>)}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em"}}>DESCRIPTION VARIANTS</div>
            {["Professional","Friendly","Luxury"].map((toneName, i) => {
              const d = aiDescs[i] || { tone: toneName, text: "" };
              const liveText = streamTones[toneName] || "";
              const showLive = isStreaming && liveText.length > 0;
              const showWaiting = isStreaming && !liveText;
              const displayText = showLive ? liveText : d.text;
              return (
                <div key={i} className={`description-card ${selectedDesc===i?"selected":""}`} onClick={()=>{if(!regenerating){setSelectedDesc(i);setEditedDesc(d.text);}}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span className="badge badge-neutral">{toneName}</span>
                      {showLive && <span style={{fontSize:10,color:"#8B5CF6",fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}><span className="typing-pulse" style={{width:6,height:6,borderRadius:"50%",background:"#8B5CF6"}}/> typing</span>}
                      {showWaiting && <span style={{fontSize:10,color:"var(--text-dim)",fontWeight:600,display:"inline-flex",alignItems:"center",gap:4}}><span className="typing-pulse" style={{width:6,height:6,borderRadius:"50%",background:"var(--text-dim)"}}/> queued</span>}
                      {selectedDesc===i && !isStreaming && <Icon name="check" size={12} color="#10B981"/>}
                    </div>
                    {!isStreaming && <CopyButton text={d.text}/>}
                  </div>
                  {showLive ? (
                    <p style={{fontSize:13,lineHeight:1.6,color:"var(--text)"}}>{displayText}<span className="cursor-blink" style={{display:"inline-block",width:2,height:14,background:"#8B5CF6",marginLeft:2,verticalAlign:"middle"}}/></p>
                  ) : showWaiting ? (
                    <div style={{display:"flex",flexDirection:"column",gap:6,padding:"4px 0"}}>
                      <div className="skeleton" style={{height:10,width:"95%",borderRadius:4}}/>
                      <div className="skeleton" style={{height:10,width:"80%",borderRadius:4}}/>
                      <div className="skeleton" style={{height:10,width:"60%",borderRadius:4}}/>
                    </div>
                  ) : (
                    <p style={{fontSize:13,lineHeight:1.6,color:"var(--text-muted)"}}>{(displayText || "").slice(0,120)}{displayText && displayText.length > 120 ? "..." : ""}</p>
                  )}
                </div>
              );
            })}
          </div>
          <div><div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>FINAL DESCRIPTION <span className="badge badge-ai">Editable</span><CopyButton text={editedDesc}/></div>
            {(() => {
              const activeToneName = ["Professional","Friendly","Luxury"][selectedDesc];
              const liveActive = isStreaming ? (streamTones[activeToneName] || "") : "";
              const value = liveActive || editedDesc;
              return <textarea className="input" value={value} onChange={e=>setEditedDesc(e.target.value)} rows={5} style={{lineHeight:1.6}} readOnly={isStreaming && !!liveActive}/>;
            })()}
          </div>

          <div style={{padding:12,background:"var(--hover-bg)",borderRadius:8,border:"1px solid var(--border)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:8}}>PRE-PUBLISH CHECKLIST</div>
            {[{t:"AI description generated",ok:hasRealAI||aiDescs!==p.aiDescriptions},{t:"Pricing verified across sources",ok:Object.keys(resolvedConflicts).length>0},{t:"Product images selected",ok:images.filter(i=>i.selected).length>0},{t:"SEO tags generated",ok:hasRealAI||seoTags!==p.seoTags}].map((item,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"center",fontSize:12,marginBottom:4,color:item.ok?"var(--text-muted)":"#F87171"}}><Icon name={item.ok?"check":"x"} size={12} color={item.ok?"#10B981":"#EF4444"}/> {item.t}</div>)}
          </div>
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid var(--border)",display:"flex",gap:10}}>
          <button className="btn btn-ghost" style={{justifyContent:"center"}} disabled={saving||saved||!canWrite} title={!canWrite?"Viewers cannot save products":""} onClick={async () => {
            setSaving(true);
            try {
              await saveForLater({
                product: {
                  ...product,
                  name: editFields.name || product.name,
                  brand: editFields.brand || product.brand,
                  attributes: specs || product.attributes || null,
                  ai_description_professional: aiDescs.find(d=>d.tone==="Professional")?.text || editedDesc,
                  ai_description_friendly: aiDescs.find(d=>d.tone==="Friendly")?.text || '',
                  ai_description_luxury: aiDescs.find(d=>d.tone==="Luxury")?.text || '',
                  ai_category_suggestion: aiCategory || product.ai_category_suggestion || p.category,
                  seo_tags: seoTags,
                  edited_description: editedDesc,
                },
                sources: dbSources,
                images: dbImages,
                enriched: { price: editPrice },
              });
              setSaved(true);
              toast.success("Product saved to catalog");
              if (onSave) setTimeout(() => onSave(), 1200);
            } catch (err) { setSaving(false); toast.error(err.message || "Failed to save product"); }
          }}>{saved?<><Icon name="check" size={15}/> Saved!</>:saving?<><Icon name="refresh" size={15}/> Saving...</>:<><Icon name="bookmark" size={15}/> Save for Later</>}</button>
          <button className="btn btn-success" style={{flex:1,justifyContent:"center"}} disabled={!canWrite} title={!canWrite?"Viewers cannot export products":""} onClick={() => {
            const enriched = {
              ...productData,
              product: {
                ...product,
                name: editFields.name || product.name,
                brand: editFields.brand || product.brand,
                attributes: specs || product.attributes || null,
                ai_description_professional: aiDescs.find(d=>d.tone==="Professional")?.text || editedDesc,
                ai_description_friendly: aiDescs.find(d=>d.tone==="Friendly")?.text || '',
                ai_description_luxury: aiDescs.find(d=>d.tone==="Luxury")?.text || '',
                ai_category_suggestion: aiCategory || product.ai_category_suggestion || p.category,
                seo_tags: seoTags,
                meta_title: metaTitle || `${editFields.name||p.name} | ${editFields.brand||p.brand}`,
                meta_description: metaDescription || `Shop ${editFields.name||p.name} from ${editFields.brand||p.brand}.`,
                edited_description: editedDesc,
                selected_tone: aiDescs[selectedDesc]?.tone || 'Professional',
              },
              enriched: {
                price: editPrice,
                selectedImages: images.filter(i => i.selected).map(i => i.url),
              }
            };
            onExport(enriched);
          }}><Icon name="download" size={15}/> Proceed to Export</button>
        </div>
      </div>
      {/* Lightbox overlay */}
      {lightbox!==null&&images.length>0&&<div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}} onClick={()=>{setLightbox(null);setZoomLevel(1);}}>
        {/* Close button */}
        <button onClick={()=>{setLightbox(null);setZoomLevel(1);}} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.1)",border:"none",borderRadius:"50%",width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:10}}><Icon name="x" size={20} color="white"/></button>
        {/* Zoom controls */}
        <div style={{position:"absolute",top:16,left:"50%",transform:"translateX(-50%)",display:"flex",gap:8,zIndex:10}}>
          <button onClick={e=>{e.stopPropagation();setZoomLevel(z=>Math.max(1,z-0.5));}} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"6px 14px",color:"white",cursor:"pointer",fontSize:14,fontFamily:"'Sora',sans-serif"}}>-</button>
          <span style={{color:"white",fontSize:13,padding:"6px 10px",background:"rgba(255,255,255,0.1)",borderRadius:8}}>{Math.round(zoomLevel*100)}%</span>
          <button onClick={e=>{e.stopPropagation();setZoomLevel(z=>Math.min(4,z+0.5));}} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"6px 14px",color:"white",cursor:"pointer",fontSize:14,fontFamily:"'Sora',sans-serif"}}>+</button>
        </div>
        {/* Main image */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",width:"100%",overflow:"hidden",cursor:zoomLevel>1?"grab":"zoom-in"}} onClick={e=>{e.stopPropagation();if(zoomLevel===1)setZoomLevel(2);else{setZoomLevel(1);setZoomPos({x:50,y:50});}}} onMouseMove={e=>{if(zoomLevel>1){const rect=e.currentTarget.getBoundingClientRect();setZoomPos({x:(e.clientX-rect.left)/rect.width*100,y:(e.clientY-rect.top)/rect.height*100});}}}>
          <img src={images[lightbox]?.url} alt="" style={{maxWidth:"90vw",maxHeight:"75vh",objectFit:"contain",transform:`scale(${zoomLevel})`,transformOrigin:`${zoomPos.x}% ${zoomPos.y}%`,transition:zoomLevel===1?"transform 0.3s":"none",borderRadius:4}}/>
        </div>
        {/* Navigation arrows */}
        {images.length>1&&<>
          <div onClick={e=>{e.stopPropagation();setLightbox(l=>l<=0?images.length-1:l-1);setZoomLevel(1);}} style={{position:"absolute",left:20,top:"50%",transform:"translateY(-50%)",width:44,height:44,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><Icon name="arrowLeft" size={20} color="white"/></div>
          <div onClick={e=>{e.stopPropagation();setLightbox(l=>l>=images.length-1?0:l+1);setZoomLevel(1);}} style={{position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",width:44,height:44,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><Icon name="chevronRight" size={20} color="white"/></div>
        </>}
        {/* Thumbnail strip */}
        <div style={{display:"flex",gap:8,padding:"16px 0",justifyContent:"center"}} onClick={e=>e.stopPropagation()}>
          {images.map((img,i)=><div key={img.id} onClick={()=>{setLightbox(i);setZoomLevel(1);}} style={{width:52,height:52,borderRadius:6,overflow:"hidden",cursor:"pointer",border:`2px solid ${i===lightbox?"#3B82F6":"rgba(255,255,255,0.2)"}`,opacity:i===lightbox?1:0.5,transition:"all 0.2s"}}>
            <img src={img.url} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>)}
        </div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:12,paddingBottom:12}}>{lightbox+1} / {images.length} · Click image to zoom · Scroll through with arrows</div>
      </div>}

      {/* ═══════════ IMAGE LIBRARY MODAL ═══════════ */}
      {libraryOpen && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}} onClick={() => setLibraryOpen(false)}>
          <div className="animate-scaleIn" onClick={e => e.stopPropagation()} style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:16,width:"100%",maxWidth:1200,height:"90vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 20px 80px rgba(0,0,0,0.5)"}}>
            {/* HEADER */}
            <div style={{padding:"18px 24px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#3B82F6,#8B5CF6,#10B981)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <Icon name="sparkle" size={17} color="white"/>
                </div>
                <div>
                  <h3 style={{fontSize:16,fontWeight:800,letterSpacing:"-0.02em"}}>Image Library</h3>
                  <p style={{fontSize:11,color:"var(--text-dim)"}}>Browse and pick images for your product</p>
                </div>
              </div>
              <button className="btn btn-ghost" style={{padding:8,border:"none"}} onClick={() => setLibraryOpen(false)}><Icon name="x" size={16}/></button>
            </div>

            {/* SEARCH BAR */}
            <div style={{padding:"16px 24px",borderBottom:"1px solid var(--border-light)",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1,position:"relative"}}>
                  <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--text-dim)"}}><Icon name="search" size={14}/></div>
                  <input className="input" value={librarySearch} onChange={e => setLibrarySearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && runLibrarySearch(librarySearch)}
                    placeholder="Search for product images..."
                    style={{paddingLeft:38,fontSize:13,padding:"10px 14px 10px 38px"}}/>
                </div>
                <button className="btn btn-primary" style={{padding:"10px 20px"}} onClick={() => runLibrarySearch(librarySearch)} disabled={librarySearching}>
                  <Icon name="search" size={13}/> Search
                </button>
                <button className="btn btn-ghost" style={{padding:"10px 16px"}} onClick={() => setPasteUrlMode(p => !p)}>
                  <Icon name="plus" size={13}/> Paste URL
                </button>
              </div>

              {/* Filter chips */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[
                  {k:"front",    l:"Front"},
                  {k:"back",     l:"Back"},
                  {k:"side",     l:"Side"},
                  {k:"top",      l:"Top View"},
                  {k:"label",    l:"Label"},
                  {k:"lifestyle",l:"Lifestyle"},
                  {k:"closeup",  l:"Close-up"},
                  {k:"packaging",l:"Packaging"},
                  {k:"multipack",l:"Multi-Pack"},
                ].map(f => {
                  const active = libraryFilter === f.k;
                  return (
                    <button key={f.k} onClick={() => applyFilter(f.k)} disabled={librarySearching}
                      style={{fontSize:11,padding:"5px 12px",borderRadius:16,cursor:"pointer",fontFamily:"'Sora',sans-serif",fontWeight:600,transition:"all 0.15s",
                        border:`1px solid ${active ? "#7C3AED" : "var(--border-light)"}`,
                        background:active ? "linear-gradient(135deg,rgba(37,99,235,0.15),rgba(124,58,237,0.15))" : "transparent",
                        color:active ? "#A78BFA" : "var(--text-dim)",
                      }}>{f.l}</button>
                  );
                })}
              </div>

              {/* Paste URL input */}
              {pasteUrlMode && (
                <div style={{display:"flex",gap:8,padding:"10px 12px",borderRadius:8,background:"rgba(124,58,237,0.06)",border:"1px solid rgba(124,58,237,0.15)"}}>
                  <input className="input" value={pasteUrlValue} onChange={e => setPasteUrlValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addPastedUrl()}
                    placeholder="https://example.com/image.jpg"
                    style={{flex:1,fontSize:12,padding:"8px 10px"}} autoFocus/>
                  <button className="btn btn-primary" style={{fontSize:11,padding:"6px 14px"}} onClick={addPastedUrl} disabled={!pasteUrlValue.trim()}>Add</button>
                </div>
              )}
            </div>

            {/* RESULTS GRID */}
            <div style={{flex:1,overflow:"auto",padding:"20px 24px"}}>
              {librarySearching && (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12}}>
                  <div className="animate-spin" style={{width:32,height:32,border:"3px solid var(--border)",borderTopColor:"var(--primary)",borderRadius:"50%"}}/>
                  <p style={{fontSize:12,color:"var(--text-dim)"}}>Searching Google Images...</p>
                </div>
              )}
              {!librarySearching && libraryResults.length === 0 && (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:"var(--text-dim)"}}>
                  <div style={{width:56,height:56,borderRadius:14,background:"var(--hover-bg)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}>
                    <Icon name="search" size={24} color="var(--text-dim)"/>
                  </div>
                  <p style={{fontSize:13,fontWeight:600}}>Click a filter or hit Search to begin</p>
                  <p style={{fontSize:11,color:"var(--text-dim)"}}>Results are cached per query so you can toggle filters freely</p>
                </div>
              )}
              {!librarySearching && libraryResults.length > 0 && (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:12}}>
                  {libraryResults.map((img, i) => {
                    const isSelected = librarySelected.has(img.url);
                    const pixels = (img.width || 0) * (img.height || 0);
                    const quality = pixels > 800*800 ? "HD" : pixels > 400*400 ? "MD" : "LO";
                    const qColor = quality === "HD" ? "#10B981" : quality === "MD" ? "#F59E0B" : "#EF4444";
                    return (
                      <div key={i} onClick={() => toggleLibrarySelect(img.url)}
                        onMouseEnter={() => setLibraryPreview(img)}
                        onMouseLeave={() => setLibraryPreview(null)}
                        style={{position:"relative",borderRadius:10,overflow:"hidden",cursor:"pointer",transition:"all 0.2s",
                          border:`2px solid ${isSelected ? "#7C3AED" : "var(--border-light)"}`,
                          boxShadow:isSelected ? "0 0 0 3px rgba(124,58,237,0.3)" : "none",
                          transform:isSelected ? "scale(0.97)" : "scale(1)",
                        }}>
                        <div style={{aspectRatio:"1",background:"var(--hover-bg)",position:"relative"}}>
                          <img src={img.thumbnail || img.url} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                          {/* Quality badge */}
                          <div style={{position:"absolute",top:6,left:6,display:"inline-flex",alignItems:"center",gap:3,padding:"2px 6px",borderRadius:10,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(6px)"}}>
                            <div style={{width:5,height:5,borderRadius:"50%",background:qColor}}/>
                            <span style={{fontSize:9,fontWeight:700,color:"white"}}>{quality}</span>
                          </div>
                          {/* Selection checkmark */}
                          {isSelected && (
                            <div style={{position:"absolute",top:6,right:6,width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#2563EB,#7C3AED)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 10px rgba(124,58,237,0.6)"}}>
                              <Icon name="check" size={12} color="white"/>
                            </div>
                          )}
                          {/* Resolution */}
                          {img.width && img.height && (
                            <div style={{position:"absolute",bottom:6,right:6,padding:"2px 6px",borderRadius:6,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(6px)",fontSize:9,fontWeight:700,color:"white"}}>
                              {img.width}×{img.height}
                            </div>
                          )}
                        </div>
                        {/* Source */}
                        <div style={{padding:"6px 8px",background:"var(--surface)",borderTop:"1px solid var(--border-light)"}}>
                          <div style={{fontSize:10,color:"var(--text-dim)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:500}}>{img.source || "Unknown"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div style={{padding:"14px 24px",borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--hover-bg)"}}>
              <div style={{fontSize:12,color:"var(--text-muted)"}}>
                {librarySelected.size > 0 ? (
                  <><strong style={{color:"#A78BFA",fontSize:14}}>{librarySelected.size}</strong> image{librarySelected.size !== 1 ? "s" : ""} selected</>
                ) : (
                  <span style={{color:"var(--text-dim)"}}>{libraryResults.length} result{libraryResults.length !== 1 ? "s" : ""} · Click images to select</span>
                )}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" style={{padding:"8px 18px"}} onClick={() => setLibraryOpen(false)}>Cancel</button>
                <button className="btn btn-primary" style={{padding:"8px 22px",fontSize:13}} disabled={librarySelected.size === 0} onClick={addFromLibrary}>
                  <Icon name="plus" size={13}/> Add {librarySelected.size > 0 ? `${librarySelected.size} ` : ""}to Gallery
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewStep;