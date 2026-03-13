# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming

> A research-based, tamper-resistant digital news platform integrating **Ethereum Blockchain (Sepolia Testnet)**, **IPFS (Pinata)**, **SHA-256 Chain Hashing**, and **HLS Streaming** to verify the authenticity of every video segment in near real-time.

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
- [Blockchain Info](#blockchain-info)
- [IPFS Info](#ipfs-info)

---

## Introduction

The rapid advancement of Generative AI and deepfakes has made it increasingly difficult to verify the credibility of digital news. While the Coalition for Content Provenance and Authenticity (C2PA) offers cryptographic standards, existing models are often centralized and difficult to validate under real streaming workloads.

**TrustStream** addresses these gaps by:
- Moving away from centralized trust to a **multi-organization consortium** (NewsAgency, Broadcaster, Auditor)
- Integrating **Ethereum Sepolia Testnet** to create an immutable, publicly verifiable record of media provenance
- Using **SHA-256 chain hashing** to link video segments so tampering with one segment breaks the chain
- Storing generated HLS segments and metadata on **IPFS via Pinata** for decentralized, content-addressed proof storage
- Using a **local manifest catalog** for fast indexing and immediate playback
- Providing **multi-layer verification** (Local manifest + Blockchain + IPFS proof visibility) during playback
- Supporting **MetaMask integration** for public on-chain inspection

---

## Research Gaps

| Gap | Description | How TrustStream Addresses It |
|-----|-------------|------------------------------|
| G1 | Lack of empirical validation for news processing workloads | Benchmarkable pipeline with FFmpeg, manifest indexing, IPFS, and blockchain proof |
| G2 | Centralized trust models incompatible with multi-org consortia | 3-org endorsement system (NewsAgency → Broadcaster → Auditor) |
| G3 | Verification latency as media volume increases | Browser-side hashing, background sync, and local HLS playback cache |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                              TrustStream                                 │
├───────────────┬──────────────────────────┬───────────────────────────────┤
│   Frontend    │         Backend          │      Decentralized Layers     │
│  React.js     │   Node.js + Express      │  Ethereum Sepolia Testnet     │
│  Tailwind CSS │   FFmpeg + SHA-256       │  IPFS via Pinata              │
│  hls.js       │   Local manifest catalog │  TrustStream.sol              │
│  MetaMask     │   Local HLS playback     │  3-Org Consortium             │
└───────┬───────┴──────────┬───────────────┴──────────────┬────────────────┘
        │                  │                               │
        ▼                  ▼                               ▼
   Video Player      Segment Hashes               Immutable Ledger
   Hash Compute      Chain Linking                3-Org Endorsement
   Local Verify      Catalog JSON                 IPFS Content CID
   MetaMask UI       /streams playback            Etherscan Public
```

**Upload Flow:**
```text
Admin uploads MP4
  → FFmpeg segments into 2s .ts chunks
  → SHA-256 hash per segment
  → Chain hash: SHA-256(currentHash + prevHash)
  → Write local manifest JSON in backend/data/catalog
  → Response sent immediately (video playable right away)
  → [Background]:
       → Upload each segment to IPFS via Pinata
       → Upload video metadata JSON to IPFS
       → Update manifest with CID/state
       → Register on Blockchain — NewsAgency (Sepolia)
       → Endorse — Broadcaster (Sepolia)
       → Endorse — Auditor (Sepolia)
```

**Verification Flow:**
```text
Browser downloads segment from local HLS stream
  → Compute SHA-256 locally (Web Crypto API)
  → Compare with manifest-stored hash     ✅/❌
  → Compare with blockchain hash          ✅/❌
  → Show IPFS CID + gateway link if synced
  → Show verification badge and endorsement count
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Tailwind CSS, hls.js, Web Crypto API |
| Backend | Node.js, Express.js, multer, axios |
| Index / Catalog | Local JSON manifest catalog (`backend/data/catalog`) |
| Video Processing | FFmpeg (HLS segmentation) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) |
| Decentralized Storage | IPFS via Pinata (segment pinning + metadata JSON) |
| Blockchain | Solidity ^0.8.0, Web3.js, Alchemy RPC |
| Smart Contract | TrustStream.sol (3-org endorsement system) |
| Testnet | Ethereum Sepolia |
| Wallet | MetaMask |
| Contract Deploy | Hardhat / Remix-compatible |
| Streaming | HLS (HTTP Live Streaming) with local `/streams` playback |

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
CONTRACT_ADDRESS=your_deployed_contract_address
PINATA_JWT=your_pinata_jwt
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
```

### Step 3 — Install Dependencies

```bash
# Backend
cd backend
npm install
cd ..

# Frontend
cd frontend
npm install
cd ..

# Network (only if you redeploy)
cd network
npm install
cd ..
```

### Step 4 — Run All Services

#### Terminal 1 — Backend

```bash
cd TrustStream/backend
node src/server.js
```

Expected output:

```text
✅ Blockchain contract loaded: 0x...
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
| Blockchain | Sepolia Testnet | Public |
| IPFS Storage | Pinata | Public |
| Local Playback Cache | `backend/public/streams` | Local |
| Local Catalog | `backend/data/catalog` | Local |

### Important Notes

1. Video becomes playable immediately after upload because local HLS files are generated before background sync finishes.
2. IPFS upload and blockchain endorsement continue in the background.
3. The active index is the local manifest catalog, not PostgreSQL.
4. The smart contract address is loaded from `network/deployment.json` and your env configuration.

---

## Optional — Redeploy Smart Contract

If you want a fresh Sepolia deployment:

### Step 1 — Configure `network/.env`

```env
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY=0xyour_newsagency_private_key
BROADCASTER_KEY=0xyour_broadcaster_private_key
AUDITOR_KEY=0xyour_auditor_private_key
```

### Step 2 — Deploy

```bash
cd network
npx hardhat run scripts/deploy.js --network sepolia
```

### Step 3 — Update `backend/.env`

```env
CONTRACT_ADDRESS=0xYourNewContractAddress
```

Then restart the backend.

---

## How to Use

### Upload News Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Enter a title and optional description
3. Select an MP4 file
4. Click **Upload & Generate Hashes**
5. Backend immediately creates local HLS output and returns success
6. Background logs will show IPFS and blockchain sync progress:

```text
📌 IPFS: seg_000.ts → bafy...
📌 Metadata CID: bafy...
⛓️ Video "title" registered on blockchain ✅
⛓️ Segment 0: registered + endorsed by 3 orgs ✅
```

### Watch & Verify (Home)
1. Go to `http://localhost:5173`
2. Connect MetaMask on Sepolia
3. Select a video
4. Playback happens from local `/streams/.../playlist.m3u8`
5. Browser computes SHA-256 per segment
6. Verification checks:
   - Manifest hash
   - Blockchain hash
   - IPFS CID visibility if sync completed

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload video, segment, hash, manifest write, background IPFS + blockchain sync |
| `GET` | `/api/upload/videos` | List all videos from local manifest catalog |
| `GET` | `/api/upload/videos/:videoId` | Get one manifest summary |
| `GET` | `/api/upload/videos/:videoId/segments` | Get segment hashes and CID state |
| `GET` | `/api/upload/ipfs/:videoId/:segmentIndex` | Get per-segment IPFS details |
| `GET` | `/api/upload/ipfs-playlist/:videoId` | Build IPFS-backed playlist from synced manifest |
| `POST` | `/api/upload/verify` | Verify segment hash against manifest and blockchain |
| `GET` | `/api/upload/blockchain/video/:videoId` | Get on-chain video metadata |
| `GET` | `/api/upload/blockchain/endorsements/:videoId/:segmentIndex` | Get endorsement list |
| `GET` | `/api/upload/blockchain/txlogs` | Get recent blockchain transaction logs |

---

## Project Structure

```text
TrustStream/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── blockchain.js
│   │   ├── services/
│   │   │   ├── blockchain.service.js
│   │   │   ├── catalog.service.js
│   │   │   └── ipfs.service.js
│   │   ├── routes/
│   │   │   ├── news.routes.js
│   │   │   └── upload.routes.js
│   │   └── server.js
│   ├── data/
│   │   └── catalog/                  # Local manifest JSON files
│   └── public/
│       ├── uploads/                  # Temporary uploaded files
│       └── streams/                  # Local HLS segments and playlists
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Home.jsx
│       │   └── Admin.jsx
│       ├── components/
│       │   ├── VideoPlayer.jsx
│       │   ├── VerificationBadge.jsx
│       │   └── Navbar.jsx
│       ├── services/
│       │   ├── api.js
│       │   └── wallet.js
│       └── utils/
│           └── hash.js
│
├── network/
│   ├── contracts/
│   │   └── TrustStream.sol
│   ├── scripts/
│   │   └── deploy.js
│   ├── deployment.json
│   └── hardhat.config.js
│
└── README.md
```

---

## Smart Contract Overview

The `TrustStream.sol` contract implements a 3-organization consortium endorsement system on Ethereum Sepolia:

| Organization | Role | Action |
|-------------|------|--------|
| NewsAgency | Submitter | Registers videos and segments |
| Broadcaster | Endorser | Endorses registered segments |
| Auditor | Endorser | Final endorsement and verification layer |

Minimum endorsements required: 2/3

---

## Blockchain Info

| Item | Value |
|------|-------|
| Network | Ethereum Sepolia Testnet |
| Contract Address | Loaded from your deployment |
| RPC Provider | Alchemy |
| Chain ID | 11155111 |

---

## IPFS Info

| Item | Value |
|------|-------|
| Pinning Service | Pinata |
| Gateway | [gateway.pinata.cloud/ipfs](https://gateway.pinata.cloud/ipfs) |
| Public Gateway | [ipfs.io/ipfs](https://ipfs.io/ipfs) |
| Content | Video segments (`.ts`) + metadata JSON |

---

## Storage Summary

TrustStream currently stores data in four places:

1. Local uploads: original uploaded files in `backend/public/uploads`
2. Local playback cache: generated HLS playlists and segments in `backend/public/streams`
3. Local manifest catalog: per-video JSON manifests in `backend/data/catalog`
4. Decentralized proof layers:
   - IPFS / Pinata for segment and metadata storage
   - Ethereum Sepolia for hashes, CIDs, and endorsements
