import React, { useState, useRef } from "react";
import { toast } from "../components/Toast";
import { Icon } from "../components/shared";
import { bulkImport } from "../api";

// ============================================================
// BULK IMPORT VIEW
// ============================================================
const BulkImportView = ({ onDone, user }) => {
  const canWrite = user?.role === "Admin" || user?.role === "Editor";
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({ name: "", barcode: "", description: "", price: "", brand: "", category: "" });
  const [step, setStep] = useState(0); // 0=upload, 1=map, 2=preview, 3=importing, 4=done
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const catalogFields = [
    { key: "name", label: "Product Name", required: true },
    { key: "barcode", label: "Barcode (UPC/EAN)", required: false },
    { key: "description", label: "Description", required: false },
    { key: "price", label: "Price", required: false },
    { key: "brand", label: "Brand", required: false },
    { key: "category", label: "Category", required: false },
  ];

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    // Detect delimiter
    const firstLine = lines[0];
    const delimiter = firstLine.includes("\t") ? "\t" : ",";
    const parseLine = (line) => {
      const result = [];
      let current = "", inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ""; }
        else { current += ch; }
      }
      result.push(current.trim());
      return result;
    };
    const hdrs = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine).filter(r => r.some(c => c));
    return { headers: hdrs, rows };
  };

  const MAX_ROWS = 500;

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv', 'tsv', 'txt'].includes(ext)) {
      toast.error("Please upload a CSV file");
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers: hdrs, rows } = parseCSV(e.target.result);
      if (hdrs.length === 0 || rows.length === 0) {
        toast.error("Could not parse file — check the format");
        return;
      }
      // Cap at MAX_ROWS — backend rejects above this anyway, no point uploading more.
      let useRows = rows;
      if (rows.length > MAX_ROWS) {
        toast.warning(`File has ${rows.length} rows. Only the first ${MAX_ROWS} will be imported (server limit).`);
        useRows = rows.slice(0, MAX_ROWS);
      }
      setHeaders(hdrs);
      setParsedRows(useRows);
      // Auto-map by matching header names
      const autoMap = {};
      const nameMatches = ["name", "product", "title", "product name", "product_name", "item"];
      const barcodeMatches = ["barcode", "upc", "ean", "gtin", "isbn", "sku", "code"];
      const descMatches = ["description", "desc", "details", "about"];
      const priceMatches = ["price", "cost", "amount", "msrp", "retail"];
      const brandMatches = ["brand", "manufacturer", "vendor", "maker"];
      const catMatches = ["category", "type", "group", "department"];
      hdrs.forEach((h, idx) => {
        const hl = h.toLowerCase().trim();
        if (!autoMap.name && nameMatches.some(m => hl.includes(m))) autoMap.name = String(idx);
        if (!autoMap.barcode && barcodeMatches.some(m => hl.includes(m))) autoMap.barcode = String(idx);
        if (!autoMap.description && descMatches.some(m => hl.includes(m))) autoMap.description = String(idx);
        if (!autoMap.price && priceMatches.some(m => hl.includes(m))) autoMap.price = String(idx);
        if (!autoMap.brand && brandMatches.some(m => hl.includes(m))) autoMap.brand = String(idx);
        if (!autoMap.category && catMatches.some(m => hl.includes(m))) autoMap.category = String(idx);
      });
      setMapping(prev => ({ ...prev, ...autoMap }));
      setStep(1);
    };
    reader.readAsText(f);
  };

  const validRows = parsedRows.filter(r => {
    const name = mapping.name ? (r[parseInt(mapping.name)] || "").trim() : "";
    const barcode = mapping.barcode ? (r[parseInt(mapping.barcode)] || "").trim() : "";
    return name || barcode;
  });

  const handleImport = async () => {
    setStep(3);
    try {
      const mappingIdx = {};
      Object.entries(mapping).forEach(([field, colIdx]) => {
        if (colIdx !== "") mappingIdx[field] = parseInt(colIdx);
      });
      const res = await bulkImport(parsedRows, mappingIdx);
      setResults(res);
      setStep(4);
      if (res.imported > 0) toast.success(`${res.imported} product${res.imported > 1 ? "s" : ""} imported!`);
    } catch (err) {
      toast.error("Import failed: " + err.message);
      setStep(2);
    }
  };

  // Step 0: Upload
  if (step === 0) return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:24,padding:"48px 20px"}}>
      <div style={{textAlign:"center",maxWidth:480}}>
        <div className="badge badge-primary" style={{marginBottom:16}}><Icon name="upload" size={11}/> Bulk Import</div>
        <h2 style={{fontSize:28,fontWeight:800,marginBottom:10,lineHeight:1.15,letterSpacing:"-0.02em"}}>Import products from a file</h2>
        <p style={{color:"var(--text-muted)",fontSize:14,lineHeight:1.6}}>Upload a CSV file with your product data. We'll map the columns and import everything into your catalog.</p>
      </div>
      <div className={`drop-zone ${dragOver?"dragging":""}`} style={{width:"100%",maxWidth:480,padding:40}}
        onClick={()=>fileRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{display:"none"}} onChange={e=>{handleFile(e.target.files[0]);e.target.value="";}}/>
        <div style={{marginBottom:12}}><Icon name="upload" size={32} color={dragOver?"#3B82F6":"var(--text-dim)"}/></div>
        <p style={{fontWeight:600,color:dragOver?"#3B82F6":"var(--text-muted)",fontSize:15}}>Drop your CSV file here</p>
        <p style={{fontSize:12,color:"var(--text-dim)",marginTop:6}}>or click to browse — CSV, TSV supported (max 500 rows)</p>
      </div>
    </div>
  );

  // Step 1: Column Mapping
  if (step === 1) return (
    <div className="animate-fadeIn" style={{maxWidth:600,margin:"0 auto",padding:"24px 20px",display:"flex",flexDirection:"column",gap:20}}>
      <div>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Map Your Columns</h2>
        <p style={{color:"var(--text-muted)",fontSize:13}}>
          {file.name} — {parsedRows.length} rows, {headers.length} columns detected
        </p>
      </div>
      <div className="card" style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
        {catalogFields.map(f => (
          <div key={f.key} style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:140,fontSize:13,fontWeight:600}}>
              {f.label} {f.required && <span style={{color:"#EF4444"}}>*</span>}
            </div>
            <Icon name="arrowLeft" size={12} color="var(--text-dim)" style={{transform:"rotate(180deg)"}}/>
            <select className="input" style={{flex:1,fontSize:13,padding:"8px 12px"}}
              value={mapping[f.key]} onChange={e => setMapping(prev => ({...prev, [f.key]: e.target.value}))}>
              <option value="">— Skip —</option>
              {headers.map((h, idx) => <option key={idx} value={String(idx)}>{h}</option>)}
            </select>
          </div>
        ))}
      </div>
      {/* Preview first 3 rows */}
      <div style={{padding:14,background:"var(--hover-bg)",borderRadius:10,border:"1px solid var(--border)"}}>
        <div style={{fontSize:11,fontWeight:600,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:8}}>PREVIEW (first 3 rows)</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{catalogFields.filter(f => mapping[f.key] !== "").map(f => (
              <th key={f.key} style={{padding:"6px 10px",textAlign:"left",color:"var(--text-dim)",fontWeight:600,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{f.label}</th>
            ))}</tr></thead>
            <tbody>{parsedRows.slice(0,3).map((row, i) => (
              <tr key={i}>{catalogFields.filter(f => mapping[f.key] !== "").map(f => (
                <td key={f.key} style={{padding:"6px 10px",color:"var(--text-sec)",borderBottom:"1px solid var(--border-light)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row[parseInt(mapping[f.key])] || <span style={{color:"var(--text-dim)"}}>—</span>}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button className="btn btn-ghost" onClick={()=>{setStep(0);setFile(null);setParsedRows([]);setHeaders([]);}}>Back</button>
        <button className="btn btn-primary" onClick={()=>setStep(2)} disabled={!mapping.name && !mapping.barcode}>
          <Icon name="check" size={14}/> Continue to Review
        </button>
      </div>
    </div>
  );

  // Step 2: Validation Preview
  if (step === 2) return (
    <div className="animate-fadeIn" style={{maxWidth:700,margin:"0 auto",padding:"24px 20px",display:"flex",flexDirection:"column",gap:20}}>
      <div>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Review Import</h2>
        <p style={{color:"var(--text-muted)",fontSize:13}}>
          {validRows.length} of {parsedRows.length} rows ready to import
          {parsedRows.length - validRows.length > 0 && <span style={{color:"#F59E0B"}}> · {parsedRows.length - validRows.length} will be skipped (missing name & barcode)</span>}
        </p>
      </div>
      <div style={{display:"flex",gap:12}}>
        {[
          {l:"Total Rows",v:parsedRows.length,color:"var(--text)"},
          {l:"Ready",v:validRows.length,color:"#10B981"},
          {l:"Will Skip",v:parsedRows.length-validRows.length,color:"#F59E0B"},
        ].map((s,i) => (
          <div key={i} style={{flex:1,padding:14,borderRadius:10,border:"1px solid var(--border)",textAlign:"center"}}>
            <div className="mono" style={{fontSize:20,fontWeight:800,color:s.color}}>{s.v}</div>
            <div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",maxHeight:300,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{position:"sticky",top:0,background:"var(--surface)",zIndex:2}}>
            <th style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em"}}>#</th>
            {catalogFields.filter(f => mapping[f.key] !== "").map(f => (
              <th key={f.key} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-dim)",letterSpacing:"0.06em"}}>{f.label.toUpperCase()}</th>
            ))}
            <th style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:"var(--text-dim)"}}>STATUS</th>
          </tr></thead>
          <tbody>{parsedRows.slice(0,50).map((row, i) => {
            const name = mapping.name ? (row[parseInt(mapping.name)] || "").trim() : "";
            const barcode = mapping.barcode ? (row[parseInt(mapping.barcode)] || "").trim() : "";
            const isValid = name || barcode;
            return (
              <tr key={i} style={{borderBottom:"1px solid var(--border-light)",background:isValid?"transparent":"rgba(245,158,11,0.04)"}}>
                <td style={{padding:"6px 12px",color:"var(--text-dim)"}}>{i+1}</td>
                {catalogFields.filter(f => mapping[f.key] !== "").map(f => (
                  <td key={f.key} style={{padding:"6px 12px",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:isValid?"var(--text-sec)":"var(--text-dim)"}}>{row[parseInt(mapping[f.key])] || "—"}</td>
                ))}
                <td style={{padding:"6px 12px"}}>
                  {isValid ? <span className="badge badge-success" style={{fontSize:10,padding:"2px 7px"}}>Ready</span> : <span className="badge badge-warning" style={{fontSize:10,padding:"2px 7px"}}>Skip</span>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
        {parsedRows.length > 50 && <div style={{padding:10,textAlign:"center",fontSize:12,color:"var(--text-dim)"}}>Showing first 50 of {parsedRows.length} rows</div>}
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button className="btn btn-ghost" onClick={()=>setStep(1)}>Back</button>
        <button className="btn btn-success" onClick={handleImport} disabled={validRows.length === 0 || !canWrite} title={!canWrite?"Viewers cannot import":""}><Icon name="download" size={14}/> Import {validRows.length} Product{validRows.length !== 1 ? "s" : ""}</button>
      </div>
    </div>
  );

  // Step 3: Importing
  if (step === 3) return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,padding:"80px 20px"}}>
      <div style={{width:64,height:64,borderRadius:"50%",border:"3px solid var(--border)",borderTopColor:"var(--primary)",animation:"spin 0.8s linear infinite"}}/>
      <div style={{textAlign:"center"}}>
        <h2 style={{fontSize:20,fontWeight:700,marginBottom:6}}>Importing {validRows.length} Product{validRows.length !== 1 ? "s" : ""}...</h2>
        <p style={{color:"var(--text-muted)",fontSize:13}}>Processing {parsedRows.length} rows. Don't close this tab.</p>
        <p style={{color:"var(--text-dim)",fontSize:11,marginTop:8}}>Approx. {Math.max(2, Math.ceil(validRows.length * 0.04))}s — depends on server load</p>
      </div>
    </div>
  );

  // Step 4: Done
  return (
    <div className="animate-fadeIn" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:24,padding:"60px 20px",textAlign:"center"}}>
      <div className="animate-scaleIn" style={{width:72,height:72,borderRadius:"50%",background:"rgba(16,185,129,0.12)",border:"2px solid #10B981",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <Icon name="check" size={32} color="#10B981"/>
      </div>
      <div>
        <h2 style={{fontSize:24,fontWeight:800,marginBottom:6}}>Import Complete!</h2>
        <p style={{color:"var(--text-muted)",fontSize:14}}>Your products have been added to the catalog.</p>
      </div>
      <div style={{display:"flex",gap:14}}>
        {[
          {l:"Imported",v:results?.imported||0,color:"#10B981"},
          {l:"Skipped",v:results?.skipped||0,color:"#F59E0B"},
          {l:"Failed",v:results?.failed||0,color:"#EF4444"},
        ].map((s,i)=>(
          <div key={i} style={{padding:"14px 24px",borderRadius:10,border:"1px solid var(--border)",textAlign:"center"}}>
            <div className="mono" style={{fontSize:22,fontWeight:800,color:s.color}}>{s.v}</div>
            <div style={{fontSize:11,color:"var(--text-dim)",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      {results?.errors?.length > 0 && results.errors.length <= 10 && (
        <div style={{maxWidth:400,width:"100%",padding:14,background:"var(--hover-bg)",borderRadius:10,border:"1px solid var(--border)",textAlign:"left"}}>
          <div style={{fontSize:11,fontWeight:600,color:"var(--text-dim)",letterSpacing:"0.06em",marginBottom:6}}>ISSUES</div>
          {results.errors.slice(0,10).map((e,i)=>(
            <div key={i} style={{fontSize:12,color:"var(--text-muted)",padding:"3px 0"}}>Row {e.row}: {e.error}</div>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:12}}>
        <button className="btn btn-primary" onClick={onDone}><Icon name="grid" size={14}/> Go to Dashboard</button>
        <button className="btn btn-ghost" onClick={()=>{setStep(0);setFile(null);setParsedRows([]);setHeaders([]);setResults(null);}}><Icon name="upload" size={14}/> Import More</button>
      </div>
    </div>
  );
};

export default BulkImportView;
