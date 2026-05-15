import React, { useState, useEffect } from "react";
import { Icon, CopyButton, LoadingDots, ConfirmDialog, safeJsonParse } from "../components/shared";
import BrandOrb from "../components/BrandOrb";
import { toast } from "../components/Toast";
import { getCatalog, getBrandVoices as apiGetBrandVoices, updateCatalogEntry, updateCatalogStatus, deleteCatalogEntry, exportProduct, getTags, createTag, deleteTag, setEntryTags as apiSetEntryTags, getSavedViews, createSavedView, deleteSavedView, getQualitySuggestions } from "../api";
import { generateCatalogPdf } from "../utils/pdfExport";
import VariantManager from "../components/VariantManager";

const Dashboard = ({ onNew, onViewVoices, onViewProduct, onExportProduct, user, refreshKey, pendingFilter, onPendingFilterConsumed }) => {
  const [catalog, setCatalog] = useState([]);
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(null);
  const [qualitySuggestions, setQualitySuggestions] = useState({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [completenessModal, setCompletenessModal] = useState(null);
  const [batchExporting, setBatchExporting] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchFmt, setBatchFmt] = useState("CSV");
  const [batchPlat, setBatchPlat] = useState("Shopify");
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // ── Catalog Organization ──
  const [tags, setTags] = useState([]);
  const [entryTags, setEntryTags] = useState({}); // { entryId: [tagId, ...] }
  const [savedViews, setSavedViews] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [filters, setFilters] = useState({ status: "", tag: "", minPrice: "", maxPrice: "", completeness: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3B82F6");
  const [tagEntryId, setTagEntryId] = useState(null); // which entry is having tags edited
  const [changelogEntry, setChangelogEntry] = useState(null); // entry for changelog modal
  const [changelog, setChangelog] = useState([]);
  const [savingView, setSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [visibleCols, setVisibleCols] = useState({ product: true, barcode: true, completeness: true, stock: true, status: true, tags: false, date: true, actions: true });
  const [stockEditId, setStockEditId] = useState(null);
  const [stockEditValue, setStockEditValue] = useState("");
  const [variantEntry, setVariantEntry] = useState(null);
  const [showColPicker, setShowColPicker] = useState(false);
  const canEdit = user.role === "Admin" || user.role === "Editor";

  const reload = () => {
    Promise.all([
      getCatalog().catch(() => { toast.error("Failed to load catalog"); return []; }),
      apiGetBrandVoices().catch(() => []),
      getTags().catch(() => ({ tags: [] })),
      getSavedViews().catch(() => ({ views: [] })),
    ]).then(([c, v, t, sv]) => {
      setCatalog(c);
      // Backend now returns tag_ids per entry — hydrate the entryTags map so
      // chips and the tag filter work after a fresh page load.
      const tagsByEntry = {};
      for (const entry of (c || [])) {
        if (Array.isArray(entry.tag_ids) && entry.tag_ids.length > 0) {
          tagsByEntry[entry.id] = entry.tag_ids;
        }
      }
      setEntryTags(tagsByEntry);
      setVoices(v.map(voice => {
        const meta = safeJsonParse(voice.metadata, {}) || {};
        return { id: voice.id, name: voice.name, tone: voice.tone || 'Professional', color: meta.color || '#3B82F6' };
      }));
      setTags(t.tags || []);
      setSavedViews(sv.views || []);
      setLoading(false);
    });
  };

  useEffect(() => { reload(); }, [refreshKey]);

  // Apply a filter pushed in from the Command Palette ("Open in Catalog").
  // One-shot consume: parent clears the prop after we notify it, so the
  // setState-in-effect pattern here is intentional and runs at most once per push.
  useEffect(() => {
    if (!pendingFilter) return;
    const next = { status: "", tag: "", minPrice: "", maxPrice: "", completeness: "" };
    if (pendingFilter.status) next.status = pendingFilter.status;
    if (pendingFilter.tag) {
      const t = tags.find(x => x.name?.toLowerCase() === String(pendingFilter.tag).toLowerCase());
      if (t) next.tag = String(t.id);
    }
    if (pendingFilter.minPrice != null) next.minPrice = String(pendingFilter.minPrice);
    if (pendingFilter.maxPrice != null) next.maxPrice = String(pendingFilter.maxPrice);
    if (pendingFilter.needsAttention) next.completeness = "needs-work";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(next);
    setShowFilters(true);
    if (pendingFilter.name) setSearchFilter(String(pendingFilter.name));
    onPendingFilterConsumed?.();
  }, [pendingFilter, tags, onPendingFilterConsumed]);

  const sc={Published:"badge-success",Review:"badge-warning",Draft:"badge-neutral",Exported:"badge-primary"};

  const filteredCatalog = catalog.filter(item => {
    // Text search
    if (searchFilter && !(item.custom_name || item.name || "").toLowerCase().includes(searchFilter.toLowerCase()) && !(item.barcode || "").includes(searchFilter)) return false;
    // Status filter
    if (filters.status && (item.status || "Draft") !== filters.status) return false;
    // Tag filter
    if (filters.tag && !(entryTags[item.id] || []).includes(parseInt(filters.tag))) return false;
    // Price filters
    if (filters.minPrice && (parseFloat(item.custom_price) || 0) < parseFloat(filters.minPrice)) return false;
    if (filters.maxPrice && (parseFloat(item.custom_price) || 0) > parseFloat(filters.maxPrice)) return false;
    // Completeness filter
    if (filters.completeness === "complete" && (item.completeness ?? 0) < 100) return false;
    if (filters.completeness === "good" && ((item.completeness ?? 0) < 70 || (item.completeness ?? 0) >= 100)) return false;
    if (filters.completeness === "needs-work" && ((item.completeness ?? 0) < 40 || (item.completeness ?? 0) >= 70)) return false;
    if (filters.completeness === "poor" && (item.completeness ?? 0) >= 40) return false;
    return true;
  });

  const activeFilterCount = Object.values(filters).filter(v => v).length;

  const applyView = (view) => {
    setFilters(view.filters);
    setActiveView(view.id);
    setShowFilters(true);
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await createTag(newTagName.trim(), newTagColor);
      setTags(prev => [...prev, tag]);
      setNewTagName("");
      toast.success("Tag created");
    } catch (err) { toast.error(err.message); }
  };

  const handleDeleteTag = async (id) => {
    try {
      await deleteTag(id);
      setTags(prev => prev.filter(t => t.id !== id));
      toast.success("Tag deleted");
    } catch (err) { toast.error(err.message); }
  };

  const handleSetEntryTags = async (entryId, tagIds) => {
    try {
      await apiSetEntryTags(entryId, tagIds);
      setEntryTags(prev => ({ ...prev, [entryId]: tagIds }));
    } catch (err) { toast.error(err.message); }
  };

  const handleSaveView = async () => {
    if (!newViewName.trim()) return;
    try {
      const view = await createSavedView(newViewName.trim(), filters);
      setSavedViews(prev => [view, ...prev]);
      setNewViewName("");
      setSavingView(false);
      toast.success("View saved");
    } catch (err) { toast.error(err.message); }
  };

  const handleDeleteView = async (id) => {
    try {
      await deleteSavedView(id);
      setSavedViews(prev => prev.filter(v => v.id !== id));
      if (activeView === id) setActiveView(null);
    } catch (err) { toast.error(err.message); }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditName(item.custom_name || item.name || "");
    setEditPrice(item.custom_price || "");
    setEditDesc(item.custom_description || "");
  };

  const saveEdit = async () => {
    try {
      await updateCatalogEntry(editingId, { custom_name: editName, custom_price: editPrice || null, custom_description: editDesc || null });
      setCatalog(prev => prev.map(c => c.id === editingId ? { ...c, custom_name: editName, custom_price: editPrice, custom_description: editDesc } : c));
      toast.success("Entry updated");
      setEditingId(null);
    } catch (err) { toast.error(err.message); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateCatalogStatus(id, status);
      setCatalog(prev => prev.map(c => c.id === id ? { ...c, status } : c));
      toast.success(`Status changed to ${status}`);
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteCatalogEntry(id);
      setCatalog(prev => prev.filter(c => c.id !== id));
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      setShowDeleteDialog(null);
      toast.success("Entry deleted");
    } catch (err) { toast.error(err.message); }
  };

  const fetchSuggestions = async (productId) => {
    if (qualitySuggestions[productId]) return;
    setLoadingSuggestions(true);
    try {
      const suggestions = await getQualitySuggestions(productId);
      setQualitySuggestions(prev => ({ ...prev, [productId]: suggestions }));
    } catch (err) { toast.error(err.message); }
    setLoadingSuggestions(false);
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredCatalog.length) setSelected(new Set());
    else setSelected(new Set(filteredCatalog.map(c => c.id)));
  };

  const handleBatchExport = () => {
    if (selected.size === 0) return toast.warning("Select products to export");
    if (selected.size === 1) {
      const item = catalog.find(c => selected.has(c.id));
      if (item) onExportProduct(item.product_id);
      return;
    }
    setShowBatchModal(true);
  };

  const doBatchExport = async () => {
    const items = [...selected].map(id => catalog.find(c => c.id === id)).filter(Boolean);
    setBatchExporting(true);
    setBatchProgress({ done: 0, total: items.length });

    if (batchPlat === "PDF Catalog") {
      try {
        const blob = await generateCatalogPdf(items, user?.store_name);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `catalog-${items.length}products.pdf`; a.click();
        URL.revokeObjectURL(url);
        for (const item of items) { try { await updateCatalogStatus(item.id, "Exported"); } catch {} }
        setBatchProgress({ done: items.length, total: items.length });
        toast.success(`PDF catalog generated (${items.length} product${items.length!==1?"s":""})`);
        setCatalog(prev => prev.map(c => selected.has(c.id) ? { ...c, status: "Exported" } : c));
        setSelected(new Set());
        setShowBatchModal(false);
      } catch (err) { toast.error("PDF generation failed: " + (err?.message||"")); }
      setBatchExporting(false);
      return;
    }

    const allContent = [];
    let success = 0, failed = 0;
    for (const item of items) {
      try {
        const result = await exportProduct(batchFmt, batchPlat, null, null, item.product_id);
        await updateCatalogStatus(item.id, "Exported");
        if (result.content) allContent.push({ content: result.content, filename: result.filename, contentType: result.contentType });
        success++;
      } catch (err) { failed++; }
      setBatchProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }
    setBatchExporting(false);
    if (success > 0) {
      // Download combined file or individual files
      if (allContent.length === 1) {
        const f = allContent[0];
        const blob = new Blob([f.content], { type: f.contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = f.filename; a.click();
        URL.revokeObjectURL(url);
      } else if (allContent.length > 1) {
        // Merge into single file for CSV, or download individually for XML/JSON
        if (batchFmt === "CSV") {
          const lines = allContent.map((f, i) => {
            const rows = f.content.split('\n');
            return i === 0 ? rows.join('\n') : rows.slice(1).join('\n');
          }).join('\n');
          const blob = new Blob([lines], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `batch-export-${batchPlat.toLowerCase()}-${items.length}products.csv`; a.click();
          URL.revokeObjectURL(url);
        } else {
          allContent.forEach(f => {
            const blob = new Blob([f.content], { type: f.contentType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = f.filename; a.click();
            URL.revokeObjectURL(url);
          });
        }
      }
      toast.success(`Exported ${success} product${success > 1 ? "s" : ""} as ${batchFmt}/${batchPlat}${failed ? ` (${failed} failed)` : ""}`);
      setCatalog(prev => prev.map(c => selected.has(c.id) ? { ...c, status: "Exported" } : c));
      setSelected(new Set());
      setShowBatchModal(false);
    } else { toast.error("Batch export failed"); }
  };

  const tp = catalog.length;
  const needsAttention = catalog.filter(c => (c.completeness ?? 0) < 70).length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24,opacity:loading?0:1,transition:"opacity 0.4s ease"}}>
      {/* Welcome + inline stats */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
        <div className="welcome-row">
          <BrandOrb size="sm" floating />
          <div>
            <h2 style={{fontSize:22,fontWeight:800,letterSpacing:"-0.02em",marginBottom:4}}>Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h2>
            <p style={{fontSize:13,color:"var(--text-dim)"}}>
              {loading ? "Loading your catalog..." : tp === 0 ? "Start by adding your first product." : `${tp} product${tp!==1?"s":""} in catalog${needsAttention > 0 ? ` \u00b7 ${needsAttention} need${needsAttention!==1?"":"s"} attention` : ""}`}
            </p>
          </div>
        </div>
        <button className="btn btn-primary" style={{boxShadow:"0 0 20px rgba(124,58,237,0.2)"}} onClick={onNew}><Icon name="plus" size={14}/> New Product</button>
      </div>

      {/* Catalog table */}
      <div>
        {/* Saved Views */}
        {savedViews.length > 0 && (
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"var(--text-dim)",fontWeight:500}}>Views:</span>
            {savedViews.map(v => (
              <button key={v.id} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:16,fontSize:11,fontWeight:600,border:`1px solid ${activeView===v.id?"var(--primary)":"var(--border-light)"}`,background:activeView===v.id?"rgba(37,99,235,0.08)":"transparent",color:activeView===v.id?"var(--primary-light)":"var(--text-muted)",cursor:"pointer",fontFamily:"'Sora',sans-serif",transition:"all 0.2s"}} onClick={()=>activeView===v.id?(setActiveView(null),setFilters({status:"",tag:"",minPrice:"",maxPrice:"",completeness:""})):applyView(v)}>
                {v.name}
                {activeView===v.id && <span onClick={e=>{e.stopPropagation();handleDeleteView(v.id);}} style={{marginLeft:2,cursor:"pointer"}}><Icon name="x" size={10}/></span>}
              </button>
            ))}
          </div>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <h3 style={{fontSize:15,fontWeight:700}}>Catalog</h3>
            <span style={{fontSize:12,color:"var(--text-dim)"}}>{filteredCatalog.length}{filteredCatalog.length !== catalog.length ? ` / ${catalog.length}` : ""} entries</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{position:"relative"}}><div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><Icon name="search" size={13} color="var(--text-dim)"/></div><input className="input" placeholder="Search..." value={searchFilter} onChange={e=>setSearchFilter(e.target.value)} style={{paddingLeft:32,width:180,fontSize:12,padding:"6px 10px 6px 30px",background:"transparent"}}/></div>
            <button className="btn btn-ghost" style={{fontSize:11,padding:"6px 10px",position:"relative"}} onClick={()=>setShowFilters(f=>!f)}>
              <Icon name="settings" size={12}/> Filter
              {activeFilterCount > 0 && <span style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"var(--primary)",color:"white",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{activeFilterCount}</span>}
            </button>
            {canEdit && visibleCols.tags && <button className="btn btn-ghost" style={{fontSize:11,padding:"6px 10px"}} onClick={()=>setShowTagManager(true)}><Icon name="tag" size={12}/> Tags</button>}
            <button className="btn btn-ghost" style={{fontSize:11,padding:"6px 10px"}} onClick={()=>setShowColPicker(p=>!p)}><Icon name="grid" size={12}/> Columns</button>
          </div>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="animate-slideUp" style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,padding:"10px 14px",background:"var(--hover-bg)",borderRadius:8,border:"1px solid var(--border-light)",flexWrap:"wrap"}}>
            <select className="input" style={{width:"auto",fontSize:11,padding:"5px 28px 5px 8px",background:"transparent"}} value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}>
              <option value="">All Status</option>
              {["Draft","Review","Published","Exported"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            {tags.length > 0 && <select className="input" style={{width:"auto",fontSize:11,padding:"5px 28px 5px 8px",background:"transparent"}} value={filters.tag} onChange={e=>setFilters(f=>({...f,tag:e.target.value}))}>
              <option value="">All Tags</option>
              {tags.map(t=><option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>}
            <select className="input" style={{width:"auto",fontSize:11,padding:"5px 28px 5px 8px",background:"transparent"}} value={filters.completeness} onChange={e=>setFilters(f=>({...f,completeness:e.target.value}))}>
              <option value="">All Quality</option>
              <option value="complete">Complete (100%)</option>
              <option value="good">Good (70-99%)</option>
              <option value="needs-work">Needs Work (40-69%)</option>
              <option value="poor">Poor (&lt;40%)</option>
            </select>
            <input className="input" type="number" placeholder="Min $" value={filters.minPrice} onChange={e=>setFilters(f=>({...f,minPrice:e.target.value}))} style={{width:80,fontSize:11,padding:"5px 8px",background:"transparent"}}/>
            <input className="input" type="number" placeholder="Max $" value={filters.maxPrice} onChange={e=>setFilters(f=>({...f,maxPrice:e.target.value}))} style={{width:80,fontSize:11,padding:"5px 8px",background:"transparent"}}/>
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              {activeFilterCount > 0 && !savingView && <button style={{fontSize:11,fontWeight:600,color:"var(--primary-light)",background:"none",border:"none",cursor:"pointer",fontFamily:"'Sora',sans-serif"}} onClick={()=>setSavingView(true)}>Save View</button>}
              {savingView && <>
                <input className="input" placeholder="View name..." value={newViewName} onChange={e=>setNewViewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSaveView()} style={{width:120,fontSize:11,padding:"4px 8px",background:"transparent"}}/>
                <button className="btn btn-primary" style={{fontSize:10,padding:"3px 8px"}} onClick={handleSaveView} disabled={!newViewName.trim()}>Save</button>
                <button style={{fontSize:11,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",fontFamily:"'Sora',sans-serif"}} onClick={()=>setSavingView(false)}>Cancel</button>
              </>}
              {activeFilterCount > 0 && <button style={{fontSize:11,fontWeight:600,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",fontFamily:"'Sora',sans-serif"}} onClick={()=>{setFilters({status:"",tag:"",minPrice:"",maxPrice:"",completeness:""});setActiveView(null);}}>Clear</button>}
            </div>
          </div>
        )}

        {/* Column Picker */}
        {showColPicker && (
          <div className="animate-slideUp" style={{display:"flex",gap:8,marginBottom:12,padding:"8px 14px",background:"var(--hover-bg)",borderRadius:8,border:"1px solid var(--border-light)",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:11,color:"var(--text-dim)",fontWeight:500}}>Show:</span>
            {[{k:"product",l:"Product"},{k:"barcode",l:"Barcode"},{k:"completeness",l:"Quality"},{k:"stock",l:"Stock"},{k:"status",l:"Status"},{k:"tags",l:"Tags"},{k:"date",l:"Date"},{k:"actions",l:"Actions"}].map(c=>(
              <button key={c.k} onClick={()=>setVisibleCols(v=>({...v,[c.k]:!v[c.k]}))} style={{fontSize:11,padding:"3px 10px",borderRadius:12,border:`1px solid ${visibleCols[c.k]?"var(--primary)":"var(--border-light)"}`,background:visibleCols[c.k]?"rgba(37,99,235,0.08)":"transparent",color:visibleCols[c.k]?"var(--primary-light)":"var(--text-dim)",cursor:"pointer",fontFamily:"'Sora',sans-serif",fontWeight:600,transition:"all 0.15s"}}>{c.l}</button>
            ))}
          </div>
        )}
        <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
        {loading ? (
          <div style={{padding:"12px 0"}}>{[0,1,2,3].map(i=><div key={i} style={{display:"flex",alignItems:"center",gap:16,padding:"14px 20px",borderBottom:"1px solid var(--border-light)",opacity:1-i*0.15}}><div className="skeleton" style={{height:14,width:"25%",borderRadius:4}}/><div className="skeleton" style={{height:12,width:"14%",borderRadius:4}}/><div className="skeleton" style={{height:6,width:60,borderRadius:3}}/><div className="skeleton" style={{height:22,width:60,borderRadius:20}}/><div className="skeleton" style={{height:12,width:"10%",borderRadius:4}}/><div className="skeleton" style={{height:12,width:80,borderRadius:4}}/></div>)}</div>
        ) : catalog.length === 0 ? (
          <div className="empty-state-modern">
            <BrandOrb size="lg" floating />
            <div className="es-title">No catalog entries yet</div>
            <div className="es-subtitle">Scan a barcode, upload a product image, or ask the AI to add one — your store starts here.</div>
            <div className="es-actions">
              <button className="btn btn-primary" style={{padding:"10px 22px"}} onClick={onNew}><Icon name="plus" size={14}/> Add First Product</button>
            </div>
          </div>
        ) : (
          <table style={{width:"100%",borderCollapse:"collapse",background:"var(--card-bg)",borderRadius:10,overflow:"hidden",border:"1px solid var(--border-light)"}}>
            <thead><tr style={{borderBottom:"1px solid var(--border)",position:"sticky",top:0,background:"var(--surface)",zIndex:2}}>
              {[
                {k:"product",l:"PRODUCT"},{k:"barcode",l:"BARCODE"},{k:"completeness",l:"QUALITY"},{k:"stock",l:"STOCK"},{k:"status",l:"STATUS"},{k:"tags",l:"TAGS"},{k:"date",l:"DATE"},{k:"actions",l:"ACTIONS"}
              ].filter(h=>visibleCols[h.k]).map(h=><th key={h.k} style={{padding:"10px 16px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em"}}>{h.l}</th>)}
            </tr></thead>
            <tbody>{filteredCatalog.map((item,i)=>{
              const isSelected = selected.has(item.id);
              return <tr key={item.id||i} className={`catalog-row ${isSelected?"selected":""}`} onClick={()=>toggleSelect(item.id)} style={{borderBottom:"1px solid var(--border-light)",background:isSelected?"rgba(124,58,237,0.06)":"transparent",cursor:"pointer"}} onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="var(--hover-bg)"}} onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background="transparent"}}>
              {visibleCols.product && <td style={{padding:"12px 16px",position:"relative"}}>
                <div style={{position:"absolute",left:6,top:"50%",transform:"translateY(-50%)",width:18,height:18,borderRadius:5,border:isSelected?"2px solid #3B82F6":"2px solid var(--border)",background:isSelected?"#3B82F6":"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",opacity:isSelected||selected.size>0?1:0}} className="row-check">
                  {isSelected && <Icon name="check" size={11} color="#fff"/>}
                </div>
                {editingId === item.id ? (
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginLeft:20}} onClick={e=>e.stopPropagation()}>
                    <input className="input" value={editName} onChange={e=>setEditName(e.target.value)} style={{fontSize:13,padding:"4px 8px"}} placeholder="Product name"/>
                    <div style={{display:"flex",gap:6}}>
                      <input className="input" value={editPrice} onChange={e=>setEditPrice(e.target.value)} style={{fontSize:12,padding:"3px 8px",width:90}} placeholder="Price"/>
                      <input className="input" value={editDesc} onChange={e=>setEditDesc(e.target.value)} style={{fontSize:12,padding:"3px 8px",flex:1}} placeholder="Description"/>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button className="btn btn-primary" style={{padding:"3px 10px",fontSize:11}} onClick={saveEdit}><Icon name="check" size={11}/> Save</button>
                      <button className="btn btn-ghost" style={{padding:"3px 10px",fontSize:11}} onClick={()=>setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <span style={{marginLeft:20}}><span style={{fontSize:13,fontWeight:600}}>{item.custom_name||item.name||"Untitled"}</span>{item.brand&&<span style={{fontSize:11,color:"var(--text-dim)",marginLeft:8}}>{item.brand}</span>}{item.custom_price&&<span style={{fontSize:11,color:"#10B981",marginLeft:8}}>${item.custom_price}</span>}</span>
                )}
              </td>}
              {visibleCols.barcode && <td style={{padding:"12px 16px"}}><span className="mono" style={{fontSize:12,color:"var(--text-muted)",display:"flex",alignItems:"center",gap:4}}>{item.barcode||"\u2014"}{item.barcode&&<CopyButton text={item.barcode}/>}</span></td>}
              {visibleCols.completeness && <td style={{padding:"12px 16px"}} onClick={e=>e.stopPropagation()}>
                {(() => {
                  const pct = item.completeness ?? 0;
                  const color = pct === 100 ? "#10B981" : pct >= 70 ? "#3B82F6" : pct >= 40 ? "#F59E0B" : "#EF4444";
                  return (
                    <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>setCompletenessModal(item)} title="View completeness details">
                      <div style={{width:60,height:6,borderRadius:3,background:"var(--hover-bg)",overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:3,background:color,width:`${pct}%`,transition:"width 0.4s ease"}}/>
                      </div>
                      <span className="mono" style={{fontSize:11,fontWeight:700,color}}>{pct}%</span>
                    </div>
                  );
                })()}
              </td>}
              {visibleCols.stock && <td style={{padding:"12px 16px"}} onClick={e=>e.stopPropagation()}>
                {item.variant_count > 0 ? (() => {
                  const total = item.variant_stock || 0;
                  const color = total === 0 ? "#EF4444" : total <= (item.low_stock_threshold ?? 5) ? "#F59E0B" : "var(--text-muted)";
                  return (
                    <div style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}} onClick={()=>setVariantEntry(item)} title="View variants">
                      <span className="mono" style={{fontSize:12,fontWeight:600,color}}>{total}</span>
                      <span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:"rgba(124,58,237,0.15)",color:"var(--primary-light,#A78BFA)",fontWeight:700}}>{item.variant_count} VAR</span>
                    </div>
                  );
                })() : stockEditId===item.id ? (() => {
                  const saveStock = async () => {
                    const v = stockEditValue==="" ? null : parseInt(stockEditValue,10);
                    try {
                      await updateCatalogEntry(item.id,{stock_quantity:v});
                      setCatalog(prev=>prev.map(c=>c.id===item.id?{...c,stock_quantity:v}:c));
                      toast.success("Stock updated");
                      setStockEditId(null);
                    } catch(err) {
                      toast.error(err?.message||"Update failed — restart backend if column is missing");
                    }
                  };
                  const bump = (d) => {
                    const cur = parseInt(stockEditValue,10);
                    const next = (isNaN(cur)?0:cur) + d;
                    setStockEditValue(String(Math.max(0,next)));
                  };
                  return (
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <button type="button" className="stepper-btn" onClick={()=>bump(-1)}>−</button>
                      <input className="input" type="number" min="0" value={stockEditValue} onChange={e=>setStockEditValue(e.target.value)} onKeyDown={e=>{
                        if(e.key==="Enter") saveStock();
                        else if(e.key==="Escape") setStockEditId(null);
                      }} autoFocus style={{width:54,fontSize:12,padding:"3px 6px",textAlign:"center"}}/>
                      <button type="button" className="stepper-btn" onClick={()=>bump(1)}>+</button>
                      <button className="btn btn-ghost" style={{padding:"3px 6px",fontSize:11}} onClick={saveStock} title="Save"><Icon name="check" size={11}/></button>
                      <button className="btn btn-ghost" style={{padding:"3px 6px",fontSize:11}} onClick={()=>setStockEditId(null)} title="Cancel"><Icon name="x" size={11}/></button>
                    </div>
                  );
                })() : (() => {
                  const stock = item.stock_quantity;
                  const threshold = item.low_stock_threshold ?? 5;
                  const isLow = stock !== null && stock !== undefined && stock <= threshold;
                  const isOut = stock === 0;
                  const color = isOut ? "#EF4444" : isLow ? "#F59E0B" : "var(--text-muted)";
                  return (
                    <div style={{display:"flex",alignItems:"center",gap:6,cursor:canEdit?"pointer":"default"}} onClick={()=>{if(canEdit){setStockEditId(item.id);setStockEditValue(stock==null?"":String(stock));}}} title={canEdit?"Click to edit":""}>
                      <span className="mono" style={{fontSize:12,fontWeight:600,color}}>{stock==null?"—":stock}</span>
                      {isOut && <span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:"rgba(239,68,68,0.15)",color:"#EF4444",fontWeight:700}}>OUT</span>}
                      {!isOut && isLow && <span style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:"rgba(245,158,11,0.15)",color:"#F59E0B",fontWeight:700}}>LOW</span>}
                    </div>
                  );
                })()}
              </td>}
              {visibleCols.status && <td style={{padding:"12px 16px"}}><span className={`badge ${sc[item.status]||"badge-neutral"}`}>{item.status||"Draft"}</span></td>}
              {visibleCols.tags && <td style={{padding:"12px 16px"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  {(entryTags[item.id]||[]).map(tid=>{const t=tags.find(x=>x.id===tid);return t?<span key={tid} style={{padding:"1px 7px",borderRadius:10,fontSize:10,fontWeight:600,background:t.color+"18",color:t.color,border:`1px solid ${t.color}30`}}>{t.name}</span>:null;})}
                  {canEdit && <button style={{width:18,height:18,borderRadius:"50%",border:"1px dashed var(--border)",background:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0}} title="Manage tags" onClick={()=>setTagEntryId(tagEntryId===item.id?null:item.id)}><Icon name="plus" size={9} color="var(--text-dim)"/></button>}
                </div>
                {tagEntryId===item.id && (
                  <div className="animate-fadeIn" style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
                    {tags.map(t=>{const active=(entryTags[item.id]||[]).includes(t.id);return <button key={t.id} onClick={()=>{const current=entryTags[item.id]||[];const next=active?current.filter(x=>x!==t.id):[...current,t.id];handleSetEntryTags(item.id,next);}} style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:600,border:`1px solid ${active?t.color:t.color+"40"}`,background:active?t.color+"20":"transparent",color:active?t.color:"var(--text-dim)",cursor:"pointer",fontFamily:"'Sora',sans-serif",transition:"all 0.15s"}}>{t.name}</button>;})}
                  </div>
                )}
              </td>}
              {visibleCols.date && <td style={{padding:"12px 16px"}}><span style={{fontSize:12,color:"var(--text-dim)"}}>{item.updated_at?new Date(item.updated_at).toLocaleDateString():""}</span></td>}
              {visibleCols.actions && <td style={{padding:"12px 16px"}}><div style={{display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>
                <button className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11}} title="View" onClick={()=>onViewProduct(item.product_id,1)}><Icon name="eye" size={12}/></button>
                <button className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11}} title="Edit" onClick={()=>startEdit(item)}><Icon name="edit" size={12}/></button>
                <button className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11,position:"relative"}} title="Variants" onClick={()=>setVariantEntry(item)}>
                  <Icon name="copy" size={12}/>
                  {item.variant_count>0 && <span style={{position:"absolute",top:-2,right:-2,fontSize:9,fontWeight:700,background:"#7C3AED",color:"#fff",borderRadius:8,padding:"1px 5px",minWidth:14,textAlign:"center"}}>{item.variant_count}</span>}
                </button>
                <button className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11}} title="Export" onClick={()=>onExportProduct(item.product_id)}><Icon name="download" size={12}/></button>
                <button className="btn btn-ghost" style={{padding:"4px 8px",fontSize:11,color:"#EF4444"}} title="Delete" onClick={()=>setShowDeleteDialog(item.id)}><Icon name="trash" size={12} color="#EF4444"/></button>
              </div></td>}
            </tr>})}</tbody>
          </table>
        )}
        {selected.size > 0 && (
          <div style={{position:"sticky",bottom:0,left:0,right:0,padding:"12px 20px",background:"var(--bg-card)",borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",backdropFilter:"blur(12px)",animation:"slideUp 0.2s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{selected.size} selected</span>
              <button className="btn btn-ghost" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>{selected.size===filteredCatalog.length?setSelected(new Set()):setSelected(new Set(filteredCatalog.map(c=>c.id)));}}>
                {selected.size===filteredCatalog.length?"Deselect All":"Select All"}
              </button>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button className="btn btn-ghost" style={{fontSize:12,padding:"6px 14px"}} onClick={()=>setSelected(new Set())}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{fontSize:12,padding:"6px 16px"}} disabled={batchExporting} onClick={handleBatchExport}>
                <Icon name="download" size={13}/> {batchExporting?"Exporting...":`Export ${selected.size} Product${selected.size>1?"s":""}`}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Brand voices — compact row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",borderTop:"1px solid var(--border-light)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:13,fontWeight:600,color:"var(--text-dim)"}}>Brand Voices</span>
          {voices.length > 0 ? (
            <div style={{display:"flex",gap:8}}>
              {voices.slice(0,4).map((pr,i)=>(
                <span key={pr.id||i} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:600,background:"var(--hover-bg)",border:"1px solid var(--border-light)",cursor:"pointer",transition:"all 0.15s"}} onClick={onViewVoices}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:pr.color}}/>{pr.name}
                </span>
              ))}
              {voices.length>4&&<span style={{fontSize:11,color:"var(--text-dim)",alignSelf:"center"}}>+{voices.length-4}</span>}
            </div>
          ) : <span style={{fontSize:12,color:"var(--text-dim)"}}>None yet</span>}
        </div>
        <button className="btn btn-ghost" style={{fontSize:12,padding:"5px 12px"}} onClick={onViewVoices}><Icon name="plus" size={12}/> {voices.length > 0 ? "Manage" : "Create"}</button>
      </div>
      {showDeleteDialog && <ConfirmDialog title="Delete Catalog Entry" message="This will permanently remove this product from your catalog. This action cannot be undone."
        confirmLabel="Delete" confirmColor="#EF4444" onCancel={() => setShowDeleteDialog(null)} onConfirm={() => handleDelete(showDeleteDialog)} />}

      {/* Tag Manager Modal */}
      {showTagManager && (
        <div className="modal-modern-overlay" onClick={()=>setShowTagManager(false)}>
          <div className="modal-modern-card size-sm" onClick={e=>e.stopPropagation()}>
            <div className="modal-modern-blobs" />
            <div className="modal-modern-header">
              <div>
                <h3>Manage Tags</h3>
                <p>Organize products with custom labels</p>
              </div>
              <button className="modal-modern-close" onClick={()=>setShowTagManager(false)}><Icon name="x" size={14}/></button>
            </div>
            <div className="modal-modern-body">
              <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
                <input className="input" placeholder="New tag name..." value={newTagName} onChange={e=>setNewTagName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleCreateTag()} style={{fontSize:13,flex:1}}/>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"].map(c=>(
                    <div key={c} onClick={()=>setNewTagColor(c)} style={{width:20,height:20,borderRadius:"50%",background:c,cursor:"pointer",border:newTagColor===c?"2px solid var(--text)":"2px solid transparent",transition:"all 0.15s"}}/>
                  ))}
                </div>
                <button className="btn btn-primary" style={{padding:"6px 12px",fontSize:12}} onClick={handleCreateTag} disabled={!newTagName.trim()}>Add</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:250,overflowY:"auto"}}>
                {tags.length === 0 && <p style={{fontSize:13,color:"var(--text-dim)",textAlign:"center",padding:20}}>No tags yet — create your first one above</p>}
                {tags.map(t=>(
                  <div key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"var(--hover-bg)",borderRadius:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:t.color}}/>
                      <span style={{fontSize:13,fontWeight:600}}>{t.name}</span>
                      <span style={{fontSize:11,color:"var(--text-dim)"}}>{t.entry_count||0} items</span>
                    </div>
                    <button style={{background:"none",border:"none",cursor:"pointer"}} onClick={()=>handleDeleteTag(t.id)}><Icon name="trash" size={12} color="#EF4444"/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {changelogEntry && (
        <div className="modal-modern-overlay" onClick={()=>setChangelogEntry(null)}>
          <div className="modal-modern-card" onClick={e=>e.stopPropagation()}>
            <div className="modal-modern-blobs" />
            <div className="modal-modern-header">
              <div>
                <h3>Product History</h3>
                <p>{changelogEntry.custom_name||changelogEntry.name||"Untitled"}</p>
              </div>
              <button className="modal-modern-close" onClick={()=>setChangelogEntry(null)}><Icon name="x" size={14}/></button>
            </div>
            <div className="modal-modern-body">
              {changelog.length === 0 ? (
                <div style={{textAlign:"center",padding:30}}>
                  <Icon name="clock" size={24} color="var(--text-dim)"/>
                  <p style={{fontSize:13,color:"var(--text-dim)",marginTop:8}}>No history yet for this product</p>
                </div>
              ) : changelog.map((a,i) => (
                <div key={a.id||i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<changelog.length-1?"1px solid var(--border-light)":"none"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:({saved:"#3B82F6",created:"#10B981",updated:"#F59E0B",deleted:"#EF4444",exported:"#8B5CF6"})[a.action]||"#3B82F6"}}/>
                    {i<changelog.length-1 && <div style={{width:1,flex:1,background:"var(--border-light)",marginTop:4}}/>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,color:"var(--text-sec)"}}>
                      <span style={{fontWeight:600}}>{a.user_name}</span> {a.action}
                      {a.details?.status && <span> status to <span style={{fontWeight:600}}>{a.details.status}</span></span>}
                      {a.details?.name && <span> name to <span style={{fontWeight:600}}>{a.details.name}</span></span>}
                      {a.details?.price && <span> price to <span style={{fontWeight:600}}>${a.details.price}</span></span>}
                      {a.details?.format && <span> as {a.details.platform} {a.details.format}</span>}
                    </div>
                    <div style={{fontSize:10,color:"var(--text-dim)",marginTop:2}}>
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {variantEntry && (
        <div className="modal-modern-overlay" onClick={()=>{setVariantEntry(null);getCatalog().then(c=>setCatalog(c||[])).catch(()=>{})}}>
          <div className="modal-modern-card size-lg" onClick={e=>e.stopPropagation()}>
            <div className="modal-modern-blobs" />
            <div className="modal-modern-header">
              <div>
                <h3>Variants</h3>
                <p>{variantEntry.custom_name||variantEntry.name}</p>
              </div>
              <button className="modal-modern-close" onClick={()=>{setVariantEntry(null);getCatalog().then(c=>setCatalog(c||[])).catch(()=>{})}}><Icon name="x" size={14}/></button>
            </div>
            <div className="modal-modern-body">
              <VariantManager entryId={variantEntry.id} canEdit={canEdit}/>
            </div>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="modal-modern-overlay" onClick={()=>{if(!batchExporting)setShowBatchModal(false);}}>
          <div className="modal-modern-card size-sm" onClick={e=>e.stopPropagation()}>
            <div className="modal-modern-blobs" />
            <div className="modal-modern-header">
              <div>
                <h3>Batch Export</h3>
                <p>{selected.size} product{selected.size>1?"s":""} selected</p>
              </div>
              <button className="modal-modern-close" onClick={()=>{if(!batchExporting)setShowBatchModal(false);}} disabled={batchExporting}><Icon name="x" size={14}/></button>
            </div>
            <div className="modal-modern-body">
          <div style={{marginBottom:18}}>
            <label style={{fontSize:12,fontWeight:600,color:"var(--text-dim)",marginBottom:8,display:"block",letterSpacing:"0.04em"}}>FORMAT</label>
            <div style={{display:"flex",gap:8,opacity:batchPlat==="PDF Catalog"?0.4:1,pointerEvents:batchPlat==="PDF Catalog"?"none":"auto"}}>{["CSV","JSON","XML"].map(f=><button key={f} onClick={()=>setBatchFmt(f)} className="mono" style={{flex:1,padding:12,borderRadius:8,border:`2px solid ${batchFmt===f?"#3B82F6":"var(--border)"}`,background:batchFmt===f?"rgba(37,99,235,0.1)":"var(--hover-bg)",color:batchFmt===f?"#60A5FA":"var(--text-muted)",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>{f}</button>)}</div>
          </div>

          <div style={{marginBottom:24}}>
            <label style={{fontSize:12,fontWeight:600,color:"var(--text-dim)",marginBottom:8,display:"block",letterSpacing:"0.04em"}}>PLATFORM</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{[
              {name:"Shopify",color:"#96BF48"},{name:"WooCommerce",color:"#7F54B3"},{name:"Magento",color:"#EE672F"},{name:"BigCommerce",color:"#34313F"},{name:"Google Shopping",color:"#4285F4"},{name:"PDF Catalog",color:"#DC2626"}
            ].map(p=><button key={p.name} onClick={()=>{setBatchPlat(p.name); if(p.name==="Google Shopping") setBatchFmt("XML"); else if(p.name==="PDF Catalog") setBatchFmt("PDF");}} style={{padding:12,borderRadius:8,border:`2px solid ${batchPlat===p.name?p.color:"var(--border)"}`,background:batchPlat===p.name?p.color+"18":"var(--hover-bg)",cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:p.color}}/>
              <span style={{fontSize:13,fontWeight:600,color:batchPlat===p.name?"var(--text)":"var(--text-muted)"}}>{p.name}</span>
            </button>)}</div>
          </div>

          {batchExporting && <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--text-dim)",marginBottom:6}}>
              <span>Exporting...</span><span>{batchProgress.done}/{batchProgress.total}</span>
            </div>
            <div style={{height:6,borderRadius:3,background:"var(--hover-bg)",overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:3,background:"#3B82F6",transition:"width 0.3s",width:`${batchProgress.total?((batchProgress.done/batchProgress.total)*100):0}%`}}/>
            </div>
          </div>}
            </div>
            <div className="modal-modern-footer">
              <button className="btn btn-ghost" style={{fontSize:13}} disabled={batchExporting} onClick={()=>setShowBatchModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{fontSize:13,padding:"8px 20px"}} disabled={batchExporting} onClick={doBatchExport}>
                <Icon name="download" size={14}/> {batchExporting?`Exporting ${batchProgress.done}/${batchProgress.total}...`:`Export & Download`}
              </button>
            </div>
          </div>
        </div>
      )}

      {completenessModal && (() => {
        const ci = completenessModal;
        const pct = ci.completeness ?? 0;
        const issues = ci.completeness_issues || [];
        const pColor = pct === 100 ? "#10B981" : pct >= 70 ? "#3B82F6" : pct >= 40 ? "#F59E0B" : "#EF4444";
        const aiTips = qualitySuggestions[ci.product_id];
        return (
          <div className="modal-modern-overlay" onClick={()=>setCompletenessModal(null)}>
            <div className="modal-modern-card size-sm" onClick={e=>e.stopPropagation()}>
              <div className="modal-modern-blobs" />
              <div className="modal-modern-header">
                <div>
                  <h3>{ci.custom_name || ci.name || "Untitled"}</h3>
                  <p>Quality breakdown · {pct}% complete</p>
                </div>
                <button className="modal-modern-close" onClick={()=>setCompletenessModal(null)}><Icon name="x" size={14}/></button>
              </div>
              <div className="modal-modern-body">
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
                <div style={{flex:1,height:8,borderRadius:4,background:"var(--hover-bg)",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:4,background:pColor,width:`${pct}%`,transition:"width 0.4s ease"}}/>
                </div>
                <span className="mono" style={{fontSize:16,fontWeight:800,color:pColor}}>{pct}%</span>
              </div>

              {pct === 100 ? (
                <div style={{textAlign:"center",padding:16}}>
                  <Icon name="check" size={28} color="#10B981"/>
                  <p style={{fontSize:14,fontWeight:600,color:"#10B981",marginTop:8}}>All fields complete!</p>
                </div>
              ) : (
                <div style={{marginBottom:20}}>
                  <h4 style={{fontSize:12,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.05em",marginBottom:10}}>MISSING FIELDS</h4>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {issues.map((issue, j) => (
                      <div key={j} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--hover-bg)",borderRadius:8}}>
                        <Icon name="warning" size={14} color="#F59E0B"/>
                        <span style={{fontSize:13,color:"var(--text)"}}>{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pct < 100 && (
                <div style={{borderTop:"1px solid var(--border)",paddingTop:16}}>
                  {!aiTips && !loadingSuggestions && (
                    <button className="btn btn-ghost" style={{width:"100%",justifyContent:"center",gap:8,fontSize:13}} onClick={()=>fetchSuggestions(ci.product_id)}>
                      <Icon name="sparkle" size={14} color="#8B5CF6"/> Get AI Tips
                    </button>
                  )}
                  {loadingSuggestions && (
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:12}}>
                      <LoadingDots/><span style={{fontSize:13,color:"var(--text-dim)"}}>Analyzing...</span>
                    </div>
                  )}
                  {aiTips && aiTips.length > 0 && (
                    <div>
                      <h4 style={{fontSize:12,fontWeight:700,color:"#8B5CF6",letterSpacing:"0.05em",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                        <Icon name="sparkle" size={12} color="#8B5CF6"/> AI SUGGESTIONS
                      </h4>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {aiTips.map((s,j) => (
                          <div key={j} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 12px",background:"var(--hover-bg)",borderRadius:8}}>
                            <div style={{width:6,height:6,borderRadius:"50%",marginTop:6,flexShrink:0,background:s.priority==="high"?"#EF4444":s.priority==="medium"?"#F59E0B":"#3B82F6"}}/>
                            <p style={{fontSize:12,color:"var(--text)",lineHeight:"1.5",margin:0}}>{s.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiTips && aiTips.length === 0 && (
                    <p style={{fontSize:13,color:"var(--text-dim)",textAlign:"center"}}>No additional suggestions.</p>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Dashboard;
