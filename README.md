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
└───────┬───────┴──────────┬───────────────┴──────────────┬────────────────────┘
        │                  │                               │
        ▼                  ▼                               ▼
   Video Player      Segment Hashes               Immutable Ledger
   SHA-256 Compute   Chain Linking                3-Org Endorsement
   C2PA Verify       C2PA Sidecar (.c2pa)         TX Receipt + Block
   MetaMask UI       Catalog JSON                 IPFS Content CID
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
| Theme | Dark / Light mode with ThemeContext |
| Index / Catalog | Local JSON manifest catalog (`backend/data/catalog`) |
| Video Processing | FFmpeg (HLS segmentation, 2s chunks) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) + Chain Hash |
| Provenance Standard | C2PA v2.2 (8 assertions, HMAC-SHA256 signing, sidecar .c2pa) |
| Decentralized Storage | IPFS via Pinata (segment pinning + metadata JSON) |
| Blockchain | Solidity ^0.8.0, Web3.js, Alchemy RPC |
| Smart Contract | TrustStream.sol (3-org endorsement system) |
| Testnet | Ethereum Sepolia |
| Wallet | MetaMask |
| Contract Deploy | Hardhat + Remix-compatible |
| TX Tracking | Receipt, block number, gas usage, Etherscan links |
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
NEWSAGENCY_ADDRESS=0xyour_newsagency_wallet_address
BROADCASTER_ADDRESS=0xyour_broadcaster_wallet_address
AUDITOR_ADDRESS=0xyour_auditor_wallet_address
CONTRACT_ADDRESS=your_deployed_contract_address
PINATA_JWT=your_pinata_jwt
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
```

### Step 3 — Configure Frontend Environment

Create `frontend/.env`:

```env
VITE_CONTRACT_ADDRESS=your_deployed_contract_address
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

# Network (only if you redeploy)
cd network
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
✅ Blockchain contract loaded: 0x...
Server running on http://localhost:3001
✅ PostgreSQL connected successfully
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
3. IPFS upload and blockchain endorsement continue in the background.
4. The active index is the local manifest catalog, not a database.
5. The smart contract address is loaded from `VITE_CONTRACT_ADDRESS` env and backend `.env`.
6. On a new machine, press **Sync from Blockchain** to restore all videos from Blockchain + IPFS.

---

## Optional — Redeploy Smart Contract

If you want a fresh Sepolia deployment with different wallets:

### Step 1 — Configure `network/.env`

```env
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY=0xyour_newsagency_private_key
BROADCASTER_KEY=0xyour_broadcaster_private_key
AUDITOR_KEY=0xyour_auditor_private_key
NEWSAGENCY_ADDRESS=0xYourNewsAgencyAddress
BROADCASTER_ADDRESS=0xYourBroadcasterAddress
AUDITOR_ADDRESS=0xYourAuditorAddress
```

### Step 2 — Deploy

```bash
cd network
npx hardhat run scripts/deploy.js --network sepolia
```

### Step 3 — Update `backend/.env` and `frontend/.env`

```env
CONTRACT_ADDRESS=0xNewContractAddress
VITE_CONTRACT_ADDRESS=0xNewContractAddress
```

Then restart the backend.

---

## How to Use

### Upload News Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Enter a title and optional description
3. Drag & drop or select an MP4 file
4. Click **Upload & Generate Hashes**
5. Backend immediately creates local HLS output and returns success
6. Background pipeline runs automatically:

```text
📋 C2PA: seg_000.c2pa signed (8 assertions) ✅
📋 C2PA: 141/141 segments signed ✅
📌 IPFS: seg_000.ts → bafy...
📌 Metadata CID: bafy...
⛓️ Video "title" registered on blockchain ✅
   📦 Block: 8234567 | Gas: 142000 | Tx: 0xabc123...
⛓️ Segment 0: registered + endorsed ✅ | Gas: 312000
✅ C2PA + IPFS + Blockchain complete | Total gas: 44823000
```

### Watch & Verify (Home)
1. Go to `http://localhost:5173`
2. Connect MetaMask on Sepolia (click **Connect Wallet**)
3. Select a video from the sidebar
4. Playback happens from local `/streams/.../playlist.m3u8`
5. Browser computes SHA-256 per segment automatically
6. Verification checks per segment:
   - 🧾 **Local Hash** — manifest stored hash
   - ⛓️ **Blockchain** — on-chain hash + endorsements
   - 📌 **IPFS** — CID availability
   - 📋 **C2PA** — manifest signature validity (8 assertions)
7. Click **Etherscan** to view contract on public explorer

### Restore from Blockchain (New Machine)
1. Go to `http://localhost:5173`
2. Press **Sync from Blockchain** in the sidebar
3. All videos are restored from Blockchain + IPFS automatically

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload video → segment → hash → C2PA sign → manifest → background IPFS + blockchain |
| `GET` | `/api/upload/videos` | List all videos from local manifest catalog |
| `GET` | `/api/upload/videos/:videoId` | Get one manifest summary |
| `GET` | `/api/upload/videos/:videoId/segments` | Get segment hashes, CIDs, C2PA, TX data |
| `GET` | `/api/upload/ipfs/:videoId/:segmentIndex` | Get per-segment IPFS details |
| `GET` | `/api/upload/ipfs-playlist/:videoId` | Build IPFS-backed playlist from synced manifest |
| `GET` | `/api/upload/c2pa/:videoId/:segmentIndex` | Get C2PA manifest + verify signature |
| `POST` | `/api/upload/verify` | Verify hash (manifest + blockchain + C2PA) |
| `POST` | `/api/upload/sync-from-blockchain` | Restore catalog from Blockchain + IPFS |
| `GET` | `/api/upload/blockchain/video/:videoId` | Get on-chain video metadata |
| `GET` | `/api/upload/blockchain/endorsements/:videoId/:segmentIndex` | Get endorsement list |
| `GET` | `/api/upload/blockchain/txlogs` | Get recent blockchain transaction logs |
| `GET` | `/api/upload/blockchain/receipt/:txHash` | Get full TX receipt |
| `GET` | `/api/upload/blockchain/network-status` | Get Sepolia network status |
| `GET` | `/api/upload/blockchain/wallet-balances` | Get 3 org wallet balances |
| `GET` | `/api/upload/blockchain/segment-tx/:videoId/:segmentIndex` | Get per-segment TX details |

---

## Project Structure

```text
TrustStream/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── blockchain.js              # Web3 + Contract ABI + Sepolia setup
│   │   ├── services/
│   │   │   ├── blockchain.service.js      # register, endorse, verify, receipt, balance
│   │   │   ├── catalog.service.js         # local manifest read/write/list
│   │   │   ├── c2pa.service.js            # C2PA manifest generate, sign, verify
│   │   │   └── ipfs.service.js            # Pinata upload, gateway, fetch
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
│       │   ├── Home.jsx                    # Video player + verification + MetaMask
│       │   └── Admin.jsx                   # Upload panel + pipeline UI
│       ├── components/
│       │   ├── VideoPlayer.jsx             # HLS player + browser SHA-256 + C2PA
│       │   ├── VerificationBadge.jsx       # Dual + C2PA verification badge UI
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
│   │   └── TrustStream.sol                # Smart contract (3-org endorsement)
│   ├── scripts/
│   │   └── deploy.js                      # Deployment script (Sepolia, reads .env)
│   ├── deployment.json                    # Contract address + org info
│   ├── hardhat.config.js                  # Hardhat + Sepolia + Alchemy config
│   └── .env                               # Network env variables (not committed)
│
└── README.md
```

---

## Smart Contract Overview

The `TrustStream.sol` contract implements a **3-organization consortium endorsement system** on Ethereum Sepolia:

| Organization | Role | Action |
|-------------|------|--------|
| NewsAgency (Org1) | Submitter | Registers video + segment hashes on blockchain |
| Broadcaster (Org2) | Endorser | Endorses registered hashes |
| Auditor (Org3) | Endorser | Final endorsement and verification layer |

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

## Blockchain Info

| Item | Value |
|------|-------|
| Network | Ethereum Sepolia Testnet |
| Chain ID | 11155111 |
| RPC Provider | Alchemy |
| Contract Address | Loaded from `CONTRACT_ADDRESS` env |
| Etherscan | https://sepolia.etherscan.io |
| TX Tracking | Receipt, block number, gas used per segment |
| Wallet Balance | Queryable via `/api/upload/blockchain/wallet-balances` |
| Network Status | Queryable via `/api/upload/blockchain/network-status` |

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

TrustStream stores data in multiple layers:

| Layer | Location | Persistent | Contents |
|-------|----------|-----------|----------|
| Local uploads | `backend/public/uploads` | ❌ Temp | Original MP4 (deleted after processing) |
| Local HLS cache | `backend/public/streams/<videoId>` | ✅ Local | `.ts` segments + `.c2pa` sidecar files + `playlist.m3u8` |
| Local catalog | `backend/data/catalog/<videoId>.json` | ✅ Local | Full manifest with hashes, CIDs, TX data |
| IPFS (Pinata) | Content-addressed | ✅ Permanent | `.ts` segments + metadata JSON |
| Ethereum Sepolia | Smart contract | ✅ Permanent | Hashes, CIDs, endorsements, TX logs |