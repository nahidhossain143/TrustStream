import { useState } from "react";

// Simple vertical bar chart: SVG-based, thin marks with rounded data-ends,
// per-bar hover tooltip, direct value labels on hover only (not every bar -
// avoids label clutter per dataviz mark spec).
export default function BarChart({ data, valueKey = "count", labelKey = "bucket", color, height = 180, isDark, formatValue = (v) => v }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  const barGap = 4;
  const chartWidth = 100; // percentage-based viewBox
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length;

  const axisColor = isDark ? "#383835" : "#c3c2b7";
  const mutedColor = isDark ? "#898781" : "#898781";
  const textColor = isDark ? "#ffffff" : "#0b0b0b";

  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <line x1="0" y1={height - 20} x2="100" y2={height - 20} stroke={axisColor} strokeWidth="0.3" />
        {data.map((d, i) => {
          const value = d[valueKey];
          const barHeight = max > 0 ? (value / max) * (height - 28) : 0;
          const x = i * (barWidth + barGap);
          const y = height - 20 - barHeight;
          const isHovered = hoverIndex === i;
          return (
            <g key={i}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Wider invisible hit target than the visible bar */}
              <rect x={x - 1} y={0} width={barWidth + 2} height={height - 20} fill="transparent" />
              <rect
                x={x} y={y} width={barWidth} height={Math.max(barHeight, value > 0 ? 1 : 0)}
                rx="1" ry="1"
                fill={color}
                opacity={isHovered ? 1 : 0.85}
              />
            </g>
          );
        })}
      </svg>
      {/* X-axis labels (every other one if crowded) */}
      <div className="flex mt-1" style={{ gap: `${barGap}%` }}>
        {data.map((d, i) => (
          <div key={i} className="text-center" style={{ width: `${barWidth}%`, flexShrink: 0 }}>
            <span className="text-[8px] font-mono" style={{ color: mutedColor }}>
              {data.length > 8 && i % 2 !== 0 ? "" : d[labelKey]}
            </span>
          </div>
        ))}
      </div>
      {hoverIndex !== null && (
        <div
          className="absolute -top-1 px-2 py-1 rounded-md text-[10px] font-mono pointer-events-none shadow-lg z-10"
          style={{
            left: `${hoverIndex * (barWidth + barGap) + barWidth / 2}%`,
            transform: "translate(-50%, -100%)",
            background: isDark ? "#1a1a19" : "#fcfcfb",
            color: textColor,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(11,11,11,0.10)"}`,
          }}
        >
          {data[hoverIndex][labelKey]}: <strong>{formatValue(data[hoverIndex][valueKey])}</strong>
        </div>
      )}
    </div>
  );
}
