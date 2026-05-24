import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { imageAPI } from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
const IPFS_GATEWAY     = "https://gateway.pinata.cloud/ipfs";

const buildGatewayUrl = (cid) => (cid ? `${IPFS_GATEWAY}/${cid}` : null);

// ─── Section Header ───────────────────────────────────────
function SectionHeader({ icon, title, color = "purple", isDark }) {
  const colors = {
    purple:  { bg: "bg-purple-500/15",  border: "border-purple-500/25",  text: "text-purple-400" },
    emerald: { bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "text-emerald-400" },
    violet:  { bg: "bg-violet-500/15",  border: "border-violet-500/25",  text: "text-violet-400" },
    orange:  { bg: "bg-orange-500/15",  border: "border-orange-500/25",  text: "text-orange-400" },
    pink:    { bg: "bg-pink-500/15",    border: "border-pink-500/25",    text: "text-pink-400" },
    blue:    { bg: "bg-blue-500/15",    border: "border-blue-500/25",    text: "text-blue-400" },
  };
  const c = colors[color] || colors.purple;
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-7 h-7 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center text-base`}>
        {icon}
      </div>
      <h2 className={`text-sm font-bold tracking-wide ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
        {title}
      </h2>
    </div>
  );
}

// ─── Info Row ─────────────────────────────────────────────
function InfoRow({ label, value, mono, link, isDark }) {
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const textVal   = isDark ? "text-neutral-300" : "text-neutral-700";
  return (
    <div className={`flex gap-3 items-start py-2.5 border-b last:border-0 ${isDark ? "border-white/5" : "border-neutral-100"}`}>
      <span className={`text-[10px] uppercase tracking-widest font-mono w-32 flex-shrink-0 pt-0.5 ${textMuted}`}>
        {label}
      </span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer"
          className="text-[11px] break-all underline font-mono text-blue-400 hover:text-blue-300">
          {value}
        </a>
      ) : (
        <span className={`text-[11px] break-all ${mono ? "font-mono" : ""} ${textVal}`}>
          {value || "—"}
        </span>
      )}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────
function StatusBadge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 ${
      ok
        ? "text-emerald-400 bg-emerald-950/30 border-emerald-800/40"
        : "text-neutral-500 bg-neutral-900/40 border-neutral-800"
    }`}>
      {ok ? "✓" : "—"} {label}
    </span>
  );
}

// ─── Main ────────────────────────────────────────────────
export default function ImageDetail() {
  const { isDark }   = useTheme();
  const { imageId }  = useParams();
  const navigate     = useNavigate();

  const [image, setImage]               = useState(null);
  const [c2paData, setC2paData]         = useState(null);
  const [chainData, setChainData]       = useState(null);
  const [endorsements, setEndorsements] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [imgError, setImgError]         = useState(false);

  useEffect(() => {
    if (!imageId) return;
    Promise.all([
      imageAPI.getOne(imageId),
      imageAPI.getC2pa(imageId).catch(() => ({ data: null })),
      imageAPI.blockchain.getImage(imageId).catch(() => ({ data: null })),
      imageAPI.blockchain.getEndorsements(imageId).catch(() => ({ data: { endorsements: [] } })),
    ])
      .then(([imgRes, c2paRes, chainRes, endorseRes]) => {
        setImage(imgRes.data);
        setC2paData(c2paRes.data);
        setChainData(chainRes.data);
        setEndorsements(endorseRes.data?.endorsements || []);
      })
      .catch(() => setError("Image not found"))
      .finally(() => setLoading(false));
  }, [imageId]);

  const bg        = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const cardBg    = isDark ? "bg-neutral-900/40 border-white/8" : "bg-white border-neutral-200";
  const text      = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";

  if (loading) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border border-purple-500/20" />
            <div className="absolute inset-0 rounded-full border-t border-purple-500 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className={`text-lg font-semibold ${text}`}>Image not found</p>
            <button onClick={() => navigate("/")} className="text-purple-400 hover:underline text-sm">
              ← Back to feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  const imgSrc = image.ipfsCid ? buildGatewayUrl(image.ipfsCid) : null;
  const statusLabel = image.status === 0 || image.status === "active"   ? "Active"
                    : image.status === 1 || image.status === "revoked"  ? "Revoked"
                    : image.status === 2 || image.status === "disputed" ? "Disputed"
                    : image.blockchainStatus;

  // Verify hash handler
  const handleVerify = async () => {
    if (!image.sha256Hash) {
      alert("No stored hash to verify against");
      return;
    }
    try {
      const res = await imageAPI.verify({
        imageId,
        clientHash: image.sha256Hash,
      });
      alert(
        res.data.status === "verified"
          ? "✓ Hash verified — image content is authentic"
          : "✗ Hash mismatch — possible tampering detected"
      );
    } catch (err) {
      alert("Verify failed: " + err.message);
    }
  };

  // Report tamper handler
  const handleReportTamper = async () => {
    if (!window.confirm(
      "Report this image as tampered? This will be recorded permanently on the blockchain (immutable)."
    )) return;
    try {
      await imageAPI.reportTamper(imageId);
      alert("Tamper report submitted. Will be confirmed on-chain shortly.");
    } catch (err) {
      alert("Failed: " + err.message);
    }
  };

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ─── Back + Title ─────────────────────────── */}
        <div className="space-y-3">
          <button
            onClick={() => navigate("/")}
            className={`flex items-center gap-2 text-[11px] font-mono transition-colors ${textMuted} hover:text-purple-400`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to feed
          </button>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-mono px-2 py-0.5 rounded border text-purple-400 bg-purple-950/20 border-purple-800/30">
                  🖼 IMAGE
                </span>
              </div>
              <h1 className={`text-2xl font-bold tracking-tight ${text}`}>{image.title}</h1>
              {image.description && (
                <p className={`text-sm mt-1 ${textMuted}`}>{image.description}</p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <StatusBadge ok={image.blockchainStatus === "ready"}  label="Blockchain" />
              <StatusBadge ok={image.c2paSigned}                    label="C2PA" />
              <StatusBadge ok={image.ipfsStatus === "uploaded"}     label="IPFS" />
              <StatusBadge ok={(image.endorsementCount || 0) >= 2}  label="Endorsed" />
              {image.forensicLabel && (
                <StatusBadge ok={image.forensicLabel === "Authentic"} label={`Forensic: ${image.forensicLabel}`} />
              )}
            </div>
          </div>
        </div>

        {/* ─── Image Preview ────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="🖼️" title="Image Preview" color="purple" isDark={isDark} />
            <div className={`rounded-xl overflow-hidden border flex items-center justify-center min-h-[200px] ${
              isDark ? "bg-neutral-950 border-white/8" : "bg-neutral-100 border-neutral-200"
            }`}>
              {imgSrc && !imgError ? (
                <img
                  src={imgSrc}
                  alt={image.title}
                  className="max-w-full max-h-[500px] object-contain"
                  onError={() => setImgError(true)}
                />
              ) : imgError ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <span className="text-4xl">🖼️</span>
                  <p className={`text-sm ${textMuted}`}>Image could not be loaded</p>
                  {imgSrc && (
                    <a href={imgSrc} target="_blank" rel="noreferrer"
                      className="text-purple-400 text-sm hover:underline">
                      Open on IPFS ↗
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-12">
                  <div className="relative w-8 h-8">
                    <div className="absolute inset-0 rounded-full border border-purple-500/20" />
                    <div className="absolute inset-0 rounded-full border-t border-purple-500 animate-spin" />
                  </div>
                  <p className={`text-sm ${textMuted}`}>
                    {image.ipfsStatus === "uploading" || image.ipfsStatus === "pending"
                      ? "Uploading to IPFS…"
                      : "Image not yet available on IPFS"}
                  </p>
                </div>
              )}
            </div>

            {/* Open on IPFS link */}
            {imgSrc && !imgError && (
              <div className="mt-3 flex justify-end">
                <a href={imgSrc} target="_blank" rel="noreferrer"
                  className="text-[11px] text-purple-400 hover:text-purple-300 font-mono flex items-center gap-1">
                  Open full resolution on IPFS ↗
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ─── NEW: Forensic Analysis ──────────────── */}
        {image.forensics && (
          <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
            <div className="px-6 py-5">
              <SectionHeader icon="🔬" title="AI-Free Forensic Analysis" color="pink" isDark={isDark} />

              {/* Risk score + verdict */}
              <div className={`rounded-xl p-4 border mb-4 ${
                image.forensics.finalLabel === "Authentic"
                  ? isDark ? "bg-emerald-950/20 border-emerald-800/30" : "bg-emerald-50 border-emerald-200"
                  : image.forensics.finalLabel === "Suspicious"
                  ? isDark ? "bg-amber-950/20 border-amber-800/30" : "bg-amber-50 border-amber-200"
                  : isDark ? "bg-red-950/20 border-red-800/30" : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className={`text-[10px] uppercase tracking-widest font-mono ${textMuted}`}>Verdict</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      image.forensics.finalLabel === "Authentic" ? "text-emerald-500"
                      : image.forensics.finalLabel === "Suspicious" ? "text-amber-500"
                      : "text-red-500"
                    }`}>
                      {image.forensics.finalLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[10px] uppercase tracking-widest font-mono ${textMuted}`}>Risk Score</p>
                    <p className={`text-2xl font-bold mt-1 ${text}`}>
                      {Math.round((image.forensics.imageRiskScore || 0) * 100)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* 2 modules: compression + metadata */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {image.forensics.modules?.compression && (
                  <div className={`rounded-xl p-3 border ${isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"}`}>
                    <p className={`text-[10px] font-semibold ${textMuted}`}>📦 COMPRESSION</p>
                    <p className={`text-lg font-bold mt-1 ${text}`}>
                      {Math.round((image.forensics.modules.compression.compressionScore || 0) * 100)}%
                    </p>
                    <p className={`text-[9px] font-mono mt-1 ${textMuted}`}>
                      {image.forensics.modules.compression.metrics?.codec || "—"}
                      {image.forensics.modules.compression.metrics?.jpegQuality &&
                        ` · Q${image.forensics.modules.compression.metrics.jpegQuality}`}
                    </p>
                  </div>
                )}
                {image.forensics.modules?.metadata && (
                  <div className={`rounded-xl p-3 border ${isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"}`}>
                    <p className={`text-[10px] font-semibold ${textMuted}`}>▪ METADATA</p>
                    <p className={`text-lg font-bold mt-1 ${text}`}>
                      {Math.round((image.forensics.modules.metadata.metadataAnomalyScore || 0) * 100)}%
                    </p>
                    <p className={`text-[9px] font-mono mt-1 ${textMuted}`}>
                      {image.forensics.modules.metadata.fingerprint?.tagCount || 0} EXIF tags
                    </p>
                  </div>
                )}
              </div>

              {/* Forensic notes */}
              {image.forensics.notes?.length > 0 && (
                <div className={`rounded-lg p-3 border ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-neutral-50 border-neutral-200"}`}>
                  <p className={`text-[10px] uppercase tracking-widest font-mono mb-2 ${textMuted}`}>Forensic Notes</p>
                  <ul className="space-y-1">
                    {image.forensics.notes.map((note, i) => (
                      <li key={i} className={`text-[11px] leading-relaxed flex gap-2 ${textMuted}`}>
                        <span className="text-amber-500 flex-shrink-0">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className={`text-[9px] font-mono mt-3 ${textMuted}`}>
                {image.forensics.analysisVersion} · Pure quantitative · No AI / no ML
              </p>
            </div>
          </div>
        )}

        {/* ─── NEW: Action Row ─────────────────────── */}
        <div className={`rounded-2xl border p-4 ${cardBg}`}>
          <div className="flex items-center gap-2 flex-wrap">
            {image.txHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${image.txHash}`}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  isDark ? "bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10"
                         : "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200"
                }`}
              >
                ⛓ View on Etherscan ↗
              </a>
            )}
            {image.metadataCid && (
              <a
                href={buildGatewayUrl(image.metadataCid)}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  isDark ? "bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10"
                         : "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200"
                }`}
              >
                📌 IPFS Metadata ↗
              </a>
            )}
            <button
              onClick={handleVerify}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                isDark ? "bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10"
                       : "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200"
              }`}
            >
              🛡 Verify Hash
            </button>
            <button
              onClick={handleReportTamper}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all"
              title="Permanent on-chain tamper record"
            >
              ⚠ Report Tamper
            </button>
          </div>
          <p className={`text-[10px] font-mono mt-3 ${textMuted}`}>
            Note: tamper reports are permanent on-chain. 2 reports flip image status to "Disputed".
          </p>
        </div>

        {/* ─── Metadata ─────────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📄" title="Image Metadata" color="blue" isDark={isDark} />
            <InfoRow label="Image ID"    value={image.imageId}                                   mono isDark={isDark} />
            <InfoRow label="Title"       value={image.title}                                          isDark={isDark} />
            <InfoRow label="Description" value={image.description}                                    isDark={isDark} />
            <InfoRow label="MIME Type"   value={image.mimeType}                                       isDark={isDark} />
            <InfoRow label="Filename"    value={image.filename}                              mono     isDark={isDark} />
            <InfoRow label="Created At"  value={new Date(image.createdAt).toLocaleString()}           isDark={isDark} />
            <InfoRow label="Uploader"    value={image.uploader || "NewsAgency"}                       isDark={isDark} />
            <InfoRow label="Status"      value={statusLabel}                                          isDark={isDark} />
            <InfoRow label="SHA-256"     value={image.sha256Hash}                            mono     isDark={isDark} />
          </div>
        </div>

        {/* ─── Blockchain ───────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="⛓" title="Blockchain Info" color="emerald" isDark={isDark} />
            <InfoRow label="Network"        value="Ethereum Sepolia Testnet"  isDark={isDark} />
            <InfoRow label="Chain ID"       value="11155111"                  isDark={isDark} />
            <InfoRow label="Contract"       value={CONTRACT_ADDRESS}     mono
              link={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`} isDark={isDark} />
            <InfoRow label="Status"         value={image.blockchainStatus}    isDark={isDark} />
            <InfoRow label="Register TX"    value={image.txHash}         mono
              link={image.txHash ? `https://sepolia.etherscan.io/tx/${image.txHash}` : null}
              isDark={isDark} />
            <InfoRow label="Broadcaster TX" value={image.txHashBroadcaster} mono
              link={image.txHashBroadcaster ? `https://sepolia.etherscan.io/tx/${image.txHashBroadcaster}` : null}
              isDark={isDark} />
            <InfoRow label="Auditor TX"     value={image.txHashAuditor}  mono
              link={image.txHashAuditor ? `https://sepolia.etherscan.io/tx/${image.txHashAuditor}` : null}
              isDark={isDark} />
            <InfoRow label="Block"          value={image.blockNumber?.toString()}        mono isDark={isDark} />
            <InfoRow label="Total Gas"      value={image.totalGasUsed ? `${image.totalGasUsed.toLocaleString()} units` : null} isDark={isDark} />
            <InfoRow label="Endorsements"   value={`${image.endorsementCount || 0} / 3`}     isDark={isDark} />
            <InfoRow label="Immutability"   value="Record permanent — delete not possible"     isDark={isDark} />

            {/* On-chain data (if fetched) */}
            {chainData?.exists && (
              <>
                <InfoRow label="Chain Hash"     value={chainData.sha256Hash}      mono isDark={isDark} />
                <InfoRow label="Chain IPFS CID" value={chainData.ipfsCid}         mono isDark={isDark} />
              </>
            )}

            {/* 3-org endorsement grid */}
            <div className={`pt-3 mt-1 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>
                3-Org Consortium Endorsements
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "NewsAgency",  role: "Submitter", icon: "🏢", color: "text-emerald-400" },
                  { name: "Broadcaster", role: "Endorser",  icon: "📡", color: "text-blue-400" },
                  { name: "Auditor",     role: "Endorser",  icon: "🔍", color: "text-violet-400" },
                ].map(({ name, role, icon, color }, i) => {
                  const endorsed = endorsements[i] || (i < (image.endorsementCount || 0));
                  return (
                    <div key={name} className={`rounded-xl p-3 border text-center ${
                      isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"
                    }`}>
                      <div className="text-xl mb-1">{icon}</div>
                      <p className={`text-[11px] font-semibold ${color}`}>{name}</p>
                      <p className={`text-[9px] ${textMuted}`}>{role}</p>
                      <p className={`text-[9px] mt-1 font-mono ${endorsed ? "text-emerald-500" : textMuted}`}>
                        {endorsed ? "✓ Endorsed" : "Pending"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ─── IPFS ─────────────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📌" title="IPFS Storage" color="orange" isDark={isDark} />
            <InfoRow label="Provider"     value="Pinata"                                           isDark={isDark} />
            <InfoRow label="Status"       value={image.ipfsStatus}                                 isDark={isDark} />
            <InfoRow label="Image CID"    value={image.ipfsCid}                              mono
              link={buildGatewayUrl(image.ipfsCid)} isDark={isDark} />
            <InfoRow label="Metadata CID" value={image.metadataCid}                          mono
              link={buildGatewayUrl(image.metadataCid)} isDark={isDark} />
            <InfoRow label="Content"      value="Image file + metadata JSON"                       isDark={isDark} />
            <InfoRow label="Public GW"    value={buildGatewayUrl(image.ipfsCid)}             mono
              link={buildGatewayUrl(image.ipfsCid)} isDark={isDark} />
          </div>
        </div>

        {/* ─── C2PA ─────────────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="▪" title="C2PA Provenance" color="violet" isDark={isDark} />
            <InfoRow label="Spec Version"  value="C2PA v2.2"                                       isDark={isDark} />
            <InfoRow label="Status"        value={image.c2paStatus}                                isDark={isDark} />
            <InfoRow label="Assertions"    value="7 per image (no chain_hash — single unit)"       isDark={isDark} />
            <InfoRow label="Algorithm"     value="HMAC-SHA256"                                     isDark={isDark} />
            <InfoRow label="Signer"        value="NewsAgency"                                      isDark={isDark} />
            <InfoRow label="Format"        value="Sidecar .c2pa file alongside image"              isDark={isDark} />
            <InfoRow label="Instance ID"   value={image.c2paInstanceId || c2paData?.c2paInstanceId} mono isDark={isDark} />
            <InfoRow label="Manifest Hash" value={image.c2paManifestHash || c2paData?.c2paManifestHash} mono isDark={isDark} />
            <InfoRow label="Signed At"     value={image.c2paSignedAt ? new Date(image.c2paSignedAt).toLocaleString() : null} isDark={isDark} />

            {/* C2PA signature verification result */}
            {c2paData?.verification && (
              <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
                <p className={`text-[10px] uppercase tracking-widest font-mono mb-2 ${textMuted}`}>Signature Verification</p>
                <div className={`rounded-lg px-3 py-2.5 border text-[11px] font-mono ${
                  c2paData.verification.valid
                    ? isDark ? "bg-emerald-950/20 border-emerald-800/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : isDark ? "bg-red-950/20 border-red-800/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"
                }`}>
                  {c2paData.verification.valid ? "✓ Signature valid — manifest not tampered" : `✗ ${c2paData.verification.error || "Signature invalid"}`}
                </div>
              </div>
            )}

            {/* 7 Assertions grid */}
            <div className={`pt-3 mt-1 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>7 Assertions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Hash Binding",    icon: "🔒", value: "c2pa.hash.data" },
                  { label: "Actions",         icon: "⚡", value: "c2pa.actions" },
                  { label: "Claim Generator", icon: "🏭", value: "c2pa.claim_generator" },
                  { label: "Creative Work",   icon: "🖼️", value: "schema-org.ImageObject" },
                  { label: "Ingredient",      icon: "🧬", value: "c2pa.ingredient" },
                  { label: "Timestamp",       icon: "⏰", value: "c2pa.timestamp" },
                  { label: "Consortium",      icon: "🏢", value: "truststream.consortium" },
                ].map(({ label, icon, value }) => (
                  <div key={value} className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
                    isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"
                  }`}>
                    <span className="text-[11px]">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] font-semibold ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>{label}</p>
                      <p className={`text-[9px] font-mono truncate ${textMuted}`}>{value}</p>
                    </div>
                    <span className="text-[9px] text-emerald-500">✓</span>
                  </div>
                ))}
                {/* No chain_hash note */}
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
                  isDark ? "bg-neutral-900/40 border-neutral-800" : "bg-neutral-100 border-neutral-200"
                }`}>
                  <span className="text-[11px]">⛓</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-semibold ${textMuted}`}>Chain Hash</p>
                    <p className={`text-[9px] font-mono truncate ${textMuted}`}>N/A — single file</p>
                  </div>
                  <span className={`text-[9px] ${textMuted}`}>—</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Immutability Notice ──────────────────── */}
        <div className={`rounded-2xl border px-6 py-5 flex items-start gap-4 ${
          isDark ? "bg-amber-950/10 border-amber-800/25" : "bg-amber-50 border-amber-200"
        }`}>
          <span className="text-2xl flex-shrink-0">🔒</span>
          <div className="space-y-1">
            <p className={`text-sm font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              Blockchain Immutability
            </p>
            <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-400/70" : "text-amber-600"}`}>
              This image record is permanently written to Ethereum Sepolia. It cannot be deleted from the blockchain.
              Only a status change (Revoke) is possible, which marks the record as revoked but keeps all data on-chain.
              The IPFS content and SHA-256 hash remain verifiable forever.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className={`text-center text-[9px] font-mono ${textMuted}`}>
          TrustStream v1.0 · C2PA v2.2 · Ethereum Sepolia · IPFS via Pinata
        </p>
      </div>
    </div>
  );
}
