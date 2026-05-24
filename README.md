# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Digital News (Video + Image)

> A research-based, tamper-resistant, **Facebook-style decentralized news platform** integrating **Ethereum Sepolia Testnet**, **C2PA v2.2 Provenance Manifests**, **IPFS via Pinata**, **SHA-256 Chain Hashing**, **HLS Streaming**, and **AI-free forensic analysis** to verify the authenticity of every video segment AND every news image in near real-time.

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
- [Project Overview](#project-overview)
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
- [Forensics (AI-Free)](#forensics-ai-free)
- [Blockchain Info](#blockchain-info)
- [IPFS Info](#ipfs-info)
- [Storage Summary](#storage-summary)
- [Immutability Guarantees](#immutability-guarantees)
- [What's New](#whats-new)

---

## Project Overview

TrustStream has evolved into a **full Facebook-style decentralized news platform** with end-to-end authentication pipelines for **both video and image** media. The original thesis core — video authentication via a 3-organization consortium + AI-free forensics + C2PA + IPFS + blockchain — is fully intact, with the image flow added as a clean parallel that reuses the same infrastructure with adapted modules.

### Smart Contract Layer

The original `TrustStream.sol` has been extended with a complete image entity:

- `registerImage`, `endorseImage`, `reportImageTamper`, `revokeImage`, `verifyImage`, `getImage`, `getImageEndorsements`, `getImageStatus`
- Same 3-organization consortium model as the video flow (NewsAgency uploads, Broadcaster + Auditor endorse)
- A shared `MediaStatus` enum manages both videos and images
- Deployed to Sepolia Testnet at `0x6a895b97872f83ddbDf53c5d773A2619a4B42db7`, verified on Sourcify (Etherscan verification ready, pending API key)
- **No `delete*` function anywhere — only `revoke*` (status flip)**, naturally enforcing the thesis core promise: *"uploaded content cannot be deleted"*

### Backend

All services upgraded to handle the image flow:

- `blockchain.service.js` — provides image methods (`registerAndEndorseImage`, `getImageFromChain`, `endorseImageOnChain`, `reportImageTamperOnChain`, `revokeImageOnChain`, `getImageEndorsementsFromChain`, `getImageIdsFromChain`)
- `c2pa.service.js` — generates an image-variant manifest with **7 assertions** (no `chain_hash`, since images aren't segmented). Image manifests are signed in-memory and pinned to IPFS — no local sidecar file
- `ipfs.service.js` — DRY refactor with `uploadImageToIPFS`, `uploadImageMetadataToIPFS`, and `uploadImageC2paToIPFS` for sidecar pinning
- `catalog.service.js` — added a `kind: "video" | "image"` discriminator with backward-compat default for legacy manifests
- `config/blockchain.js` — loads from the auto-exported ABI bundle (single source of truth — `deploy.js` writes to both backend and frontend automatically, no manual sync)
- **NEW** `image-forensics.service.js` — AI-free image risk scoring via JPEG quantization table parsing + EXIF metadata analysis. Formula: `risk = 0.60 × Compression + 0.40 × Metadata`, with the same Authentic / Suspicious / Likely Manipulated bands used by the video forensics module

### Image Upload Pipeline

`POST /api/upload/image` exposes the complete pipeline:

```
multer (temp uploads/) → SHA-256 → image forensics → C2PA (in-memory) →
  IPFS pin (image bytes) → IPFS pin (C2PA sidecar JSON) → IPFS pin (metadata JSON) →
  blockchain register + 2 endorsements → unconditional temp-file cleanup
```

The flow is **fully IPFS-only** — image bytes and the C2PA sidecar both live as content-addressed IPFS pins. The temporary local file is unconditionally deleted after the pipeline completes; no env flag, no fallback. The local catalog stores only manifest metadata (sha256, CIDs, status), which is reproducible from on-chain TxLogs at any time.

### Unified Feed + Cross-Kind Sync

- `GET /api/upload/feed` — unified endpoint that merges videos and images, sorted newest-first, drives the timeline
- `POST /api/upload/sync-from-blockchain` — recovers BOTH media kinds from on-chain TxLogs and IPFS metadata; videos and images both rebuild from chain on a fresh machine

### Frontend (Facebook-Style Timeline)

The Home page is now a centered single-column vertical feed (max-width 3xl). Each post is a fully self-contained card:

- Avatar, organization badge ("Verified"), media-kind pill (🎬 VIDEO / 🖼 IMAGE), time-ago
- Inline media — video posters with custom thumbnails, images shown at natural ratio
- Status pills: ⛓ On-chain, 📋 C2PA, 📌 IPFS, ✓ 3-Org
- Click-to-play video opens a fullscreen modal with HLS playback + auto per-segment hash verification + tamper overlay
- Click-to-zoom image opens a fullscreen lightbox served directly from the IPFS gateway
- "View Details" link on each card jumps to `/video/:id` or `/image/:id`

A sticky filter pill bar at the top toggles between **All / Video / Image**.

The `VideoDetail.jsx` page renders metadata, blockchain (3-org grid), IPFS info, C2PA details (8 assertions), and per-segment hash table. The parallel `Imagedetail.jsx` page follows the same structure with image-specific 7 assertions (`chain_hash` explicitly noted as N/A), a Forensic Analysis section showing the risk score and the two modules with notes, and a dedicated immutability notice that strengthens the thesis story line.

The Admin page uses a tab switcher to separate Video Upload from Image Upload, each rendering an animated step-by-step pipeline visualization:
- **Image:** 6 steps — Upload → Hash → Forensic → C2PA → IPFS → Blockchain
- **Video:** 7 steps — Upload → FFmpeg → Hash → Forensic → C2PA → IPFS → Blockchain

The Video Upload form also accepts an optional **thumbnail image**, which becomes the `<video poster>` shown before HLS playback.

All components are fully theme-aware (dark + light), `api.js` provides complete coverage for both flows (`videoAPI`, `imageAPI`, `feedAPI`, `syncAPI`), and `App.jsx` includes the `/image/:imageId` route alongside the existing video route.

### Net Result

- Contract layer extended and deployed
- Backend services all image-aware with the new forensics module
- Frontend transformed to a Facebook timeline aesthetic with proper detail pages for both kinds
- **Immutability preserved at all four layers** (see [Immutability Guarantees](#immutability-guarantees) below)
- Full end-to-end test passed: image upload → forensic → C2PA → IPFS → blockchain → on-chain registration → sync recovery
- **Demo ready.**

---

## Research Gaps

| Gap | Description | How TrustStream Addresses It |
|-----|-------------|------------------------------|
| G1 | Lack of empirical validation for news processing workloads | Benchmarkable pipeline with FFmpeg, manifest indexing, IPFS, blockchain proof, and forensic risk scoring (gas + latency tracked end-to-end) |
| G2 | Centralized trust models incompatible with multi-org consortia | 3-org endorsement (NewsAgency → Broadcaster → Auditor) on Ethereum Sepolia, shared by video and image flows |
| G3 | Verification latency as media volume increases | Browser-side hashing, background sync, parallel batch IPFS, cached HLS playback, per-segment hash-on-load verification |
| G4 | Centralized image storage in news platforms | IPFS-only image flow — image bytes AND the C2PA sidecar both live as pinned content; no local copy after pipeline completes |
| G5 | Reliance on AI / ML deepfake detectors that hallucinate | AI-free forensic module — JPEG quantization tables + EXIF for images, temporal + AV-sync analysis for video, all deterministic |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                TrustStream                                   │
├───────────────┬──────────────────────────┬───────────────────────────────────┤
│   Frontend    │         Backend          │       Decentralized Layers        │
│  React 19     │   Node.js + Express 5    │  Ethereum Sepolia Testnet         │
│  Tailwind 3   │   FFmpeg + SHA-256       │  IPFS via Pinata                  │
│  hls.js       │   Local manifest catalog │  TrustStream.sol (video + image)  │
│  React Router │   C2PA service           │  3-Org Consortium (shared enum)   │
│  Dark/Light   │   Video / Image forensics│  C2PA v2.2 Provenance             │
│  Clerk Auth   │   Web3.js 4 + Alchemy    │  Immutable status flip system     │
└───────┬───────┴──────────┬───────────────┴──────────────┬────────────────────┘
        │                  │                               │
        ▼                  ▼                               ▼
   FB-style feed     Segment Hashes               Immutable Ledger
   Image lightbox    Image SHA-256                3-Org Endorsement
   Video modal       Chain Linking                TX Receipt + Block
   Per-card poster   In-memory C2PA sign          IPFS Content CID
   Forensic risk     Catalog cache (rebuildable)  Tamper / Disputed Status
```

### Video Upload Flow (HLS + local cache + IPFS + chain)

```text
Admin uploads MP4 + (optional) thumbnail image (Clerk authenticated)
  → Thumbnail saved to /public/thumbnails/<videoId>.<ext> (served via /thumbnails/*)
  → FFmpeg segments MP4 into 2s .ts chunks
  → SHA-256 hash per segment
  → Chain hash: SHA-256(currentHash + prevHash)
  → AI-free video forensics (compression, temporal, AV sync, motion)
  → Write local manifest JSON in backend/data/catalog
  → Response sent immediately (video playable right away)
  → [Background]:
       → Generate C2PA manifest per segment (8 assertions, HMAC-SHA256 signed)
       → Save .c2pa sidecar file alongside each .ts segment (offline verify)
       → Upload each segment to IPFS via Pinata (parallel batches)
       → Upload forensic report JSON to IPFS
       → Upload video metadata JSON (with C2PA + forensics) to IPFS
       → Register on blockchain - NewsAgency (Sepolia) - capture TX receipt + block
       → Endorse - Broadcaster (Sepolia) - capture TX receipt + gas
       → Endorse - Auditor (Sepolia) - capture TX receipt + gas
       → Store txHash, blockNumber, gasUsed per segment in manifest
```

### Image Upload Flow (IPFS-ONLY, zero local persistence)

```text
Admin uploads JPG / PNG / WebP (Clerk authenticated)
  → Multer saves to public/uploads/ TEMP DIR ONLY
  → SHA-256 hash directly from temp file
  → AI-free image forensics
       → JPEG quantization-table parsing (compression score)
       → EXIF metadata analysis (metadata score)
       → Risk = 0.60 × Compression + 0.40 × Metadata
       → Bands: Authentic / Suspicious / Likely Manipulated
  → Write local manifest in data/catalog/images/ (cache index, NOT canonical bytes)
  → Response sent immediately
  → [Background]:
       → Generate C2PA image manifest (7 assertions) IN-MEMORY (no disk write)
       → Pin image bytes to IPFS                   → ipfsCid
       → Pin C2PA sidecar JSON to IPFS             → c2paSidecarCid
       → Pin metadata JSON to IPFS (includes sidecar CID + forensics)
       → registerImage on blockchain (NewsAgency auto-endorses)
       → endorseImage from Broadcaster + Auditor
       → UNCONDITIONALLY unlink the temp file
  → Final state: image bytes only on IPFS, sidecar only on IPFS,
    hash anchored on Ethereum, manifest cache reproducible from chain
```

### Verification Flow

```text
Video (during HLS playback - automatic, per segment):
  Browser downloads .ts segment via hls.js
    → Compute SHA-256 locally (Web Crypto API)
    → POST /api/upload/verify with { videoId, segmentIndex, clientHash }
    → Backend compares manifest.sha256Hash + calls verifySegment(...) on-chain
    → Verify .c2pa sidecar HMAC signature
    → Returns { isMatch, blockchain, c2pa, txInfo, ipfsCid }
    → [If tampered]:
         → Pause video, show red overlay
         → POST /api/upload/report-tamper - contract reportTamper()
         → 2 reports - contract auto-flips video status to Disputed

Image (manual verify on detail page):
  Browser fetches image from IPFS gateway
    → Compute SHA-256 of fetched bytes
    → POST /api/upload/images/verify with { imageId, clientHash }
    → Backend compares manifest.sha256Hash + calls verifyImage(...) on-chain
    → Backend FETCHES the C2PA sidecar from IPFS by c2paSidecarCid (no local file)
    → Verify the sidecar HMAC signature in-memory
    → Returns full multi-layer verification result
```

### Sync / Recovery Flow

```text
New machine / fresh start
  → POST /api/upload/sync-from-blockchain
  → Read all TxLogs from on-chain
  → Group into video IDs and image IDs
  → For each video:
       → getVideo() + getEndorsements() per segment from chain
       → fetchJsonFromIPFS(metadataCid) for full segment list, hashes, CIDs
       → Rebuild local manifest in data/catalog/<videoId>.json
  → For each image:
       → getImage() + getImageStatus() from chain
       → fetchJsonFromIPFS(metadataCid) for sha256, ipfsCid, c2paSidecarCid
       → Rebuild local manifest in data/catalog/images/<imageId>.json
  → Both kinds restored without ever touching the original uploader machine
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS 3, Vite 7, hls.js, react-router 7 |
| Auth | Clerk (Admin panel only) |
| Theme | Dark / Light mode via ThemeContext |
| Backend | Node.js, Express 5, multer (single + fields), axios |
| Index / Catalog | Local JSON manifest catalog (videos + images) |
| Video Processing | FFmpeg (HLS segmentation, 2s chunks) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) + Chain Hash |
| Provenance Standard | C2PA v2.2 (8 video assertions, 7 image assertions, HMAC-SHA256) |
| Decentralized Storage | IPFS via Pinata (segments + image + C2PA sidecar + metadata JSON) |
| Forensics | AI-free — JPEG quantization, EXIF, temporal coherence, AV sync |
| Blockchain | Solidity ^0.8.0, Web3.js 4, Alchemy RPC |
| Smart Contract | TrustStream.sol (video + image, shared MediaStatus) |
| Testnet | Ethereum Sepolia (chainId 11155111) |
| Wallet | MetaMask |
| Contract Deploy | Hardhat (single source of truth — auto-exports ABI bundle) |
| TX Tracking | Receipt, block number, gas usage, Etherscan links |
| Streaming | HLS (HTTP Live Streaming) |

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | v22 LTS | [nodejs.org](https://nodejs.org) |
| FFmpeg | Latest (must be on PATH) | [ffmpeg.org/download.html](https://ffmpeg.org/download.html) |
| Git | Latest | [git-scm.com](https://git-scm.com) |
| MetaMask | Latest | [metamask.io](https://metamask.io) |

> FFmpeg must be on system PATH for video segmentation.
>
> MetaMask must be connected to Sepolia Testnet for on-chain reads/writes from the browser.

---

## How to Run

The project requires **2 terminals** running simultaneously.

### Step 1 — Clone

```bash
git clone https://github.com/nahidhossain143/TrustStream.git
cd TrustStream
```

### Step 2 — Configure Backend

Create `backend/.env`:

```env
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY=0xyour_newsagency_private_key
BROADCASTER_KEY=0xyour_broadcaster_private_key
AUDITOR_KEY=0xyour_auditor_private_key
NEWSAGENCY_ADDRESS=0xyour_newsagency_wallet_address
BROADCASTER_ADDRESS=0xyour_broadcaster_wallet_address
AUDITOR_ADDRESS=0xyour_auditor_wallet_address
PINATA_JWT=your_pinata_jwt
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
```

> **Note on `CONTRACT_ADDRESS`:** the backend reads the contract address from the auto-exported ABI bundle (`backend/src/config/TrustStream.abi.json`). You do NOT need to set `CONTRACT_ADDRESS` manually. If it is set and disagrees with the bundle, the bundle wins and a warning is logged.

### Step 3 — Configure Frontend

Create `frontend/.env`:

```env
VITE_CONTRACT_ADDRESS=0x6a895b97872f83ddbDf53c5d773A2619a4B42db7
VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:3001
VITE_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
```

### Step 4 — Install Dependencies

```bash
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
cd network  && npm install && cd ..
```

### Step 5 — Run

#### Terminal 1 — Backend

```bash
cd TrustStream/backend
node src/server.js
```

Expected output:

```text
[blockchain] Contract loaded: 0x6a895b97872f83ddbDf53c5d773A2619a4B42db7
[blockchain] Network: sepolia (chainId: 11155111)
[blockchain] Org accounts:
             NewsAgency:  0x...
             Broadcaster: 0x...
             Auditor:     0x...
Server running on port 3001
```

#### Terminal 2 — Frontend

```bash
cd TrustStream/frontend
npm run dev
```

Expected output:

```text
VITE v7.x.x ready in xxx ms
➜ Local: http://localhost:5173/   (or 5174 if 5173 busy)
```

### Running Services Checklist

| Service | URL | Status |
|---------|-----|--------|
| Backend API | http://localhost:3001 | Terminal 1 |
| Frontend | http://localhost:5173 (or 5174) | Terminal 2 |
| Blockchain | Sepolia Testnet | Always live |
| IPFS Storage | Pinata | Always live |
| Local HLS cache (videos) | `backend/public/streams` | Local |
| Local thumbnails | `backend/public/thumbnails` | Local |
| Local manifest catalog | `backend/data/catalog` | Local |

---

## Optional — Redeploy Smart Contract

Single source of truth — `deploy.js` auto-exports the ABI bundle to both backend and frontend.

```bash
cd network
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

After deploy:
- `backend/src/config/TrustStream.abi.json` — auto-updated (used by backend)
- `frontend/src/services/TrustStream.abi.json` — auto-updated (used by wallet.js)
- Update `VITE_CONTRACT_ADDRESS` in `frontend/.env` to the new address
- Restart backend and frontend dev servers

> **Hardhat config:** `viaIR: true` and the optimizer are enabled. The contract is also designed to compile in non-IR mode (Etherscan / Sourcify defaults), so verification works out of the box.

---

## How to Use

### Upload a Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Sign in with Clerk
3. Switch to the **Video Upload** tab
4. Enter a title and optional description
5. Drag & drop or pick an MP4 file
6. (Optional) Add a thumbnail image — this becomes the video's poster shown before playback
7. Click **Upload & Generate Hashes**
8. Pipeline panel updates in real time (7 steps): Upload → FFmpeg → Hash → Forensics → C2PA → IPFS → Blockchain (3-org)

### Upload an Image (Admin)
1. Same admin page, switch to the **Image Upload** tab
2. Enter title + optional description
3. Drag & drop or pick a JPG / PNG / WebP (max 20 MB)
4. Click **Upload & Authenticate Image**
5. Pipeline panel (6 steps): Upload → Hash → Forensic → C2PA → IPFS → Blockchain (3-org)
6. After completion, the temp local file is unconditionally deleted — only IPFS + Ethereum hold the canonical content

### Browse the Feed (Home)
1. Go to `http://localhost:5173`
2. Single-column Facebook-style timeline with mixed video + image posts, newest first
3. Sticky filter pill bar: All / Video / Image
4. Click a video card → fullscreen modal player (auto-verifies each segment, uses uploaded thumbnail as poster)
5. Click an image card → fullscreen lightbox (zoomable, IPFS-served)
6. Each card shows: avatar, time-ago, status pills (On-chain / C2PA / IPFS / 3-Org), title, description

### View Full Details
- Click **View Details** on any card
- **Video detail page:** metadata, blockchain (3-org grid), IPFS, C2PA (8 assertions), per-segment hash table
- **Image detail page:** metadata, forensics (risk score + 2 modules + notes), blockchain, IPFS, C2PA (7 assertions, `chain_hash` marked N/A), dedicated immutability notice

### Manual Verify (Image)
- On the image detail page, click **Verify**
- Backend recomputes SHA-256, fetches C2PA sidecar from IPFS by CID, calls `verifyImage()` on-chain
- Returns Local + Blockchain + C2PA + IPFS verdict

### Restore from Blockchain
- Hit `POST /api/upload/sync-from-blockchain` (button available on detail pages and via API)
- Reads on-chain TxLogs → fetches metadata from IPFS → rebuilds local catalog for both videos AND images
- A fresh machine can fully recover the platform without ever touching the original uploader

---

## API Reference

### Video

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload MP4 + (optional) thumbnail → segment → hash → forensics → C2PA → IPFS → blockchain |
| `GET` | `/api/upload/videos` | List all videos |
| `GET` | `/api/upload/videos/:videoId` | Get one video's full summary |
| `GET` | `/api/upload/videos/:videoId/segments` | Per-segment hashes, CIDs, C2PA, TX data |
| `GET` | `/api/upload/videos/:videoId/forensics` | Forensic report for one video |
| `GET` | `/api/upload/ipfs/:videoId/:segmentIndex` | Per-segment IPFS details |
| `GET` | `/api/upload/ipfs-playlist/:videoId` | IPFS-backed M3U8 playlist |
| `GET` | `/api/upload/c2pa/:videoId/:segmentIndex` | C2PA sidecar verification |
| `POST` | `/api/upload/verify` | Verify segment hash (manifest + chain + C2PA) |
| `POST` | `/api/upload/report-tamper` | Report tampered segment on-chain |

### Image

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload/image` | Upload image (JPG/PNG/WebP) → hash → forensics → C2PA → IPFS → blockchain |
| `GET` | `/api/upload/images` | List all images |
| `GET` | `/api/upload/images/:imageId` | Get one image's full summary |
| `GET` | `/api/upload/images/:imageId/forensics` | Image forensic report |
| `GET` | `/api/upload/images/:imageId/c2pa` | Verify the C2PA sidecar (fetched from IPFS) |
| `POST` | `/api/upload/images/verify` | Verify image hash (manifest + chain + C2PA-from-IPFS) |
| `POST` | `/api/upload/images/report-tamper` | Report tampered image on-chain |

### Unified Feed + Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/upload/feed` | Mixed video + image feed (newest-first) — drives the FB-style home page |
| `POST` | `/api/upload/sync-from-blockchain` | Restore both videos AND images from chain + IPFS |

### Blockchain Helpers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/upload/blockchain/video/:videoId` | On-chain video record |
| `GET` | `/api/upload/blockchain/image/:imageId` | On-chain image record |
| `GET` | `/api/upload/blockchain/image/:imageId/endorsements` | Image endorsement list |
| `GET` | `/api/upload/blockchain/endorsements/:videoId/:segmentIndex` | Segment endorsement list |
| `GET` | `/api/upload/blockchain/segment-tx/:videoId/:segmentIndex` | Per-segment TX details |
| `GET` | `/api/upload/blockchain/txlogs` | Recent transaction logs |
| `GET` | `/api/upload/blockchain/receipt/:txHash` | Full TX receipt |
| `GET` | `/api/upload/blockchain/network-status` | Sepolia network status |
| `GET` | `/api/upload/blockchain/wallet-balances` | 3 org wallet balances |

### Static

| Path | Serves |
|------|--------|
| `/streams/<videoId>/playlist.m3u8` + segments | Local HLS cache |
| `/thumbnails/<videoId>.<ext>` | Uploaded video poster images |

> Note: there are **NO** `DELETE` endpoints anywhere in the API. Once content is uploaded, only revoke (status flip) is possible. See [Immutability Guarantees](#immutability-guarantees).

---

## Project Structure

```text
TrustStream/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── blockchain.js                # Web3 + ABI bundle loader (single source of truth)
│   │   │   └── TrustStream.abi.json         # Auto-exported by deploy.js
│   │   ├── services/
│   │   │   ├── blockchain.service.js        # Video + image registers, endorsements, verify, tamper, revoke
│   │   │   ├── catalog.service.js           # Local manifest read/write/list (kind: video|image)
│   │   │   ├── c2pa.service.js              # C2PA v2.2 generate/sign/verify (in-memory + sidecar)
│   │   │   ├── ipfs.service.js              # Pinata upload (image, segment, JSON, sidecar), gateway, fetch
│   │   │   ├── forensics.service.js         # Video forensics (compression, temporal, AV sync)
│   │   │   └── image-forensics.service.js   # Image forensics (JPEG quant + EXIF)
│   │   ├── routes/
│   │   │   └── upload.routes.js             # All video + image endpoints, unified /feed, sync
│   │   └── server.js                        # Express entry — serves /streams + /thumbnails
│   ├── data/
│   │   └── catalog/
│   │       ├── <videoId>.json               # Video manifest cache
│   │       └── images/<imageId>.json        # Image manifest cache (no canonical bytes)
│   └── public/
│       ├── uploads/                         # Multer temp dir — emptied after each pipeline
│       ├── streams/<videoId>/               # HLS segments + .c2pa sidecars + playlist.m3u8
│       └── thumbnails/<videoId>.<ext>       # Video poster images
│
├── frontend/
│   └── src/
│       ├── context/
│       │   ├── ThemeContext.jsx             # Dark/Light theme state
│       │   └── AuthContext.jsx              # Auth wrapper
│       ├── pages/
│       │   ├── Home.jsx                     # FB-style single-column feed (videos + images mixed)
│       │   ├── VideoDetail.jsx              # Video full details (metadata, chain, IPFS, C2PA, segments)
│       │   ├── Imagedetail.jsx              # Image full details (metadata, forensics, chain, IPFS, C2PA)
│       │   ├── Admin.jsx                    # Tabbed upload (Video + Image), thumbnail picker, pipeline UI
│       │   └── Login.jsx                    # Clerk sign-in
│       ├── components/
│       │   ├── VideoPlayer.jsx              # hls.js + per-segment SHA-256 + tamper overlay + posterUrl
│       │   ├── NewsCard.jsx                 # Reusable card (legacy; current Home uses inline cards)
│       │   ├── ForensicPanel.jsx            # Visualizes the 4 video forensic modules
│       │   ├── VerificationBadge.jsx        # Multi-layer verification badge
│       │   ├── Navbar.jsx                   # Logo + theme toggle + admin link
│       │   ├── ProtectedRoute.jsx           # Clerk-gated route wrapper
│       │   └── SyncButton.jsx               # Sync-from-blockchain trigger
│       ├── services/
│       │   ├── api.js                       # videoAPI, imageAPI, feedAPI, syncAPI
│       │   ├── wallet.js                    # MetaMask connect + chain check
│       │   └── TrustStream.abi.json         # Auto-exported by deploy.js
│       └── utils/
│           └── hash.js                      # Browser SHA-256 (Web Crypto API)
│
├── network/
│   ├── contracts/
│   │   └── TrustStream.sol                  # Shared video + image contract (MediaStatus enum)
│   ├── scripts/
│   │   └── deploy.js                        # Deploy + auto-export ABI bundle to backend/frontend
│   ├── deployment.json                      # Last deployment info
│   ├── contract-address.json                # Address + chainId
│   └── hardhat.config.js                    # viaIR + optimizer + Sepolia network
│
└── README.md
```

---

## Smart Contract Overview

`TrustStream.sol` is deployed on **Ethereum Sepolia Testnet** at `0x6a895b97872f83ddbDf53c5d773A2619a4B42db7` (verified on Sourcify).

### 3-Org Consortium

| Organization | Role | Action |
|-------------|------|--------|
| NewsAgency (Org1) | Submitter | Registers videos, segments, and images. Auto-endorses on registration. |
| Broadcaster (Org2) | Endorser | Endorses registered media. |
| Auditor (Org3) | Endorser | Final endorsement and verification. |

### Shared `MediaStatus` Enum

Both videos and images use the same status state machine:

| Value | Meaning |
|-------|---------|
| `Active` | Default after registration |
| `Revoked` | Uploader chose to take it down (status flip only) |
| `Disputed` | 2+ tamper reports — auto-flipped by contract |

### Video Functions

- `registerVideo(videoId, title, metadataCid, totalSegments)` — NewsAgency only
- `registerSegment(videoId, segmentIndex, sha256, chainHash, ipfsCid, c2paManifestHash, c2paInstanceId)` — NewsAgency, requires video Active
- `endorseSegment(videoId, segmentIndex)` — Broadcaster / Auditor, requires Active
- `verifySegment(videoId, segmentIndex, sha256)` — view; returns `(hashMatch, fullyEndorsed, endorsementCount)`
- `reportTamper(videoId, segmentIndex)` — increments BOTH per-segment AND video-level counters
- `revokeVideo(videoId)` — uploader only; allows `Active → Revoked` AND `Disputed → Revoked`
- `getVideo(videoId)` / `getSegment(...)` / `getSegmentStatus(...)` — split getters (stack-safe)

### Image Functions

- `registerImage(imageId, title, description, sha256, ipfsCid, metadataCid, c2paManifestHash, c2paInstanceId)` — NewsAgency, auto-endorses
- `endorseImage(imageId)` — Broadcaster / Auditor, requires Active
- `verifyImage(imageId, sha256)` — view; returns `(hashMatch, fullyEndorsed, endorsementCount, status)`
- `reportImageTamper(imageId)` — 2+ reports → status flips to Disputed
- `revokeImage(imageId)` — uploader only; allows `Active → Revoked` AND `Disputed → Revoked`
- `getImage(imageId)` / `getImageStatus(imageId)` / `getImageCore(imageId)` / `getImageContent(imageId)` — split getters

### Key Design Choices

- **No `delete*` functions anywhere.** Only `revoke*` (status flip). Records stay on chain forever.
- **Status guards on all writes.** No new endorsements, segments, or tamper reports on Revoked or Disputed media.
- **Tamper logic uses both per-segment and video-level counters** — closes the "spread reports thin" attack.
- **Storage-pointer view functions** — `memory` → `storage` everywhere to avoid stack-too-deep on wide structs.
- **Wide-struct mappings are `internal`** — auto-generated public getters for 14-field structs were the source of stack-too-deep errors during Etherscan / Sourcify verification (which doesn't enable viaIR by default).
- **`REQUIRED_ENDORSEMENTS = 2`** (NewsAgency auto-endorse + 1 of {Broadcaster, Auditor} = quorum).
- **`TAMPER_THRESHOLD = 2`** (2 distinct reporters → Disputed).

---

## C2PA Implementation

TrustStream implements **C2PA v2.2** with HMAC-SHA256 signing.

### Video Segment — 8 assertions

| # | Assertion Label | Description |
|---|----------------|-------------|
| 1 | `c2pa.hash.data` | SHA-256 hard binding |
| 2 | `c2pa.actions` | Created + Transcoded (FFmpeg) + Published |
| 3 | `c2pa.claim_generator_info` | TrustStream software identity |
| 4 | `stds.schema-org.CreativeWork` | Video metadata |
| 5 | `c2pa.ingredient` | Original MP4 → HLS segment provenance |
| 6 | `c2pa.timestamp` | Proof of existence (RFC 3161 compatible) |
| 7 | `truststream.consortium` | 3-org endorsement + blockchain + IPFS |
| 8 | `truststream.chain_hash` | Sequential chain-hash provenance |

### Image — 7 assertions

| # | Assertion Label | Description |
|---|----------------|-------------|
| 1 | `c2pa.hash.data` | SHA-256 hard binding |
| 2 | `c2pa.actions` | Created + Published |
| 3 | `c2pa.claim_generator_info` | TrustStream software identity |
| 4 | `stds.schema-org.CreativeWork` | Image metadata |
| 5 | `c2pa.ingredient` | Original upload provenance |
| 6 | `c2pa.timestamp` | Proof of existence |
| 7 | `truststream.consortium` | 3-org endorsement + blockchain + IPFS |

> Images don't have `truststream.chain_hash` (not segmented). The image detail page explicitly notes this as N/A.

### Sidecar Storage

- **Video:** `seg_NNN.c2pa` saved next to `seg_NNN.ts` (offline verification)
- **Image:** pinned to IPFS as `c2paSidecarCid` — **no local sidecar file**. Verification fetches from IPFS by CID at request time.

---

## Forensics (AI-Free)

All forensic checks are deterministic — no machine-learning models, no hallucinations, no opaque scores.

### Video forensics (4 modules)

1. **Compression analysis** — bitrate variance, GOP structure, encoder fingerprint
2. **Temporal coherence** — per-frame variance and jump detection
3. **AV sync** — audio/video drift across segments
4. **Motion / structural** — keyframe distribution

The risk score combines module outputs into a 0..1 scalar; bands: Authentic / Suspicious / Likely Manipulated.

### Image forensics (2 modules)

1. **Compression analysis** — JPEG quantization-table parsing (manipulation often re-saves with non-standard tables)
2. **EXIF metadata** — presence, consistency, camera fingerprint

Risk formula:
```
risk = 0.60 × Compression + 0.40 × Metadata
```

Same Authentic / Suspicious / Likely Manipulated bands. The image detail page renders both modules with notes.

---

## Blockchain Info

| Item | Value |
|------|-------|
| Network | Ethereum Sepolia Testnet |
| Chain ID | 11155111 |
| RPC Provider | Alchemy |
| Contract Address | `0x6a895b97872f83ddbDf53c5d773A2619a4B42db7` |
| Verified On | Sourcify (Etherscan verification ready, just needs API key) |
| Etherscan | https://sepolia.etherscan.io |
| Sourcify | https://repo.sourcify.dev/contracts/full_match/11155111/ |
| TX Tracking | Receipt, block number, gas used per segment / per image |
| Tamper System | Auto `reportTamper()` / `reportImageTamper()` + Disputed status |

---

## IPFS Info

| Item | Value |
|------|-------|
| Pinning Service | Pinata |
| Gateway | [gateway.pinata.cloud/ipfs](https://gateway.pinata.cloud/ipfs) |
| Public Gateway | [ipfs.io/ipfs](https://ipfs.io/ipfs) |
| Video content | `.ts` segments + video metadata JSON + forensic report |
| Image content | Image bytes + C2PA sidecar JSON + image metadata JSON |
| Batch upload (video) | 2 segments per batch, rate-limit aware, auto-retry |
| Image upload | Single-shot, with separate sidecar pin |

---

## Storage Summary

| Asset | Local | IPFS | Ethereum | Notes |
|-------|-------|------|----------|-------|
| Video original MP4 | ❌ Temp | ❌ | ❌ | Deleted after FFmpeg |
| Video HLS segments | ✅ `public/streams/` | ✅ Pinned | (hash anchored) | Local for fast HLS playback |
| Video `.c2pa` sidecars | ✅ Next to segments | (in metadata JSON) | (hash anchored) | Allows offline verification |
| Video metadata JSON | — | ✅ Pinned | (cid anchored) | Sole source for sync recovery |
| Video forensic report | — | ✅ Pinned | (cid in metadata) | — |
| Video thumbnail | ✅ `public/thumbnails/` | — | — | Poster image, not part of provenance |
| **Image bytes** | ❌ **Deleted after pin** | ✅ Pinned | (hash anchored) | **IPFS-only** |
| **Image C2PA sidecar** | ❌ **Never written to disk** | ✅ Pinned | (hash anchored) | **IPFS-only** |
| Image metadata JSON | — | ✅ Pinned | (cid anchored) | Includes sidecar CID + forensics |
| Manifest catalog (cache) | ✅ `data/catalog/*` | — | — | Reproducible from chain via sync |

The local manifest catalog is just a cache — every byte of canonical content lives on IPFS, every authoritative status lives on Ethereum.

---

## Immutability Guarantees

The thesis core promise is "uploaded content cannot be deleted." This is enforced at **four layers**:

1. **Smart contract** — there is NO `delete*` function anywhere. Only `revoke*` (status flip). The `VideoRecord` / `ImageRecord` stays in storage forever, just with `status = Revoked`. Status guards prevent revoked / disputed media from accepting further endorsements.

2. **IPFS** — content-addressed by definition. Even if Pinata unpins, the CID still resolves on any other IPFS node that has the content. Hashes anchored on Ethereum let any third party detect substitution.

3. **HTTP API** — there are NO `DELETE` routes. The only mutation endpoints are `report-tamper` (with per-layer guard rails) and on-chain status flips. The Admin UI exposes no delete affordance.

4. **Catalog service** — `removeManifest()` exists for internal sync hygiene only, NOT exposed via any route. A code comment explicitly warns against exposing it.

For images specifically, the **IPFS-only flow** strengthens the guarantee further: even the local backend cannot be coerced into producing a deletion path, because there's no local file to delete after the pipeline completes.

---

## What's New

- **Image flow added end-to-end** — parallel to video, sharing the same blockchain / IPFS / C2PA infrastructure.
- **Facebook-style timeline** — single-column feed, mixed videos + images, fullscreen modal/lightbox, per-card status pills.
- **Custom video thumbnails** — admins can upload a poster shown before HLS playback. New static route at `/thumbnails/`.
- **Image flow is fully IPFS-only** — image bytes AND the C2PA sidecar live ONLY on IPFS. The local temp file is unconditionally deleted after the pipeline completes (no env flag, no fallback).
- **Smart contract hardened** — status guards on all write paths, video-level tamper counter, both `Active → Revoked` and `Disputed → Revoked` allowed.
- **Stack-too-deep fixes** — `getImage` / `getSegment` split into smaller getters; wide-struct mappings made `internal`. The contract now compiles cleanly with AND without `viaIR`, so Etherscan / Sourcify verification just works.
- **ABI single source of truth** — `deploy.js` auto-exports the bundle to backend AND frontend. No manual ABI sync.
- **Backend `/feed` endpoint** — unified video + image feed sorted newest-first.
- **`/sync-from-blockchain` recovers BOTH** videos AND images from on-chain TxLogs and IPFS metadata.
