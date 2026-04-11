import React from "react";
import { Icon } from "./shared";

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('ErrorBoundary caught:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#09090B",color:"#D4D4D4",fontFamily:"'Sora',sans-serif"}}>
          <div style={{textAlign:"center",maxWidth:440,padding:40}}>
            <div style={{width:56,height:56,borderRadius:14,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:20}}>
              <Icon name="warning" size={28} color="#EF4444"/>
            </div>
            <h2 style={{fontSize:22,fontWeight:700,marginBottom:8}}>Something went wrong</h2>
            <p style={{color:"#94A3B8",fontSize:14,lineHeight:1.6,marginBottom:24}}>An unexpected error occurred. Try refreshing the page.</p>
            <button onClick={() => window.location.reload()} style={{padding:"10px 28px",background:"#2563EB",color:"white",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>Refresh Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
