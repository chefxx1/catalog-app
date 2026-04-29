import React from "react";
import { Icon } from "./shared";

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('ErrorBoundary caught:', error, info); }
  // Reset boundary state so React re-renders children. Useful when the error
  // was transient (e.g. a network blip during render) and we don't want the
  // user to lose page-level state from a full reload.
  reset = () => { this.setState({ hasError: false, error: null }); };
  render() {
    if (this.state.hasError) {
      return (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#09090B",color:"#D4D4D4",fontFamily:"'Sora',sans-serif"}}>
          <div style={{textAlign:"center",maxWidth:440,padding:40}}>
            <div style={{width:56,height:56,borderRadius:14,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:20}}>
              <Icon name="warning" size={28} color="#EF4444"/>
            </div>
            <h2 style={{fontSize:22,fontWeight:700,marginBottom:8}}>Something went wrong</h2>
            <p style={{color:"#94A3B8",fontSize:14,lineHeight:1.6,marginBottom:24}}>An unexpected error occurred. Try again, or refresh the page if the problem persists.</p>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={this.reset} style={{padding:"10px 24px",background:"transparent",color:"#D4D4D4",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>Try Again</button>
              <button onClick={() => window.location.reload()} style={{padding:"10px 24px",background:"#2563EB",color:"white",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer"}}>Refresh Page</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
