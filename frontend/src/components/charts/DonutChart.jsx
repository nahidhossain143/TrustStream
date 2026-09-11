import { useState } from "react";

// Donut chart for status/verdict breakdowns. Segments carry a 2px
// surface-color gap between them (per mark spec) and a legend with counts
// (never color-alone identity). Center shows the total as a stat.
export default function DonutChart({ data, size = 160, isDark, centerLabel }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = size / 2;
  const strokeWidth = size * 0.16;
  const innerRadius = radius - strokeWidth / 2;
  const circumference = 2 * Math.PI * innerRadius;
  const gapDeg = total > 0 ? 2 : 0; // visual gap between segments

  const surfaceColor = isDark ? "#1a1a19" : "#fcfcfb";
  const textColor = isDark ? "#ffffff" : "#0b0b0b";
  const mutedColor = "#898781";

  let cumulativeAngle = -90;
  const segments = data.map((d) => {
    const fraction = total > 0 ? d.value / total : 0;
    const angle = fraction * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    return { ...d, fraction, angle, startAngle };
  });

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map((seg, i) => {
            if (seg.value === 0) return null;
            const dashLength = (seg.angle / 360) * circumference - gapDeg;
            const dashOffset = -((seg.startAngle + 90) / 360) * circumference;
            return (
              <circle
                key={i}
                cx={radius} cy={radius} r={innerRadius}
                fill="none"
                stroke={seg.color}
                strokeWidth={hoverIndex === i ? strokeWidth * 1.08 : strokeWidth}
                strokeDasharray={`${Math.max(dashLength, 0)} ${circumference}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.5}
                style={{ cursor: "pointer", transition: "stroke-width 120ms, opacity 120ms" }}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hoverIndex !== null ? (
            <>
              <span className="text-lg font-bold" style={{ color: textColor }}>{segments[hoverIndex].value}</span>
              <span className="text-[9px] font-mono text-center px-2" style={{ color: mutedColor }}>{segments[hoverIndex].label}</span>
            </>
          ) : (
            <>
              <span className="text-lg font-bold" style={{ color: textColor }}>{total}</span>
              <span className="text-[9px] font-mono" style={{ color: mutedColor }}>{centerLabel || "total"}</span>
            </>
          )}
        </div>
      </div>
      <div className="space-y-1.5 min-w-[140px]">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 cursor-pointer"
            onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)}>
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="text-[11px] font-mono flex-1" style={{ color: textColor, opacity: hoverIndex === null || hoverIndex === i ? 1 : 0.5 }}>
              {d.label}
            </span>
            <span className="text-[11px] font-mono font-bold" style={{ color: textColor }}>
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
