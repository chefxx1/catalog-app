import React, { useState, useCallback, useEffect, useRef } from "react";
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
  // Track active timers so we can clear them on unmount and avoid setState
  // calls on a stale component (React dev warning).
  const timersRef = useRef(new Set());

  _showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
    timersRef.current.add(timer);
  }, []);

  useEffect(() => () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current.clear();
    _showToast = () => {};
  }, []);

  const colors = { success: "#10B981", error: "#EF4444", warning: "#F59E0B", info: "#3B82F6" };
  const icons = { success: "check", error: "warning", warning: "warning", info: "sparkle" };
  if (toasts.length === 0) return null;
  return (
    <div style={{position:"fixed",top:20,right:20,zIndex:99999,display:"flex",flexDirection:"column",gap:10,maxWidth:380,pointerEvents:"none"}}>
      {toasts.map(t=>(
        <div key={t.id} className="toast-glass" style={{pointerEvents:"auto","--toast-c":colors[t.type]}}>
          <div className="toast-glass-icon">
            <Icon name={icons[t.type]} size={14} color={colors[t.type]}/>
          </div>
          <span style={{flex:1,fontSize:13,color:"var(--text)",lineHeight:1.4}}>{t.message}</span>
          <button className="toast-glass-close" onClick={()=>setToasts(prev=>prev.filter(x=>x.id!==t.id))}><Icon name="x" size={11} color="var(--text-dim)"/></button>
        </div>
      ))}
    </div>
  );
};

export { toast, ToastContainer };
