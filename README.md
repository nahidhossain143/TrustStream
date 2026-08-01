# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Live News Streaming (Video + Image)

> A research-based, tamper-resistant, **Facebook-style decentralized live news streaming platform** integrating **Ethereum Sepolia Testnet**, **Hyperledger Fabric**, **C2PA v2.2 Provenance Manifests**, **IPFS via Pinata**, **SHA-256 Chain Hashing**, **HLS Streaming**, and **AI-free forensic analysis** to verify the authenticity of every video segment AND every news image in near real-time.

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
- [Hyperledger Fabric Run Guide](#hyperledger-fabric-run-guide)
- [Hyperledger Fabric Implementation Details](#hyperledger-fabric-implementation-details)
- [How to Use](#how-to-use)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Smart Contract](#smart-contract-overview)
- [C2PA Implementation](#c2pa-implementation)
- [Forensics (AI-Free)](#forensics-ai-free)
- [Forensic Analysis Modules](#forensic-analysis-modules)
- [Experimental Results](#experimental-results)
- [Revocation Timeline Visual](#revocation-timeline-visual)
- [Blockchain Info](#blockchain-info)
- [IPFS Info](#ipfs-info)
- [Storage Summary](#storage-summary)
- [Immutability Guarantees](#immutability-guarantees)
- [Git Push Notes](#git-push-notes)
- [What's New](#whats-new)

---

## Project Overview

TrustStream has evolved into a **full Facebook-style decentralized live news streaming platform** with end-to-end authentication pipelines for **both video and image** media. The original thesis core — video authentication via a 3-organization consortium + AI-free forensics + C2PA + IPFS + blockchain — is fully intact, with the image flow added as a clean parallel that reuses the same infrastructure with adapted modules.

### Smart Contract Layer

The original `TrustStream.sol` has been extended with a complete image entity:

- `registerImage`, `endorseImage`, `reportImageTamper`, `revokeImage`, `verifyImage`, `getImage`, `getImageEndorsements`, `getImageStatus`
- Same 3-organization consortium model as the video flow (NewsAgency uploads, Broadcaster + Auditor endorse)
- A shared `MediaStatus` enum manages both videos and images
- Deployed to Sepolia Testnet at `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9`, verified on Sourcify (Etherscan verification ready, pending API key)
- **No `delete*` function anywhere — only `revoke*` (status flip)**, naturally enforcing the thesis core promise: *"uploaded content cannot be deleted"*

> **Deployment note:** The contract must be deployed from the `network/` folder using Hardhat before the frontend and backend will function. The deployed address `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9` is already wired into both `backend/src/config/TrustStream.abi.json` and `frontend/src/services/TrustStream.abi.json` via the auto-export in `deploy.js`. The frontend's browser-side wallet (MetaMask) reads the ABI bundle and handles all endorsement calls directly on-chain — no backend wallet is needed for Broadcaster or Auditor endorsements in the browser flow.

### Backend

All services upgraded to handle the image flow:

- `blockchain.service.js` — provides image methods (`registerAndEndorseImage`, `getImageFromChain`, `endorseImageOnChain`, `reportImageTamperOnChain`, `revokeImageOnChain`, `getImageEndorsementsFromChain`, `getImageIdsFromChain`)
- `fabric.service.js` — connects the backend to Hyperledger Fabric using Fabric Gateway and gRPC, then calls `RegisterVideoProof` and `RegisterImageProof` on the `truststreamcc` chaincode
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
- "View Timeline" link on each card jumps to `/timeline/:kind/:id` — the new Revocation Timeline Visual

A sticky filter pill bar at the top toggles between **All / Video / Image**.

The `VideoDetail.jsx` page renders metadata, blockchain (3-org grid), IPFS info, C2PA details (8 assertions), and per-segment hash table. The parallel `Imagedetail.jsx` page follows the same structure with image-specific 7 assertions (`chain_hash` explicitly noted as N/A), a Forensic Analysis section showing the risk score and the two modules with notes, and a dedicated immutability notice that strengthens the thesis story line.

The Admin page uses a tab switcher to separate Video Upload from Image Upload, each rendering an animated step-by-step pipeline visualization:
- **Image:** 6 steps — Upload → Hash → Forensic → C2PA → IPFS → Blockchain
- **Video:** 7 steps — Upload → FFmpeg → Hash → Forensic → C2PA → IPFS → Blockchain

The Video Upload form also accepts an optional **thumbnail image**, which becomes the `<video poster>` shown before HLS playback.

All components are fully theme-aware (dark + light), `api.js` provides complete coverage for both flows (`videoAPI`, `imageAPI`, `feedAPI`, `syncAPI`, `timelineAPI`), and `App.jsx` includes the `/image/:imageId` and `/timeline/:kind/:id` routes alongside the existing video route.

### Net Result

- Contract deployed at `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9` and ABI auto-exported to both backend and frontend
- Hyperledger Fabric `truststreamcc` writes video and image proof records to `mychannel`
- Backend services all image-aware with the new forensics module
- Frontend transformed to a Facebook timeline aesthetic with proper detail pages for both kinds
- **Revocation Timeline Visual** added — full media lifecycle viewable as an interactive vertical timeline
- Frontend detail pages display Fabric proof status, ledger record, MSP identity, and Fabric consortium endorsements
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
   Revocation Timeline                            Revocation Timeline API
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
       → RegisterVideoProof on Hyperledger Fabric (`truststreamcc`)
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
       → RegisterImageProof on Hyperledger Fabric (`truststreamcc`)
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

### Revocation Timeline Flow

```text
User clicks "View Timeline" on any media card
  → Frontend calls GET /api/upload/blockchain/revocation-timeline?id=xxx&kind=video|image
  → Backend reads all TxLogs from on-chain for that media ID
  → Backend merges with local catalog (C2PA signed events, IPFS upload events)
  → Events sorted chronologically (oldest → newest)
  → Response: { mediaId, kind, status, title, events[] }
  → Frontend renders RevocationTimeline.jsx:
       → Vertical timeline — each event is a color-coded card
       → Event types: upload, c2pa, ipfs, register, endorsement, tamper, disputed, revoked
       → TX hash links to Sepolia Etherscan
       → IPFS CIDs link to Pinata gateway
       → Current status badge at the top (Active / Disputed / Revoked)
       → Immutability proof footer
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
| Blockchain | Solidity ^0.8.0, Web3.js 4, Alchemy RPC, Hyperledger Fabric Gateway |
| Smart Contract | TrustStream.sol (video + image, shared MediaStatus), Fabric chaincode `truststreamcc` |
| Testnet | Ethereum Sepolia (chainId 11155111) |
| Permissioned Ledger | Hyperledger Fabric test-network (`mychannel`) |
| Wallet | MetaMask (browser-side endorsement via `wallet.js`) |
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
| Docker Desktop | Latest | Required for Hyperledger Fabric containers |
| WSL / Ubuntu | Ubuntu 24.04 recommended | Required for Fabric test-network commands on Windows |
| Hyperledger Fabric Samples | Fabric test-network | Required for `peer`, `orderer`, and `truststreamcc` |

> FFmpeg must be on system PATH for video segmentation.
>
> MetaMask must be connected to Sepolia Testnet for on-chain reads/writes from the browser.
>
> Docker Desktop and Ubuntu/WSL must be running before testing Hyperledger Fabric proof storage.

---

## How to Run

The project requires Docker Desktop plus **3 active terminals**:

1. Ubuntu/WSL terminal for Hyperledger Fabric and Docker containers
2. PowerShell / VS Code terminal for the backend
3. PowerShell / VS Code terminal for the frontend

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
CONTRACT_ADDRESS=0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9
NEWSAGENCY_ADDRESS=0xyour_newsagency_wallet_address
BROADCASTER_ADDRESS=0xyour_broadcaster_wallet_address
AUDITOR_ADDRESS=0xyour_auditor_wallet_address
PINATA_JWT=your_pinata_jwt
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs

FABRIC_ENABLED=true
FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL_NAME=mychannel
FABRIC_CHAINCODE_NAME=truststreamcc
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com
```

> **Note on `CONTRACT_ADDRESS`:** the backend reads the contract address from the auto-exported ABI bundle (`backend/src/config/TrustStream.abi.json`). You do NOT need to set `CONTRACT_ADDRESS` manually. If it is set and disagrees with the bundle, the bundle wins and a warning is logged.
>
> The Fabric certificate paths are OS-specific. Use the Windows/WSL paths on Windows and the Mac paths on macOS.

Windows / WSL Fabric certificate paths:

```env
FABRIC_TLS_CERT_PATH=\\wsl.localhost\Ubuntu-24.04\home\YOUR_UBUNTU_USERNAME\fabric-project\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\peers\peer0.org1.example.com\tls\ca.crt
FABRIC_CERT_PATH=\\wsl.localhost\Ubuntu-24.04\home\YOUR_UBUNTU_USERNAME\fabric-project\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\users\User1@org1.example.com\msp\signcerts\cert.pem
FABRIC_KEY_DIR=\\wsl.localhost\Ubuntu-24.04\home\YOUR_UBUNTU_USERNAME\fabric-project\fabric-samples\test-network\organizations\peerOrganizations\org1.example.com\users\User1@org1.example.com\msp\keystore
```

Mac Fabric certificate paths:

```env
FABRIC_TLS_CERT_PATH=/Users/YOUR_MAC_USERNAME/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
FABRIC_CERT_PATH=/Users/YOUR_MAC_USERNAME/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/signcerts/cert.pem
FABRIC_KEY_DIR=/Users/YOUR_MAC_USERNAME/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/keystore
```

> Replace `YOUR_UBUNTU_USERNAME` with the Ubuntu username returned by `whoami`.
>
> Replace `YOUR_MAC_USERNAME` with the macOS username returned by `whoami`. In our Mac setup, the path was `/Users/sumaiyaaftab/fabric-project/fabric-samples/test-network`.

### Step 3 — Configure Frontend

Create `frontend/.env`:

```env
VITE_CONTRACT_ADDRESS=0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9
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

### Step 5 — Start Docker Desktop

Open **Docker Desktop** on Windows and wait until it says Docker is running.

Docker is required because Hyperledger Fabric runs its peers, orderer, certificate authorities, and chaincode as containers.

### Step 6 — Start / Check Hyperledger Fabric Network

Open PowerShell and enter Ubuntu/WSL:

```powershell
wsl -d Ubuntu-24.04
```

If the distro name is different, use:

```powershell
wsl
```

Go to the Fabric test-network folder:

```bash
cd ~/fabric-project/fabric-samples/test-network
```

Check running Fabric containers:

```bash
docker ps
```

Expected important containers:

```text
peer0.org1.example.com
peer0.org2.example.com
peer0.org3.example.com
orderer.example.com
dev-peer0.org1.example.com-truststreamcc...
dev-peer0.org2.example.com-truststreamcc...
```

If `docker ps` is empty, start the Fabric network:

```bash
./network.sh up createChannel -ca
```

Deploy the TrustStream chaincode:

```bash
./network.sh deployCC -ccn truststreamcc -ccp ../chaincode/truststream/javascript -ccl javascript
```

If Org3 is required and not running, add Org3:

```bash
cd addOrg3
./addOrg3.sh up -c mychannel -ca
cd ..
```

If the terminal says `ledger already exists`, it usually means the channel was already joined earlier. In that case, check `docker ps` again and continue.

### Step 7 — Run Backend

#### Terminal 1 — Backend

```powershell
cd D:\TrustStream\TrustStream\backend
node src/server.js
```

Expected output:

```text
[blockchain] Contract loaded: 0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9
[blockchain] Network: sepolia (chainId: 11155111)
[blockchain] Org accounts:
             NewsAgency:  0x...
             Broadcaster: 0x...
             Auditor:     0x...
Server running on port 3001
```

When uploading a video or image, Fabric success looks like:

```text
[fabric] RegisterVideoProof success
[fabric] RegisterImageProof success
```

### Step 8 — Run Frontend

#### Terminal 2 — Frontend

```powershell
cd D:\TrustStream\TrustStream\frontend
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
| Hyperledger Fabric | Docker containers in Ubuntu/WSL | `docker ps` |
| Blockchain | Sepolia Testnet | Always live |
| IPFS Storage | Pinata | Always live |
| Local HLS cache (videos) | `backend/public/streams` | Local |
| Local thumbnails | `backend/public/thumbnails` | Local |
| Local manifest catalog | `backend/data/catalog` | Local |

---

## Hyperledger Fabric Run Guide

### What Docker Runs

Docker runs the Fabric network components:

| Container | Purpose |
|----------|---------|
| `peer0.org1.example.com` | Org1 peer node; backend connects here |
| `peer0.org2.example.com` | Org2 peer node |
| `peer0.org3.example.com` | Org3 peer node, used when the 3-org network is enabled |
| `orderer.example.com` | Orders transactions and creates blocks |
| `dev-peer0.org1.example.com-truststreamcc...` | TrustStream chaincode container for Org1 |
| `dev-peer0.org2.example.com-truststreamcc...` | TrustStream chaincode container for Org2 |

Without Docker, the Fabric peer/orderer/chaincode will not run, and the backend cannot write Fabric proofs.

### Daily Startup Checklist

Every time the project is started on Windows:

```text
1. Open Docker Desktop
2. Open PowerShell
3. Run: wsl -d Ubuntu-24.04
4. Run: cd ~/fabric-project/fabric-samples/test-network
5. Run: docker ps
6. Start backend: node src/server.js
7. Start frontend: npm run dev
```

Every time the project is started on Mac:

```text
1. Open Docker Desktop
2. Open Terminal
3. Run: cd ~/fabric-project/fabric-samples/test-network
4. Run: docker ps
5. If needed, run: ./network.sh up createChannel -ca
6. If Org3 is needed, run: cd addOrg3 && ./addOrg3.sh up -ca && cd ..
7. Start backend: node src/server.js
8. Start frontend: npm run dev
```

### Mac First-Time Fabric Setup

On macOS, install Fabric samples, binaries, and Docker images:

```bash
mkdir -p ~/fabric-project
cd ~/fabric-project
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh docker samples binary
```

Start the test network:

```bash
cd ~/fabric-project/fabric-samples/test-network
./network.sh up createChannel -ca
```

Add Org3:

```bash
cd addOrg3
./addOrg3.sh up -ca
cd ..
```

Create the TrustStream chaincode folder if it is not already present:

```bash
mkdir -p ~/fabric-project/fabric-samples/chaincode/truststream/javascript
```

The chaincode folder must contain:

```text
index.js
package.json
```

Deploy the chaincode:

```bash
cd ~/fabric-project/fabric-samples/test-network
./network.sh deployCC -ccn truststreamcc -ccp ../chaincode/truststream/javascript -ccl javascript
```

### Verify Fabric CLI Environment

In Ubuntu/WSL:

```bash
cd ~/fabric-project/fabric-samples/test-network
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
source scripts/envVar.sh
setGlobals 1
```

This configures the Fabric peer CLI to use Org1 identity.

### Query Saved Video Proof

```bash
peer chaincode query -C mychannel -n truststreamcc -c '{"Args":["GetMediaProof","video","VIDEO_ID"]}'
```

### Query Saved Image Proof

```bash
peer chaincode query -C mychannel -n truststreamcc -c '{"Args":["GetMediaProof","image","IMAGE_ID"]}'
```

If JSON is returned, the media proof is saved in the Hyperledger Fabric ledger.

### Expected Frontend Result

Video and image detail pages show a Hyperledger Fabric card:

```text
✓ Fabric
Status: ready
Ledger Record: saved
Created By: Org1MSP
NewsAgency: Endorsed
Broadcaster: Pending
Auditor: Pending
```

Ethereum Sepolia can be `degraded` if the testnet wallet has insufficient gas. Fabric proof can still be successful because Fabric is a separate permissioned ledger.

---

## Hyperledger Fabric Implementation Details

### Backend Packages Added

```bash
npm install @hyperledger/fabric-gateway @grpc/grpc-js
```

`@hyperledger/fabric-gateway` lets the Node.js backend submit transactions to Fabric.

`@grpc/grpc-js` provides the gRPC client used to connect to Fabric peers.

### Backend Files Changed

| File | What changed |
|------|--------------|
| `backend/src/services/fabric.service.js` | New service that connects to Fabric peer, signs transactions with Org1 identity, and calls chaincode functions |
| `backend/src/routes/upload.routes.js` | Video/image upload flow now calls Fabric after IPFS metadata is ready |
| `backend/package.json` | Added Fabric SDK dependencies |
| `backend/package-lock.json` | Locked installed Fabric SDK versions |
| `backend/src/services/merkle.service.js` | Builds Merkle root / proof data used in video proof anchoring |
| `backend/src/services/image-forensics.service.js` | Balanced AI-free image scoring so normal captured images are not incorrectly marked suspicious |
| `backend/src/services/blockchain.service.js` | Kept Ethereum registration/endorsement flow compatible with Fabric-added upload pipeline |

### Frontend Files Changed

| File | What changed |
|------|--------------|
| `frontend/src/pages/VideoDetail.jsx` | Shows Hyperledger Fabric proof card for video uploads |
| `frontend/src/pages/Imagedetail.jsx` | Shows Hyperledger Fabric proof card for image uploads |

### Contract / ABI Files Updated

| File | Purpose |
|------|---------|
| `network/contracts/TrustStream.sol` | Ethereum smart contract updates |
| `network/contract-address.json` | Latest deployed Sepolia contract address |
| `network/deployment.json` | Latest deployment metadata |
| `backend/src/config/TrustStream.abi.json` | Backend ABI bundle |
| `frontend/src/services/TrustStream.abi.json` | Frontend ABI bundle |
| `backend/src/config/blockchain.js` | Loads ABI bundle as source of truth |

### Fabric Service Flow

`fabric.service.js` does this:

```text
Read TLS certificate
  → Create gRPC connection to peer0.org1.example.com
  → Read Org1 user certificate
  → Read Org1 private key from keystore
  → Sign transaction as Org1MSP
  → Connect to channel mychannel
  → Get chaincode truststreamcc
  → Submit RegisterVideoProof / RegisterImageProof
  → Return JSON result from Fabric ledger
```

### Fabric Chaincode Functions

The TrustStream chaincode is deployed as:

```text
truststreamcc
```

Main functions:

```text
RegisterVideoProof(videoId, title, metadataCid, merkleRoot, totalSegments)
RegisterImageProof(imageId, title, sha256Hash, ipfsCid, metadataCid, c2paHash)
EndorseMedia(mediaType, mediaId)
GetMediaProof(mediaType, mediaId)
VerifyVideoProof(videoId, merkleRoot)
VerifyImageProof(imageId, sha256Hash)
```

### What Gets Saved in Fabric

For video, Fabric stores:

```text
mediaType
mediaId
title
metadataCid
merkleRoot
totalSegments
endorsements
createdBy
createdAt
updatedAt
```

For image, Fabric stores:

```text
mediaType
mediaId
title
sha256Hash
ipfsCid
metadataCid
c2paHash
endorsements
createdBy
createdAt
updatedAt
```

### Confirmed Fabric Test Result

A direct Fabric test was run on Mac:

```bash
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile ~/fabric-project/fabric-samples/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n truststreamcc --peerAddresses localhost:7051 --tlsRootCertFiles ~/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles ~/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{"Args":["RegisterVideoProof","mac-test-2","Mac Fabric Test","bafkrei-test","0xabc123","3"]}'
```

Then queried:

```bash
peer chaincode query -C mychannel -n truststreamcc -c '{"Args":["GetMediaProof","video","mac-test-2"]}'
```

Successful output returned JSON, proving the Fabric ledger saved the proof:

```json
{
  "docType": "mediaProof",
  "mediaType": "video",
  "mediaId": "mac-test-2",
  "title": "Mac Fabric Test",
  "metadataCid": "bafkrei-test",
  "merkleRoot": "0xabc123",
  "totalSegments": 3,
  "endorsements": {
    "NewsAgency": true,
    "Broadcaster": false,
    "Auditor": false
  },
  "createdBy": "Org1MSP"
}
```

### Common Fabric Errors

| Error | Meaning | Fix |
|------|---------|-----|
| `Cannot find module '../services/fabric.service'` | Fabric service file missing | Create `backend/src/services/fabric.service.js` |
| `Cannot find module '@grpc/grpc-js'` | Fabric SDK dependency missing | Run `npm install @hyperledger/fabric-gateway @grpc/grpc-js` in backend |
| `ENOENT ... wsl.localhost ... ca.crt` on Mac | Windows WSL path used on Mac | Replace `.env` Fabric paths with `/Users/...` Mac paths |
| `Account blocked due to plan usage limit` | Pinata/IPFS account blocked | Use a new Pinata JWT or fix Pinata usage |
| Frontend shows `Fabric Status: registering` | Page opened before backend finished, or manifest did not return Fabric result | Refresh page and confirm `fabricStatus`, `fabricResult`, `fabricError` are returned |
| `Media proof does not exist` | Fabric ledger does not have that media ID | Query the correct ID or confirm transaction was endorsed/committed |

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
- `frontend/src/services/TrustStream.abi.json` — auto-updated (used by `wallet.js` for browser-side endorsement)
- Update `VITE_CONTRACT_ADDRESS` in `frontend/.env` to the new address
- Restart backend and frontend dev servers

> **Important:** The frontend's `wallet.js` uses the auto-exported ABI bundle to call `endorseSegment` and `endorseImage` directly from the browser via MetaMask. After redeploying, the ABI bundle update is automatic — you only need to update `VITE_CONTRACT_ADDRESS`.
>
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

### View Revocation Timeline
- Click **View Timeline** on any card, or navigate to `/timeline/video/:id` or `/timeline/image/:id`
- Full media lifecycle rendered as a vertical timeline: upload → C2PA sign → IPFS pin → on-chain register → endorsements → tamper reports → disputed / revoked (if applicable)
- Each event card is color-coded by type: local (gray), c2pa (purple), ipfs (teal), register (blue), endorsement (green), tamper (amber), disputed/revoked (red)
- TX hashes link to Sepolia Etherscan; IPFS CIDs link to the Pinata gateway
- Immutability proof footer confirms no events can be deleted from this log

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
| `GET` | `/api/upload/blockchain/revocation-timeline` | **Full media lifecycle timeline** — query params: `id` (mediaId) + `kind` (`video` or `image`) |

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
│   │   │   └── TrustStream.abi.json         # Auto-exported by deploy.js (contract: 0x3ee8f0B4...)
│   │   ├── services/
│   │   │   ├── blockchain.service.js        # Video + image registers, endorsements, verify, tamper, revoke
│   │   │   ├── catalog.service.js           # Local manifest read/write/list (kind: video|image)
│   │   │   ├── c2pa.service.js              # C2PA v2.2 generate/sign/verify (in-memory + sidecar)
│   │   │   ├── ipfs.service.js              # Pinata upload (image, segment, JSON, sidecar), gateway, fetch
│   │   │   ├── forensics.service.js         # Video forensics coordinator
│   │   │   ├── compression.service.js       # Module 1: Compression forensics (FFmpeg frame size analysis)
│   │   │   ├── temporal.service.js          # Module 2: Temporal consistency (frame-by-frame diff)
│   │   │   ├── avsync.service.js            # Module 3: Audio-video sync drift analysis
│   │   │   ├── forensic.service.js          # Module 4: Score fusion engine + forensic report generation
│   │   │   └── image-forensics.service.js   # Image forensics (JPEG quant + EXIF)
│   │   ├── routes/
│   │   │   └── upload.routes.js             # All video + image endpoints, unified /feed, sync, timeline
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
│       │   ├── RevocationTimeline.jsx       # Full media lifecycle visual timeline (video + image)
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
│       │   ├── api.js                       # videoAPI, imageAPI, feedAPI, syncAPI, timelineAPI
│       │   ├── wallet.js                    # MetaMask connect + chain check + browser-side endorsement
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
│   ├── contract-address.json                # Address (0x3ee8f0B4...) + chainId
│   └── hardhat.config.js                    # viaIR + optimizer + Sepolia network
│
└── README.md
```

---

## Smart Contract Overview

`TrustStream.sol` is deployed on **Ethereum Sepolia Testnet** at `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9` (verified on Sourcify).

> **Frontend endorsement:** `wallet.js` in the frontend connects to this contract via MetaMask and calls `endorseSegment` / `endorseImage` directly from the browser. The ABI bundle is auto-exported by `deploy.js` and stored at `frontend/src/services/TrustStream.abi.json` — no manual sync required after redeployment.

### 3-Org Consortium

| Organization | Role | Action |
|-------------|------|--------|
| NewsAgency (Org1) | Submitter | Registers videos, segments, and images. Auto-endorses on registration. |
| Broadcaster (Org2) | Endorser | Endorses registered media (via backend wallet or browser MetaMask). |
| Auditor (Org3) | Endorser | Final endorsement and verification (via backend wallet or browser MetaMask). |

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

## Revocation Timeline Visual

The Revocation Timeline is a purpose-built visual audit interface that shows the **complete chronological lifecycle** of any media item — from the moment it was uploaded to its current on-chain status. It is the primary tool for demonstrating the immutability guarantee to thesis evaluators and end users.

### What it shows

Every event that has ever touched a piece of media is shown as a color-coded card on a vertical timeline, in strict chronological order:

| Event type | Color | Events included |
|-----------|-------|-----------------|
| `local` | Gray | Upload accepted, segments prepared |
| `c2pa` | Purple | Per-segment C2PA signed, video/image C2PA provenance signed |
| `ipfs` | Teal | Per-segment IPFS upload, metadata JSON upload, image bytes + sidecar upload |
| `register` | Blue | Video registered on-chain, segment registered on-chain, image registered on-chain |
| `endorsement` | Green | Broadcaster / Auditor endorsements (per segment or per image) |
| `tamper` | Amber | `reportTamper` or `reportImageTamper` calls |
| `disputed` | Red | Contract auto-flip to Disputed status |
| `revoked` | Red | Manual `revokeVideo` / `revokeImage` call |

### API endpoint

```
GET /api/upload/blockchain/revocation-timeline?id=<mediaId>&kind=video|image
```

**How the backend builds the timeline:**

1. Reads all on-chain TxLogs for the given `mediaId` and `kind` from Ethereum Sepolia
2. Merges with the local catalog manifest — picks up C2PA sign events and IPFS upload events that aren't directly emitted as contract events
3. Sorts all events chronologically (oldest first)
4. Returns a unified response:

```json
{
  "mediaId": "abc123",
  "kind": "video",
  "title": "Breaking News",
  "status": "Active",
  "totalEvents": 29,
  "events": [
    {
      "type": "local",
      "action": "UPLOAD_CREATED",
      "label": "Video upload accepted",
      "timestamp": "2026-05-26T14:58:39.000Z",
      "org": "TrustStream",
      "actor": "Local catalog",
      "detail": "3 segment(s) prepared for provenance."
    },
    {
      "type": "c2pa",
      "action": "C2PA_SEGMENT_SIGNED",
      "label": "Segment 0 C2PA signed",
      "timestamp": "2026-05-26T14:58:39.000Z",
      "segment": 0,
      "manifestHash": "17767e91f132..."
    },
    {
      "type": "register",
      "action": "REGISTER_VIDEO",
      "label": "Video registered on-chain",
      "timestamp": "2026-05-26T14:58:48.000Z",
      "org": "NewsAgency",
      "txHash": "0x3570a95e...",
      "blockNumber": 8421337
    },
    {
      "type": "endorsement",
      "action": "ENDORSE_SEGMENT",
      "label": "Broadcaster endorsed segment 0",
      "timestamp": "2026-05-26T14:59:12.000Z",
      "org": "Broadcaster",
      "segment": 0,
      "txHash": "0x6f6b4bb3..."
    }
  ]
}
```

### Frontend component

`RevocationTimeline.jsx` is accessible at `/timeline/:kind/:id`. It:

- Fetches the timeline from the API on mount
- Shows a status badge at the top: **Active** (green) / **Disputed** (amber) / **Revoked** (red)
- Renders each event as a card on a vertical left-ruled timeline with a colored dot matching the event type
- TX hash fields link directly to `https://sepolia.etherscan.io/tx/<hash>`
- IPFS CID fields link to `https://gateway.pinata.cloud/ipfs/<cid>`
- Shows a total event count in the header
- Shows an immutability proof footer: *"Media cannot be deleted; revoke only changes status while the original record remains auditable."*
- Is fully theme-aware (dark + light) and links back to the detail page via a ← Back button

### Where the link appears

- On every Home feed card: **View Timeline** link alongside **View Details**
- On `VideoDetail.jsx` and `Imagedetail.jsx`: a dedicated **Immutable Audit Trail** button
- Directly navigable via URL: `/timeline/video/:videoId` or `/timeline/image/:imageId`

---

## Blockchain Info

| Item | Value |
|------|-------|
| Network | Ethereum Sepolia Testnet |
| Chain ID | 11155111 |
| RPC Provider | Alchemy |
| Contract Address | `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9` |
| Verified On | Sourcify (Etherscan verification ready, just needs API key) |
| Etherscan | https://sepolia.etherscan.io |
| Sourcify | https://repo.sourcify.dev/contracts/full_match/11155111/ |
| TX Tracking | Receipt, block number, gas used per segment / per image |
| Tamper System | Auto `reportTamper()` / `reportImageTamper()` + Disputed status |
| Browser Endorsement | `wallet.js` calls `endorseSegment` / `endorseImage` via MetaMask using the auto-exported ABI |

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

### Storage Summary

| Asset | Local | IPFS | Ethereum | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Video original MP4** | ❌ Temp | ❌ | ❌ | Deleted after FFmpeg |
| **Video HLS segments** | ✅ `public/streams/` | ✅ Pinned | *(hash anchored)* | Local for fast HLS playback |
| **Video .c2pa sidecars** | ✅ Next to segments | *(in metadata JSON)* | *(hash anchored)* | Allows offline verification |
| **Video metadata JSON** | — | ✅ Pinned | *(cid anchored)* | Sole source for sync recovery |
| **Video forensic report** | — | ✅ Pinned | *(cid in metadata)* | — |
| **Video thumbnail** | ✅ `public/thumbnails/` | — | — | Poster image, not part of provenance |
| **Image bytes** | ❌ Deleted after pin | ✅ Pinned | *(hash anchored)* | IPFS-only |
| **Image C2PA sidecar** | ❌ Never written to disk | ✅ Pinned | *(hash anchored)* | IPFS-only |
| **Image metadata JSON** | — | ✅ Pinned | *(cid anchored)* | Includes sidecar CID + forensics |
| **Manifest catalog (cache)**| ✅ `data/catalog/*` | — | — | Reproducible from chain via sync |

> **Note:** The local manifest catalog is just a cache — every byte of canonical content lives on IPFS, every authoritative status lives on Ethereum.

---

## Immutability Guarantees

The thesis core promise is **"uploaded content cannot be deleted."** This is enforced at four layers:

* **Smart contract:** There is NO `delete*` function anywhere. Only `revoke*` (status flip). The `VideoRecord` / `ImageRecord` stays in storage forever, just with `status = Revoked`. Status guards prevent revoked / disputed media from accepting further endorsements.
* **IPFS:** Content-addressed by definition. Even if Pinata unpins, the CID still resolves on any other IPFS node that has the content. Hashes anchored on Ethereum let any third party detect substitution.
* **HTTP API:** There are NO `DELETE` routes. The only mutation endpoints are `report-tamper` (with per-layer guard rails) and on-chain status flips. The Admin UI exposes no delete affordance.
* **Catalog service:** `removeManifest()` exists for internal sync hygiene only, NOT exposed via any route. The Revocation Timeline endpoint reads and displays the catalog merge — but never deletes from it.

*The Revocation Timeline Visual reinforces all four layers by making the full immutable event log visible and navigable by any user, with direct links to on-chain TX receipts and IPFS-pinned content.*

---

## Git Push Notes

Files that should be pushed for the Hyperledger Fabric integration:

```text
backend/package.json
backend/package-lock.json
backend/src/config/TrustStream.abi.json
backend/src/config/blockchain.js
backend/src/routes/upload.routes.js
backend/src/services/blockchain.service.js
backend/src/services/fabric.service.js
backend/src/services/image-forensics.service.js
backend/src/services/merkle.service.js
frontend/src/pages/Imagedetail.jsx
frontend/src/pages/VideoDetail.jsx
frontend/src/services/TrustStream.abi.json
network/contract-address.json
network/contracts/TrustStream.sol
network/deployment.json
```

Do not push:

```text
.env
private keys
Pinata JWT
node_modules
backend/test-fabric.js
temporary uploaded files
```

Safe push flow:

```bash
git add .
git restore --staged backend/test-fabric.js
git status
git commit -m "Add Hyperledger Fabric proof integration"
git push origin feature/merkle-batching
```

If `.env` is staged accidentally:

```bash
git restore --staged backend/.env
git restore --staged frontend/.env
```

---

## What's New

### v3 — Hyperledger Fabric Proof Layer (August 2026)
* **Hyperledger Fabric added:** TrustStream now writes video and image proof records to a permissioned Fabric ledger in addition to Ethereum Sepolia.
* **Fabric chaincode:** New `truststreamcc` chaincode supports `RegisterVideoProof`, `RegisterImageProof`, `EndorseMedia`, `GetMediaProof`, `VerifyVideoProof`, and `VerifyImageProof`.
* **Backend Fabric Gateway service:** New `fabric.service.js` uses Org1 certificate/private key to connect to `peer0.org1.example.com` and submit Fabric transactions.
* **Video Fabric proof:** Upload flow now calls `RegisterVideoProof` with `videoId`, `title`, `metadataCid`, `merkleRoot`, and `totalSegments`.
* **Image Fabric proof:** Image flow now supports `RegisterImageProof` with `imageId`, `title`, `sha256Hash`, `ipfsCid`, `metadataCid`, and `c2paHash`.
* **Frontend proof card:** Video and image detail pages now show Fabric status, ledger record, MSP, peer, channel, chaincode, and Fabric consortium endorsements.
* **Mac setup completed:** Docker Desktop + Fabric samples + 3-org test-network + `truststreamcc` deployment were verified on macOS Ventura / Apple Silicon.
* **Ledger proof verified:** `GetMediaProof` query returned saved JSON for `mac-test-2`, proving Fabric ledger write/read works.
* **Troubleshooting documented:** Added fixes for missing Fabric SDK, wrong WSL/Mac certificate paths, Pinata usage limit, and frontend `registering` state.

### v2 — Live News Streaming + Revocation Timeline (May 2026)
* **Live news streaming:** Platform repositioned from digital news archive to active live news streaming with real-time per-segment hash verification during HLS playback.
* **Revocation Timeline Visual:** New `GET /api/upload/blockchain/revocation-timeline?id=xxx&kind=video|image` endpoint; new `RevocationTimeline.jsx` page at `/timeline/:kind/:id`; linked from every feed card and detail page.
* **Contract redeployed:** New canonical address `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9` on Sepolia; ABI bundle auto-exported to both backend and frontend.
* **Browser-side endorsement:** `wallet.js` calls `endorseSegment` / `endorseImage` directly via MetaMask using the ABI bundle; Broadcaster and Auditor can endorse without a backend wallet.
* **Merge conflicts resolved:** README cleaned; HEAD branch is authoritative; `image-forensics.service.js` and `forensics.service.js` are confirmed present in the HEAD branch services directory.

### v1 — Image Flow + Facebook Timeline (March 2026)
* **Full image upload pipeline:** IPFS-only, zero local persistence.
* **`image-forensics.service.js`:** AI-free image risk scoring (JPEG quant + EXIF).
* **Facebook-style feed:** Single-column timeline with mixed video + image posts.
* **`ImageDetail.jsx`:** Features 7-assertion C2PA display and forensic panel.
* **Unified API:** `/feed` endpoint and `sync-from-blockchain` covering both media kinds.
* **Smart contract extended:** Complete image entity added (`registerImage`, `endorseImage`, `reportImageTamper`, `revokeImage`, `verifyImage`).
* **Admin page:** Tabbed Video / Image upload with an animated pipeline visualizer.
