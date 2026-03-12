# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming

> A research-based, tamper-resistant digital news platform integrating **Ethereum Blockchain (Sepolia Testnet)**, **IPFS (Pinata)**, **SHA-256 Chain Hashing**, and **HLS Streaming** to verify the authenticity of every video segment in real-time.

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

---

## Introduction

The rapid advancement of Generative AI and deepfakes has made it increasingly difficult to verify the credibility of digital news. While the Coalition for Content Provenance and Authenticity (C2PA) offers cryptographic standards, existing models are centralized and lack empirical validation for high-volume news streaming.

**TrustStream** addresses these gaps by:
- Moving away from centralized trust to a **multi-organization consortium** (NewsAgency, Broadcaster, Auditor)
- Integrating **Ethereum Sepolia Testnet** to create an immutable, publicly verifiable record of media provenance
- Using **SHA-256 chain hashing** to link video segments — tampering any segment breaks the entire chain
- Storing every generated video segment on **IPFS via Pinata** for decentralized, content-addressed proof storage
- Providing **real-time multi-layer verification** (Database + Blockchain + IPFS proof visibility) during video playback
- **MetaMask integration** — users can verify on-chain directly from the browser

---

## Research Gaps

| Gap | Description | How TrustStream Addresses It |
|-----|-------------|------------------------------|
| G1 | Lack of empirical validation for news processing workloads | Benchmarkable pipeline with PostgreSQL + Blockchain + IPFS metrics |
| G2 | Centralized trust models incompatible with multi-org consortia | 3-org endorsement system (NewsAgency → Broadcaster → Auditor) |
| G3 | Verification latency as media volume increases | Browser-side hashing + async sequential blockchain calls + local HLS fallback |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              TrustStream                                 │
├───────────────┬──────────────────────────┬───────────────────────────────┤
│   Frontend    │         Backend          │      Decentralized Layers     │
│  React.js     │   Node.js + Express      │  Ethereum Sepolia Testnet     │
│  Tailwind CSS │   FFmpeg + SHA-256       │  IPFS via Pinata              │
│  hls.js       │   PostgreSQL (Neon)      │  TrustStream.sol              │
│  MetaMask     │   Web3.js + Axios        │  3-Org Consortium             │
└───────┬───────┴──────────┬───────────────┴──────────────┬────────────────┘
        │                  │                               │
        ▼                  ▼                               ▼
   Video Player      Segment Hashes               Immutable Ledger
   Hash Compute      Chain Linking                3-Org Endorsement
   Triple Verify     Audit Logging                IPFS Content CID
   MetaMask UI       Neon Cloud DB                Etherscan Public
```

**Upload Flow:**
```
Admin uploads MP4
  → FFmpeg segments into 2s .ts chunks
  → SHA-256 hash per segment
  → Chain hash: SHA-256(currentHash + prevHash)
  → Save to PostgreSQL (Neon Cloud)
  → Response sent immediately ✅ (video playable right away)
  → [Background]:
       → Upload each segment to IPFS via Pinata → store CID in DB
       → Upload video metadata JSON to IPFS
       → Register on Blockchain — NewsAgency (Sepolia)
       → Endorse — Broadcaster (Sepolia)
       → Endorse — Auditor (Sepolia)
```

**Verification Flow:**
```
Browser downloads segment (local HLS stream)
  → Compute SHA-256 locally (Web Crypto API)
  → Compare with PostgreSQL hash       ✅/❌
  → Compare with Blockchain hash       ✅/❌
  → Show IPFS CID + Pinata gateway link ✅
  → Show dual verification badge (DB + Blockchain 3/3 orgs)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Tailwind CSS, hls.js, Web Crypto API |
| Backend | Node.js, Express.js, multer, axios |
| Database | PostgreSQL (Neon Cloud) |
| Video Processing | FFmpeg (HLS segmentation) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) |
| Decentralized Storage | IPFS via Pinata (segment pinning + metadata) |
| Blockchain | Solidity ^0.8.0, Web3.js, Alchemy RPC |
| Smart Contract | TrustStream.sol (3-org endorsement system) |
| Testnet | Ethereum Sepolia |
| Wallet | MetaMask |
| Contract Deploy | Remix IDE |
| Streaming | HLS (HTTP Live Streaming) — local server |

---

## Prerequisites

Make sure all of these are installed before running the project:

| Tool | Version | Download |
|------|---------|----------|
| Node.js | v22 LTS | https://nodejs.org |
| FFmpeg | Latest | https://ffmpeg.org/download.html |
| Git | Latest | https://git-scm.com |
| MetaMask | Latest | https://metamask.io |

> ⚠️ **FFmpeg must be added to system PATH** for video segmentation to work.

> ⚠️ **MetaMask must be installed** and connected to **Sepolia Testnet**.

---

## How to Run

> The project requires **2 terminals** running simultaneously.

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/nahidhossain143/TrustStream.git
cd TrustStream
```

---

### Step 2 — Configure Backend Environment

Create `backend/.env` file:

```env
DATABASE_URL=postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=verify-full
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY=your_newsagency_private_key
BROADCASTER_KEY=your_broadcaster_private_key
AUDITOR_KEY=your_auditor_private_key
CONTRACT_ADDRESS=0x79AC56F7dF74abD253E07c16CB3B29060B114BAd
PINATA_JWT=your_pinata_jwt_token
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
```

> 💡 **Pinata JWT** পেতে: [app.pinata.cloud/keys](https://app.pinata.cloud/keys) → New Key → `pinFileToIPFS` + `pinJSONToIPFS` permissions চালু করো → JWT copy করো।

---

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
```

---

### Step 4 — Run All Services

Open **2 separate terminals**:

#### 🔷 Terminal 1 — Backend Server
```bash
cd TrustStream/backend
node src/server.js
```
✅ Expected output:
```
✅ Blockchain contract loaded: 0x79AC56F7dF74abD253E07c16CB3B29060B114BAd
✅ PostgreSQL connected successfully
Server running on http://localhost:3001
```

---

#### 🔷 Terminal 2 — Frontend
```bash
cd TrustStream/frontend
npm run dev
```
✅ Expected output:
```
  VITE v7.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

### ✅ All services running checklist

| Service | URL | Status |
|---------|-----|--------|
| Backend API | http://localhost:3001 | Terminal 1 |
| Frontend | http://localhost:5173 | Terminal 2 |
| Blockchain | Sepolia Testnet (public) | Always live ✅ |
| Database | Neon Cloud (public) | Always live ✅ |
| IPFS Storage | Pinata (public) | Always live ✅ |

---

### ⚠️ Important Notes

1. **No Hardhat node needed** — contract is deployed on Sepolia Testnet permanently
2. **No redeploy needed** — contract address is fixed: `0x79AC56F7dF74abD253E07c16CB3B29060B114BAd`
3. **Database is persistent** — Neon Cloud, no local setup needed
4. **MetaMask must be on Sepolia** to interact with the contract
5. **Video plays immediately** after upload — IPFS pinning and blockchain endorsement run in background
6. **IPFS CID** appears in the verification panel after background pinning completes

---

### 🔁 Optional — Redeploy Smart Contract (Advanced)

> Only needed if you want to deploy a **new contract** with different organization wallets.
> The current contract is already live on Sepolia — **skip this for normal usage**.

#### Step 1 — Configure network/.env

```env
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY=your_newsagency_private_key
BROADCASTER_KEY=your_broadcaster_private_key
AUDITOR_KEY=your_auditor_private_key
```

#### Step 2 — Install network dependencies

```bash
cd network
npm install
```

#### Step 3 — Update deploy.js with your wallet addresses

Open `network/scripts/deploy.js` and update:

```js
const newsAgency  = "0xYourNewsAgencyAddress";
const broadcaster = "0xYourBroadcasterAddress";
const auditor     = "0xYourAuditorAddress";
```

#### Step 4 — Deploy to Sepolia

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

✅ Expected output:
```
🏢 Deploying with organizations:
  NewsAgency:   0xYourNewsAgencyAddress
  Broadcaster:  0xYourBroadcasterAddress
  Auditor:      0xYourAuditorAddress

✅ TrustStream deployed to: 0xNewContractAddress
📄 Deployment info saved to deployment.json
```

#### Step 5 — Update backend/.env

```env
CONTRACT_ADDRESS=0xNewContractAddress
```

Then restart the backend server.

---

## How to Use

### Upload News Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Enter a news title and optional description
3. Select an MP4 video file
4. Click **Upload & Generate Hashes**
5. Video is immediately playable. Backend terminal will show background progress:
   ```
   📌 Starting IPFS + blockchain registration for video xxx...
   📌 Video metadata CID: bafkrei...
   📌 IPFS: seg_000.ts → bafybei...
   📌 IPFS: seg_001.ts → bafybei...
   ⛓️  Segment 0: registered + endorsed by 3 orgs ✅
   ⛓️  Segment 1: registered + endorsed by 3 orgs ✅
   ✅ IPFS + blockchain complete for video xxx
   ```

### Watch & Verify (Home)
1. Go to `http://localhost:5173`
2. Connect MetaMask wallet (Sepolia network)
3. Select a video from the sidebar
4. As each segment plays, the browser computes its SHA-256 hash
5. Three verifications happen automatically:
   - 🗄️ **Database** — checks against PostgreSQL stored hash
   - ⛓️ **Blockchain** — checks against Sepolia immutable ledger (3/3 orgs)
   - 📌 **IPFS** — shows content-addressed CID with Pinata gateway link
6. Results shown:
   - 🛡️ **Authentic & Verified** — hash matches, 3/3 orgs endorsed
   - ⚠️ **Tampered** — hash mismatch detected
7. Click **Etherscan** to view contract on public explorer
8. Click **View ↗** on IPFS CID to access segment on Pinata gateway

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload video → segment → hash → store → IPFS + blockchain (background) |
| `GET` | `/api/upload/videos` | List all uploaded videos |
| `GET` | `/api/upload/videos/:id/segments` | Get all segment hashes + IPFS CIDs for a video |
| `GET` | `/api/upload/videos/:id/playlist` | Dynamic M3U8 playlist (local stream) |
| `GET` | `/api/upload/ipfs/:videoId/:segmentIndex` | Get IPFS CID + gateway URLs for a segment |
| `POST` | `/api/upload/verify` | Verify segment hash (DB + Blockchain), returns IPFS CID |
| `GET` | `/api/upload/blockchain/video/:videoId` | Get on-chain video metadata |
| `GET` | `/api/upload/blockchain/endorsements/:videoId/:segmentIndex` | Get endorsement list |
| `GET` | `/api/upload/blockchain/txlogs` | Get recent blockchain transaction logs |

---

## Project Structure

```
TrustStream/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                  # PostgreSQL (Neon Cloud) connection
│   │   │   ├── blockchain.js          # Web3 + Contract ABI + Sepolia setup
│   │   │   └── schema.sql             # Database schema (3 tables + ipfs_cid column)
│   │   ├── models/
│   │   │   └── video.model.js         # DB query functions (incl. updateSegmentIPFS)
│   │   ├── services/
│   │   │   ├── blockchain.service.js  # registerVideo, registerAndEndorse, verify
│   │   │   └── ipfs.service.js        # uploadSegmentToIPFS, uploadMetadataToIPFS
│   │   ├── routes/
│   │   │   └── upload.routes.js       # All API endpoints
│   │   └── server.js                  # Express server entry point
│   ├── .env                           # Environment variables (not committed)
│   ├── .env.example                   # Environment variable template
│   └── public/
│       ├── uploads/                   # Temporary uploaded files
│       └── streams/                   # Generated HLS segments (.ts files)
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Home.jsx               # Video player + MetaMask + verification UI
│       │   └── Admin.jsx              # Video upload panel
│       ├── components/
│       │   ├── VideoPlayer.jsx        # HLS player + browser hash compute
│       │   ├── VerificationBadge.jsx  # Dual verification badge UI
│       │   └── Navbar.jsx             # Navigation + MetaMask connect button
│       ├── services/
│       │   ├── api.js                 # Axios API client
│       │   └── wallet.js              # MetaMask wallet connect service
│       └── utils/
│           └── hash.js                # Browser SHA-256 (Web Crypto API)
│
├── network/
│   ├── contracts/
│   │   └── TrustStream.sol            # Smart contract (3-org endorsement)
│   ├── scripts/
│   │   └── deploy.js                  # Deployment script (Sepolia)
│   ├── deployment.json                # Contract address + org info
│   ├── hardhat.config.js              # Hardhat + Sepolia + Alchemy config
│   └── .env                           # Network env variables (not committed)
│
└── README.md                          # This file
```

---

## Smart Contract Overview

The `TrustStream.sol` contract implements a **3-organization consortium endorsement system** deployed on **Ethereum Sepolia Testnet**:

| Organization | Role | Wallet | Action |
|-------------|------|--------|--------|
| NewsAgency (Org1) | Submitter | `0x13EF...6A09` | Registers segment hash on blockchain |
| Broadcaster (Org2) | Endorser | `0x792C...5869` | Endorses the registered hash |
| Auditor (Org3) | Endorser | `0x91F8...4c11` | Endorses and finalizes verification |

**Minimum endorsements required:** 2/3

---

## System Architecture — 4-Layer Trust Model

```
┌─────────────────────────────────────────────────────────────┐
│                    TrustStream Trust Layers                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 1 — IPFS (Pinata)                                    │
│  Decentralized content-addressed storage                    │
│  Each segment pinned with immutable CID                     │
│  Publicly accessible via gateway                            │
├─────────────────────────────────────────────────────────────┤
│  Layer 2 — Ethereum Blockchain (Sepolia)                    │
│  Immutable cryptographic provenance                         │
│  SHA-256 hash + chain hash per segment                      │
│  3-org consortium endorsement                               │
├─────────────────────────────────────────────────────────────┤
│  Layer 3 — PostgreSQL (Neon Cloud)                          │
│  Fast indexing and retrieval                                │
│  Stores hashes + IPFS CIDs for quick lookup                 │
│  Source of truth reconstructible from blockchain            │
├─────────────────────────────────────────────────────────────┤
│  Layer 4 — Browser (Client-side)                            │
│  Independent SHA-256 verification via Web Crypto API        │
│  No trust in server — hash computed locally                 │
└─────────────────────────────────────────────────────────────┘
```

> **Design Note:** PostgreSQL serves as a lightweight indexing cache for query efficiency. The cryptographic source of truth is the Ethereum blockchain (hash integrity + endorsements) and IPFS (content storage). In principle, indexed records can be re-derived from blockchain events and IPFS content.

---

## Blockchain Info

| Item | Value |
|------|-------|
| Network | Ethereum Sepolia Testnet |
| Contract Address | `0x79AC56F7dF74abD253E07c16CB3B29060B114BAd` |
| Etherscan | [View Contract](https://sepolia.etherscan.io/address/0x79AC56F7dF74abD253E07c16CB3B29060B114BAd) |
| Blockscout | Verified ✅ |
| Sourcify | Verified ✅ |
| Deploy Tool | Remix IDE |
| RPC Provider | Alchemy |
| Chain ID | 11155111 |

## IPFS Info

| Item | Value |
|------|-------|
| Pinning Service | Pinata |
| Gateway | https://gateway.pinata.cloud/ipfs/ |
| Public IPFS Gateway | https://ipfs.io/ipfs/ |
| Dashboard | [app.pinata.cloud/files](https://app.pinata.cloud/files) |
| Content | Video segments (.ts) + metadata JSON per video |
