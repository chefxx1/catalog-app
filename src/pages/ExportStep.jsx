import React, { useState, useEffect } from "react";
import { toast } from "../components/Toast";
import { Icon } from "../components/shared";
import { exportProduct, getExportHistory, downloadExport, getGoogleMerchantFeed } from "../api";

// ============================================================
// STEP 3: EXPORT
// ============================================================
const ExportStep = ({ onComplete, productData, user }) => {
  const canWrite = user?.role === "Admin" || user?.role === "Editor";
  const [fmt,setFmt]=useState("CSV"); const [plat,setPlat]=useState("Shopify"); const [exporting,setExporting]=useState(false); const [progress,setProgress]=useState(0); const [done,setDone]=useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportedFile, setExportedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const platforms=[{name:"Shopify",color:"#96BF48"},{name:"WooCommerce",color:"#7F54B3"},{name:"Magento",color:"#EE672F"},{name:"BigCommerce",color:"#34313F"},{name:"Google Shopping",color:"#4285F4"}];
  const product = productData?.product || {};
  const productName = product.name || "Product";

  useEffect(() => { getExportHistory().then(setHistory).catch(() => { toast.warning("Could not load export history"); }); }, [done]);

  const handleExport=async()=>{
    setExporting(true); setExportError(null); setProgress(0); setShowPreview(false);
    const progressInterval = setInterval(() => setProgress(p => Math.min(p + 8, 90)), 100);
    try {
      let result;
      if (plat === "Google Shopping") {
        const r = await getGoogleMerchantFeed();
        if (r.productCount === 0) { throw new Error("No published products to export"); }
        result = { content: r.content, filename: r.filename, contentType: "application/xml" };
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
    const blob = new Blob([exportedFile.content], { type: exportedFile.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = exportedFile.filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    setExportError(null);
    try {
      const result = await exportProduct(fmt, plat, product.barcode, productData);
      setPreview(result.content);
      setShowPreview(true);
    } catch (err) {
      setExportError(err.message);
    }
  };

  const handleRedownload = async (exp) => {
    try {
      const data = await downloadExport(exp.id);
      const blob = new Blob([data.content], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error("Download failed: " + err.message); }
  };

  if(done) return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:24,padding:"60px 20px",textAlign:"center"}}>
      <div className="animate-scaleIn" style={{width:80,height:80,borderRadius:"50%",background:"rgba(16,185,129,0.15)",border:"2px solid #10B981",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="check" size={36} color="#10B981"/></div>
      <div><h2 style={{fontSize:28,fontWeight:800,marginBottom:8}}>Export Complete!</h2><p style={{color:"var(--text-muted)",maxWidth:400}}>Your product has been exported to {plat} as {fmt}. Ready to import!</p></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,maxWidth:480}}>
        {[{l:"Products Exported",v:"1"},{l:"Platform",v:plat},{l:"Format",v:fmt}].map((s,i)=><div key={i} className="card" style={{textAlign:"center"}}><div className="mono" style={{fontSize:24,fontWeight:800,color:"#10B981"}}>{s.v}</div><div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>{s.l}</div></div>)}
      </div>
      <div style={{display:"flex",gap:12}}><button className="btn btn-success" onClick={handleDownload}><Icon name="download" size={15}/> Download {exportedFile?.filename || "File"}</button><button className="btn btn-ghost" onClick={onComplete}><Icon name="plus" size={15}/> New Product</button></div>
    </div>
  );

  return (
    <div className="animate-fadeIn" style={{maxWidth:600,margin:"0 auto",padding:"24px 20px",display:"flex",flexDirection:"column",gap:20}}>
      <div>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Export Catalog</h2>
        <p style={{color:"var(--text-muted)",fontSize:13}}>Choose your export format and destination platform</p>
      </div>
      {exportError&&<div style={{padding:"10px 14px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,fontSize:13,color:"#FCA5A5",display:"flex",gap:8,alignItems:"center"}}><Icon name="warning" size={14} color="#EF4444"/>{exportError}</div>}
      <div>
        <div style={{fontSize:11,fontWeight:600,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:10}}>FORMAT</div>
        <div style={{display:"flex",gap:8}}>{["CSV","JSON","XML"].map(f=>{
          const icons = {CSV:"download",JSON:"code",XML:"code"};
          return <button key={f} onClick={()=>{setFmt(f);setShowPreview(false);}} style={{flex:1,padding:"12px 8px",borderRadius:10,border:`1.5px solid ${fmt===f?"#3B82F6":"var(--border)"}`,background:fmt===f?"rgba(37,99,235,0.08)":"transparent",color:fmt===f?"#60A5FA":"var(--text-muted)",cursor:"pointer",transition:"all 0.2s",display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontFamily:"'Sora',sans-serif"}}>
            <Icon name={icons[f]} size={16} color={fmt===f?"#3B82F6":"var(--text-dim)"}/>
            <span className="mono" style={{fontSize:14,fontWeight:700}}>{f}</span>
          </button>;
        })}</div>
      </div>
      <div>
        <div style={{fontSize:11,fontWeight:600,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:10}}>PLATFORM</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{platforms.map(pl=><div key={pl.name} className={`export-card ${plat===pl.name?"selected":""}`} onClick={()=>{setPlat(pl.name); if(pl.name==="Google Shopping") setFmt("XML"); setShowPreview(false);}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:8,height:8,borderRadius:"50%",background:pl.color}}/><span style={{fontSize:13,fontWeight:600}}>{pl.name}</span></div>
          <div style={{fontSize:11,color:"var(--text-dim)",marginTop:4}}>{pl.name==="Google Shopping"?"Product feed XML":fmt+" optimized"}</div>
          {plat===pl.name&&<div style={{position:"absolute",top:10,right:10}}><Icon name="check" size={13} color="#10B981"/></div>}
        </div>)}</div>
      </div>
      <div style={{padding:14,background:"var(--hover-bg)",borderRadius:10,border:"1px solid var(--border)"}}>
        <div style={{fontSize:11,fontWeight:600,color:"var(--text-dim)",marginBottom:8,letterSpacing:"0.06em"}}>SUMMARY</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px"}}>
          {[["Product",productName],["Format",fmt],["Platform",plat],["Barcode",product.barcode||"N/A"],["Description",(product.ai_description_professional||product.edited_description)?"AI-Generated":"Standard"],["Price",productData?.enriched?.price||"Not set"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0"}}><span style={{color:"var(--text-dim)"}}>{k}</span><span className={k==="Format"?"mono":""} style={{color:"var(--text-sec)",fontWeight:500}}>{v}</span></div>)}
        </div>
      </div>
      {showPreview&&preview&&<div style={{maxHeight:250,overflow:"auto",background:"var(--hover-bg)",border:"1px solid var(--border)",borderRadius:10,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em"}}>EXPORT PREVIEW — {fmt}</span>
          <button className="btn btn-ghost" style={{fontSize:11,padding:"2px 8px"}} onClick={()=>setShowPreview(false)}><Icon name="x" size={12}/></button>
        </div>
        <pre className="mono" style={{fontSize:11,color:"var(--text-muted)",whiteSpace:"pre-wrap",wordBreak:"break-all",lineHeight:1.5,margin:0}}>{preview}</pre>
      </div>}
      {exporting&&<div><div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}><span style={{color:"var(--text-muted)"}}>Generating {fmt}...</span><span className="mono" style={{color:"#10B981"}}>{progress}%</span></div><div className="progress-bar" style={{height:6}}><div className="progress-fill" style={{width:`${progress}%`,background:"linear-gradient(90deg,#2563EB,#10B981)"}}/></div></div>}
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{justifyContent:"center",fontSize:13,padding:14}} onClick={handlePreview} disabled={exporting}><Icon name="search" size={15}/> Preview</button>
        <button className="btn btn-success" style={{flex:1,justifyContent:"center",fontSize:15,padding:14}} onClick={handleExport} disabled={exporting||!canWrite} title={!canWrite?"Viewers cannot export products":""}>{exporting?<><Icon name="refresh" size={15}/> Generating...</>:<><Icon name="download" size={15}/> Export to {plat}</>}</button>
      </div>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setShowHistory(!showHistory)}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em"}}>EXPORT HISTORY ({history.length})</div>
          <Icon name={showHistory?"chevronDown":"chevronRight"} size={14} color="var(--text-dim)"/>
        </div>
        {showHistory&&<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflow:"auto"}}>
          {history.length===0&&<div style={{fontSize:12,color:"var(--text-dim)",textAlign:"center",padding:12}}>No exports yet</div>}
          {history.map(exp=><div key={exp.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"var(--hover-bg)",borderRadius:6,fontSize:12,border:"1px solid var(--border)"}}>
            <div>
              <div style={{fontWeight:600,color:"var(--text-sec)"}}>{exp.product_name||exp.barcode}</div>
              <div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>{exp.platform} · {exp.format} · {new Date(exp.created_at).toLocaleDateString()}</div>
            </div>
            <button className="btn btn-ghost" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>handleRedownload(exp)}><Icon name="download" size={12}/></button>
          </div>)}
        </div>}
      </div>
    </div>
  );
};

export default ExportStep;
