import React, { useState, useRef } from "react";
import { Icon, LoadingDots } from "../components/shared";
import { toast } from "../components/Toast";
import { searchProduct, identifyProduct, searchProductImages } from "../api";
import { Html5Qrcode } from "html5-qrcode";
import CameraScanner from "../components/CameraScanner";
import BrandOrb from "../components/BrandOrb";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const SearchStep = ({ onSearch }) => {
  const [upc,setUpc]=useState(""); const [loading,setLoading]=useState(false); const [loadingStep,setLoadingStep]=useState(0); const [dragOver,setDragOver]=useState(false); const fileRef=useRef(null);
  const [error,setError]=useState(null); const [notFound,setNotFound]=useState(false);
  const [scannerOpen,setScannerOpen]=useState(false);
  const msgs=["Checking Open Food Facts...","Scanning UPC Database..."];
  const sourceNames=[{name:"Open Food Facts",icon:"database",trustScore:75,color:"#10B981"},{name:"UPC Database",icon:"barcode",trustScore:80,color:"#6366F1"}];
  // Monotonic id used to ignore stale in-flight searches when the user kicks off a new one.
  const searchSeqRef = useRef(0);
  const handleSearch=(code)=>{
    const barcode=code||upc.trim();
    if(!barcode||loading) return;
    setError(null); setNotFound(false); setLoading(true); setLoadingStep(0);
    const myId = ++searchSeqRef.current;
    let s=0;
    const iv=setInterval(()=>{ s++; if(s>=msgs.length){clearInterval(iv);} else setLoadingStep(s); },800);
    searchProduct(barcode).then(data=>{
      clearInterval(iv);
      if (myId !== searchSeqRef.current) return; // a newer search superseded us
      setLoadingStep(msgs.length-1);
      setTimeout(()=>{
        if (myId !== searchSeqRef.current) return;
        setLoading(false);
        if(!data.product){ setNotFound(true); } else { onSearch(data); }
      },600);
    }).catch(err=>{
      clearInterval(iv);
      if (myId !== searchSeqRef.current) return;
      setLoading(false);
      setError(err.message||"Search failed");
    });
  };
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState(null);
  const compressImage = (file, maxSize = 800) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error("Could not decode image — try a different file"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  const [productImages, setProductImages] = useState([]);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [searchingImages, setSearchingImages] = useState(false);
  const handleIdentifyBase64 = async (base64) => {
    setError(null); setIdentifying(true); setIdentified(null); setProductImages([]); setSelectedImages(new Set());
    try {
      setUploadedImage(base64);
      const result = await identifyProduct(base64);
      setIdentified(result);
      if (result.name) {
        setSearchingImages(true);
        searchProductImages(`${result.name} ${result.brand || ''}`).then(imgs => {
          setProductImages(imgs);
          setSelectedImages(new Set([0]));
        }).catch(() => { toast.warning("Could not load product images"); }).finally(() => setSearchingImages(false));
      }
    } catch (err) { setError(err.message || "Image identification failed"); }
    finally { setIdentifying(false); }
  };
  const handleImageIdentify = async (file) => {
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image is too large (${Math.round(file.size / 1024 / 1024)} MB). Max 10 MB.`);
      return;
    }
    setError(null); setIdentifying(true); setIdentified(null); setProductImages([]); setSelectedImages(new Set());
    try {
      const base64 = await compressImage(file);
      setUploadedImage(base64);
      const result = await identifyProduct(base64);
      setIdentified(result);
      // Search for product images in background
      if (result.name) {
        setSearchingImages(true);
        searchProductImages(`${result.name} ${result.brand || ''}`).then(imgs => {
          setProductImages(imgs);
          setSelectedImages(new Set([0])); // auto-select first
        }).catch(() => { toast.warning("Could not load product images"); }).finally(() => setSearchingImages(false));
      }
    } catch (err) {
      setError(err.message || "Image identification failed");
    } finally {
      setIdentifying(false);
    }
  };
  const [uploadedImage, setUploadedImage] = useState(null);
  const handleIdentifiedSearch = () => {
    if (!identified) return;
    // Map AI sources to display format
    const aiSources = (identified.sources || []).map(s => ({
      source_name: s.name, trust_score: s.trustScore || 75, price: s.price?.replace(/[^0-9.]/g, '') || null,
      currency: 'USD', source_url: s.url || null,
    }));
    // Build images: uploaded photo + selected product images
    const aiImages = [];
    if (uploadedImage) aiImages.push({ id: 1, image_url: uploadedImage, quality_score: 85, source_name: "Uploaded photo" });
    productImages.forEach((img, i) => {
      if (selectedImages.has(i)) aiImages.push({ id: i + 2, image_url: img.url, quality_score: 80, source_name: img.source || "Web" });
    });
    onSearch({
      product: { name: identified.name, brand: identified.brand, description: identified.description, barcode: identified.barcode || null, ai_category_suggestion: identified.category, attributes: identified.specs },
      sources: aiSources, images: aiImages, conflicts: [],
    });
  };
  const scanBarcodeFromFile=(file)=>{
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image is too large (${Math.round(file.size / 1024 / 1024)} MB). Max 10 MB.`);
      return;
    }
    setError(null);
    const html5Qr=new Html5Qrcode("barcode-scanner-temp");
    html5Qr.scanFile(file,true)
      .then(code=>{setUpc(code);handleSearch(code);})
      .catch(()=>{handleImageIdentify(file);})
      .finally(()=>{ try { html5Qr.clear(); } catch { /* library may already have cleared */ } });
  };

  if(loading) return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:28,padding:"60px 20px",minHeight:400}}>
      <BrandOrb size="xl" floating />
      <div style={{textAlign:"center"}}>
        <h2 style={{fontSize:22,fontWeight:800,letterSpacing:"-0.01em",marginBottom:6,background:"linear-gradient(135deg,var(--text),var(--text-muted))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Aggregating Data</h2>
        <p style={{color:"var(--text-muted)",marginBottom:22,fontSize:13}}>{msgs[loadingStep]}</p>
        <div style={{display:"flex",flexDirection:"column",gap:8,width:320}}>
          {sourceNames.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,opacity:i<=loadingStep?1:0.3,transition:"opacity 0.3s",padding:"6px 10px",borderRadius:8,background:i===loadingStep?"rgba(124,58,237,0.06)":"transparent"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:i<loadingStep?"#10B981":i===loadingStep?"#7C3AED":"var(--text-dim)",flexShrink:0}}/>
              <span style={{fontSize:13,color:i<=loadingStep?"var(--text)":"var(--text-dim)"}}>{s.name}</span>
              {i<loadingStep&&<Icon name="check" size={12} color="#10B981"/>}
              {i===loadingStep&&<LoadingDots/>}
              <span className="mono" style={{marginLeft:"auto",fontSize:11,color:"#10B981",opacity:i<loadingStep?1:0}}>✓ {s.trustScore}%</span>
            </div>
          ))}
        </div>
        <div className="progress-bar" style={{marginTop:20,width:320}}><div className="progress-fill" style={{width:`${((loadingStep+1)/msgs.length)*100}%`,background:"linear-gradient(90deg,#3B82F6,#7C3AED,#10B981)"}}/></div>
      </div>
    </div>
  );

  return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:28,padding:"32px 20px 40px"}}>
      {/* Hero */}
      <div style={{textAlign:"center",maxWidth:560,display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        {/* Logo-style icon */}
        <div style={{position:"relative",width:52,height:52}}>
          <div style={{position:"absolute",inset:-4,borderRadius:16,background:"conic-gradient(from 0deg, #2563EB, #7C3AED, #10B981, #2563EB)",opacity:0.35,filter:"blur(10px)",animation:"logoSpin 6s linear infinite"}}/>
          <div style={{position:"relative",width:52,height:52,borderRadius:14,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke="url(#searchLogoGrad)" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 22V12" stroke="url(#searchLogoGrad)" strokeWidth="1.5"/>
              <path d="M2 7l10 5 10-5" stroke="url(#searchLogoGrad)" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="2.2" fill="url(#searchLogoGrad)"/>
              <defs>
                <linearGradient id="searchLogoGrad" x1="2" y1="2" x2="22" y2="22">
                  <stop offset="0%" stopColor="#3B82F6"/>
                  <stop offset="50%" stopColor="#8B5CF6"/>
                  <stop offset="100%" stopColor="#10B981"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        <div>
          <h1 style={{fontSize:30,fontWeight:900,marginBottom:6,lineHeight:1.1,letterSpacing:"-0.03em"}}>
            New <span style={{background:"linear-gradient(135deg,#3B82F6,#8B5CF6,#10B981)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Catalog</span> Entry
          </h1>
          <p style={{color:"var(--text-dim)",fontSize:13,fontWeight:500}}>Scan a barcode or drop an image — we'll pull the rest</p>
        </div>

        {/* Real data sources — not fluff */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"center",marginTop:2}}>
          {[
            {name:"Open Food Facts",color:"#10B981"},
            {name:"UPC Database",color:"#6366F1"},
            {name:"Gemini Vision",color:"#8B5CF6"},
            {name:"Google Images",color:"#F59E0B"},
          ].map(s=>(
            <div key={s.name} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:"var(--hover-bg)",border:"1px solid var(--border-light)"}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:s.color}}/>
              <span style={{fontSize:10,fontWeight:600,color:"var(--text-dim)",letterSpacing:"0.02em"}}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>
      {notFound&&<div className="card" style={{maxWidth:560,width:"100%",padding:"36px 28px",border:"1px solid rgba(245,158,11,0.25)",position:"relative",overflow:"hidden",textAlign:"center"}}>
        <div className="modal-modern-blobs" style={{borderRadius:"inherit"}}/>
        <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{width:56,height:56,borderRadius:14,background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="search" size={26} color="#F59E0B"/>
          </div>
          <div>
            <h3 style={{fontWeight:800,fontSize:17,letterSpacing:"-0.01em",marginBottom:4}}>Product Not Found</h3>
            <p style={{color:"var(--text-muted)",fontSize:13,lineHeight:1.5,maxWidth:340,margin:"0 auto"}}>No data found for barcode <span className="mono" style={{color:"var(--text)"}}>{upc}</span>. Try a different barcode or upload an image.</p>
          </div>
        </div>
      </div>}
      {error&&<div className="card" style={{maxWidth:560,width:"100%",textAlign:"center",padding:24,border:"1px solid rgba(239,68,68,0.3)"}}><Icon name="warning" size={28} color="#EF4444"/><h3 style={{marginTop:10,fontWeight:700,color:"#EF4444"}}>Search Error</h3><p style={{color:"var(--text-muted)",marginTop:6,fontSize:13}}>{error}</p></div>}
      {identifying&&<div className="card" style={{maxWidth:560,width:"100%",textAlign:"center",padding:"36px 28px",border:"1px solid rgba(124,58,237,0.25)",background:"color-mix(in oklab, var(--card-bg) 92%, transparent)",backdropFilter:"blur(12px)",position:"relative",overflow:"hidden"}}>
        <div className="modal-modern-blobs" style={{borderRadius:"inherit"}}/>
        <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
          <BrandOrb size="lg" floating/>
          <div>
            <h3 style={{fontWeight:800,fontSize:17,letterSpacing:"-0.01em",marginBottom:4}}>AI Identifying Product...</h3>
            <p style={{color:"var(--text-muted)",fontSize:13}}>Analyzing image with Gemini</p>
          </div>
        </div>
      </div>}
      {identified && (() => {
        const conf = identified.confidence || 0;
        const confColor = conf >= 80 ? "#10B981" : conf >= 60 ? "#3B82F6" : conf >= 40 ? "#F59E0B" : "#EF4444";
        return (
        <div className="identify-card animate-fadeIn">
          <div className="modal-modern-blobs" />
          <div style={{ position: "relative" }}>
            {/* Hero: photo + name + confidence */}
            <div className="identify-hero">
              {uploadedImage && (
                <div className="identify-hero-img">
                  <img src={uploadedImage} alt="Uploaded" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)", fontSize: 10, fontWeight: 700, color: "var(--primary-light, #A78BFA)", letterSpacing: "0.08em", marginBottom: 8 }}>
                  <Icon name="sparkle" size={10} color="var(--primary-light, #A78BFA)" /> AI IDENTIFIED
                </div>
                <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.2, marginBottom: 4 }}>{identified.name || "Unknown Product"}</h2>
                {identified.brand && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{identified.brand}{identified.category ? ` · ${identified.category}` : ""}</div>}
                <div className="identify-conf">
                  <div className="identify-conf-bar">
                    <div className="identify-conf-fill" style={{ width: `${conf}%`, background: `linear-gradient(90deg, ${confColor}aa, ${confColor})` }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: confColor, minWidth: 38, textAlign: "right" }}>{conf}%</span>
                </div>
              </div>
            </div>

            {identified.description && (
              <div style={{ padding: "12px 14px", background: "color-mix(in oklab, var(--surface) 60%, transparent)", borderRadius: 10, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55, marginTop: 14 }}>
                {identified.description}
              </div>
            )}

            {/* Specs grid */}
            {identified.specs && Object.keys(identified.specs).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="export-section-label">Specifications</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                  {Object.entries(identified.specs).filter(([, v]) => v && v !== "null").map(([k, v]) => (
                    <div key={k} className="identify-spec-item">
                      <div style={{ fontSize: 9.5, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, fontWeight: 600 }}>{k}</div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, lineHeight: 1.3 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sources */}
            {identified.sources?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="export-section-label">Available At</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {identified.sources.map((s, i) => (
                    <span key={i} className="identify-source-pill">
                      <span style={{ fontWeight: 700 }}>{s.name}</span>
                      {s.price && <span style={{ color: "#10B981", fontWeight: 700 }}>· {s.price}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Product image picker */}
            {(searchingImages || productImages.length > 0) && (
              <div style={{ marginTop: 14 }}>
                <div className="export-section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Product Images</span>
                  <span style={{ fontWeight: 400, color: "var(--text-dim)", textTransform: "none", letterSpacing: 0 }}>· tap to select</span>
                  {!searchingImages && productImages.length > 0 && (
                    <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(16,185,129,0.12)", color: "#10B981", fontWeight: 700, letterSpacing: 0, textTransform: "none" }}>{selectedImages.size} selected</span>
                  )}
                </div>
                {searchingImages && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "color-mix(in oklab, var(--surface) 60%, transparent)", borderRadius: 10, marginTop: 4 }}>
                    <span className="typing-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary-light, #A78BFA)" }} />
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Finding product images...</span>
                  </div>
                )}
                {productImages.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {productImages.slice(0, 8).map((img, i) => {
                      const sel = selectedImages.has(i);
                      return (
                        <div key={i} onClick={() => setSelectedImages(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; })}
                          className={`identify-img-tile ${sel ? "selected" : ""}`}>
                          <img src={img.thumbnail || img.url} alt="" loading="lazy" onError={e => { e.target.style.display = "none"; }} />
                          {sel && (
                            <>
                              <div className="identify-img-overlay" />
                              <div className="identify-img-check"><Icon name="check" size={11} color="white" /></div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18, position: "relative" }}>
              <button className="btn btn-ghost" onClick={() => setIdentified(null)}><Icon name="x" size={14} /> Dismiss</button>
              <button className="btn" style={{ flex: 1, justifyContent: "center", fontSize: 14, padding: "10px 16px", fontWeight: 700, background: "linear-gradient(135deg, #3B82F6, #7C3AED, #10B981)", color: "white", border: "none", boxShadow: "0 4px 18px rgba(124,58,237,0.4)" }} onClick={handleIdentifiedSearch}>
                <Icon name="check" size={14} color="white" /> Use This Product
              </button>
            </div>
        </div>
        );
      })()}
      <div style={{width:"100%",maxWidth:560,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{position:"relative"}}>
          <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--text-dim)"}}><Icon name="barcode" size={18}/></div>
          <input className="input" style={{paddingLeft:44,fontSize:16,padding:"14px 18px 14px 44px"}} placeholder="UPC, EAN, GTIN, ISBN (e.g. 012345678901)" value={upc} onChange={e=>setUpc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSearch()}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-primary" style={{flex:1,justifyContent:"center",fontSize:15,padding:"12px 0"}} onClick={()=>handleSearch()} disabled={loading||identifying}><Icon name="search" size={16}/> {loading?"Searching...":"Search Product"}</button>
          <button className="btn btn-ghost" onClick={()=>setScannerOpen(true)}><Icon name="camera" size={16}/> Scan</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,color:"var(--text-dim)"}}><div style={{flex:1,height:1,background:"var(--border)"}}/><span style={{fontSize:11,fontWeight:600,letterSpacing:"0.06em"}}>OR UPLOAD IMAGE</span><div style={{flex:1,height:1,background:"var(--border)"}}/></div>
        <div className={`drop-zone ${dragOver?"dragging":""}`} onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)scanBarcodeFromFile(f);}}>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)scanBarcodeFromFile(f);e.target.value="";}}/>
          <div style={{color:"var(--text-dim)",marginBottom:8}}><Icon name="upload" size={28} color={dragOver?"#3B82F6":"var(--text-dim)"}/></div>
          <p style={{fontWeight:600,color:dragOver?"#3B82F6":"var(--text-muted)",fontSize:14}}>Drop product image here</p>
          <p style={{fontSize:12,color:"var(--text-dim)",marginTop:4}}>JPG, PNG up to 10MB</p>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
        <span style={{fontSize:11,color:"var(--text-dim)",fontWeight:500}}>Quick try:</span>
        {[{c:"3017620422003",l:"Nutella"},{c:"5449000000996",l:"Coca-Cola"},{c:"8076809513753",l:"Barilla"}].map(({c,l})=><button key={c} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:600,background:"var(--hover-bg)",border:"1px solid var(--border-light)",cursor:"pointer",color:"var(--text-sec)",fontFamily:"'Sora',sans-serif",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--primary)";e.currentTarget.style.color="var(--primary)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border-light)";e.currentTarget.style.color="var(--text-sec)";}} onClick={()=>{setUpc(c);setTimeout(()=>handleSearch(c),50);}}><Icon name="barcode" size={10}/> {l}</button>)}
      </div>
      <div id="barcode-scanner-temp" style={{display:"none"}}/>
      {scannerOpen && <CameraScanner
        onClose={()=>setScannerOpen(false)}
        onDetect={(code)=>{setScannerOpen(false);setUpc(code);handleSearch(code);}}
        onFilePick={(file)=>{setScannerOpen(false);scanBarcodeFromFile(file);}}
        onCapture={(base64)=>{setScannerOpen(false);handleIdentifyBase64(base64);}}
      />}
    </div>
  );
};

export default SearchStep;
