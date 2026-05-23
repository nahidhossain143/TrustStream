# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming

> A research-based, tamper-resistant digital news platform integrating **Ethereum Blockchain (Sepolia Testnet)**, **C2PA v2.2 Provenance Manifests**, **IPFS (Pinata)**, **SHA-256 Chain Hashing**, and **HLS Streaming** to verify the authenticity of every video segment in near real-time.

**Institution:** Ahsanullah University of Science and Technology (AUST)
**Program:** B.Sc. in Computer Science and Engineering
**Date:** March 2026

**Contributors:**

| Name | Student ID |
|------|-----------|
| Nadia Supti | 20220104002 |
| Sumaiya Aftab | 20220104116 |
| Md Nahid Hossain | 20220104146 |

---

## Table of Contents
- [Introduction](#introduction)
- [Research Gaps](#research-gaps)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [How to Run](#how-to-run)
- [How to Use](#how-to-use)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Smart Contract](#smart-contract-overview)
- [C2PA Implementation](#c2pa-implementation)
- [Forensic Analysis Modules](#forensic-analysis-modules)
- [Experimental Results](#experimental-results)
- [Blockchain Info](#blockchain-info)
- [IPFS Info](#ipfs-info)

---

## Introduction

The rapid advancement of Generative AI and deepfakes has made it increasingly difficult to verify the credibility of digital news. While the Coalition for Content Provenance and Authenticity (C2PA) offers cryptographic standards, existing models are often centralized and difficult to validate under real streaming workloads.

**TrustStream** addresses these gaps by:
- Moving away from centralized trust to a **multi-organization consortium** (NewsAgency, Broadcaster, Auditor)
- Integrating **Ethereum Sepolia Testnet** to create an immutable, publicly verifiable record of media provenance
- Implementing **C2PA v2.2 specification** with 8 assertions per segment — including hash binding, actions, ingredient tracking, timestamps, and consortium proof
- Using **SHA-256 chain hashing** to link video segments so tampering with one segment breaks the chain
- Storing generated HLS segments and metadata on **IPFS via Pinata** for decentralized, content-addressed proof storage
- Using a **local manifest catalog** for fast indexing and immediate playback
- Providing **multi-layer verification** (Local manifest + Blockchain + C2PA + IPFS) during playback
- Supporting **MetaMask integration** for public on-chain inspection
- Tracking **transaction receipts, block numbers, gas usage, and wallet balances** per segment
- **Auto tamper detection** — hash mismatch triggers on-chain `reportTamper()` and pauses playback
- **Clerk authentication** for Admin panel access
- **Video Detail page** with full metadata, blockchain, IPFS, C2PA, and segment hash info

---

## Research Gaps

| Gap | Description | How TrustStream Addresses It |
|-----|-------------|------------------------------|
| G1 | Lack of empirical validation for news processing workloads | Benchmarkable pipeline with FFmpeg, manifest indexing, IPFS, and blockchain proof with gas/latency tracking |
| G2 | Centralized trust models incompatible with multi-org consortia | 3-org endorsement system (NewsAgency → Broadcaster → Auditor) on Ethereum Sepolia |
| G3 | Verification latency as media volume increases | Browser-side hashing, background sync, local HLS playback cache, and parallel batch processing |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                TrustStream                                   │
├───────────────┬──────────────────────────┬───────────────────────────────────┤
│   Frontend    │         Backend          │       Decentralized Layers        │
│  React.js     │   Node.js + Express      │  Ethereum Sepolia Testnet         │
│  Tailwind CSS │   FFmpeg + SHA-256       │  IPFS via Pinata                  │
│  hls.js       │   Local manifest catalog │  TrustStream.sol                  │
│  MetaMask     │   C2PA sidecar manifests │  3-Org Consortium                 │
│  Dark/Light   │   Web3.js + Alchemy      │  C2PA v2.2 Provenance             │
│  Clerk Auth   │   JWT Auth (admin)       │  Tamper Alert System              │
└───────┬───────┴──────────┬───────────────┴──────────────┬────────────────────┘
        │                  │                               │
        ▼                  ▼                               ▼
   Video Player      Segment Hashes               Immutable Ledger
   SHA-256 Compute   Chain Linking                3-Org Endorsement
   C2PA Verify       C2PA Sidecar (.c2pa)         TX Receipt + Block
   Tamper Overlay    Catalog JSON                 IPFS Content CID
   MetaMask UI       Report Tamper API            Auto Disputed Status
```

**Upload Flow:**
```text
Admin uploads MP4 (Clerk authenticated)
  → FFmpeg segments into 2s .ts chunks
  → SHA-256 hash per segment
  → Chain hash: SHA-256(currentHash + prevHash)
  → Write local manifest JSON in backend/data/catalog
  → Response sent immediately (video playable right away)
  → [Background]:
       → Generate C2PA manifest per segment (8 assertions, HMAC-SHA256 signed)
       → Save .c2pa sidecar file alongside each .ts segment
       → Upload each segment to IPFS via Pinata
       → Upload video metadata JSON (with C2PA manifests) to IPFS
       → Register on Blockchain — NewsAgency (Sepolia) → capture TX receipt + block
       → Endorse — Broadcaster (Sepolia) → capture TX receipt + gas
       → Endorse — Auditor (Sepolia) → capture TX receipt + gas
       → Store txHash, blockNumber, gasUsed per segment in manifest
```

**Verification Flow:**
```text
Browser downloads segment from local HLS stream
  → Compute SHA-256 locally (Web Crypto API)
  → Compare with manifest-stored hash            ✅/❌
  → Compare with blockchain hash                 ✅/❌
  → Verify C2PA sidecar manifest signature       ✅/❌
  → Show IPFS CID + gateway link if synced
  → Show TX hash + Etherscan links per segment
  → Show endorsement count (3/3 orgs)
  → [If tampered]:
       → Pause video
       → Show red warning overlay
       → Auto call reportTamper() on-chain
       → 2 reports → contract marks Disputed
```

**Sync / Recovery Flow:**
```text
New machine / fresh start
  → Press "Sync from Blockchain" button
  → Fetch all videoIds from blockchain TxLogs
  → For each video: fetch metadataCid from blockchain
  → Fetch full metadata JSON from IPFS (hashes, CIDs, C2PA info)
  → Fetch endorsement counts from blockchain (parallel)
  → Rebuild local manifest catalog
  → Videos restored with full provenance data
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Tailwind CSS, hls.js, Web Crypto API |
| Backend | Node.js, Express.js, multer, axios |
| Auth | Clerk (Admin panel) |
| Theme | Dark / Light mode with ThemeContext |
| Index / Catalog | Local JSON manifest catalog (`backend/data/catalog`) |
| Video Processing | FFmpeg (HLS segmentation, 2s chunks) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) + Chain Hash |
| Provenance Standard | C2PA v2.2 (8 assertions, HMAC-SHA256 signing, sidecar .c2pa) |
| Decentralized Storage | IPFS via Pinata (segment pinning + metadata JSON) |
| Blockchain | Solidity ^0.8.0, Web3.js, Alchemy RPC |
| Smart Contract | TrustStream.sol (3-org endorsement + tamper alert system) |
| Testnet | Ethereum Sepolia |
| Wallet | MetaMask |
| Contract Deploy | Hardhat + Remix-compatible |
| TX Tracking | Receipt, block number, gas usage, Etherscan links |
| Streaming | HLS (HTTP Live Streaming) with local `/streams` playback |
| Testing | Hardhat + Chai (52 unit tests) |

---

## Prerequisites

Make sure all of these are installed before running the project:

| Tool | Version | Download |
|------|---------|----------|
| Node.js | v22 LTS | [nodejs.org](https://nodejs.org) |
| FFmpeg | Latest | [ffmpeg.org/download.html](https://ffmpeg.org/download.html) |
| Git | Latest | [git-scm.com](https://git-scm.com) |
| MetaMask | Latest | [metamask.io](https://metamask.io) |

> FFmpeg must be added to system PATH for video segmentation to work.
>
> MetaMask must be installed and connected to Sepolia Testnet.

---

## How to Run

The project requires **2 terminals** running simultaneously.

### Step 1 — Clone the Repository

```bash
git clone https://github.com/nahidhossain143/TrustStream.git
cd TrustStream
```

### Step 2 — Configure Backend Environment

Create `backend/.env`:

```env
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY=0xyour_newsagency_private_key
BROADCASTER_KEY=0xyour_broadcaster_private_key
AUDITOR_KEY=0xyour_auditor_private_key
NEWSAGENCY_ADDRESS=0xyour_newsagency_wallet_address
BROADCASTER_ADDRESS=0xyour_broadcaster_wallet_address
AUDITOR_ADDRESS=0xyour_auditor_wallet_address
CONTRACT_ADDRESS=0xBFDb80380Bca9Ce10a2d2aA820489831A415c347
PINATA_JWT=your_pinata_jwt
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
AUTH_SECRET=your_auth_secret
```

### Step 3 — Configure Frontend Environment

Create `frontend/.env`:

```env
VITE_CONTRACT_ADDRESS=0xBFDb80380Bca9Ce10a2d2aA820489831A415c347
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:3001
```

### Step 4 — Install Dependencies

```bash
# Backend
cd backend
npm install
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### Step 5 — Run All Services

#### Terminal 1 — Backend

```bash
cd TrustStream/backend
node src/server.js
```

Expected output:

```text
✅ Blockchain contract loaded: 0xBFDb80380Bca9Ce10a2d2aA820489831A415c347
Server running on http://localhost:3001
```

#### Terminal 2 — Frontend

```bash
cd TrustStream/frontend
npm run dev
```

Expected output:

```text
VITE v7.x.x ready in xxx ms
➜ Local: http://localhost:5173/
```

### All Services Running Checklist

| Service | URL | Status |
|---------|-----|--------|
| Backend API | http://localhost:3001 | Terminal 1 |
| Frontend | http://localhost:5173 | Terminal 2 |
| Blockchain | Sepolia Testnet | Always live ✅ |
| IPFS Storage | Pinata | Always live ✅ |
| Local Playback Cache | `backend/public/streams` | Local |
| Local Catalog | `backend/data/catalog` | Local |

### Important Notes

1. Video becomes playable immediately after upload — local HLS files are generated before background sync.
2. C2PA manifests are generated first, then IPFS upload, then blockchain registration.
3. IPFS upload and blockchain endorsement continue in the background — Admin pipeline panel auto-updates.
4. The active index is the local manifest catalog.
5. On a new machine, press **Sync from Blockchain** to restore all videos from Blockchain + IPFS.
6. Admin panel requires Clerk authentication — sign in with your Clerk account.

---

## Optional — Redeploy Smart Contract

```bash
cd network
npx hardhat run scripts/deploy.js --network sepolia
```

Update `CONTRACT_ADDRESS` in `backend/.env` and `VITE_CONTRACT_ADDRESS` in `frontend/.env`, then restart backend.

---

## How to Use

### Upload News Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Sign in with Clerk (admin account)
3. Enter a title and optional description
4. Drag & drop or select an MP4 file
5. Click **Upload & Generate Hashes**
6. Pipeline panel auto-updates — shows real-time C2PA → IPFS → Blockchain status

### Watch & Verify (Home)
1. Go to `http://localhost:5173`
2. Connect MetaMask on Sepolia
3. Select a video from the sidebar
4. Browser auto-verifies each segment:
   - 🧾 Local Hash match
   - ⛓ Blockchain hash + endorsements
   - 📌 IPFS CID
   - 📋 C2PA signature (8 assertions)
5. If tampered: video pauses, red overlay appears, tamper reported on-chain automatically

### View Full Details
1. Click **View Full Details** on any video
2. See complete info: Metadata, Blockchain TX, IPFS CIDs, C2PA assertions, per-segment hashes

### Restore from Blockchain
1. Press **Sync from Blockchain** in the sidebar
2. All videos restored from Blockchain + IPFS

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload video → segment → hash → C2PA → IPFS → blockchain |
| `GET` | `/api/upload/videos` | List all videos |
| `GET` | `/api/upload/videos/:videoId` | Get one manifest summary |
| `GET` | `/api/upload/videos/:videoId/segments` | Get segment hashes, CIDs, C2PA, TX data |
| `GET` | `/api/upload/ipfs/:videoId/:segmentIndex` | Get per-segment IPFS details |
| `GET` | `/api/upload/ipfs-playlist/:videoId` | IPFS-backed playlist |
| `GET` | `/api/upload/c2pa/:videoId/:segmentIndex` | Get C2PA manifest + verify signature |
| `POST` | `/api/upload/verify` | Verify hash (manifest + blockchain + C2PA) |
| `POST` | `/api/upload/report-tamper` | Report tampered segment on-chain |
| `POST` | `/api/upload/sync-from-blockchain` | Restore catalog from Blockchain + IPFS |
| `GET` | `/api/upload/blockchain/video/:videoId` | On-chain video metadata |
| `GET` | `/api/upload/blockchain/endorsements/:videoId/:segmentIndex` | Endorsement list |
| `GET` | `/api/upload/blockchain/txlogs` | Recent transaction logs |
| `GET` | `/api/upload/blockchain/receipt/:txHash` | Full TX receipt |
| `GET` | `/api/upload/blockchain/network-status` | Sepolia network status |
| `GET` | `/api/upload/blockchain/wallet-balances` | 3 org wallet balances |
| `GET` | `/api/upload/blockchain/segment-tx/:videoId/:segmentIndex` | Per-segment TX details |

---

## Project Structure

```text
TrustStream/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── blockchain.js              # Web3 + Contract ABI + Sepolia setup
│   │   ├── services/
│   │   │   ├── blockchain.service.js      # register, endorse, verify, receipt, balance, reportTamper
│   │   │   ├── catalog.service.js         # local manifest read/write/list
│   │   │   ├── c2pa.service.js            # C2PA v2.2 manifest generate, sign, verify
│   │   │   ├── ipfs.service.js            # Pinata upload, gateway, fetch
│   │   │   ├── compression.service.js     # Module 1: Compression forensics (FFmpeg frame size analysis)
│   │   │   ├── temporal.service.js        # Module 2: Temporal consistency (frame-by-frame diff)
│   │   │   ├── avsync.service.js          # Module 3: Audio-video sync drift analysis
│   │   │   └── forensic.service.js        # Module 4: Score fusion engine + forensic report generation
│   │   ├── routes/
│   │   │   └── upload.routes.js           # all API endpoints
│   │   └── server.js                      # Express server entry point
│   ├── data/
│   │   └── catalog/                       # Local manifest JSON files (per video)
│   └── public/
│       ├── uploads/                       # Temporary uploaded files
│       └── streams/                       # Local HLS segments + .c2pa sidecar files
│
├── frontend/
│   └── src/
│       ├── context/
│       │   └── ThemeContext.jsx            # Dark/Light mode global state
│       ├── pages/
│       │   ├── Home.jsx                    # Simple video feed + player
│       │   ├── VideoDetail.jsx             # Full details page (metadata, blockchain, IPFS, C2PA, segments)
│       │   └── Admin.jsx                   # Upload panel + pipeline UI (Clerk protected)
│       ├── components/
│       │   ├── VideoPlayer.jsx             # HLS player + SHA-256 + tamper detection + overlay
│       │   ├── VerificationBadge.jsx       # Verification badge UI (Local + Blockchain + C2PA + IPFS)
│       │   ├── Navbar.jsx                  # Navigation + MetaMask + theme toggle
│       │   └── SyncButton.jsx              # Blockchain + IPFS sync button
│       ├── services/
│       │   ├── api.js                      # Axios API client
│       │   └── wallet.js                   # MetaMask wallet connect service
│       └── utils/
│           └── hash.js                     # Browser SHA-256 (Web Crypto API)
│
├── network/
│   ├── contracts/
│   │   └── TrustStream.sol                # Smart contract (3-org + tamper alert + C2PA fields)
│   ├── test/
│   │   └── TrustStream.test.js            # 52 unit tests (all passing)
│   ├── scripts/
│   │   └── deploy.js                      # Deployment script (Sepolia)
│   ├── deployment.json                    # Contract address + org info
│   └── hardhat.config.js                  # Hardhat + Sepolia + Alchemy config
│
└── README.md
```

---

## Smart Contract Overview

The `TrustStream.sol` contract is deployed on **Ethereum Sepolia Testnet** at `0xBFDb80380Bca9Ce10a2d2aA820489831A415c347` (verified on Blockscout + Sourcify).

| Organization | Role | Action |
|-------------|------|--------|
| NewsAgency (Org1) | Submitter | Registers video + segment hashes + C2PA info |
| Broadcaster (Org2) | Endorser | Endorses registered segments |
| Auditor (Org3) | Endorser | Final endorsement and verification |

**Key features:**
- `VideoStatus` enum: Active / Revoked / Disputed
- `reportTamper()` — auto-flags segment after 2 reports, video becomes Disputed
- `revokeVideo()` — NewsAgency can revoke a video
- C2PA fields: `c2paManifestHash`, `c2paInstanceId` stored per segment
- `getSegment()` + `getSegmentStatus()` — split to avoid stack-too-deep
- 52 unit tests passing

**Minimum endorsements required:** 2/3

---

## C2PA Implementation

TrustStream implements **C2PA Specification v2.2** with 8 assertions per video segment:

| # | Assertion Label | Description |
|---|----------------|-------------|
| 1 | `c2pa.hash.data` | SHA-256 hard binding — tamper detection |
| 2 | `c2pa.actions` | Created + Transcoded (FFmpeg) + Published actions |
| 3 | `c2pa.claim_generator_info` | TrustStream software identity |
| 4 | `stds.schema-org.CreativeWork` | Video metadata (title, creator, date, format) |
| 5 | `c2pa.ingredient` | Original MP4 → HLS segment provenance |
| 6 | `c2pa.timestamp` | Proof of existence (RFC 3161 compatible) |
| 7 | `truststream.consortium` | 3-org endorsement + blockchain + IPFS info |
| 8 | `truststream.chain_hash` | Sequential chain hash provenance |

**Signing:** HMAC-SHA256 with NewsAgency private key
**Sidecar format:** `seg_000.c2pa` alongside `seg_000.ts`
**Video manifest:** Included in IPFS metadata JSON

---

## Forensic Analysis Modules

To strengthen authenticity detection beyond hash-based provenance, four quantitative forensic modules have been added to `backend/src/services/`. These modules analyze video file properties to detect signs of re-encoding, frame splicing, audio replacement, or other manipulation — independently of blockchain or C2PA verification.

```text
backend/src/services/
├── compression.service.js   ← Module 1: Compression forensics
├── temporal.service.js      ← Module 2: Temporal consistency analysis
├── avsync.service.js        ← Module 3: Audio-video sync analysis
└── forensic.service.js      ← Module 4: Score fusion engine & report generation
```

### Module 1 — Compression Forensics (`compression.service.js`)

**What it does:** Uses FFmpeg and FFprobe to precisely measure the frame size (in bytes) and bitrate of every frame in a video.

**How it works:**
- Original camera footage produces stable, consistent frame sizes (e.g. Frame 1: 45KB, Frame 2: 47KB, Frame 3: 44KB).
- Re-encoded or edited video produces erratic, anomalous frame size spikes (e.g. Frame 1: 45KB, Frame 2: 12KB, Frame 3: 89KB).

**Why it works:** A natively encoded video maintains a predictable compression pattern tied to the original codec and camera hardware. Re-encoding or exporting through an editing tool breaks this pattern, leaving a forensically detectable signature.

---

### Module 2 — Temporal Consistency (`temporal.service.js`)

**What it does:** Analyzes pixel-level differences and timestamp gaps between consecutive frames (frame-by-frame) to detect abrupt discontinuities.

**How it works:**
- Normal video: Frame N vs Frame N+1 shows gradual, natural differences consistent with camera motion or object movement.
- Spliced/edited video: Frame 47 vs Frame 48 shows a sudden, mathematically anomalous jump — indicating two separate clips joined together.

**Why it works:** Naturally recorded video scenes transition smoothly. When footage is cut and joined using editing software, the timestamp and frame-level delta exhibits a large "jump cut" or discontinuity that is statistically inconsistent with organic recording.

---

### Module 3 — AV Sync Analysis (`avsync.service.js`)

**What it does:** Compares mouth movement in video frames against audio energy peaks in the audio track, computing a time offset (drift) between them.

**How it works:**
- Real news reporter: Mouth opens → audio responds simultaneously → Time Offset ≈ 0ms (perfect sync).
- Dubbed or replaced audio: Mouth opens → audio arrives 500ms later → Time Offset = −500ms (detectable drift).

**Why it works:** Naturally recorded speech is inherently synchronized with facial expression. AI-generated or dubbed audio replacement cannot perfectly reproduce the original lip-sync timing, creating a measurable AV drift that this module quantifies.

---

### Module 4 — Score Fusion Engine (`forensic.service.js`)

**What it does:** Aggregates scores from the three modules above along with metadata parameters into a single weighted **Final Risk Score**, then maps it to a human-readable authenticity verdict.

**Formula:**

```
FinalRiskScore = (Compression × 0.35) + (Metadata × 0.20) + (Temporal × 0.25) + ((1 - AVSync) × 0.20)
```

**Verdict thresholds:**

| Score Range | Status Label | Meaning |
|-------------|-------------|---------|
| 0.00 – 0.30 | ✅ Authentic | Original source, not tampered. Video is intact and sourced directly from the capture device. |
| 0.31 – 0.60 | ⚠️ Suspicious | Re-encoded or processed. Video has been compressed or handled by a third-party platform. |
| 0.61 – 1.00 | 🚨 Likely Manipulated | Heavy manipulation detected. Frame content or audio has been significantly altered or forged. |

The multiplicative nature of the formula means that if multiple modules independently signal an anomaly, the final risk score compounds — making it harder for manipulated videos to score low by passing only one check.

---

## Experimental Results

The fusion forensic engine was validated in a laboratory environment against three categories of source files. Results recorded for thesis evaluation (April 2026):

| Test Case | Media Input | Risk Score | Verdict | Forensic Observations |
|-----------|-------------|------------|---------|----------------------|
| Original camera footage | Direct camera capture | 25% | ✅ Authentic | Frame sizes fully stable; metadata parameters match expected camera output. |
| YouTube music video | Platform-transcoded | 39% | ⚠️ Suspicious | YouTube's internal transcoding and compression altered natural frame size variation and pattern. |
| Re-encoded viral clip | Social media messenger compressed | 47% | ⚠️ Suspicious | Timestamp discontinuity and metadata stripping detected — consistent with messenger app re-compression. |

---

## Blockchain Info

| Item | Value |
|------|-------|
| Network | Ethereum Sepolia Testnet |
| Chain ID | 11155111 |
| RPC Provider | Alchemy |
| Contract Address | `0xBFDb80380Bca9Ce10a2d2aA820489831A415c347` |
| Verified On | Blockscout + Sourcify |
| Etherscan | https://sepolia.etherscan.io |
| TX Tracking | Receipt, block number, gas used per segment |
| Tamper System | Auto reportTamper() + Disputed status |

---

## IPFS Info

| Item | Value |
|------|-------|
| Pinning Service | Pinata |
| Gateway | [gateway.pinata.cloud/ipfs](https://gateway.pinata.cloud/ipfs) |
| Public Gateway | [ipfs.io/ipfs](https://ipfs.io/ipfs) |
| Content | Video segments (`.ts`) + metadata JSON (with C2PA manifests) |
| Batch Upload | 2 segments per batch (rate-limit aware, auto-retry) |

---

## Storage Summary

| Layer | Location | Persistent | Contents |
|-------|----------|-----------|----------|
| Local uploads | `backend/public/uploads` | ❌ Temp | Original MP4 (deleted after processing) |
| Local HLS cache | `backend/public/streams/<videoId>` | ✅ Local | `.ts` segments + `.c2pa` sidecar files + `playlist.m3u8` |
| Local catalog | `backend/data/catalog/<videoId>.json` | ✅ Local | Full manifest with hashes, CIDs, TX data |
| IPFS (Pinata) | Content-addressed | ✅ Permanent | `.ts` segments + metadata JSON |
| Ethereum Sepolia | Smart contract | ✅ Permanent | Hashes, CIDs, endorsements, TX logs, tamper reports |

---

## Unit Tests

```bash
cd network
npx hardhat test
```

**52 tests passing** — covering organization setup, video registration, revocation, metadata CID update, segment registration with C2PA, endorsement, verification, tamper alerts, auto-disputed status, getFullyEndorsedCount, TxLogs, and getVideosByUploader.
