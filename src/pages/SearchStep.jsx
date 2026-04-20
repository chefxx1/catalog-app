import React, { useState, useRef } from "react";
import { Icon, LoadingDots } from "../components/shared";
import { toast } from "../components/Toast";
import { searchProduct, identifyProduct, searchProductImages } from "../api";
import { Html5Qrcode } from "html5-qrcode";
import CameraScanner from "../components/CameraScanner";

const SearchStep = ({ onSearch }) => {
  const [upc,setUpc]=useState(""); const [loading,setLoading]=useState(false); const [loadingStep,setLoadingStep]=useState(0); const [dragOver,setDragOver]=useState(false); const fileRef=useRef(null);
  const [error,setError]=useState(null); const [notFound,setNotFound]=useState(false);
  const [scannerOpen,setScannerOpen]=useState(false);
  const msgs=["Checking Open Food Facts...","Scanning UPC Database..."];
  const sourceNames=[{name:"Open Food Facts",icon:"database",trustScore:75,color:"#10B981"},{name:"UPC Database",icon:"barcode",trustScore:80,color:"#6366F1"}];
  const handleSearch=(code)=>{const barcode=code||upc.trim();if(!barcode||loading)return;setError(null);setNotFound(false);setLoading(true);setLoadingStep(0);let s=0;const apiPromise=searchProduct(barcode);const iv=setInterval(()=>{s++;if(s>=msgs.length){clearInterval(iv);}else setLoadingStep(s);},800);apiPromise.then(data=>{clearInterval(iv);setLoadingStep(msgs.length-1);setTimeout(()=>{setLoading(false);if(!data.product){setNotFound(true);}else{onSearch(data);}},600);}).catch(err=>{clearInterval(iv);setLoading(false);setError(err.message||"Search failed");});};
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState(null);
  const compressImage = (file, maxSize = 800) => new Promise((resolve) => {
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
      img.src = e.target.result;
    };
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
    setIdentifying(false);
  };
  const handleImageIdentify = async (file) => {
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
    }
    setIdentifying(false);
  };
  const [uploadedImage, setUploadedImage] = useState(null);
  const handleIdentifiedSearch = () => {
    if (!identified) return;
    // Map AI sources to display format
    const aiSources = (identified.sources || []).map(s => ({
      source_name: s.name, trust_score: s.trustScore || 75, price: s.price?.replace(/[^0-9.]/g, '') || null,
      currency: 'USD', description: s.url || null,
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
  const scanBarcodeFromFile=(file)=>{setError(null);const html5Qr=new Html5Qrcode("barcode-scanner-temp");html5Qr.scanFile(file,true).then(code=>{setUpc(code);handleSearch(code);}).catch(()=>{handleImageIdentify(file);}).finally(()=>{html5Qr.clear();});};

  if(loading) return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:30,padding:"60px 20px",minHeight:400}}>
      <div className="animate-glow" style={{position:"relative",width:120,height:120}}>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"3px solid rgba(37,99,235,0.2)",borderTop:"3px solid #2563EB",animation:"spin 1s linear infinite"}}/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="cpu" size={36} color="#2563EB"/></div>
      </div>
      <div style={{textAlign:"center"}}>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:8}}>Aggregating Data</h2>
        <p style={{color:"var(--text-muted)",marginBottom:20}}>{msgs[loadingStep]}</p>
        <div style={{display:"flex",flexDirection:"column",gap:8,width:320}}>
          {sourceNames.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,opacity:i<=loadingStep?1:0.3,transition:"opacity 0.3s"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:i<loadingStep?"#10B981":i===loadingStep?"#2563EB":"var(--text-dim)",flexShrink:0}}/>
              <span style={{fontSize:13,color:i<=loadingStep?"var(--text)":"var(--text-dim)"}}>{s.name}</span>
              {i<loadingStep&&<Icon name="check" size={12} color="#10B981"/>}
              {i===loadingStep&&<LoadingDots/>}
              <span className="mono" style={{marginLeft:"auto",fontSize:11,color:"#10B981",opacity:i<loadingStep?1:0}}>✓ {s.trustScore}%</span>
            </div>
          ))}
        </div>
        <div className="progress-bar" style={{marginTop:20,width:320}}><div className="progress-fill" style={{width:`${((loadingStep+1)/msgs.length)*100}%`,background:"linear-gradient(90deg,#2563EB,#10B981)"}}/></div>
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
      {notFound&&<div className="card" style={{maxWidth:560,width:"100%",textAlign:"center",padding:24,border:"1px solid rgba(245,158,11,0.3)"}}><Icon name="search" size={28} color="#F59E0B"/><h3 style={{marginTop:10,fontWeight:700}}>Product Not Found</h3><p style={{color:"var(--text-muted)",marginTop:6,fontSize:13}}>No product data found for barcode <span className="mono" style={{color:"var(--text)"}}>{upc}</span>. Try a different barcode.</p></div>}
      {error&&<div className="card" style={{maxWidth:560,width:"100%",textAlign:"center",padding:24,border:"1px solid rgba(239,68,68,0.3)"}}><Icon name="warning" size={28} color="#EF4444"/><h3 style={{marginTop:10,fontWeight:700,color:"#EF4444"}}>Search Error</h3><p style={{color:"var(--text-muted)",marginTop:6,fontSize:13}}>{error}</p></div>}
      {identifying&&<div className="card" style={{maxWidth:560,width:"100%",textAlign:"center",padding:32,border:"1px solid rgba(37,99,235,0.3)"}}><div style={{width:48,height:48,margin:"0 auto 12px",borderRadius:"50%",border:"3px solid var(--border)",borderTopColor:"#3B82F6",animation:"spin 0.8s linear infinite"}}/><h3 style={{fontWeight:700,marginBottom:4}}>AI Identifying Product...</h3><p style={{color:"var(--text-muted)",fontSize:13}}>Analyzing image with Gemini AI</p></div>}
      {identified&&<div className="card animate-fadeIn" style={{maxWidth:560,width:"100%",padding:24,border:"1px solid rgba(16,185,129,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><Icon name="sparkle" size={18} color="#10B981"/><h3 style={{fontWeight:700}}>Product Identified</h3><span className="badge badge-ai">AI</span><span style={{marginLeft:"auto",fontSize:12,color:"#10B981",fontWeight:600}}>{identified.confidence}% confidence</span></div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[["Name",identified.name],["Brand",identified.brand],["Category",identified.category]].filter(([,v])=>v).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 10px",background:"var(--hover-bg)",borderRadius:6}}><span style={{color:"var(--text-dim)"}}>{k}</span><span style={{fontWeight:600}}>{v}</span></div>)}
          {identified.description&&<p style={{fontSize:13,color:"var(--text-muted)",lineHeight:1.5,padding:"6px 10px"}}>{identified.description}</p>}
          {identified.specs&&Object.keys(identified.specs).length>0&&<>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginTop:4}}>SPECIFICATIONS</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>{Object.entries(identified.specs).filter(([,v])=>v&&v!=="null").map(([k,v])=><div key={k} style={{padding:"5px 10px",background:"var(--hover-bg)",borderRadius:6}}><div style={{fontSize:10,color:"var(--text-dim)"}}>{k}</div><div className="mono" style={{fontSize:12,color:"var(--text-sec)"}}>{v}</div></div>)}</div>
          </>}
          {identified.sources?.length>0&&<>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginTop:4}}>AVAILABLE AT</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{identified.sources.map((s,i)=><span key={i} style={{padding:"4px 10px",background:"rgba(37,99,235,0.08)",border:"1px solid rgba(37,99,235,0.2)",borderRadius:6,fontSize:12,color:"#60A5FA"}}>{s.name}{s.price?` · ${s.price}`:""}</span>)}</div>
          </>}
          {/* Product Images */}
          {(searchingImages||productImages.length>0)&&<>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.08em",marginTop:4}}>PRODUCT IMAGES <span style={{fontWeight:400,color:"var(--text-dim)"}}> — select the ones you want</span></div>
            {searchingImages&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid var(--border)",borderTopColor:"#3B82F6",animation:"spin 0.8s linear infinite"}}/><span style={{fontSize:12,color:"var(--text-dim)"}}>Finding product images...</span></div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:6}}>
              {productImages.map((img,i)=><div key={i} onClick={()=>setSelectedImages(prev=>{const s=new Set(prev);s.has(i)?s.delete(i):s.add(i);return s;})} style={{position:"relative",borderRadius:6,overflow:"hidden",cursor:"pointer",border:`2px solid ${selectedImages.has(i)?"#10B981":"transparent"}`,opacity:selectedImages.has(i)?1:0.5,transition:"all 0.2s",aspectRatio:"1"}}>
                <img src={img.thumbnail||img.url} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>
                {selectedImages.has(i)&&<div style={{position:"absolute",top:3,right:3,width:16,height:16,borderRadius:"50%",background:"#10B981",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="check" size={10} color="white"/></div>}
              </div>)}
            </div>
            {productImages.length>0&&<div style={{fontSize:11,color:"var(--text-dim)"}}>{selectedImages.size} image{selectedImages.size!==1?"s":""} selected</div>}
          </>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button className="btn btn-primary" style={{flex:1,justifyContent:"center"}} onClick={handleIdentifiedSearch}><Icon name="check" size={14}/> Use This Product</button>
          <button className="btn btn-ghost" onClick={()=>setIdentified(null)}><Icon name="x" size={14}/> Dismiss</button>
        </div>
      </div>}
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
