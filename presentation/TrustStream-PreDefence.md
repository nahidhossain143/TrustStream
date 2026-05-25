---
marp: true
theme: default
paginate: true
size: 16:9
header: 'TrustStream — Pre-Defence | AUST CSE'
footer: 'Nadia Supti · Sumaiya Aftab · Md Nahid Hossain'
style: |
  section {
    font-family: 'Segoe UI', 'Inter', sans-serif;
    background: #ffffff;
    color: #0f172a;
  }
  section.lead {
    background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
    color: #f8fafc;
    text-align: center;
  }
  section.lead h1 {
    font-size: 2.4em;
    color: #f8fafc;
    margin-bottom: 0.2em;
  }
  section.lead h2 {
    color: #93c5fd;
    font-weight: 400;
  }
  h1 {
    color: #1e3a8a;
    border-bottom: 3px solid #2563eb;
    padding-bottom: 0.15em;
  }
  h2 { color: #1e40af; }
  h3 { color: #2563eb; }
  table {
    font-size: 0.78em;
    width: 100%;
    border-collapse: collapse;
  }
  th {
    background: #1e3a8a;
    color: white;
    padding: 6px 10px;
  }
  td { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
  code {
    background: #f1f5f9;
    color: #be185d;
    padding: 2px 5px;
    border-radius: 4px;
  }
  pre {
    background: #0f172a !important;
    color: #e2e8f0 !important;
    border-radius: 8px;
    font-size: 0.72em;
    padding: 12px;
  }
  blockquote {
    border-left: 4px solid #2563eb;
    background: #eff6ff;
    padding: 8px 14px;
    color: #1e3a8a;
    font-style: italic;
  }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.2em;
  }
  .badge {
    display: inline-block;
    background: #2563eb;
    color: white;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.75em;
    margin: 2px;
  }
  .pill-green { background:#16a34a; color:white; padding:3px 10px; border-radius:12px; font-size:0.78em; }
  .pill-amber { background:#d97706; color:white; padding:3px 10px; border-radius:12px; font-size:0.78em; }
  .pill-red   { background:#dc2626; color:white; padding:3px 10px; border-radius:12px; font-size:0.78em; }
---

<!-- _class: lead -->
<!-- _paginate: false -->

# TrustStream 📡

## Decentralized Trust and Provenance for C2PA-Compliant Digital News
### (Video + Image)

<br>

**Ahsanullah University of Science and Technology (AUST)**
B.Sc. in Computer Science and Engineering — Pre-Defence

<br>

| Contributors | Student ID |
|---|---|
| Nadia Supti | 20220104002 |
| Sumaiya Aftab | 20220104116 |
| Md Nahid Hossain | 20220104146 |

**March 2026**

---

# Presentation Outline

<div class="columns">

<div>

1. Motivation & Problem
2. Research Gaps
3. Project Overview
4. System Architecture
5. Tech Stack
6. Smart Contract Layer
7. C2PA v2.2 Implementation
8. Video Upload Pipeline
9. Image Upload Pipeline (IPFS-only)

</div>

<div>

10. Verification Flow
11. Sync / Recovery Flow
12. AI-Free Forensics — Video (4 modules)
13. AI-Free Forensics — Image (2 modules)
14. Score Fusion Engine
15. Experimental Results
16. Immutability Guarantees
17. Storage Summary
18. Demo & Q&A

</div>

</div>

---

# 1. Motivation

> **The crisis:** AI-generated media, deepfakes, and platform-level recompression have made *digital news verification* an open problem.

- News consumed online cannot be trusted by metadata alone — files are easily edited, re-encoded, or stripped.
- Centralized fact-checking is **slow** and **single-point-of-failure**.
- AI-based deepfake detectors are **opaque** and **hallucinate**.
- C2PA standard exists but lacks **decentralized trust anchoring**.

**TrustStream goal:** combine **C2PA v2.2 provenance**, **Ethereum blockchain**, **IPFS**, and **AI-free deterministic forensics** into a Facebook-style decentralized news platform — for **both video and image**.

---

# 2. Research Gaps Addressed

| ID | Gap | TrustStream's Answer |
|----|-----|----------------------|
| **G1** | No empirical validation for news-processing workloads | Benchmarkable pipeline (gas + latency tracked end-to-end) |
| **G2** | Centralized trust models incompatible with multi-org consortia | 3-org endorsement on Ethereum Sepolia (NewsAgency → Broadcaster → Auditor) |
| **G3** | Verification latency grows with media volume | Browser-side hashing, parallel IPFS batches, cached HLS, per-segment hash-on-load |
| **G4** | Centralized image storage in news platforms | **IPFS-only image flow** — image bytes AND C2PA sidecar both live as pinned content |
| **G5** | Reliance on AI/ML deepfake detectors that hallucinate | **AI-free** deterministic forensics (JPEG quant + EXIF for image; temporal + AV-sync for video) |

---

# 3. Project Overview

A **full Facebook-style decentralized news platform** with end-to-end authentication for **video and image** media.

<div class="columns">

<div>

### Core Pillars
- **3-org consortium** on Ethereum Sepolia
- **C2PA v2.2** provenance manifests
- **IPFS** via Pinata (content-addressed)
- **SHA-256 chain hashing** for video
- **HLS** segmented streaming
- **AI-free** forensic risk scoring

</div>

<div>

### Key Innovations
- Image flow is **IPFS-only** (zero local persistence)
- Shared `MediaStatus` enum for video + image
- **No `delete*`** function anywhere — only revoke (status flip)
- Auto-exported ABI bundle (single source of truth)
- Sync-from-chain recovers **both** kinds

</div>

</div>

---

# 4. System Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                              TrustStream                                 │
├──────────────┬───────────────────────────┬───────────────────────────────┤
│  Frontend    │         Backend           │     Decentralized Layers      │
│  React 19    │   Node.js + Express 5     │   Ethereum Sepolia Testnet    │
│  Tailwind 3  │   FFmpeg + SHA-256        │   IPFS via Pinata             │
│  hls.js      │   Local manifest catalog  │   TrustStream.sol             │
│  Clerk Auth  │   C2PA service            │   3-Org Consortium            │
│  Dark/Light  │   Video / Image forensics │   C2PA v2.2 Provenance        │
└──────┬───────┴────────────┬──────────────┴───────────────┬───────────────┘
       │                    │                              │
       ▼                    ▼                              ▼
   FB-style feed      Segment Hashes              Immutable Ledger
   Image lightbox     Image SHA-256               3-Org Endorsement
   Video modal        Chain Linking               TX Receipt + Block
   Forensic risk      In-memory C2PA sign         IPFS Content CID
```

> **Catalog cache is rebuildable** — every canonical byte lives on IPFS, every authoritative status on Ethereum.

---

# 5. Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Tailwind CSS 3, Vite 7, hls.js, react-router 7 |
| **Auth** | Clerk (Admin panel only) |
| **Backend** | Node.js, Express 5, multer, axios |
| **Video Processing** | FFmpeg (HLS, 2-second chunks) |
| **Hashing** | SHA-256 (Node crypto + Web Crypto API) + Chain Hash |
| **Provenance** | C2PA v2.2 — 8 video assertions, 7 image assertions, HMAC-SHA256 |
| **Storage** | IPFS via Pinata (segments, image, sidecar, metadata JSON) |
| **Forensics** | AI-free — JPEG quantization, EXIF, temporal coherence, AV sync |
| **Blockchain** | Solidity ^0.8.0, Web3.js 4, Alchemy RPC |
| **Smart Contract** | `TrustStream.sol` (shared `MediaStatus` enum) |
| **Network** | Ethereum Sepolia (chainId `11155111`) |
| **Wallet / Deploy** | MetaMask, Hardhat (auto-exports ABI bundle) |

---

# 6. Smart Contract Layer — 3-Org Consortium

### `TrustStream.sol` — deployed on Sepolia at `0x6a89...2db7`

| Org | Role | Action |
|-----|------|--------|
| **NewsAgency** (Org1) | Submitter | Registers videos, segments, images. **Auto-endorses** on registration. |
| **Broadcaster** (Org2) | Endorser | Endorses registered media. |
| **Auditor** (Org3) | Endorser | Final endorsement and verification. |

### Shared `MediaStatus` enum
- <span class="pill-green">Active</span> — default after registration
- <span class="pill-amber">Revoked</span> — uploader chose to take it down (status flip only)
- <span class="pill-red">Disputed</span> — 2+ tamper reports → auto-flipped by contract

> **Quorum:** `REQUIRED_ENDORSEMENTS = 2` (auto-endorse + 1 of {Broadcaster, Auditor})
> **Tamper threshold:** `TAMPER_THRESHOLD = 2` distinct reporters

---

# 6a. Smart Contract — Function Surface

<div class="columns">

<div>

### Video Functions
- `registerVideo(...)`
- `registerSegment(...)`
- `endorseSegment(...)`
- `verifySegment(...)` *(view)*
- `reportTamper(...)`
- `revokeVideo(videoId)`
- `getVideo / getSegment / getSegmentStatus`

</div>

<div>

### Image Functions
- `registerImage(...)` *(auto-endorses)*
- `endorseImage(imageId)`
- `verifyImage(...)` *(view)*
- `reportImageTamper(imageId)`
- `revokeImage(imageId)`
- `getImage / getImageStatus / getImageCore / getImageContent`

</div>

</div>

### Hardening highlights
- **No `delete*` functions** — only `revoke*` (status flip). Records stay on chain forever.
- **Status guards** on every write path.
- **Tamper logic** uses both per-segment AND video-level counters → closes "spread reports thin" attack.
- **Stack-safe getters** — wide structs split; mappings made `internal` for clean Etherscan / Sourcify verification.

---

# 7. C2PA v2.2 Implementation

### Video Segment — **8 assertions**

| # | Assertion | Purpose |
|---|-----------|---------|
| 1 | `c2pa.hash.data` | SHA-256 hard binding |
| 2 | `c2pa.actions` | Created + Transcoded + Published |
| 3 | `c2pa.claim_generator_info` | TrustStream identity |
| 4 | `stds.schema-org.CreativeWork` | Video metadata |
| 5 | `c2pa.ingredient` | Original MP4 → HLS provenance |
| 6 | `c2pa.timestamp` | RFC 3161 proof of existence |
| 7 | `truststream.consortium` | 3-org + blockchain + IPFS |
| 8 | `truststream.chain_hash` | Sequential chain-hash provenance |

> **Signing:** HMAC-SHA256.
> **Sidecar storage:** `seg_NNN.c2pa` next to `seg_NNN.ts` (offline verification).

---

# 7a. C2PA — Image Variant (7 Assertions)

| # | Assertion | Purpose |
|---|-----------|---------|
| 1 | `c2pa.hash.data` | SHA-256 hard binding |
| 2 | `c2pa.actions` | Created + Published |
| 3 | `c2pa.claim_generator_info` | TrustStream identity |
| 4 | `stds.schema-org.CreativeWork` | Image metadata |
| 5 | `c2pa.ingredient` | Original upload provenance |
| 6 | `c2pa.timestamp` | Proof of existence |
| 7 | `truststream.consortium` | 3-org + blockchain + IPFS |

### Why no `chain_hash`?
Images aren't segmented — there's nothing to chain. The image detail page **explicitly marks it N/A**.

### Sidecar storage (image)
- Pinned to IPFS as `c2paSidecarCid` — **NO local sidecar file**.
- Verification fetches the sidecar **from IPFS by CID** at request time.

---

# 8. Video Upload Pipeline (HLS + Local Cache + IPFS + Chain)

```text
Admin uploads MP4 + optional thumbnail (Clerk authenticated)
  → Thumbnail saved to /public/thumbnails/<videoId>
  → FFmpeg segments MP4 → 2-second .ts chunks
  → SHA-256 hash per segment
  → Chain hash:  SHA-256(currentHash + prevHash)
  → AI-free video forensics (compression, temporal, AV sync, motion)
  → Local manifest written → response sent (video playable IMMEDIATELY)
  → [Background]:
      • Generate C2PA per segment (8 assertions, HMAC-SHA256)
      • Save .c2pa sidecar next to each .ts segment
      • Upload each segment to IPFS (parallel batches)
      • Upload forensic report + metadata JSON
      • registerVideo + registerSegment (NewsAgency, auto-endorse)
      • endorseSegment (Broadcaster) + endorseSegment (Auditor)
      • Capture txHash, blockNumber, gasUsed per segment
```

> Response is sent **immediately** after local manifest write. Blockchain + IPFS run **in the background** for low perceived latency.

---

# 9. Image Upload Pipeline — IPFS-ONLY

```text
Admin uploads JPG / PNG / WebP (Clerk authenticated)
  → Multer saves to public/uploads/  ← TEMP DIR ONLY
  → SHA-256 hash directly from temp file
  → AI-free image forensics
       • JPEG quantization-table parsing  → Compression score
       • EXIF metadata analysis            → Metadata score
       • Risk = 0.60 × Compression + 0.40 × Metadata
  → Local manifest in data/catalog/images/  (cache index, NOT bytes)
  → Response sent immediately
  → [Background]:
       • C2PA image manifest (7 assertions) generated IN-MEMORY (no disk write)
       • Pin image bytes to IPFS                → ipfsCid
       • Pin C2PA sidecar JSON to IPFS          → c2paSidecarCid
       • Pin metadata JSON (sidecar CID + forensics)
       • registerImage (auto-endorse) + endorseImage × 2
       • UNCONDITIONALLY unlink the temp file
```

> **Final state:** image bytes only on IPFS, sidecar only on IPFS, hash anchored on Ethereum, manifest cache reproducible from chain.

---

# 10. Verification Flow

<div class="columns">

<div>

### Video (automatic, per segment)
```text
Browser fetches .ts via hls.js
  → SHA-256 computed locally (Web Crypto)
  → POST /api/upload/verify
  → Backend compares manifest hash
     + verifySegment(...) on-chain
     + .c2pa HMAC signature check
  → { isMatch, blockchain, c2pa,
      txInfo, ipfsCid }

If tampered:
  → Pause video + red overlay
  → POST /api/upload/report-tamper
  → 2 reports → auto-flip to Disputed
```

</div>

<div>

### Image (manual, on detail page)
```text
Browser fetches image from
  IPFS gateway
  → SHA-256 of fetched bytes
  → POST /api/upload/images/verify
  → Backend recomputes + compares
     + verifyImage(...) on-chain
     + Backend FETCHES sidecar
       from IPFS by CID
     + HMAC-verifies in-memory
  → Local + Blockchain + C2PA + IPFS verdict
```

</div>

</div>

> Verification is **multi-layer**: Local hash + Chain hash + C2PA HMAC + IPFS CID match.

---

# 11. Sync / Recovery Flow

```text
New machine / fresh start
  → POST /api/upload/sync-from-blockchain
  → Read all TxLogs from on-chain
  → Group into video IDs and image IDs

  For each video:
     getVideo() + getEndorsements() per segment from chain
     fetchJsonFromIPFS(metadataCid) → segments, hashes, CIDs
     Rebuild data/catalog/<videoId>.json

  For each image:
     getImage() + getImageStatus() from chain
     fetchJsonFromIPFS(metadataCid) → sha256, ipfsCid, c2paSidecarCid
     Rebuild data/catalog/images/<imageId>.json
```

> **Result:** A fresh machine fully recovers the platform — both videos AND images — without ever touching the original uploader.

---

# 12. AI-Free Video Forensics — 4 Modules

### Module 1 — Compression Forensics
FFmpeg/FFprobe measures **per-frame size + bitrate**. Camera-native footage has stable frames; re-encodes show erratic spikes.

### Module 2 — Temporal Consistency
Pixel-level diff and timestamp gaps **between consecutive frames** detect spliced clips and jump cuts.

### Module 3 — AV Sync
Compares **mouth movement** (video frames) vs **audio energy peaks** to compute drift. Real speech: ≈0 ms; dubbed audio: detectable offset.

### Module 4 — Score Fusion Engine
Aggregates above + metadata into a single **Final Risk Score** with verdict bands.

> All checks are **deterministic** — no ML, no hallucinations, no opaque scores.

---

# 13. AI-Free Image Forensics — 2 Modules

<div class="columns">

<div>

### Module 1 — Compression Analysis
**JPEG quantization-table parsing**
- Manipulation often re-saves with non-standard tables.
- Software fingerprint detected from QT signature.

### Module 2 — EXIF Metadata
**Presence, consistency, camera fingerprint**
- Stripped EXIF → suspicious.
- Inconsistent timestamps → suspicious.

</div>

<div>

### Risk Formula
```
risk = 0.60 × Compression
     + 0.40 × Metadata
```

### Verdict Bands

| Score | Verdict |
|-------|---------|
| 0.00 – 0.30 | <span class="pill-green">✅ Authentic</span> |
| 0.31 – 0.60 | <span class="pill-amber">⚠️ Suspicious</span> |
| 0.61 – 1.00 | <span class="pill-red">🚨 Likely Manipulated</span> |

</div>

</div>

---

# 14. Score Fusion Engine — Video

### Final Risk Score Formula

```
FinalRiskScore = (Compression × 0.35)
               + (Metadata    × 0.20)
               + (Temporal    × 0.25)
               + ((1 - AVSync) × 0.20)
```

### Verdict Bands

| Score Range | Status | Meaning |
|-------------|--------|---------|
| 0.00 – 0.30 | <span class="pill-green">✅ Authentic</span> | Original source, untampered |
| 0.31 – 0.60 | <span class="pill-amber">⚠️ Suspicious</span> | Re-encoded / processed (e.g. platform compression) |
| 0.61 – 1.00 | <span class="pill-red">🚨 Likely Manipulated</span> | Frame content or audio significantly altered |

> **Multiplicative effect:** if multiple modules flag anomalies, the score *compounds* — it's hard for a manipulated video to score low by passing only one check.

---

# 15. Experimental Results (April 2026)

Validated in a laboratory environment against three categories of real-world media:

| Test Case | Input | Risk Score | Verdict | Forensic Observations |
|-----------|-------|------------|---------|------------------------|
| Original camera footage | Direct camera capture | **25 %** | <span class="pill-green">✅ Authentic</span> | Frame sizes fully stable; metadata matches expected camera output |
| YouTube music video | Platform-transcoded | **39 %** | <span class="pill-amber">⚠️ Suspicious</span> | Internal transcoding altered natural frame-size variation |
| Re-encoded viral clip | Messenger-compressed | **47 %** | <span class="pill-amber">⚠️ Suspicious</span> | Timestamp discontinuity + metadata stripping → consistent with messenger app re-compression |

### Backend Validation
**52 contract tests passing** — covering organization setup, registration, revocation, metadata CID update, segment registration with C2PA, endorsement, verification, tamper alerts, auto-disputed status, `getFullyEndorsedCount`, TxLogs, and `getVideosByUploader`.

---

# 16. Frontend — Facebook-Style Timeline

<div class="columns">

<div>

### Home Feed
- **Single-column** vertical feed (max-w 3xl)
- Sticky filter pill bar: **All / Video / Image**
- Each card: avatar, "Verified" badge, media-kind pill (🎬 / 🖼), time-ago
- Status pills: ⛓ On-chain, 📋 C2PA, 📌 IPFS, ✓ 3-Org
- Click video → fullscreen modal + auto per-segment hash verify
- Click image → IPFS-served lightbox

</div>

<div>

### Detail Pages
- `/video/:id` — metadata, 3-org grid, IPFS info, **8 C2PA assertions**, per-segment hash table
- `/image/:id` — metadata, **forensic risk**, blockchain, IPFS, **7 C2PA assertions** (`chain_hash` = N/A), immutability notice

### Admin Page
- Tab switcher: Video Upload / Image Upload
- Animated step-by-step pipeline UI
- Optional **video thumbnail** picker (`<video poster>`)

</div>

</div>

---

# 17. Immutability Guarantees — 4 Layers

> **Thesis core promise:** *"Uploaded content cannot be deleted."*

| # | Layer | Guarantee |
|---|-------|-----------|
| 1 | **Smart Contract** | NO `delete*` function. Only `revoke*` (status flip). Records persist forever. Status guards block writes on Revoked / Disputed. |
| 2 | **IPFS** | Content-addressed by definition. CID still resolves on any IPFS node even if Pinata unpins. Hashes anchored on Ethereum allow third-party substitution detection. |
| 3 | **HTTP API** | NO `DELETE` routes. Only mutations are `report-tamper` + on-chain status flips. Admin UI exposes no delete affordance. |
| 4 | **Catalog Service** | `removeManifest()` exists for internal sync hygiene only — NOT exposed via any route. Code comment explicitly warns against exposing it. |

> For images, the **IPFS-only flow** strengthens this further: even the local backend cannot be coerced into a deletion path, because there's no local file to delete after the pipeline completes.

---

# 18. Storage Summary

| Asset | Local | IPFS | Ethereum | Notes |
|-------|:-----:|:----:|:--------:|-------|
| Video original MP4 | ❌ Temp | ❌ | ❌ | Deleted after FFmpeg |
| Video HLS segments | ✅ | ✅ Pinned | hash anchored | Local for fast playback |
| Video `.c2pa` sidecars | ✅ | (in metadata JSON) | hash anchored | Offline verification |
| Video metadata JSON | — | ✅ | cid anchored | Sole sync recovery source |
| Video forensic report | — | ✅ | cid in metadata | — |
| Video thumbnail | ✅ | — | — | Not part of provenance |
| **Image bytes** | ❌ Deleted after pin | ✅ | hash anchored | **IPFS-only** |
| **Image C2PA sidecar** | ❌ Never written | ✅ | hash anchored | **IPFS-only** |
| Image metadata JSON | — | ✅ | cid anchored | Includes sidecar CID + forensics |
| Manifest catalog (cache) | ✅ | — | — | Reproducible from chain |

> Local catalog is **just a cache**. Every byte of canonical content lives on IPFS, every authoritative status on Ethereum.

---

# 19. Blockchain & IPFS Info

<div class="columns">

<div>

### Blockchain
- **Network:** Ethereum Sepolia Testnet
- **Chain ID:** 11155111
- **Contract:** `0x6a895b97872f83ddbDf53c5d773A2619a4B42db7`
- **RPC Provider:** Alchemy
- **Verified On:** Sourcify
- **TX Tracking:** Receipt, block #, gas used per segment / per image
- **Tamper system:** auto `reportTamper()` + Disputed status

</div>

<div>

### IPFS
- **Pinning Service:** Pinata
- **Gateway:** `gateway.pinata.cloud/ipfs`
- **Public Gateway:** `ipfs.io/ipfs`
- **Video content:** `.ts` segments + metadata JSON + forensic report
- **Image content:** image bytes + C2PA sidecar JSON + metadata JSON
- **Video batch upload:** 2 segments / batch, rate-limit aware, auto-retry
- **Image upload:** single-shot + separate sidecar pin

</div>

</div>

---

# 20. Key Contributions Recap

1. **Image flow added end-to-end** — parallel to video, sharing the same blockchain / IPFS / C2PA infrastructure.
2. **Facebook-style timeline** — single-column feed, mixed videos + images, fullscreen modal/lightbox, per-card status pills.
3. **Custom video thumbnails** — admins can upload a poster shown before HLS playback.
4. **IPFS-only image flow** — image bytes AND C2PA sidecar exist *only* on IPFS. Local temp file unconditionally deleted (no env flag, no fallback).
5. **Hardened smart contract** — status guards on all writes, video-level tamper counter, both `Active → Revoked` and `Disputed → Revoked` allowed.
6. **Stack-too-deep fixes** — split getters + `internal` mappings → contract compiles cleanly with AND without `viaIR` (Etherscan / Sourcify just works).
7. **ABI single source of truth** — `deploy.js` auto-exports the bundle to backend AND frontend.
8. **Unified `/feed` + `/sync-from-blockchain`** — both kinds restored from chain on a fresh machine.

---

# 21. Live Demo Walkthrough

> *(Switch to running platform — http://localhost:5173)*

1. **Home feed** — show mixed video/image timeline + filter bar
2. **Admin upload** (Image) — JPG → 6-step pipeline animation → temp file gone
3. **Image detail** — risk score, 2 forensic modules, 7 C2PA assertions, manual `Verify` button
4. **Admin upload** (Video) — MP4 + thumbnail → 7-step pipeline → segments on IPFS
5. **Video detail** — 8 C2PA assertions, per-segment hash table, 3-org grid
6. **Tamper simulation** — modify cached segment → red overlay → on-chain `reportTamper`
7. **Sync recovery** — wipe local catalog → `POST /sync-from-blockchain` → both kinds rebuilt

---

# 22. Future Work

- **Mainnet deployment** — Sepolia → an L2 (Polygon / Arbitrum) for low gas + production scale.
- **Etherscan verification** — currently Sourcify; adding API key for one-click Etherscan verify.
- **Reputation system** — weight Auditor / Broadcaster endorsements by historical accuracy.
- **Batch endorsement** — gas optimization via multi-segment endorse in single tx.
- **Mobile reader app** — React Native client consuming the same `/feed` + `/verify` APIs.
- **Cross-chain anchoring** — periodic Merkle-root commitment to Bitcoin for a higher trust anchor.
- **Image variant of segment-style chain hash** — for animated sequences (GIF / WebP-anim).
- **Independent forensic-tool benchmark** — compare against industry tools (Adobe CAI, Truepic).

---

<!-- _class: lead -->

# Thank You 🙏

## Questions & Discussion

<br>

**TrustStream** — Decentralized Trust and Provenance for C2PA-Compliant Digital News

<br>

| Contributors | ID |
|---|---|
| Nadia Supti | 20220104002 |
| Sumaiya Aftab | 20220104116 |
| Md Nahid Hossain | 20220104146 |

**Ahsanullah University of Science and Technology — March 2026**
