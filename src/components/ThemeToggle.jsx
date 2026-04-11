import React from "react";
import { Icon } from "./shared";

const ThemeToggle = ({ dark, onToggle }) => (
  <div onClick={onToggle} style={{ position:"relative", width:48, height:26, borderRadius:13, cursor:"pointer", border:"1px solid var(--border)", background: dark ? "linear-gradient(135deg,#131316,#1C1C21)" : "linear-gradient(135deg,#BFDBFE,#93C5FD)", transition:"all 0.35s ease", boxShadow: dark ? "inset 0 1px 4px rgba(0,0,0,0.5)" : "inset 0 1px 4px rgba(0,0,0,0.1)" }}>
    <div style={{ position:"absolute", top:2, left: dark ? 24 : 2, width:20, height:20, borderRadius:"50%", background: dark ? "#2A2A2E" : "#FEF3C7", boxShadow: dark ? "0 0 6px rgba(251,191,36,0.3)" : "0 0 8px rgba(251,191,36,0.5)", transition:"all 0.35s cubic-bezier(0.68,-0.55,0.27,1.55)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ transition:"transform 0.35s ease", transform: dark ? "rotate(-30deg)" : "rotate(0deg)" }}>
        <Icon name={dark ? "moon" : "sun"} size={12} color={dark ? "#94A3B8" : "#F59E0B"} />
      </div>
    </div>
  </div>
);

export default ThemeToggle;
