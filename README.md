# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming

> A research-based, tamper-resistant digital news platform integrating **Ethereum Blockchain**, **SHA-256 Chain Hashing**, and **HLS Streaming** to verify the authenticity of every video segment in real-time.

**Institution:** Ahsanullah University of Science and Technology (AUST)
**Program:** B.Sc. in Computer Science and Engineering
**Date:** February 2026

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

---

## Introduction

The rapid advancement of Generative AI and deepfakes has made it increasingly difficult to verify the credibility of digital news. While the Coalition for Content Provenance and Authenticity (C2PA) offers cryptographic standards, existing models are centralized and lack empirical validation for high-volume news streaming.

**TrustStream** addresses these gaps by:
- Moving away from centralized trust to a **multi-organization consortium** (NewsAgency, Broadcaster, Auditor)
- Integrating **Ethereum blockchain** to create an immutable record of media provenance
- Using **SHA-256 chain hashing** to link video segments — tampering any segment breaks the entire chain
- Providing **real-time dual verification** (Database + Blockchain) during video playback

---

## Research Gaps

| Gap | Description | How TrustStream Addresses It |
|-----|-------------|------------------------------|
| G1 | Lack of empirical validation for news processing workloads | Benchmarkable pipeline with PostgreSQL + Blockchain metrics |
| G2 | Centralized trust models incompatible with multi-org consortia | 3-org endorsement system (NewsAgency → Broadcaster → Auditor) |
| G3 | Verification latency as media volume increases | Browser-side hashing + async blockchain calls |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TrustStream                          │
├───────────────┬─────────────────────────┬───────────────────┤
│   Frontend    │        Backend          │    Blockchain     │
│  React.js     │   Node.js + Express     │  Hardhat + Solidity│
│  Tailwind CSS │   FFmpeg + SHA-256      │  3-Org Consortium  │
│  hls.js       │   PostgreSQL            │  Smart Contract    │
└───────┬───────┴──────────┬──────────────┴────────┬──────────┘
        │                  │                        │
        ▼                  ▼                        ▼
   Video Player      Segment Hashes          Immutable Ledger
   Hash Compute      Chain Linking           3-Org Endorsement
   Dual Verify       Audit Logging           Transaction Log
```

**Upload Flow:**
```
Admin uploads MP4
  → FFmpeg segments into 2s .ts chunks
  → SHA-256 hash per segment
  → Chain hash: SHA-256(currentHash + prevHash)
  → Save to PostgreSQL
  → Register on Blockchain (NewsAgency)
  → Endorse (Broadcaster + Auditor)
```

**Verification Flow:**
```
Browser downloads segment
  → Compute SHA-256 locally (Web Crypto API)
  → Compare with PostgreSQL hash  ✅/❌
  → Compare with Blockchain hash  ✅/❌
  → Show dual verification badge
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Tailwind CSS, hls.js, Web Crypto API |
| Backend | Node.js, Express.js, multer |
| Database | PostgreSQL |
| Video Processing | FFmpeg (HLS segmentation) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) |
| Blockchain | Hardhat, Solidity ^0.8.0, Web3.js |
| Smart Contract | TrustStream.sol (3-org endorsement system) |
| Streaming | HLS (HTTP Live Streaming) |

---

## Prerequisites

Make sure all of these are installed before running the project:

| Tool | Version | Download |
|------|---------|----------|
| Node.js | v22 LTS | https://nodejs.org |
| PostgreSQL | v14+ | https://www.postgresql.org/download/windows |
| FFmpeg | Latest | https://ffmpeg.org/download.html |
| Git | Latest | https://git-scm.com |

> ⚠️ **FFmpeg must be added to system PATH** for video segmentation to work.

---

## How to Run

> The project requires **4 terminals** running simultaneously. Follow the exact order below.

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/nahidhossain143/TrustStream.git
cd TrustStream
```

---

### Step 2 — PostgreSQL Setup

Open **pgAdmin** or psql and run:

```sql
CREATE DATABASE truststream;
```

Then apply the schema:

```bash
# Windows — add PostgreSQL to PATH first
set PATH=%PATH%;C:\Program Files\PostgreSQL\18\bin

psql -U postgres -h 127.0.0.1 -p 5432 -d truststream -f backend/src/config/schema.sql
```

---

### Step 3 — Configure Backend Database Password

Open `backend/src/config/db.js` and set your PostgreSQL password:

```js
const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'truststream',
  user: 'postgres',
  password: 'YOUR_POSTGRES_PASSWORD', // ← change this
});
```

---

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

# Blockchain
cd network
npm install
cd ..
```

---

### Step 5 — Run All Services

Open **4 separate terminals** and run each command in order:

#### 🔷 Terminal 1 — Hardhat Blockchain Node
```bash
cd TrustStream/network
npx hardhat node
```
✅ Expected output:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
...
```
> ⚠️ Keep this terminal running. Do NOT close it.

---

#### 🔷 Terminal 2 — Deploy Smart Contract
```bash
cd TrustStream/network
npx hardhat run scripts/deploy.js --network localhost
```
✅ Expected output:
```
🏢 Deploying with organizations:
  NewsAgency:   0xf39Fd6...
  Broadcaster:  0x70997...
  Auditor:      0x3C44C...

✅ TrustStream deployed to: 0x5FbDB...
📄 Deployment info saved to deployment.json
```
> ⚠️ Run this every time the Hardhat node restarts.

---

#### 🔷 Terminal 3 — Backend Server
```bash
cd TrustStream/backend
node src/server.js
```
✅ Expected output:
```
✅ Blockchain contract loaded: 0x5FbDB...
✅ PostgreSQL connected successfully
Server running on http://localhost:3001
```

---

#### 🔷 Terminal 4 — Frontend
```bash
cd TrustStream/frontend
npm run dev
```
✅ Expected output:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

### ✅ All services running checklist

| Service | URL | Status |
|---------|-----|--------|
| Hardhat Node | http://localhost:8545 | Terminal 1 |
| Smart Contract | deployed | Terminal 2 |
| Backend API | http://localhost:3001 | Terminal 3 |
| Frontend | http://localhost:5173 | Terminal 4 |

---

### ⚠️ Important Rules

1. **Always start Hardhat node FIRST** before backend
2. **Redeploy contract** every time Hardhat node restarts (blockchain data resets)
3. **Restart backend** after redeploying contract
4. **Upload new video** after each redeploy (old hashes are lost on node restart)
5. PostgreSQL data **persists** across restarts — no need to re-setup

---

## How to Use

### Upload News Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Enter a news title and optional description
3. Select an MP4 video file
4. Click **Upload & Generate Hashes**
5. Wait for processing — backend terminal will show:
   ```
   ⛓️  Segment 0: registered + endorsed by 3 orgs ✅
   ⛓️  Segment 1: registered + endorsed by 3 orgs ✅
   ...
   ```

### Watch & Verify (Home)
1. Go to `http://localhost:5173`
2. Select a video from the sidebar
3. As each segment plays, the browser computes its SHA-256 hash
4. Two verifications happen automatically:
   - 🗄️ **Database** — checks against PostgreSQL stored hash
   - ⛓️ **Blockchain** — checks against immutable ledger hash
5. Results shown:
   - 🛡️ **Authentic** — hash matches on both sources
   - ⚠️ **Tampered** — hash mismatch detected

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload video → segment → hash → store |
| `GET` | `/api/upload/videos` | List all uploaded videos |
| `GET` | `/api/upload/videos/:id/segments` | Get all segment hashes for a video |
| `POST` | `/api/upload/verify` | Verify segment hash (DB + Blockchain) |
| `GET` | `/api/upload/blockchain/endorsements/:videoId/:segmentIndex` | Get endorsement list for a segment |
| `GET` | `/api/upload/blockchain/txlogs` | Get recent blockchain transaction logs |

---

## Project Structure

```
TrustStream/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js              # PostgreSQL connection pool
│   │   │   └── schema.sql         # Database schema (3 tables)
│   │   ├── models/
│   │   │   └── video.model.js     # DB query functions
│   │   ├── routes/
│   │   │   └── upload.routes.js   # All API endpoints + blockchain
│   │   └── server.js              # Express server entry point
│   └── public/
│       ├── uploads/               # Temporary uploaded files
│       └── streams/               # Generated HLS segments (.ts files)
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Home.jsx           # Video player + verification UI
│       │   └── Admin.jsx          # Video upload panel
│       ├── components/
│       │   ├── VideoPlayer.jsx    # HLS player + browser hash compute
│       │   ├── VerificationBadge.jsx  # Dual verification badge UI
│       │   └── Navbar.jsx         # Navigation bar
│       ├── services/
│       │   └── api.js             # Axios API client
│       └── utils/
│           └── hash.js            # Browser SHA-256 (Web Crypto API)
│
├── network/
│   ├── contracts/
│   │   └── TrustStream.sol        # Smart contract (3-org endorsement)
│   ├── scripts/
│   │   └── deploy.js              # Deployment script
│   ├── deployment.json            # Generated after deploy (contract address)
│   └── hardhat.config.js          # Hardhat configuration
│
├── DEMO_GUIDE.md                  # Step-by-step demo instructions
└── README.md                      # This file
```

---

## Smart Contract Overview

The `TrustStream.sol` contract implements a **3-organization consortium endorsement system**:

| Organization | Role | Action |
|-------------|------|--------|
| NewsAgency (Org1) | Submitter | Registers segment hash on blockchain |
| Broadcaster (Org2) | Endorser | Endorses the registered hash |
| Auditor (Org3) | Endorser | Endorses and finalizes verification |
