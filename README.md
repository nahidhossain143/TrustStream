# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming

> A research-based, tamper-resistant digital news platform integrating **Ethereum Blockchain (Sepolia Testnet)**, **SHA-256 Chain Hashing**, and **HLS Streaming** to verify the authenticity of every video segment in real-time.

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
- Providing **real-time dual verification** (Database + Blockchain) during video playback
- **MetaMask integration** — users can verify on-chain directly from the browser

---

## Research Gaps

| Gap | Description | How TrustStream Addresses It |
|-----|-------------|------------------------------|
| G1 | Lack of empirical validation for news processing workloads | Benchmarkable pipeline with PostgreSQL + Blockchain metrics |
| G2 | Centralized trust models incompatible with multi-org consortia | 3-org endorsement system (NewsAgency → Broadcaster → Auditor) |
| G3 | Verification latency as media volume increases | Browser-side hashing + async sequential blockchain calls |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          TrustStream                            │
├───────────────┬─────────────────────────┬───────────────────────┤
│   Frontend    │        Backend          │    Blockchain         │
│  React.js     │   Node.js + Express     │  Sepolia Testnet      │
│  Tailwind CSS │   FFmpeg + SHA-256      │  3-Org Consortium     │
│  hls.js       │   PostgreSQL (Neon)     │  TrustStream.sol      │
│  MetaMask     │   Web3.js               │  Remix Verified       │
└───────┬───────┴──────────┬──────────────┴────────┬──────────────┘
        │                  │                        │
        ▼                  ▼                        ▼
   Video Player      Segment Hashes          Immutable Ledger
   Hash Compute      Chain Linking           3-Org Endorsement
   Dual Verify       Audit Logging           Transaction Log
   MetaMask UI       Neon Cloud DB           Etherscan Public
```

**Upload Flow:**
```
Admin uploads MP4
  → FFmpeg segments into 2s .ts chunks
  → SHA-256 hash per segment
  → Chain hash: SHA-256(currentHash + prevHash)
  → Save to PostgreSQL (Neon Cloud)
  → Register on Blockchain — NewsAgency (Sepolia)
  → Endorse — Broadcaster (Sepolia)
  → Endorse — Auditor (Sepolia)
```

**Verification Flow:**
```
Browser downloads segment
  → Compute SHA-256 locally (Web Crypto API)
  → Compare with PostgreSQL hash  ✅/❌
  → Compare with Blockchain hash  ✅/❌
  → Show dual verification badge (DB + Blockchain 3/3 orgs)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Tailwind CSS, hls.js, Web Crypto API |
| Backend | Node.js, Express.js, multer |
| Database | PostgreSQL (Neon Cloud) |
| Video Processing | FFmpeg (HLS segmentation) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) |
| Blockchain | Solidity ^0.8.0, Web3.js, Alchemy RPC |
| Smart Contract | TrustStream.sol (3-org endorsement system) |
| Testnet | Ethereum Sepolia |
| Wallet | MetaMask |
| Contract Deploy | Remix IDE |
| Streaming | HLS (HTTP Live Streaming) |

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
```

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

---

### ⚠️ Important Notes

1. **No Hardhat node needed** — contract is deployed on Sepolia Testnet permanently
2. **No redeploy needed** — contract address is fixed: `0x79AC56F7dF74abD253E07c16CB3B29060B114BAd`
3. **Database is persistent** — Neon Cloud, no local setup needed
4. **MetaMask must be on Sepolia** to interact with the contract
5. Blockchain registration happens **in background** — video is immediately playable after upload

---

### 🔁 Optional — Redeploy Smart Contract (Advanced)

> Only needed if you want to deploy a **new contract** with different organization wallets.
> The current contract is already live on Sepolia — **skip this for normal usage**.

#### Step 1 — Configure network/.env

```env
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY=your_newsagency_private_key        # NewsAgency wallet
BROADCASTER_KEY=your_broadcaster_private_key   # Broadcaster wallet
AUDITOR_KEY=your_auditor_private_key           # Auditor wallet
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

#### Step 5 — Update backend/.env with new contract address

```env
CONTRACT_ADDRESS=0xNewContractAddress
```

Then restart the backend server:
```bash
cd backend
node src/server.js
```

---

## How to Use

### Upload News Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Enter a news title and optional description
3. Select an MP4 video file
4. Click **Upload & Generate Hashes**
5. Wait for processing — backend terminal will show:
   ```
   ⛓️  Starting blockchain registration...
   ⛓️  Video "title" registered on blockchain ✅
   ⛓️  Segment 0: registered + endorsed by 3 orgs ✅
   ⛓️  Segment 1: registered + endorsed by 3 orgs ✅
   ✅ All segments registered on blockchain
   ```

### Watch & Verify (Home)
1. Go to `http://localhost:5173`
2. Connect MetaMask wallet (Sepolia network)
3. Select a video from the sidebar
4. As each segment plays, the browser computes its SHA-256 hash
5. Two verifications happen automatically:
   - 🗄️ **Database** — checks against PostgreSQL stored hash
   - ⛓️ **Blockchain** — checks against Sepolia immutable ledger
6. Results shown:
   - 🛡️ **Authentic & Verified** — hash matches, 3/3 orgs endorsed
   - ⚠️ **Tampered** — hash mismatch detected
7. Click **Etherscan** to view contract on public explorer

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload video → segment → hash → store |
| `GET` | `/api/upload/videos` | List all uploaded videos |
| `GET` | `/api/upload/videos/:id/segments` | Get all segment hashes for a video |
| `POST` | `/api/upload/verify` | Verify segment hash (DB + Blockchain) |
| `GET` | `/api/upload/blockchain/video/:videoId` | Get on-chain video metadata |
| `GET` | `/api/upload/blockchain/endorsements/:videoId/:segmentIndex` | Get endorsement list for a segment |
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
│   │   │   └── schema.sql             # Database schema (3 tables)
│   │   ├── models/
│   │   │   └── video.model.js         # DB query functions
│   │   ├── services/
│   │   │   └── blockchain.service.js  # registerVideo, registerAndEndorse, verify
│   │   ├── routes/
│   │   │   └── upload.routes.js       # All API endpoints
│   │   └── server.js                  # Express server entry point
│   ├── .env                           # Environment variables (not committed)
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
