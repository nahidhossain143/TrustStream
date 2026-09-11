import { useState } from "react";

// Grouped bar chart for 2 categorical series (e.g. videos vs images over
// time). Fixed color-slot order per series - color follows the entity,
// never repainted when the data changes.
export default function GroupedBarChart({ data, labelKey, series, height = 200, isDark }) {
  const [hover, setHover] = useState(null); // { index, seriesKey }
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const groupGap = 3;
  const groupWidth = (100 - groupGap * (data.length - 1)) / data.length;
  const barGap = 0.5;
  const barWidth = (groupWidth - barGap * (series.length - 1)) / series.length;

  const axisColor = isDark ? "#383835" : "#c3c2b7";
  const mutedColor = "#898781";
  const textColor = isDark ? "#ffffff" : "#0b0b0b";

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
          <line x1="0" y1={height - 18} x2="100" y2={height - 18} stroke={axisColor} strokeWidth="0.3" />
          {data.map((d, gi) => {
            const gx = gi * (groupWidth + groupGap);
            return (
              <g key={gi}>
                {series.map((s, si) => {
                  const value = d[s.key] || 0;
                  const barHeight = max > 0 ? (value / max) * (height - 26) : 0;
                  const x = gx + si * (barWidth + barGap);
                  const y = height - 18 - barHeight;
                  const isHovered = hover?.index === gi && hover?.seriesKey === s.key;
                  return (
                    <g key={s.key}
                      onMouseEnter={() => setHover({ index: gi, seriesKey: s.key })}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <rect x={x - 0.3} y={0} width={barWidth + 0.6} height={height - 18} fill="transparent" />
                      <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, value > 0 ? 0.8 : 0)}
                        rx="0.8" fill={s.color} opacity={isHovered ? 1 : 0.85} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hover && (
          <div
            className="absolute -top-1 px-2 py-1 rounded-md text-[10px] font-mono pointer-events-none shadow-lg z-10 whitespace-nowrap"
            style={{
              left: `${hover.index * (groupWidth + groupGap) + groupWidth / 2}%`,
              transform: "translate(-50%, -100%)",
              background: isDark ? "#1a1a19" : "#fcfcfb",
              color: textColor,
              border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(11,11,11,0.10)"}`,
            }}
          >
            {data[hover.index][labelKey]} · {series.find((s) => s.key === hover.seriesKey)?.label}:{" "}
            <strong>{data[hover.index][hover.seriesKey]}</strong>
          </div>
        )}
      </div>
      <div className="flex justify-between mt-1">
        {data.map((d, i) => (
          <span key={i} className="text-[8px] font-mono" style={{ color: mutedColor, width: `${groupWidth}%`, textAlign: "center" }}>
            {data.length > 10 && i % 3 !== 0 ? "" : d[labelKey]}
          </span>
        ))}
      </div>
      {/* Legend - identity is never color-alone */}
      <div className="flex items-center gap-4 mt-3">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-[10px] font-mono" style={{ color: textColor }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
