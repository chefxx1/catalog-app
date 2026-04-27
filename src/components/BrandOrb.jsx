import React from "react";

const SIZES = {
  sm: { ring: 36, inner: 22, padding: 4 },
  md: { ring: 56, inner: 36, padding: 6 },
  lg: { ring: 72, inner: 48, padding: 8 },
  xl: { ring: 96, inner: 64, padding: 10 },
};

let gradId = 0;

const BrandOrb = ({ size = "md", spinning = true, floating = false, style = {} }) => {
  const s = SIZES[size] || SIZES.md;
  const id = React.useMemo(() => `brand-orb-grad-${++gradId}`, []);
  return (
    <div
      className={`brand-orb-wrap${spinning ? " brand-orb-spinning" : ""}${floating ? " brand-orb-floating" : ""}`}
      style={{ width: s.ring, height: s.ring, ...style }}
    >
      <div className="brand-orb-ring" />
      <div className="brand-orb-core" style={{ inset: s.padding }} />
      <div className="brand-orb-icon">
        <svg width={s.inner} height={s.inner} viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke={`url(#${id})`} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M12 22V12" stroke={`url(#${id})`} strokeWidth="1.5" />
          <path d="M2 7l10 5 10-5" stroke={`url(#${id})`} strokeWidth="1.5" />
          <circle cx="12" cy="12" r="2.5" fill={`url(#${id})`} opacity="0.9" />
          <defs>
            <linearGradient id={id} x1="2" y1="2" x2="22" y2="22">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="50%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
};

export default BrandOrb;
