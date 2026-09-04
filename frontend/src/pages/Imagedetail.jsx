import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { imageAPI } from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";
const FABRIC_CHANNEL = import.meta.env.VITE_FABRIC_CHANNEL_NAME || "mychannel";
const FABRIC_CHAINCODE = import.meta.env.VITE_FABRIC_CHAINCODE_NAME || "truststreamcc";
const FABRIC_MSP_ID = import.meta.env.VITE_FABRIC_MSP_ID || "Org1MSP";
const FABRIC_PEER = import.meta.env.VITE_FABRIC_PEER_HOST_ALIAS || "peer0.org1.example.com";

const buildGatewayUrl = (cid) => (cid ? `${IPFS_GATEWAY}/${cid}` : null);

function SectionHeader({ icon, title, color = "purple", isDark }) {
  const colors = {
    purple: { bg: "bg-purple-500/15", border: "border-purple-500/25", text: "text-purple-400" },
    emerald: { bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "text-emerald-400" },
    violet: { bg: "bg-violet-500/15", border: "border-violet-500/25", text: "text-violet-400" },
    orange: { bg: "bg-orange-500/15", border: "border-orange-500/25", text: "text-orange-400" },
    pink: { bg: "bg-pink-500/15", border: "border-pink-500/25", text: "text-pink-400" },
    blue: { bg: "bg-blue-500/15", border: "border-blue-500/25", text: "text-blue-400" },
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

function InfoRow({ label, value, mono, link, isDark }) {
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const textVal = isDark ? "text-neutral-300" : "text-neutral-700";

  return (
    <div className={`flex gap-3 items-start py-2.5 border-b last:border-0 ${isDark ? "border-white/5" : "border-neutral-100"}`}>
      <span className={`text-[10px] uppercase tracking-widest font-mono w-32 flex-shrink-0 pt-0.5 ${textMuted}`}>
        {label}
      </span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] break-all underline font-mono text-blue-400 hover:text-blue-300"
        >
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

function isFabricReady(image) {
  if (image?.fabricStatus === "ready") return true;
  if (image?.fabricResult && !image.fabricResult.skipped && !image.fabricError) return true;
  return false;
}

function formatFabricStatus(image) {
  if (image?.fabricError) return "degraded";
  if (image?.fabricResult?.skipped) return "skipped";
  if (isFabricReady(image)) return "ready";
  return image?.fabricStatus || "pending";
}

export default function ImageDetail() {
  const { isDark } = useTheme();
  const { imageId } = useParams();
  const navigate = useNavigate();

  const [image, setImage] = useState(null);
  const [c2paData, setC2paData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [fabricCheck, setFabricCheck] = useState(null);
  const [fabricCheckLoading, setFabricCheckLoading] = useState(false);
  const [fabricCheckError, setFabricCheckError] = useState(null);
  const [tamperReporting, setTamperReporting] = useState(false);
  const [clearingDispute, setClearingDispute] = useState(false);
  const [showRawProof, setShowRawProof] = useState(false);

  useEffect(() => {
    if (!imageId) return;

    Promise.all([
      imageAPI.getOne(imageId),
      imageAPI.getC2pa(imageId).catch(() => ({ data: null })),
    ])
      .then(([imgRes, c2paRes]) => {
        setImage(imgRes.data);
        setC2paData(c2paRes.data);
      })
      .catch(() => setError("Image not found"))
      .finally(() => setLoading(false));
  }, [imageId]);

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const cardBg = isDark ? "bg-neutral-900/40 border-white/8" : "bg-white border-neutral-200";
  const text = isDark ? "text-white" : "text-neutral-900";
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
  const disputed = image.fabricResult?.status === "disputed";
  const statusLabel =
    image.status === "revoked"
      ? "Revoked"
      : disputed
      ? "Disputed"
      : "Active";

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

  const checkFabricAuthenticity = () => {
    setFabricCheckLoading(true);
    setFabricCheckError(null);
    setFabricCheck(null);

    imageAPI
      .verifyFabric(imageId)
      .then((res) => setFabricCheck(res.data))
      .catch((err) => setFabricCheckError(err.response?.data?.error || "Check failed"))
      .finally(() => setFabricCheckLoading(false));
  };

  const handleReportTamper = async () => {
    if (!window.confirm("Report this image as tampered? This will be recorded permanently on the Fabric ledger (immutable). 2 of 3 orgs must report before it's marked Disputed.")) {
      return;
    }

    setTamperReporting(true);
    try {
      await imageAPI.reportTamper(imageId);
      const res = await imageAPI.getOne(imageId);
      setImage(res.data);
    } catch (err) {
      alert("Failed: " + (err.response?.data?.error || err.message));
    } finally {
      setTamperReporting(false);
    }
  };

  const handleClearDispute = async () => {
    setClearingDispute(true);
    try {
      await imageAPI.clearDispute(imageId);
      const res = await imageAPI.getOne(imageId);
      setImage(res.data);
    } catch (err) {
      alert("Failed: " + (err.response?.data?.error || err.message));
    } finally {
      setClearingDispute(false);
    }
  };

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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
              <StatusBadge ok={image.c2paSigned} label="C2PA" />
              <StatusBadge ok={image.ipfsStatus === "uploaded"} label="IPFS" />
              <StatusBadge ok={isFabricReady(image)} label="Fabric" />
              {disputed && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 text-red-400 bg-red-950/30 border-red-800/40">
                  ⚠ Disputed
                </span>
              )}

              <Link
                to={`/timeline/image/${imageId}`}
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 ${
                  isDark
                    ? "text-cyan-300 bg-cyan-950/20 border-cyan-800/40 hover:bg-cyan-900/30"
                    : "text-cyan-700 bg-cyan-50 border-cyan-200 hover:bg-cyan-100"
                }`}
              >
                View Audit Trail
              </Link>

              <Link
                to="/fabric-audit"
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 ${
                  isDark
                    ? "text-violet-300 bg-violet-950/20 border-violet-800/40 hover:bg-violet-900/30"
                    : "text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100"
                }`}
              >
                Fabric Audit
              </Link>

              {image.forensicLabel && (
                <StatusBadge
                  ok={image.forensicLabel === "Authentic"}
                  label={`Forensic: ${image.forensicLabel}`}
                />
              )}
            </div>
          </div>
        </div>

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
                    <a href={imgSrc} target="_blank" rel="noreferrer" className="text-purple-400 text-sm hover:underline">
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

            {imgSrc && !imgError && (
              <div className="mt-3 flex justify-end">
                <a href={imgSrc} target="_blank" rel="noreferrer" className="text-[11px] text-purple-400 hover:text-purple-300 font-mono flex items-center gap-1">
                  Open full resolution on IPFS ↗
                </a>
              </div>
            )}
          </div>
        </div>

        {image.forensics && (
          <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
            <div className="px-6 py-5">
              <SectionHeader icon="🔬" title="AI-Free Forensic Analysis" color="pink" isDark={isDark} />

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
                      image.forensics.finalLabel === "Authentic"
                        ? "text-emerald-500"
                        : image.forensics.finalLabel === "Suspicious"
                        ? "text-amber-500"
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

        <div className={`rounded-2xl border p-4 ${cardBg}`}>
          <div className="flex items-center gap-2 flex-wrap">
            {image.metadataCid && (
              <a
                href={buildGatewayUrl(image.metadataCid)}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  isDark ? "bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10" : "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200"
                }`}
              >
                📌 IPFS Metadata ↗
              </a>
            )}

            <button
              onClick={handleVerify}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                isDark ? "bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10" : "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200"
              }`}
            >
              🛡 Verify Hash
            </button>

            {disputed ? (
              <button
                onClick={handleClearDispute}
                disabled={clearingDispute}
                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  clearingDispute
                    ? "opacity-60 cursor-wait"
                    : "text-emerald-500 hover:bg-emerald-500/10 border-transparent hover:border-emerald-500/30"
                }`}
              >
                {clearingDispute ? "Clearing…" : "✓ Clear Dispute (Auditor only)"}
              </button>
            ) : (
              <button
                onClick={handleReportTamper}
                disabled={tamperReporting}
                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  tamperReporting
                    ? "opacity-60 cursor-wait"
                    : "text-red-500 hover:bg-red-500/10 border-transparent hover:border-red-500/30"
                }`}
                title="Permanent Fabric ledger tamper record"
              >
                {tamperReporting ? "Reporting…" : "⚠ Report Tamper"}
              </button>
            )}
          </div>

          <p className={`text-[10px] font-mono mt-3 ${textMuted}`}>
            Note: tamper reports are permanent on the Fabric ledger. 2 distinct orgs must report before status flips to "Disputed".
          </p>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📄" title="Image Metadata" color="blue" isDark={isDark} />
            <InfoRow label="Image ID" value={image.imageId} mono isDark={isDark} />
            <InfoRow label="Title" value={image.title} isDark={isDark} />
            <InfoRow label="Description" value={image.description} isDark={isDark} />
            <InfoRow label="MIME Type" value={image.mimeType} isDark={isDark} />
            <InfoRow label="Filename" value={image.filename} mono isDark={isDark} />
            <InfoRow label="Created At" value={new Date(image.createdAt).toLocaleString()} isDark={isDark} />
            <InfoRow label="Uploader" value={image.uploader || "NewsAgency"} isDark={isDark} />
            <InfoRow label="Status" value={statusLabel} isDark={isDark} />
            <InfoRow label="SHA-256" value={image.sha256Hash} mono isDark={isDark} />
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="🏛" title="Hyperledger Fabric Proof" color="violet" isDark={isDark} />
            <InfoRow label="Status" value={formatFabricStatus(image)} isDark={isDark} />
            <InfoRow label="Network" value="Fabric test-network" isDark={isDark} />
            <InfoRow label="Channel" value={FABRIC_CHANNEL} mono isDark={isDark} />
            <InfoRow label="Chaincode" value={FABRIC_CHAINCODE} mono isDark={isDark} />
            <InfoRow label="Peer" value={FABRIC_PEER} mono isDark={isDark} />
            <InfoRow label="MSP" value={FABRIC_MSP_ID} mono isDark={isDark} />
            <InfoRow label="Ledger Record" value={isFabricReady(image) ? "saved" : null} isDark={isDark} />
            <InfoRow label="Media Type" value={image.fabricResult?.mediaType || "image"} isDark={isDark} />
            <InfoRow label="Media ID" value={image.fabricResult?.mediaId || image.imageId} mono isDark={isDark} />
            <InfoRow label="Created By" value={image.fabricResult?.createdBy || null} mono isDark={isDark} />
            <InfoRow
              label="Created At"
              value={image.fabricResult?.createdAt ? new Date(image.fabricResult.createdAt).toLocaleString() : null}
              isDark={isDark}
            />
            <InfoRow
              label="Updated At"
              value={image.fabricResult?.updatedAt ? new Date(image.fabricResult.updatedAt).toLocaleString() : null}
              isDark={isDark}
            />
            <InfoRow label="Image Hash" value={image.fabricResult?.sha256Hash || image.sha256Hash} mono isDark={isDark} />
            <InfoRow label="IPFS CID" value={image.fabricResult?.ipfsCid || image.ipfsCid} mono isDark={isDark} />
            <InfoRow label="Metadata CID" value={image.fabricResult?.metadataCid || image.metadataCid} mono isDark={isDark} />
            <InfoRow label="C2PA Hash" value={image.fabricResult?.c2paHash || image.c2paManifestHash} mono isDark={isDark} />
            <InfoRow label="Error" value={image.fabricError || null} isDark={isDark} />

            <div className={`pt-3 mt-1 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>
                Fabric Consortium Endorsements
              </p>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "NewsAgency", role: "Submitter", icon: "🏢", color: "text-emerald-400" },
                  { name: "Broadcaster", role: "Endorser", icon: "📡", color: "text-blue-400" },
                  { name: "Auditor", role: "Endorser", icon: "🔍", color: "text-violet-400" },
                ].map(({ name, role, icon, color }) => {
                  const endorsed = Boolean(image.fabricResult?.endorsements?.[name]);
                  const endorsingPeer = image.fabricResult?.endorsingPeers?.[name];

                  return (
                    <div
                      key={name}
                      className={`rounded-xl p-3 border text-center ${
                        endorsed
                          ? isDark
                            ? "bg-emerald-950/20 border-emerald-800/40"
                            : "bg-emerald-50 border-emerald-200"
                          : isDark
                          ? "bg-neutral-800/40 border-neutral-700"
                          : "bg-neutral-50 border-neutral-200"
                      }`}
                    >
                      <div className="text-xl mb-1">{icon}</div>
                      <p className={`text-[11px] font-semibold ${color}`}>{name}</p>
                      <p className={`text-[9px] ${textMuted}`}>{role}</p>
                      <p className={`text-[9px] mt-1 font-mono ${endorsed ? "text-emerald-400" : textMuted}`}>
                        {endorsed ? "✓ Endorsed" : "— Pending"}
                      </p>
                      {endorsingPeer && (
                        <p className={`text-[8px] mt-0.5 font-mono truncate ${textMuted}`} title={endorsingPeer}>
                          via {endorsingPeer.split(".")[0]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`pt-3 mt-3 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>
                Tamper Reports &amp; Dispute
              </p>

              {disputed ? (
                <div className={`rounded-xl p-4 border ${isDark ? "bg-red-950/20 border-red-800/40" : "bg-red-50 border-red-200"}`}>
                  <p className="text-sm font-bold text-red-400">
                    ⚠ Disputed — 2 of 3 orgs reported possible tampering
                  </p>
                  <p className={`text-[10px] font-mono mt-1 ${textMuted}`}>
                    Reporting orgs: {Object.keys(image.fabricResult?.tamperReports || {}).join(", ") || "—"}
                  </p>
                </div>
              ) : (
                <p className={`text-[11px] ${textMuted}`}>
                  No active dispute. Use "Report Tamper" above if this content looks manipulated.
                </p>
              )}
            </div>

            <div className={`pt-3 mt-3 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>
                Check Authenticity
              </p>

              <button
                onClick={checkFabricAuthenticity}
                disabled={fabricCheckLoading}
                className={`w-full rounded-xl py-2.5 text-xs font-semibold border transition-colors ${
                  fabricCheckLoading
                    ? "opacity-60 cursor-wait"
                    : isDark
                    ? "bg-violet-950/30 border-violet-800/40 text-violet-300 hover:bg-violet-950/50"
                    : "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100"
                }`}
              >
                {fabricCheckLoading
                  ? "Re-fetching from IPFS and checking ledger…"
                  : "🔎 Check Authenticity"}
              </button>

              {fabricCheckError && (
                <p className="text-[11px] text-red-400 mt-2 font-mono">{fabricCheckError}</p>
              )}

              {fabricCheck && (
                <div
                  className={`mt-3 rounded-xl p-4 border ${
                    fabricCheck.authentic
                      ? isDark
                        ? "bg-emerald-950/20 border-emerald-800/40"
                        : "bg-emerald-50 border-emerald-200"
                      : isDark
                      ? "bg-red-950/20 border-red-800/40"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <p
                    className={`text-sm font-bold ${
                      fabricCheck.authentic ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {fabricCheck.authentic ? "✓ Authentic — matches the ledger" : "✗ Does not match the ledger"}
                  </p>
                  <div className={`mt-2 space-y-1 text-[10px] font-mono ${textMuted}`}>
                    <p>IPFS copy intact: {fabricCheck.fileIntact ? "yes" : "no — content changed"}</p>
                    <p>
                      Fabric record valid:{" "}
                      {fabricCheck.fabric?.available
                        ? fabricCheck.fabric.valid
                          ? "yes"
                          : "no — hash mismatch"
                        : `unavailable (${fabricCheck.fabric?.reason || "unknown"})`}
                    </p>
                    <p className="break-all">Current hash: {fabricCheck.currentHash}</p>
                    <p className="break-all">Registered hash: {fabricCheck.registeredHash}</p>
                  </div>
                </div>
              )}
            </div>

            {image.fabricResult && (
              <div className={`pt-3 mt-3 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
                <button
                  onClick={() => setShowRawProof((v) => !v)}
                  className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border transition-colors ${
                    isDark ? "border-white/10 text-neutral-400 hover:border-white/20" : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                  }`}
                >
                  {showRawProof ? "▾ Hide raw ledger JSON" : "▸ View raw ledger JSON"}
                </button>

                {showRawProof && (
                  <pre className={`mt-2 rounded-xl p-3 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all ${
                    isDark ? "bg-neutral-950 border border-white/8 text-neutral-300" : "bg-neutral-50 border border-neutral-200 text-neutral-700"
                  }`}>
                    {JSON.stringify(image.fabricResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📌" title="IPFS Storage" color="orange" isDark={isDark} />
            <InfoRow label="Provider" value="Pinata" isDark={isDark} />
            <InfoRow label="Status" value={image.ipfsStatus} isDark={isDark} />
            <InfoRow label="Image CID" value={image.ipfsCid} mono link={buildGatewayUrl(image.ipfsCid)} isDark={isDark} />
            <InfoRow label="Metadata CID" value={image.metadataCid} mono link={buildGatewayUrl(image.metadataCid)} isDark={isDark} />
            <InfoRow label="Content" value="Image file + metadata JSON" isDark={isDark} />
            <InfoRow label="Public GW" value={buildGatewayUrl(image.ipfsCid)} mono link={buildGatewayUrl(image.ipfsCid)} isDark={isDark} />
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="▪" title="C2PA Provenance" color="violet" isDark={isDark} />
            <InfoRow label="Spec Version" value="C2PA v2.2" isDark={isDark} />
            <InfoRow label="Status" value={image.c2paStatus} isDark={isDark} />
            <InfoRow label="Assertions" value="Actions + Creative Work + Consortium (+ auto hash-binding)" isDark={isDark} />
            <InfoRow label="Algorithm" value="ES256 (P-256 ECDSA, X.509 cert chain)" isDark={isDark} />
            <InfoRow label="Signer" value="TrustStream C2PA Signer" isDark={isDark} />
            <InfoRow label="Format" value="Embedded in image bytes (real C2PA JUMBF)" isDark={isDark} />
            <InfoRow label="Instance ID" value={image.c2paInstanceId || c2paData?.c2paInstanceId} mono isDark={isDark} />
            <InfoRow label="Manifest Hash" value={image.c2paManifestHash || c2paData?.c2paManifestHash} mono isDark={isDark} />
            <InfoRow label="Signed At" value={image.c2paSignedAt ? new Date(image.c2paSignedAt).toLocaleString() : null} isDark={isDark} />

            {c2paData?.verification && (
              <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
                <p className={`text-[10px] uppercase tracking-widest font-mono mb-2 ${textMuted}`}>
                  Signature Verification {c2paData.verification.validation_state ? `(${c2paData.verification.validation_state})` : ""}
                </p>
                <div className={`rounded-lg px-3 py-2.5 border text-[11px] font-mono ${
                  c2paData.verification.valid
                    ? isDark ? "bg-emerald-950/20 border-emerald-800/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : isDark ? "bg-red-950/20 border-red-800/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"
                }`}>
                  {c2paData.verification.valid
                    ? "✓ Signature + hash-binding valid — manifest not tampered"
                    : `✗ ${c2paData.verification.error || "Signature invalid"}`}
                </div>
              </div>
            )}

            <div className={`pt-3 mt-1 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>Assertions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Hash Binding", icon: "🔒", value: "c2pa.hash.data" },
                  { label: "Actions", icon: "⚡", value: "c2pa.actions" },
                  { label: "Creative Work", icon: "🖼️", value: "schema-org.ImageObject" },
                  { label: "Consortium", icon: "🏢", value: "truststream.consortium" },
                ].map(({ label, icon, value }) => (
                  <div
                    key={value}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
                      isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"
                    }`}
                  >
                    <span className="text-[11px]">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] font-semibold ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>{label}</p>
                      <p className={`text-[9px] font-mono truncate ${textMuted}`}>{value}</p>
                    </div>
                    <span className="text-[9px] text-emerald-500">✓</span>
                  </div>
                ))}

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

        <div className={`rounded-2xl border px-6 py-5 flex items-start gap-4 ${
          isDark ? "bg-amber-950/10 border-amber-800/25" : "bg-amber-50 border-amber-200"
        }`}>
          <span className="text-2xl flex-shrink-0">🔒</span>
          <div className="space-y-1">
            <p className={`text-sm font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              Ledger Immutability
            </p>
            <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-400/70" : "text-amber-600"}`}>
              This image record is permanently written to the Hyperledger Fabric ledger. It cannot be deleted.
              Only a status change (Revoke, or Disputed via tamper reports) is possible, which keeps all data on the ledger.
              The IPFS content and SHA-256 hash remain verifiable forever.
            </p>
          </div>
        </div>

        <p className={`text-center text-[9px] font-mono ${textMuted}`}>
          TrustStream v1.0 · C2PA v2.2 · Hyperledger Fabric · IPFS via Pinata
        </p>
      </div>
    </div>
  );
}