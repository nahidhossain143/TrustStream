import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import BarChart from "../components/charts/BarChart";
import GroupedBarChart from "../components/charts/GroupedBarChart";
import DonutChart from "../components/charts/DonutChart";
import { statsAPI } from "../services/api";
import { useTheme } from "../context/ThemeContext";

// Status palette (fixed - never reused for generic series identity; same
// steps in both themes per the dataviz palette reference).
const STATUS_GOOD = "#0ca30c";
const STATUS_WARNING = "#fab219";
const STATUS_CRITICAL = "#d03b3b";
const STATUS_MUTED = "#898781";

// Categorical slots, fixed order (never cycled/repainted by filters).
// Dark mode uses its own validated steps, not an automatic flip of light's.
const seriesColors = (isDark) => ({
  blue: isDark ? "#3987e5" : "#2a78d6",
  orange: isDark ? "#d95926" : "#eb6834",
});

// Real Hyperledger Caliper benchmark results (see README § Performance
// Benchmarking) - a completed, static measurement, not live-fetched.
const CALIPER_ROUNDS = [
  { round: "Video\n1 worker", throughput: 3.0, avgLatencyS: 4.67 },
  { round: "Image\n1 worker", throughput: 4.8, avgLatencyS: 1.20 },
  { round: "Image\n5 workers", throughput: 14.5, avgLatencyS: 0.52 },
  { round: "Image\n10 workers", throughput: 23.0, avgLatencyS: 0.46 },
  { round: "Query\n5 workers", throughput: 25.2, avgLatencyS: 0.02 },
];

function StatTile({ label, value, isDark }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
      <p className={`text-[10px] uppercase tracking-widest font-mono ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${isDark ? "text-white" : "text-neutral-900"}`}>{value}</p>
    </div>
  );
}

function Card({ title, subtitle, children, isDark }) {
  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
      <div className="px-6 py-5">
        <p className={`text-sm font-bold ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>{title}</p>
        {subtitle && <p className={`text-[11px] mt-0.5 mb-4 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>{subtitle}</p>}
        <div className={subtitle ? "" : "mt-4"}>{children}</div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { isDark } = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    statsAPI.getStats()
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-100";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const colors = seriesColors(isDark);

  const verdictData = stats ? [
    { label: "Authentic", value: stats.verdictBreakdown.Authentic, color: STATUS_GOOD },
    { label: "Suspicious", value: stats.verdictBreakdown.Suspicious, color: STATUS_WARNING },
    { label: "Likely Manipulated", value: stats.verdictBreakdown["Likely Manipulated"], color: STATUS_CRITICAL },
    { label: "Pending analysis", value: stats.verdictBreakdown.Pending, color: STATUS_MUTED },
  ] : [];

  const fabricStatusColor = (status) => {
    if (status === "disputed" || status === "revoked") return STATUS_CRITICAL;
    if (status === "pending" || status === "registering") return STATUS_WARNING;
    if (status === "active" || status === "ready") return STATUS_GOOD;
    return STATUS_MUTED;
  };
  const fabricData = stats ? Object.entries(stats.fabricStatusBreakdown).map(([status, value]) => ({
    label: status, value, color: fabricStatusColor(status),
  })) : [];

  const uploadsSeries = [
    { key: "videos", label: "Videos", color: colors.blue },
    { key: "images", label: "Images", color: colors.orange },
  ];
  const uploadsData = (stats?.uploadsOverTime || []).map((d) => ({
    ...d,
    date: d.date.slice(5), // MM-DD, room is tight
  }));

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Analytics</h1>
          <p className={`text-sm mt-1 ${textMuted}`}>
            Every number below is computed live from the actual catalog and ledger — nothing simulated.
          </p>
        </div>

        {loading && (
          <div className={`rounded-2xl border p-12 text-center ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
            <div className="w-8 h-8 rounded-full border-t-2 border-blue-400 animate-spin mx-auto" />
          </div>
        )}

        {error && (
          <div className={`rounded-2xl border p-5 text-sm ${isDark ? "bg-red-950/20 border-red-800/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}>
            ✗ {error}
          </div>
        )}

        {stats && (
          <>
            {/* Stat tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Total Media" value={stats.totals.total} isDark={isDark} />
              <StatTile label="Videos" value={stats.totals.videos} isDark={isDark} />
              <StatTile label="Images" value={stats.totals.images} isDark={isDark} />
              <StatTile label="Avg Risk Score" value={stats.averageRiskScore != null ? `${Math.round(stats.averageRiskScore * 100)}%` : "—"} isDark={isDark} />
            </div>

            {/* Verdict breakdown + Fabric health */}
            <div className="grid md:grid-cols-2 gap-5">
              <Card title="Forensic Verdict Breakdown" subtitle="AI-free compression/temporal/AV-sync/ELA analysis across every upload" isDark={isDark}>
                <DonutChart data={verdictData} isDark={isDark} centerLabel="media" />
              </Card>
              <Card title="Fabric Ledger Health" subtitle="Current on-chain status across every registered proof" isDark={isDark}>
                <DonutChart data={fabricData} isDark={isDark} centerLabel="records" />
              </Card>
            </div>

            {/* Risk histogram */}
            <Card title="Risk Score Distribution" subtitle="How many uploads fall into each 0.0–1.0 risk band" isDark={isDark}>
              <BarChart data={stats.riskHistogram} valueKey="count" labelKey="bucket" color={colors.blue} isDark={isDark} height={160} />
            </Card>

            {/* Uploads over time */}
            {uploadsData.length > 0 && (
              <Card title="Uploads Over Time" subtitle="Registrations per day, video vs image" isDark={isDark}>
                <GroupedBarChart data={uploadsData} labelKey="date" series={uploadsSeries} isDark={isDark} height={180} />
              </Card>
            )}

            {/* Caliper benchmark */}
            <Card
              title="Hyperledger Caliper Benchmark"
              subtitle="Real load-test results against the live 3-org network — 301 transactions, 0 failures (see README § Performance Benchmarking)"
              isDark={isDark}
            >
              <BarChart
                data={CALIPER_ROUNDS}
                valueKey="throughput"
                labelKey="round"
                color={colors.blue}
                isDark={isDark}
                height={180}
                formatValue={(v) => `${v} TPS`}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
