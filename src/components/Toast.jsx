import React, { useState, useCallback } from "react";
import { Icon } from "./shared";

// Global toast system
let _showToast = () => {};
const toast = {
  success: (msg) => _showToast(msg, "success"),
  error: (msg) => _showToast(msg, "error"),
  warning: (msg) => _showToast(msg, "warning"),
  info: (msg) => _showToast(msg, "info"),
};

const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);
  _showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  const colors = { success: "#10B981", error: "#EF4444", warning: "#F59E0B", info: "#3B82F6" };
  const icons = { success: "check", error: "warning", warning: "warning", info: "sparkle" };
  if (toasts.length === 0) return null;
  return (
    <div style={{position:"fixed",top:20,right:20,zIndex:99999,display:"flex",flexDirection:"column",gap:8,maxWidth:380}}>
      {toasts.map(t=>(
        <div key={t.id} className="animate-slideUp" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"var(--bg-sidebar)",border:`1px solid ${colors[t.type]}40`,borderLeft:`3px solid ${colors[t.type]}`,borderRadius:10,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",fontSize:13,color:"var(--text-sec)"}}>
          <Icon name={icons[t.type]} size={16} color={colors[t.type]}/>
          <span style={{flex:1}}>{t.message}</span>
          <span style={{cursor:"pointer",opacity:0.5,fontSize:16,lineHeight:1}} onClick={()=>setToasts(prev=>prev.filter(x=>x.id!==t.id))}>&times;</span>
        </div>
      ))}
    </div>
  );
};

export { toast, ToastContainer };
