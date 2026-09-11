import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";

const STEPS = [
  {
    icon: "📤",
    title: "Upload",
    techBadge: null,
    plain:
      "A news organization uploads a video or photo to TrustStream, exactly like posting to any news site.",
  },
  {
    icon: "🔬",
    title: "AI-Free Forensic Check",
    techBadge: "Forensics Engine",
    plain:
      "The file is checked for signs of tampering using measurable technical signals — compression patterns, pixel-level consistency, audio/video sync — not a black-box AI guess. Every result can be traced back to a specific, explainable measurement, and a human can check the working.",
  },
  {
    icon: "🔏",
    title: "A Digital Signature Is Sealed Into the File",
    techBadge: "C2PA Provenance",
    plain:
      "A tamper-evident digital signature is embedded directly inside the file itself — like a wax seal that visibly breaks the moment anyone edits the content afterward. This isn't a separate record that can go missing; it travels with the file wherever it's copied.",
  },
  {
    icon: "🏛️",
    title: "Three Independent Organizations Must Agree",
    techBadge: "Hyperledger Fabric Blockchain",
    plain:
      "Before anything is permanently recorded, three separate organizations — a News Agency, a Broadcaster, and an independent Auditor — must each independently approve it. No single party, not even TrustStream itself, can fake or alter a record alone.",
  },
  {
    icon: "🌐",
    title: "Stored Across a Distributed Network",
    techBadge: "IPFS",
    plain:
      "The content itself lives on a decentralized storage network spread across many computers, instead of sitting on one company's server — so it can't quietly disappear or be swapped out later.",
  },
  {
    icon: "✅",
    title: "Anyone Can Verify, Forever",
    techBadge: null,
    plain:
      "A reader, a fact-checker, a court, or a future researcher can independently check whether a piece of content is genuine and untampered — at any point in the future, without needing to trust TrustStream's word for it.",
  },
];

const ORGS = [
  { name: "News Agency", role: "Submits the content", color: "#2a78d6" },
  { name: "Broadcaster", role: "Independently endorses", color: "#1baf7a" },
  { name: "Auditor", role: "Independently endorses", color: "#4a3aa7" },
];

function StepCard({ step, index, isDark, isLast }) {
  const cardBg = isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-400" : "text-neutral-500";

  return (
    <div className="flex gap-4">
      {/* Connector rail */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-2xl ${isDark ? "bg-neutral-900 border-blue-500/40" : "bg-white border-blue-400/60"}`}>
          {step.icon}
        </div>
        {!isLast && <div className={`w-0.5 flex-1 mt-2 ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`} style={{ minHeight: 24 }} />}
      </div>

      {/* Content */}
      <div className={`rounded-2xl border p-5 mb-6 flex-1 ${cardBg}`}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className={`text-[10px] font-mono font-bold ${textMuted}`}>STEP {index + 1}</span>
          {step.techBadge && (
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${isDark ? "border-violet-800/40 bg-violet-950/30 text-violet-300" : "border-violet-200 bg-violet-50 text-violet-700"}`}>
              {step.techBadge}
            </span>
          )}
        </div>
        <h3 className={`text-base font-bold mb-1.5 ${text}`}>{step.title}</h3>
        <p className={`text-sm leading-relaxed ${textMuted}`}>{step.plain}</p>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const { isDark } = useTheme();
  const bg = isDark ? "bg-[#080808]" : "bg-neutral-100";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-400" : "text-neutral-500";
  const cardBg = isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">

        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">How TrustStream Works</h1>
          <p className={`text-base leading-relaxed max-w-xl mx-auto ${textMuted}`}>
            A plain-language walkthrough of how TrustStream proves a video or image is genuine —
            from the moment it's uploaded to a permanent record anyone can check.
          </p>
        </div>

        {/* The problem */}
        <div className={`rounded-2xl border p-6 ${cardBg}`}>
          <p className={`text-[10px] uppercase tracking-widest font-mono mb-2 ${textMuted}`}>The Problem</p>
          <p className={`text-sm leading-relaxed ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
            Manipulated or fabricated news content can spread far faster than anyone can fact-check it.
            By the time a claim is debunked, the damage is often already done. TrustStream gives every
            piece of published content a permanent, independently checkable proof of authenticity —
            created the moment it's published, not after the fact.
          </p>
        </div>

        {/* Step-by-step pipeline */}
        <div>
          <h2 className="text-xl font-bold mb-5">The Journey of One Upload</h2>
          <div>
            {STEPS.map((step, i) => (
              <StepCard key={step.title} step={step} index={i} isDark={isDark} isLast={i === STEPS.length - 1} />
            ))}
          </div>
        </div>

        {/* Why AI-free */}
        <div className={`rounded-2xl border p-6 ${isDark ? "bg-emerald-950/15 border-emerald-800/30" : "bg-emerald-50 border-emerald-200"}`}>
          <p className={`text-[10px] uppercase tracking-widest font-mono mb-2 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>Why "AI-Free"?</p>
          <p className={`text-sm leading-relaxed ${isDark ? "text-emerald-100/80" : "text-emerald-900"}`}>
            Most deepfake-detection tools today are themselves AI models — which means their verdicts are
            often a black box: you get a score, but not a reason, and AI detectors can be fooled by content
            specifically crafted to beat them. TrustStream deliberately avoids this. Every forensic signal it
            checks (compression consistency, pixel-level patterns, audio/video timing) is a deterministic,
            human-explainable measurement — the same file always produces the same result, and the reasoning
            behind every score can be inspected, not just trusted.
          </p>
        </div>

        {/* 3-org trust model */}
        <div className={`rounded-2xl border p-6 ${cardBg}`}>
          <p className={`text-[10px] uppercase tracking-widest font-mono mb-1 ${textMuted}`}>The Trust Model</p>
          <h3 className={`text-base font-bold mb-4 ${text}`}>Why Three Organizations, Not One?</h3>
          <p className={`text-sm leading-relaxed mb-5 ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
            If only one organization controlled the record, that organization could quietly edit or delete
            it — which defeats the entire purpose. TrustStream instead requires all three consortium members
            to independently endorse every submission before it becomes permanent.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {ORGS.map((org) => (
              <div key={org.name} className={`rounded-xl border p-3 text-center ${isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"}`}>
                <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ background: org.color }} />
                <p className={`text-xs font-bold ${text}`}>{org.name}</p>
                <p className={`text-[10px] mt-0.5 ${textMuted}`}>{org.role}</p>
              </div>
            ))}
          </div>
          <p className={`text-xs mt-4 ${textMuted}`}>
            If two of the three later flag a piece of content as suspicious, it's automatically marked
            <strong className={isDark ? "text-amber-400" : "text-amber-600"}> Disputed</strong> — and only
            the independent Auditor organization can clear that status, not the org that originally
            submitted it.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <Link to="/" className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
            Browse Real Content →
          </Link>
          <Link to="/fabric-audit" className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${isDark ? "border-neutral-700 text-neutral-300 hover:border-violet-500 hover:text-violet-400" : "border-neutral-200 text-neutral-600 hover:border-violet-400 hover:text-violet-600"}`}>
            See the Live Ledger →
          </Link>
          <Link to="/analytics" className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${isDark ? "border-neutral-700 text-neutral-300 hover:border-blue-500 hover:text-blue-400" : "border-neutral-200 text-neutral-600 hover:border-blue-400 hover:text-blue-600"}`}>
            View Analytics →
          </Link>
        </div>
      </div>
    </div>
  );
}
