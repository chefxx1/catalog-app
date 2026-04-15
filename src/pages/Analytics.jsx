import React, { useState, useEffect } from "react";
import { Icon, LoadingDots } from "../components/shared";
import { toast } from "../components/Toast";
import { getStats, getSourcePerformance, getSearchHistory, clearSearchHistory, getCompleteness, getActivity, getPriceAlerts } from "../api";

const Analytics = () => {
  const [stats, setStats] = useState(null);
  const [sources, setSources] = useState([]);
  const [history, setHistory] = useState([]);
  const [completenessData, setCompletenessData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getStats().catch(() => ({})),
      getSourcePerformance().catch(() => ({ sources: [] })),
      getSearchHistory().catch(() => ({ history: [] })),
      getCompleteness().catch(() => null),
      getActivity(15).catch(() => ({ activity: [] })),
      getPriceAlerts().catch(() => ({ alerts: [] })),
    ]).then(([s, src, h, comp, act, pa]) => {
      setStats(s);
      setSources(src.sources || []);
      setHistory(h.history || []);
      setCompletenessData(comp);
      setActivity(act.activity || []);
      setPriceAlerts(pa.alerts || []);
      setLoading(false);
    }).catch(() => { setLoading(false); toast.error("Failed to load analytics"); });
  }, []);

  const sourceColors = { "Amazon": "#FF9900", "Open Food Facts": "#10B981", "UPC Database": "#6366F1", "Alibaba": "#FF6A00", "Google": "#4285F4", "Barcode Spider": "#F97316" };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24,opacity:loading?0:1,transition:"opacity 0.4s ease"}}>
      {loading && <div style={{display:"flex",flexDirection:"column",gap:16,padding:"14px 0"}}><div className="skeleton" style={{height:20,width:"60%"}}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><div className="skeleton-card"/><div className="skeleton-card"/><div className="skeleton-card"/><div className="skeleton-card"/></div></div>}
      {!loading && stats && (
        <div style={{display:"flex",gap:24,padding:"14px 0",borderBottom:"1px solid var(--border-light)",flexWrap:"wrap"}}>
          {[
            {l:"Searches",v:stats?.total_searches||0,grad:"linear-gradient(135deg,#3B82F6,#8B5CF6)"},
            {l:"Cache Hit",v:`${stats?.cache_hit_rate||0}%`,grad:"linear-gradient(135deg,#10B981,#3B82F6)"},
            {l:"Avg Response",v:`${stats?.avg_response_time||0}ms`,grad:"linear-gradient(135deg,#8B5CF6,#EC4899)"},
            {l:"Products",v:stats?.total_products||0,grad:"linear-gradient(135deg,#F59E0B,#EF4444)"},
          ].map((s,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"baseline",gap:8}}>
              <span className="mono" style={{fontSize:20,fontWeight:800,background:s.grad,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{s.v}</span>
              <span style={{fontSize:11,color:"var(--text-dim)",fontWeight:500}}>{s.l}</span>
            </div>
          ))}
        </div>
      )}

      <div className="analytics-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Completeness donut */}
        {completenessData && completenessData.total > 0 && (() => {
          const { total, average, complete, good, needsWork, poor } = completenessData;
          const segments = [
            { label: "Complete", value: complete, color: "#10B981" },
            { label: "Good", value: good, color: "#3B82F6" },
            { label: "Needs Work", value: needsWork, color: "#F59E0B" },
            { label: "Poor", value: poor, color: "#EF4444" },
          ].filter(s => s.value > 0);
          const r = 46, cx = 54, cy = 54, stroke = 10;
          const circumference = 2 * Math.PI * r;
          let offset = 0;
          return (
            <div className="card" style={{padding:24,gridColumn:completenessData.total > 0 ? "auto" : "1 / -1"}}>
              <h3 style={{fontWeight:700,marginBottom:18}}>Catalog Completeness</h3>
              <div style={{display:"flex",alignItems:"center",gap:24}}>
                <div style={{position:"relative",width:108,height:108,flexShrink:0}}>
                  <svg width="108" height="108" viewBox="0 0 108 108">
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke}/>
                    {segments.map((seg, i) => {
                      const pct = seg.value / total;
                      const dash = pct * circumference;
                      const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke}
                        strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset}
                        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} style={{transition:"all 0.6s ease"}}/>;
                      offset += dash;
                      return el;
                    })}
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                    <span style={{fontSize:18,fontWeight:800,color:"var(--text)"}}>{average}%</span>
                    <span style={{fontSize:9,color:"var(--text-dim)"}}>avg</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,flex:1}}>
                  {[
                    { label: "Complete", value: complete, color: "#10B981" },
                    { label: "Good", value: good, color: "#3B82F6" },
                    { label: "Needs Work", value: needsWork, color: "#F59E0B" },
                    { label: "Poor", value: poor, color: "#EF4444" },
                  ].map((row, i) => (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:row.color,flexShrink:0}}/>
                      <span style={{fontSize:12,color:"var(--text-dim)",flex:1}}>{row.label}</span>
                      <span className="mono" style={{fontSize:12,fontWeight:700}}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        <div className="card" style={{padding:24}}>
          <h3 style={{fontWeight:700,marginBottom:20}}>Data Source Performance</h3>
          {loading ? <div style={{textAlign:"center",padding:20}}><LoadingDots/></div> :
           sources.length === 0 ? <div style={{textAlign:"center",padding:30}}><div style={{width:48,height:48,borderRadius:12,background:"rgba(37,99,235,0.08)",border:"1px solid rgba(37,99,235,0.15)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:10}}><Icon name="chart" size={22} color="var(--primary-light)"/></div><p style={{fontSize:13,color:"var(--text-dim)"}}>No source data yet</p></div> :
           sources.map((s,i)=>{
            const baseColor = sourceColors[s.source_name]||"#3B82F6";
            return <div key={i} style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
              <div style={{width:120,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:baseColor,boxShadow:`0 0 8px ${baseColor}80`}}/>
                {s.source_name}
              </div>
              <div style={{flex:1}}><div className="progress-bar" style={{height:8,background:"var(--hover-bg)"}}><div className="progress-fill" style={{width:`${Math.round(s.avg_trust||0)}%`,background:`linear-gradient(90deg, ${baseColor}, ${baseColor}cc)`,boxShadow:`0 0 10px ${baseColor}60`}}/></div></div>
              <span className="mono" style={{width:44,textAlign:"right",fontSize:13,fontWeight:700,color:baseColor}}>{Math.round(s.avg_trust||0)}%</span>
            </div>;
          })}
        </div>

        <div className="card" style={{padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h3 style={{fontWeight:700}}>Recent Searches</h3>
            {history.length > 0 && <button className="btn btn-ghost" style={{fontSize:11,color:"#EF4444"}} onClick={async ()=>{
              try { await clearSearchHistory(); setHistory([]); toast.success("Search history cleared"); } catch(err) { toast.error(err.message); }
            }}><Icon name="trash" size={12} color="#EF4444"/> Clear All</button>}
          </div>
          {loading ? <div style={{textAlign:"center",padding:20}}><LoadingDots/></div> :
           history.length === 0 ? <div style={{textAlign:"center",padding:30}}><div style={{width:48,height:48,borderRadius:12,background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.15)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:10}}><Icon name="search" size={22} color="#10B981"/></div><p style={{fontSize:13,color:"var(--text-dim)"}}>No searches yet</p></div> :
          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:300,overflowY:"auto"}}>
            {history.slice(0,15).map((h,i)=><div key={h.id||i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"var(--hover-bg)",borderRadius:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Icon name="barcode" size={14} color="var(--text-dim)"/>
                <span className="mono" style={{fontSize:13}}>{h.barcode}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                {h.cache_hit ? <span className="badge badge-success" style={{fontSize:10}}>Cache</span> : <span className="badge badge-primary" style={{fontSize:10}}>API</span>}
                <span className="mono" style={{fontSize:11,color:"var(--text-dim)"}}>{h.response_time_ms}ms</span>
                <span style={{fontSize:11,color:"var(--text-dim)"}}>{new Date(h.created_at).toLocaleDateString()}</span>
              </div>
            </div>)}
          </div>}
        </div>

        {/* Activity Feed */}
        <div className="card" style={{padding:24}}>
          <h3 style={{fontWeight:700,marginBottom:20}}>Recent Activity</h3>
          {loading ? <div style={{textAlign:"center",padding:20}}><LoadingDots/></div> :
           activity.length === 0 ? <div style={{textAlign:"center",padding:30}}><div style={{width:48,height:48,borderRadius:12,background:"rgba(139,92,246,0.08)",border:"1px solid rgba(139,92,246,0.15)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:10}}><Icon name="clock" size={22} color="#8B5CF6"/></div><p style={{fontSize:13,color:"var(--text-dim)"}}>No activity yet</p></div> :
          <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:300,overflowY:"auto"}}>
            {activity.slice(0,15).map((a,i) => {
              const actionIcons = { saved: "package", created: "plus", updated: "edit", deleted: "trash", exported: "download", imported: "upload" };
              const actionColors = { saved: "#3B82F6", created: "#10B981", updated: "#F59E0B", deleted: "#EF4444", exported: "#8B5CF6", imported: "#3B82F6" };
              const entityLabels = { product: "product", catalog_entry: "entry", brand_voice: "voice", export: "", bulk_import: "", tag: "tag" };
              const timeAgo = (date) => {
                const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
                if (s < 60) return "just now";
                if (s < 3600) return `${Math.floor(s/60)}m ago`;
                if (s < 86400) return `${Math.floor(s/3600)}h ago`;
                return `${Math.floor(s/86400)}d ago`;
              };
              return (
                <div key={a.id||i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<Math.min(activity.length,15)-1?"1px solid var(--border-light)":"none"}}>
                  <div style={{width:22,height:22,borderRadius:6,background:(actionColors[a.action]||"#3B82F6")+"14",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <Icon name={actionIcons[a.action]||"edit"} size={10} color={actionColors[a.action]||"#3B82F6"}/>
                  </div>
                  <div style={{flex:1,fontSize:12,color:"var(--text-sec)",lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    <span style={{fontWeight:600}}>{a.user_name||"User"}</span>
                    {" "}{a.action}{" "}
                    {a.entity_type === "bulk_import" ? (
                      <span>{a.details?.imported||0} products</span>
                    ) : (
                      <>{entityLabels[a.entity_type]||a.entity_type}{a.entity_name ? <span style={{fontWeight:600}}> {a.entity_name}</span> : ""}</>
                    )}
                  </div>
                  <span style={{fontSize:10,color:"var(--text-dim)",whiteSpace:"nowrap",flexShrink:0}}>{timeAgo(a.created_at)}</span>
                </div>
              );
            })}
          </div>}
        </div>
      </div>

      {/* Price Alerts */}
      {priceAlerts.length > 0 && (
        <div className="card" style={{padding:24}}>
          <h3 style={{fontWeight:700,marginBottom:16}}>Price Alerts</h3>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {priceAlerts.map((a,i) => {
              const diff = a.current_price - a.previous_price;
              const isUp = diff > 0;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"var(--hover-bg)",borderRadius:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:14,color:isUp?"#EF4444":"#10B981",fontWeight:700}}>{isUp?"↑":"↓"}</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{a.name}</div>
                      <div style={{fontSize:11,color:"var(--text-dim)"}}>{a.source_name}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span className="mono" style={{fontSize:12,color:"var(--text-dim)",textDecoration:"line-through"}}>${parseFloat(a.previous_price).toFixed(2)}</span>
                      <span className="mono" style={{fontSize:13,fontWeight:700,color:isUp?"#EF4444":"#10B981"}}>${parseFloat(a.current_price).toFixed(2)}</span>
                    </div>
                    <span style={{fontSize:10,color:isUp?"#EF4444":"#10B981",fontWeight:600}}>{isUp?"+":""}${diff.toFixed(2)} ({isUp?"+":""}{((diff/a.previous_price)*100).toFixed(1)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
