import React from "react";

const colorFor = (pct) =>
  pct >= 100 ? "#10B981" : pct >= 70 ? "#3B82F6" : pct >= 40 ? "#F59E0B" : "#EF4444";

const CompletenessRing = ({ pct = 0, size = 30, strokeWidth = 3, showLabel = true, label, onClick, title }) => {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  const color = colorFor(safe);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (safe / 100) * c;

  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--hover-bg)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease", filter: `drop-shadow(0 0 4px ${color}40)` }}
          />
        </svg>
        {showLabel && size >= 26 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: size >= 44 ? 12 : size >= 36 ? 10 : 9,
              fontWeight: 700,
              color,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "-0.02em",
            }}
          >
            {safe}
          </div>
        )}
      </div>
      {label && (
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" }}>{label}</span>
      )}
    </div>
  );
};

export default CompletenessRing;
