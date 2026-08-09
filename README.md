# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Live News Streaming (Video + Image)

> A research-based, tamper-resistant, **Facebook-style decentralized live news streaming platform** integrating **Ethereum Sepolia Testnet**, **Hyperledger Fabric (3-org consortium)**, **C2PA v2.2 Provenance Manifests**, **IPFS via Pinata**, **SHA-256 Chain Hashing**, **HLS Streaming**, and **AI-free forensic analysis** to verify the authenticity of every video segment AND every news image in near real-time.

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
- [How to Run — Windows](#how-to-run--windows)
- [How to Run — macOS](#how-to-run--macos)
- [Daily Startup (Both Platforms)](#daily-startup-both-platforms)
- [Hyperledger Fabric Network Topology](#hyperledger-fabric-network-topology)
- [Hyperledger Fabric Implementation Details](#hyperledger-fabric-implementation-details)
- [Fabric Chaincode Reference](#fabric-chaincode-reference)
- [Fabric Audit Dashboard (Live)](#fabric-audit-dashboard-live)
- [Upgrading the Chaincode](#upgrading-the-chaincode)
- [Fabric Troubleshooting](#fabric-troubleshooting)
- [How to Use](#how-to-use)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Smart Contract](#smart-contract-overview)
- [Redeploy the Smart Contract](#optional--redeploy-the-smart-contract)
- [C2PA Implementation](#c2pa-implementation)
- [Forensics (AI-Free)](#forensics-ai-free)
- [Forensic Analysis Modules](#forensic-analysis-modules)
- [Experimental Results](#experimental-results)
- [Revocation Timeline Visual](#revocation-timeline-visual)
- [Blockchain Info](#blockchain-info)
- [IPFS Info](#ipfs-info)
- [Storage Summary](#storage-summary)
- [Immutability Guarantees](#immutability-guarantees)
- [Design Decisions & Limitations](#design-decisions--limitations)
- [Git Push Notes](#git-push-notes)
- [What's New](#whats-new)

---

## Project Overview

TrustStream is a **full Facebook-style decentralized live news streaming platform** with end-to-end authentication pipelines for **both video and image** media, anchored on **two independent blockchains**:

- **Ethereum Sepolia** — a public, permissionless chain providing globally verifiable, censorship-resistant proof
- **Hyperledger Fabric** — a permissioned 3-organization consortium ledger providing fast, unanimous multi-party endorsement

Using both is deliberate. The public chain lets anyone in the world verify a claim without asking permission; the permissioned chain lets the news consortium itself reach agreement quickly and privately, without gas costs. Neither alone gives both properties.

### Smart Contract Layer (Ethereum)

`TrustStream.sol` covers both media kinds:

- `registerImage`, `endorseImage`, `reportImageTamper`, `revokeImage`, `verifyImage`, `getImage`, `getImageEndorsements`, `getImageStatus`
- Same 3-organization consortium model as the video flow (NewsAgency uploads, Broadcaster + Auditor endorse)
- A shared `MediaStatus` enum manages both videos and images
- Deployed to Sepolia Testnet at `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9`, verified on Sourcify
- **No `delete*` function anywhere — only `revoke*` (status flip)**, naturally enforcing the thesis core promise: *"uploaded content cannot be deleted"*

> **Deployment note:** The contract must be deployed from the `network/` folder using Hardhat before the frontend and backend will function. The deployed address is already wired into both `backend/src/config/TrustStream.abi.json` and `frontend/src/services/TrustStream.abi.json` via the auto-export in `deploy.js`.

### Permissioned Ledger Layer (Hyperledger Fabric)

A genuine 3-organization Fabric network, not a single-node stub:

- **3 organizations × 2 peers each = 6 peer nodes**, each with its own CA-issued X.509 identity
- **Unanimous endorsement policy** — `AND('Org1MSP.peer', 'Org2MSP.peer', 'Org3MSP.peer')`. A media proof cannot be committed unless a peer from *all three* organizations independently executes the chaincode and signs the result.
- **CouchDB state database**, enabling rich queries over the ledger's current state
- **Raft (etcdraft)** ordering service
- **Gossip leader election** enabled (`useLeaderElection: true`) — real dynamic election, not the static default
- **Chaincode events** pushed to the UI over Server-Sent Events, so the audit dashboard updates the moment a block commits
- **Ledger history** via `GetHistoryForKey` — every version a record has ever held, with the transaction that produced it

### Backend

- `blockchain.service.js` — Ethereum image + video methods (register, endorse, verify, tamper, revoke)
- `fabric.service.js` — connects to Fabric via Fabric Gateway + gRPC; submits proofs, verifies, revokes, reads history, runs rich queries, and maintains a long-lived chaincode event listener
- `c2pa.service.js` — image-variant manifest with **7 assertions** (no `chain_hash`, since images aren't segmented), signed in-memory and pinned to IPFS
- `ipfs.service.js` — `uploadImageToIPFS`, `uploadImageMetadataToIPFS`, `uploadImageC2paToIPFS`
- `catalog.service.js` — `kind: "video" | "image"` discriminator with backward-compat default
- `image-forensics.service.js` — AI-free image risk scoring via JPEG quantization table parsing + EXIF analysis

### Frontend

Facebook-style single-column feed, detail pages for both media kinds, the Revocation Timeline, and a **live Fabric Audit Dashboard** at `/fabric-audit`.

---

## Research Gaps

| Gap | Description | How TrustStream Addresses It |
|-----|-------------|------------------------------|
| G1 | Lack of empirical validation for news processing workloads | Benchmarkable pipeline with FFmpeg, manifest indexing, IPFS, dual-chain proof, and forensic risk scoring (gas + latency tracked end-to-end) |
| G2 | Centralized trust models incompatible with multi-org consortia | 3-org endorsement on **both** chains — 2-of-3 quorum on Ethereum, unanimous `AND(3)` on Fabric |
| G3 | Verification latency as media volume increases | Browser-side hashing, background sync, parallel batch IPFS, cached HLS playback, per-segment hash-on-load verification, push-based chaincode events instead of polling |
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
│  Tailwind 3   │   FFmpeg + SHA-256       │  Hyperledger Fabric (3 org)       │
│  hls.js       │   Local manifest catalog │  IPFS via Pinata                  │
│  React Router │   C2PA service           │  TrustStream.sol (video + image)  │
│  Dark/Light   │   Video / Image forensics│  truststreamcc chaincode          │
│  Clerk Auth   │   Fabric Gateway + gRPC  │  C2PA v2.2 Provenance             │
│  SSE listener │   Chaincode event stream │  Immutable status flip system     │
└───────┬───────┴──────────┬───────────────┴──────────────┬────────────────────┘
        │                  │                               │
        ▼                  ▼                               ▼
   FB-style feed     Segment Hashes               Immutable Ledgers
   Image lightbox    Image SHA-256                3-Org Endorsement (both)
   Video modal       Chain Linking                TX Receipt + Block (ETH)
   Fabric Audit      In-memory C2PA sign          Ledger History (Fabric)
   Live SSE updates  Catalog cache (rebuildable)  Tamper / Disputed / Revoked
   Revocation Timeline                            IPFS Content CID
```

### Video Upload Flow

```text
Admin uploads MP4 + (optional) thumbnail image
  → Thumbnail saved to /public/thumbnails/<videoId>.<ext>
  → FFmpeg segments MP4 into 2s .ts chunks
  → SHA-256 hash per segment
  → Chain hash: SHA-256(currentHash + prevHash)
  → AI-free video forensics (compression, temporal, AV sync, motion)
  → Write local manifest JSON in backend/data/catalog
  → Response sent immediately (video playable right away)
  → [Background]:
       → Generate C2PA manifest per segment (8 assertions, HMAC-SHA256 signed)
       → Save .c2pa sidecar file alongside each .ts segment
       → Upload each segment to IPFS via Pinata (parallel batches)
       → Upload forensic report JSON + video metadata JSON to IPFS
       → RegisterVideoProof on Hyperledger Fabric  ← needs all 3 orgs to endorse
       → Register on Ethereum Sepolia (NewsAgency) → TX receipt + block
       → Endorse — Broadcaster (Sepolia) → TX receipt + gas
       → Endorse — Auditor (Sepolia) → TX receipt + gas
```

### Image Upload Flow (IPFS-ONLY, zero local persistence)

```text
Admin uploads JPG / PNG / WebP
  → Multer saves to public/uploads/ TEMP DIR ONLY
  → SHA-256 hash directly from temp file
  → AI-free image forensics (JPEG quant tables + EXIF)
  → Write local manifest in data/catalog/images/ (cache index, NOT canonical bytes)
  → Response sent immediately
  → [Background]:
       → Generate C2PA image manifest (7 assertions) IN-MEMORY
       → Pin image bytes to IPFS                → ipfsCid
       → Pin C2PA sidecar JSON to IPFS          → c2paSidecarCid
       → Pin metadata JSON to IPFS
       → RegisterImageProof on Hyperledger Fabric  ← needs all 3 orgs to endorse
       → registerImage + 2 endorsements on Ethereum
       → UNCONDITIONALLY unlink the temp file
```

### Fabric Endorsement Flow (what "3-org consortium" actually means)

```text
Backend submits a proposal via Fabric Gateway
  → Gateway discovers which peers satisfy AND(Org1, Org2, Org3)
  → Sends the SAME proposal to a peer in each org (peer0 OR peer1 — chosen at runtime)
  → Each peer independently executes the chaincode against its own ledger copy
  → Each peer signs the result with its own X.509 identity
  → Backend decodes the raw protobuf endorsements to record WHICH physical peer signed
  → Orderer (Raft) sequences the transaction into a block
  → Every peer validates the endorsement policy (VSCC) before committing
       → 3 valid signatures  → block committed VALID
       → fewer than 3        → block committed but marked INVALID; state unchanged
  → Chaincode emits MediaRegistered → backend listener → SSE → dashboard updates live
```

### Verification Flow

```text
Video (during HLS playback — automatic, per segment):
  Browser downloads .ts segment via hls.js
    → Compute SHA-256 locally (Web Crypto API)
    → POST /api/upload/verify
    → Backend compares manifest hash + calls verifySegment(...) on Ethereum
    → Verify .c2pa sidecar HMAC signature
    → [If tampered]: pause, red overlay, report on-chain; 2 reports → Disputed

Fabric "Check Authenticity" (manual, on detail pages):
  → Backend re-hashes the local segments from disk and rebuilds the merkle root
  → Calls VerifyVideoProof / VerifyImageProof on the Fabric ledger
  → Returns { valid, hashMatches, revoked, proof }
       → hashMatches=false → the file was altered
       → revoked=true      → the file is intact but the consortium withdrew its endorsement
    These are reported separately because they are different failures.
```

### Sync / Recovery Flow

```text
New machine / fresh start
  → POST /api/upload/sync-from-blockchain
  → Read all TxLogs from Ethereum
  → For each video: getVideo() + per-segment data + fetchJsonFromIPFS(metadataCid)
  → For each image: getImage() + fetchJsonFromIPFS(metadataCid)
  → Rebuild local manifests for both kinds
  → Note: the Fabric ledger is NOT recovered this way — it lives in Docker volumes
    on the machine that ran the network. See "Design Decisions & Limitations".
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS 3, Vite 7, hls.js, react-router 7 |
| Auth | Clerk (Admin panel; can be bypassed for demos — see below) |
| Theme | Dark / Light mode via ThemeContext |
| Backend | Node.js, Express 5, multer, axios |
| Live updates | Server-Sent Events (EventSource) driven by Fabric chaincode events |
| Index / Catalog | Local JSON manifest catalog (videos + images) |
| Video Processing | FFmpeg (HLS segmentation, 2s chunks) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) + Chain Hash + Merkle root |
| Provenance Standard | C2PA v2.2 (8 video assertions, 7 image assertions, HMAC-SHA256) |
| Decentralized Storage | IPFS via Pinata |
| Forensics | AI-free — JPEG quantization, EXIF, temporal coherence, AV sync |
| Public Blockchain | Solidity ^0.8.0, Web3.js 4, Alchemy RPC, Ethereum Sepolia |
| Permissioned Ledger | Hyperledger Fabric 2.5.16, `truststreamcc` chaincode (JavaScript) |
| Fabric SDK | `@hyperledger/fabric-gateway`, `@grpc/grpc-js`, `@hyperledger/fabric-protos` |
| Fabric State DB | CouchDB (enables rich queries) |
| Fabric Consensus | Raft (etcdraft) |
| Wallet | MetaMask (browser-side endorsement via `wallet.js`) |
| Contract Deploy | Hardhat (auto-exports ABI bundle to backend + frontend) |
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
| WSL 2 + Ubuntu | Ubuntu 24.04 recommended | **Windows only** — Fabric scripts are bash |

> **Disk space:** the Fabric network plus Docker images needs roughly **10 GB free**. Running with a nearly-full disk causes Docker's VM filesystem to go read-only, which breaks the peers in confusing ways. Keep at least 15 GB free.

---

## How to Run — Windows

Fabric's own scripts (`network.sh`, `addOrg3.sh`) are bash scripts, so they must run inside WSL. Docker Desktop itself runs on Windows and is shared with WSL.

### Step 1 — Install WSL 2 + Ubuntu

Open **PowerShell as Administrator**:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart when prompted, then open Ubuntu from the Start menu and create your Linux username and password.

### Step 2 — Enable the WSL backend in Docker Desktop

Open Docker Desktop → **Settings**:

- **General** → tick **Use the WSL 2 based engine**
- **Resources → WSL Integration** → tick **Ubuntu-24.04**
- Click **Apply & Restart**

Verify from the Ubuntu terminal:

```bash
docker ps
```

If this prints a table (even an empty one), Docker and WSL are talking to each other.

### Step 3 — Clone the repository

In **Ubuntu (WSL)**:

```bash
cd ~
git clone https://github.com/nahidhossain143/TrustStream.git
cd TrustStream
```

> Clone into the **Linux filesystem** (`~/`), not `/mnt/c/...`. Running Node and Docker across the Windows/Linux filesystem boundary is dramatically slower and causes file-watching problems in Vite.

### Step 4 — Install Node.js inside WSL

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg
node -v && ffmpeg -version | head -1
```

### Step 5 — Install Hyperledger Fabric

```bash
mkdir -p ~/fabric-project && cd ~/fabric-project
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.16 docker samples binary
```

This downloads the Fabric binaries (`peer`, `orderer`, `configtxgen`, …), the sample networks, and the Docker images.

### Step 6 — Copy the chaincode into fabric-samples

The chaincode lives in this repository, but Fabric expects it under `fabric-samples`:

```bash
mkdir -p ~/fabric-project/fabric-samples/chaincode/truststream
cp -r ~/TrustStream/network/chaincode/truststream/javascript \
      ~/fabric-project/fabric-samples/chaincode/truststream/
```

### Step 7 — Bring up the 3-org network

```bash
cd ~/fabric-project/fabric-samples/test-network

# Org1 + Org2, with CA-based identities and CouchDB
./network.sh up createChannel -c mychannel -ca -s couchdb

# Add Org3 (Auditor)
cd addOrg3
./addOrg3.sh up -c mychannel -ca -s couchdb
cd ..
```

### Step 8 — Deploy the chaincode with the unanimous policy

The default `deployCC` uses a majority policy. TrustStream requires **unanimous** endorsement, so pass the signature policy explicitly:

```bash
./network.sh deployCC \
  -ccn truststreamcc \
  -ccp ../chaincode/truststream/javascript \
  -ccl javascript \
  -ccep "AND('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')"
```

Verify:

```bash
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
source scripts/envVar.sh
setGlobals 1
peer lifecycle chaincode querycommitted -C mychannel -n truststreamcc
```

Expected:

```text
Version: 1.3, Sequence: 3, Endorsement Plugin: escc, Validation Plugin: vscc,
Approvals: [Org1MSP: true, Org2MSP: true, Org3MSP: true]
```

### Step 9 — Configure the backend

Create `~/TrustStream/backend/.env`:

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

FABRIC_ENABLED=true
FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL_NAME=mychannel
FABRIC_CHAINCODE_NAME=truststreamcc
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com

# Replace YOUR_UBUNTU_USERNAME with the output of `whoami`
FABRIC_TLS_CERT_PATH=/home/YOUR_UBUNTU_USERNAME/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
FABRIC_CERT_PATH=/home/YOUR_UBUNTU_USERNAME/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/cert.pem
FABRIC_KEY_DIR=/home/YOUR_UBUNTU_USERNAME/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore
```

> **Use Linux paths (`/home/...`), never Windows paths (`\\wsl.localhost\...`).** Since the backend runs inside WSL, a `\\wsl.localhost\...` path produces `ENOENT ... ca.crt` and the Fabric registration silently degrades. This was a real bug in earlier runs.
>
> `CONTRACT_ADDRESS` is **not** required — the backend reads it from the auto-exported ABI bundle. If set and it disagrees, the bundle wins and a warning is logged.

### Step 10 — Configure the frontend

Create `~/TrustStream/frontend/.env`:

```env
VITE_CONTRACT_ADDRESS=0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9
VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:3001
VITE_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs

# Set to "true" to require Clerk sign-in on /admin.
# Left unset (or false), /admin opens directly — convenient for demos.
VITE_REQUIRE_ADMIN_AUTH=false
```

### Step 11 — Install dependencies

```bash
cd ~/TrustStream
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
cd network  && npm install && cd ..
```

### Step 12 — Run

**Terminal 1 — backend:**

```bash
cd ~/TrustStream/backend && node src/server.js
```

Expected:

```text
[blockchain] Contract loaded: 0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9
[blockchain] Network: sepolia (chainId: 11155111)
Server running on port 3001
[fabric] chaincode event listener started
```

**Terminal 2 — frontend:**

```bash
cd ~/TrustStream/frontend && npm run dev
```

Open **http://localhost:5173** in Windows Chrome — WSL forwards localhost automatically.

---

## How to Run — macOS

macOS needs no WSL; Docker Desktop and the terminal are enough.

### First-time setup

```bash
# 1. Fabric
mkdir -p ~/fabric-project && cd ~/fabric-project
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.16 docker samples binary

# 2. Chaincode into fabric-samples
mkdir -p ~/fabric-project/fabric-samples/chaincode/truststream
cp -r ~/NewProject/TrustStream/network/chaincode/truststream/javascript \
      ~/fabric-project/fabric-samples/chaincode/truststream/

# 3. Network
cd ~/fabric-project/fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca -s couchdb
cd addOrg3 && ./addOrg3.sh up -c mychannel -ca -s couchdb && cd ..

# 4. Chaincode with the unanimous policy
./network.sh deployCC -ccn truststreamcc \
  -ccp ../chaincode/truststream/javascript -ccl javascript \
  -ccep "AND('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')"
```

`.env` files are identical to Windows except the Fabric paths use `/Users/YOUR_MAC_USERNAME/...` instead of `/home/YOUR_UBUNTU_USERNAME/...`.

### Adding the second peer per organization (optional but recommended)

The stock test-network gives each org one peer. TrustStream runs **two per org** for fault tolerance. The helper script in `fabric-samples/test-network` registers the `peer1` identities against each CA, starts the containers, joins them to the channel, and installs the chaincode:

```bash
./start-truststream-network.sh
```

> ⚠️ This script tears the network **down** first and rebuilds it from scratch — every existing ledger record is lost. Use it for a fresh setup, never to restart an existing network.

---

## Daily Startup (Both Platforms)

The Fabric containers are configured with `restart: unless-stopped`, so **starting Docker Desktop brings all 17 containers back automatically.** No `docker start` needed.

```text
1. Open Docker Desktop, wait until it reports "running"
2. Terminal 1:  cd <repo>/backend  && node src/server.js
3. Terminal 2:  cd <repo>/frontend && npm run dev
4. Open http://localhost:5173
```

Confirm Fabric is healthy:

```bash
docker ps --format "{{.Names}}" | grep -c -E "peer|orderer|couch|ca_"
```

Expected: **17** (6 peers + 1 orderer + 4 CAs + 6 CouchDB).

If containers are stopped for any reason:

```bash
docker start orderer.example.com ca_org1 ca_org2 ca_org3 ca_orderer \
  couchdb0 couchdb1 couchdb2 couchdb3 couchdb4 couchdb5 \
  peer0.org1.example.com peer1.org1.example.com \
  peer0.org2.example.com peer1.org2.example.com \
  peer0.org3.example.com peer1.org3.example.com
```

### Running Services Checklist

| Service | URL / Location | Where |
|---------|----------------|-------|
| Backend API | http://localhost:3001 | Terminal 1 |
| Frontend | http://localhost:5173 | Terminal 2 |
| Fabric Audit Dashboard | http://localhost:5173/fabric-audit | Browser |
| Admin upload | http://localhost:5173/admin | Browser |
| Hyperledger Fabric | 17 Docker containers | `docker ps` |
| Ethereum | Sepolia Testnet | Always live |
| IPFS | Pinata | Always live |

---

## Hyperledger Fabric Network Topology

```text
                          ┌──────────────────────┐
                          │  orderer.example.com │   Raft (etcdraft)
                          │       :7050          │   sequences all blocks
                          └──────────┬───────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
┌───────┴────────┐          ┌────────┴───────┐          ┌─────────┴──────┐
│ Org1MSP        │          │ Org2MSP        │          │ Org3MSP        │
│ NewsAgency     │          │ Broadcaster    │          │ Auditor        │
│                │          │                │          │                │
│ peer0  :7051 ★ │          │ peer0  :9051 ★ │          │ peer0  :11051 ★│
│ peer1  :8051   │          │ peer1  :10051  │          │ peer1  :12051  │
│ ca_org1 :7054  │          │ ca_org2 :8054  │          │ ca_org3 :11054 │
│ couchdb0/1     │          │ couchdb2/3     │          │ couchdb4/5     │
└────────────────┘          └────────────────┘          └────────────────┘
                     ★ = anchor peer (cross-org discovery)

Channel: mychannel     Chaincode: truststreamcc v1.3 (sequence 3)
Endorsement policy: AND('Org1MSP.peer', 'Org2MSP.peer', 'Org3MSP.peer')
```

### Why two peers per organization

Redundancy is not decorative here. If `peer0.org2` goes down, Fabric Gateway's discovery automatically routes the endorsement to `peer1.org2`, and the unanimous policy is still satisfied — the upload succeeds without any code change or manual intervention. This was verified by stopping `peer0.org2` mid-run and confirming the endorsement moved to `peer1.org2`.

The dashboard shows which physical peer signed for each organization on every transaction. That value is **not hardcoded** — it is decoded from the raw protobuf endorsement signatures (see below), so it genuinely varies from one transaction to the next.

### Policy layers

Access control is enforced at three distinct levels, and it is worth keeping them apart:

| Level | Policy | Effect |
|-------|--------|--------|
| Organization (Signature) | `Readers/Writers: OR('OrgNMSP.member')`, `Admins: OR('OrgNMSP.admin')` | Who counts as a member/admin *within* an org |
| Channel (ImplicitMeta) | `Readers: ANY`, `Writers: ANY`, `Admins: MAJORITY`, `LifecycleEndorsement: MAJORITY` | How org-level decisions combine into channel decisions |
| Chaincode (Signature) | `AND('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')` | **The core rule** — all three orgs must sign before a write commits |

> **An important distinction:** the endorsement policy guarantees that all three orgs' peers *executed the same code and agreed on the result*. It is **not** a human approval workflow. Authorization about *who may call what* is a separate concern, handled in chaincode logic. See [Design Decisions & Limitations](#design-decisions--limitations).

---

## Hyperledger Fabric Implementation Details

### Backend packages

```bash
npm install @hyperledger/fabric-gateway @grpc/grpc-js @hyperledger/fabric-protos
```

### `fabric.service.js` — what it does

```text
Read TLS certificate
  → Create gRPC connection to peer0.org1.example.com:7051
  → Read Org1 Admin certificate + private key from the MSP keystore
  → Connect to channel mychannel, get contract truststreamcc
  → newProposal() → endorse() → decode endorsements → submit() → getStatus()
  → Return the chaincode result, enriched with which peer endorsed for each org
```

### Identifying the endorsing peer (protobuf decoding)

Fabric does not expose "which peer signed this" through the high-level SDK. TrustStream recovers it by decoding the raw transaction envelope:

```text
gateway.PreparedTransaction
  → common.Envelope → common.Payload → peer.Transaction
  → peer.ChaincodeActionPayload → ChaincodeEndorsedAction.getEndorsementsList()
  → each peer.Endorsement.getEndorser() is a serialized msp.SerializedIdentity
  → parse the embedded X.509 certificate → read CN (peer0 / peer1) and MSP ID
```

Result, per transaction:

```json
{
  "NewsAgency":  "peer0.org1.example.com",
  "Broadcaster": "peer1.org2.example.com",
  "Auditor":     "peer0.org3.example.com"
}
```

This is what makes the "via peer0 / via peer1" labels in the dashboard real evidence rather than decoration.

### Chaincode events → live UI

```text
Chaincode calls ctx.stub.setEvent("MediaRegistered", {...})
  → Event is delivered only AFTER the block commits, so receiving it proves
    all three orgs endorsed and the write is final
  → Backend keeps ONE long-lived listener (network.getChaincodeEvents), which
    reconnects automatically if a peer restarts
  → Backend re-broadcasts to browsers over SSE at /api/upload/blockchain/fabric-events
  → FabricAudit.jsx subscribes with EventSource and refreshes on each event
```

SSE was chosen over WebSockets because the traffic is one-way and `EventSource` reconnects on its own if the backend restarts.

### Backend files

| File | Purpose |
|------|---------|
| `backend/src/services/fabric.service.js` | Gateway connection, submit/evaluate, protobuf endorsement decoding, event listener |
| `backend/src/services/merkle.service.js` | Merkle root / proof data for video anchoring |
| `backend/src/routes/upload.routes.js` | Fabric verify, revoke, audit, history, query, and SSE endpoints |
| `backend/src/server.js` | Starts the Fabric event listener at boot |

### Frontend files

| File | Purpose |
|------|---------|
| `frontend/src/pages/FabricAudit.jsx` | Live audit dashboard at `/fabric-audit` |
| `frontend/src/pages/VideoDetail.jsx` | Fabric proof card, Check Authenticity, ledger history |
| `frontend/src/pages/Imagedetail.jsx` | Same, for images |

---

## Fabric Chaincode Reference

`truststreamcc` — **13 functions**, JavaScript (`fabric-contract-api`).

### Write functions (require unanimous endorsement)

| Function | Purpose |
|----------|---------|
| `RegisterVideoProof(videoId, title, metadataCid, merkleRoot, totalSegments)` | Anchors a video proof; emits `MediaRegistered` |
| `RegisterImageProof(imageId, title, sha256Hash, ipfsCid, metadataCid, c2paHash)` | Anchors an image proof; emits `MediaRegistered` |
| `RevokeMedia(mediaType, mediaId, reason)` | Withdraws the consortium's endorsement; emits `MediaRevoked`. The original record is **not** deleted — the revocation is written on top of it |
| `EndorseMedia(mediaType, mediaId)` | Marks an additional org endorsement (kept for completeness) |

### Read functions (evaluated, no ordering)

| Function | Purpose |
|----------|---------|
| `GetMediaProof(mediaType, mediaId)` | Current state of one record |
| `GetMediaHistory(mediaType, mediaId)` | **Every version** this key has held, each with its transaction ID and timestamp |
| `VerifyVideoProof(videoId, merkleRoot)` | Returns `{ valid, hashMatches, revoked, proof }` |
| `VerifyImageProof(imageId, sha256Hash)` | Same, for images |
| `QueryMedia(queryString)` | Raw CouchDB Mango query |
| `QueryByOrg(mspId)` | Everything a given organization registered |
| `QueryByMediaType(mediaType)` | All videos, or all images |
| `QueryRevoked()` | Everything the consortium has revoked |
| `InitLedger()` | Callable, but no init is required (`--init-required` is not used) |

> Rich queries run against CouchDB and are **evaluated only, never submitted** — query results are not guaranteed identical across peers, so using one in a write transaction would break endorsement.

### What gets stored

```jsonc
{
  "docType": "mediaProof",
  "mediaType": "video",              // or "image"
  "mediaId": "...",
  "title": "...",
  "merkleRoot": "0x...",             // video
  "sha256Hash": "...",               // image
  "ipfsCid": "...", "metadataCid": "...", "c2paHash": "...",
  "totalSegments": 3,
  "endorsements": { "NewsAgency": true, "Broadcaster": true, "Auditor": true },
  "createdBy": "Org1MSP",
  "createdAt": "...", "updatedAt": "...",

  // present only after RevokeMedia
  "status": "revoked",
  "revokedBy": "Org2MSP", "revokedByOrg": "Broadcaster",
  "revocationReason": "...", "revokedAt": "..."
}
```

### Verified behaviour

A record registered by NewsAgency and later revoked returns **two versions** from `GetMediaHistory`, each with its own transaction ID:

```text
2026-08-07T09:58:26Z  status=revoked   tx 375546725bad4d7d…  "Forensic analysis found manipulated frames"
2026-08-06T21:57:20Z  status=active    tx 409a60233621f30c…
```

The original "authentic" state is still in the ledger. Nothing was overwritten out of existence — which is exactly the immutability claim this project makes.

---

## Fabric Audit Dashboard (Live)

`http://localhost:5173/fabric-audit`

A browsable view of everything the consortium has committed to `mychannel`, since Fabric — being permissioned — has no public block explorer like Etherscan.

**Shows:**

- Summary tiles: Total Records · Committed · Revoked · Degraded
- Filter pills: all / ready / revoked / degraded / skipped
- Per record: media kind, status, title, timestamp, submitting org, proof hash
- **Per-organization endorsement with the physical peer that signed** (`via peer0` / `via peer1`)
- Revoked records styled in red with the reason and timestamp
- A green **Live** badge when the SSE stream is connected

**Live behaviour:** with the dashboard open on one screen and an upload running on another, the new row appears **the moment its block commits** — no refresh, no polling — carrying a "Just committed" highlight that fades after 15 seconds.

Reachable from the **Fabric Audit** button next to **View Audit Trail** on every video and image detail page.

---

## Upgrading the Chaincode

Changing chaincode requires a full lifecycle round: package → install on all 6 peers → approve by all 3 orgs → commit. A helper script in `fabric-samples/test-network` does all of it:

```bash
./upgrade-truststream-cc.sh 1.4 4      # <version> <sequence>
```

Always increment **both** the version and the sequence. Existing ledger records survive an upgrade untouched.

> The peer builds a Node image on first install, which routinely takes longer than the CLI's 3-second default connection timeout. The script passes `--connTimeout 300s` and treats an "already successfully installed" reply on retry as success — a timeout here is not a failure.

---

## Fabric Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ENOENT ... wsl.localhost ... ca.crt` | Windows-style path in `.env` while the backend runs in WSL/macOS | Use `/home/...` (WSL) or `/Users/...` (Mac) paths |
| `Cannot find module '@grpc/grpc-js'` | Fabric SDK not installed | `npm install @hyperledger/fabric-gateway @grpc/grpc-js @hyperledger/fabric-protos` in `backend/` |
| `read-only file system` on every peer | **Host disk full** — Docker's VM remounted read-only to protect itself | Free disk space, then **restart Docker Desktop** (the VM does not remount read-write on its own) |
| `No DB shards could be opened` (CouchDB) | Same root cause as above | Same fix |
| `keepalive ping failed to receive ACK` during install | Node chaincode image build outran the CLI timeout | Harmless — the install usually completed. Re-run with `--connTimeout 300s` |
| `fork: Resource temporarily unavailable` | Host ran out of process slots | Close unused apps; restart the machine if it persists |
| Frontend shows `Fabric Status: registering` | Page opened before the background pipeline finished | Refresh after a few seconds |
| `Media proof does not exist` | Wrong media ID, or the record was never committed | Verify the ID; check `docker logs peer0.org1.example.com` |
| Dashboard shows `via ?` on older records | Those predate the endorsing-peer tracking feature | Expected for legacy records; new uploads show real peer names |

### Useful checks

```bash
# Committed chaincode definition
peer lifecycle chaincode querycommitted -C mychannel -n truststreamcc

# Gossip leader election evidence
docker logs peer0.org2.example.com | grep -E "Becoming a leader|Stopped being a leader"

# System chaincode (proves the peer is serving queries)
peer chaincode query -C mychannel -n qscc -c '{"Args":["GetChainInfo","mychannel"]}' --hex

# Read one record
peer chaincode query -C mychannel -n truststreamcc \
  -c '{"function":"GetMediaProof","Args":["video","VIDEO_ID"]}'
```

---

## How to Use

### Upload a Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Switch to the **Video Upload** tab
3. Enter a title and optional description
4. Drag & drop or pick an MP4 file
5. (Optional) Add a thumbnail image — becomes the video's poster
6. Click **Upload & Generate Hashes**
7. Pipeline panel updates in real time (8 steps): Upload → FFmpeg → Hash → Forensics → C2PA → IPFS → Blockchain → **Fabric**

### Upload an Image (Admin)
1. Same page, **Image Upload** tab
2. Title + optional description, then pick a JPG / PNG / WebP (max 20 MB)
3. Click **Upload & Authenticate Image**
4. Pipeline panel (7 steps): Upload → Hash → C2PA → IPFS → Blockchain → **Fabric**
5. The temp local file is unconditionally deleted — only IPFS + the two chains hold canonical content

### Browse the Feed (Home)
Single-column Facebook-style timeline, newest first. Sticky filter bar: All / Video / Image. Click a video for a fullscreen player that verifies each segment as it plays; click an image for an IPFS-served lightbox.

### Check Authenticity (Fabric)
On any detail page, click **🔎 Check Authenticity**. The backend re-hashes the local content, rebuilds the merkle root, and compares it against the Fabric ledger. The result distinguishes two different failures:

- `hashMatches: false` → the file itself was altered
- `revoked: true` → the file is intact, but the consortium withdrew its endorsement

### View Ledger History (Fabric)
Click **📜 Show ledger history** to see every version of the record straight from Fabric's history index, each with its transaction ID — including the original registration of a record that was later revoked.

### Revoke
`POST /api/upload/:videoId/revoke` (or `/images/:imageId/revoke`) with `{ "reason": "..." }` withdraws the endorsement on **both chains at once**. Neither chain deletes anything; both record who revoked and why.

### View Revocation Timeline
Click **View Timeline** on any card, or go to `/timeline/video/:id`.

### Restore from Blockchain
`POST /api/upload/sync-from-blockchain` rebuilds the local catalog for both media kinds from Ethereum TxLogs + IPFS metadata.

---

## API Reference

### Video

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload MP4 + optional thumbnail → full pipeline |
| `GET` | `/api/upload/videos` | List all videos |
| `GET` | `/api/upload/videos/:videoId` | One video's full summary |
| `GET` | `/api/upload/videos/:videoId/segments` | Per-segment hashes, CIDs, C2PA, TX data |
| `GET` | `/api/upload/videos/:videoId/forensics` | Forensic report |
| `GET` | `/api/upload/c2pa/:videoId/:segmentIndex` | C2PA sidecar verification |
| `POST` | `/api/upload/verify` | Verify segment hash (manifest + chain + C2PA) |
| `POST` | `/api/upload/:videoId/verify-fabric` | **Fabric** Check Authenticity |
| `POST` | `/api/upload/:videoId/revoke` | **Revoke on both chains** |
| `POST` | `/api/upload/report-tamper` | Report tampered segment on-chain |

### Image

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload/image` | Upload image → full pipeline |
| `GET` | `/api/upload/images` | List all images |
| `GET` | `/api/upload/images/:imageId` | One image's full summary |
| `GET` | `/api/upload/images/:imageId/c2pa` | Verify C2PA sidecar (fetched from IPFS) |
| `POST` | `/api/upload/images/verify` | Verify image hash |
| `POST` | `/api/upload/images/:imageId/verify-fabric` | **Fabric** Check Authenticity |
| `POST` | `/api/upload/images/:imageId/revoke` | **Revoke on both chains** |
| `POST` | `/api/upload/images/report-tamper` | Report tampered image on-chain |

### Hyperledger Fabric

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/upload/blockchain/fabric-audit` | All Fabric records with per-org, per-peer endorsements |
| `GET` | `/api/upload/blockchain/fabric-events` | **SSE stream** of `MediaRegistered` / `MediaRevoked` |
| `GET` | `/api/upload/blockchain/fabric-history/:kind/:id` | Full ledger history of one record |
| `GET` | `/api/upload/blockchain/fabric-query` | Rich query — `?by=org&value=Org2MSP`, `?by=type&value=video`, `?by=revoked` |

### Unified Feed + Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/upload/feed` | Mixed video + image feed (newest-first) |
| `POST` | `/api/upload/sync-from-blockchain` | Restore both kinds from Ethereum + IPFS |

### Ethereum Helpers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/upload/blockchain/video/:videoId` | On-chain video record |
| `GET` | `/api/upload/blockchain/image/:imageId` | On-chain image record |
| `GET` | `/api/upload/blockchain/endorsements/:videoId/:segmentIndex` | Segment endorsements |
| `GET` | `/api/upload/blockchain/segment-tx/:videoId/:segmentIndex` | Per-segment TX details |
| `GET` | `/api/upload/blockchain/txlogs` | Recent transaction logs |
| `GET` | `/api/upload/blockchain/receipt/:txHash` | Full TX receipt |
| `GET` | `/api/upload/blockchain/network-status` | Sepolia network status |
| `GET` | `/api/upload/blockchain/wallet-balances` | 3-org wallet balances |
| `GET` | `/api/upload/blockchain/revocation-timeline` | Full media lifecycle — `?id=` + `?kind=` |

> There are **NO** `DELETE` endpoints anywhere in the API. Once content is uploaded, only revoke (status flip) is possible.

---

## Project Structure

```text
TrustStream/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── blockchain.js                # Web3 + ABI bundle loader
│   │   │   └── TrustStream.abi.json         # Auto-exported by deploy.js
│   │   ├── services/
│   │   │   ├── blockchain.service.js        # Ethereum: register, endorse, verify, tamper, revoke
│   │   │   ├── fabric.service.js            # Fabric Gateway, protobuf decoding, event listener
│   │   │   ├── merkle.service.js            # Merkle root builder
│   │   │   ├── catalog.service.js           # Local manifest read/write/list
│   │   │   ├── c2pa.service.js              # C2PA v2.2 generate/sign/verify
│   │   │   ├── ipfs.service.js              # Pinata upload + gateway fetch
│   │   │   ├── forensics.service.js         # Video forensics coordinator
│   │   │   ├── compression.service.js       # Module 1
│   │   │   ├── temporal.service.js          # Module 2
│   │   │   ├── avsync.service.js            # Module 3
│   │   │   ├── forensic.service.js          # Module 4 — score fusion
│   │   │   └── image-forensics.service.js   # Image forensics (JPEG quant + EXIF)
│   │   ├── routes/
│   │   │   └── upload.routes.js             # All endpoints incl. Fabric audit/events/history/query
│   │   └── server.js                        # Express entry + Fabric event listener boot
│   ├── data/catalog/                        # Manifest cache (videos + images/)
│   └── public/                              # uploads/ (temp), streams/, thumbnails/
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Home.jsx                     # FB-style feed
│       │   ├── VideoDetail.jsx              # Fabric card, Check Authenticity, ledger history
│       │   ├── Imagedetail.jsx              # Same, for images
│       │   ├── FabricAudit.jsx              # Live Fabric audit dashboard (SSE)
│       │   ├── TimeLinePage.jsx             # Revocation timeline
│       │   ├── Admin.jsx                    # Tabbed upload + pipeline visualiser
│       │   └── Login.jsx
│       ├── components/                      # VideoPlayer, ForensicPanel, Navbar, …
│       ├── services/
│       │   ├── api.js                       # videoAPI, imageAPI, feedAPI, syncAPI, timelineAPI
│       │   ├── wallet.js                    # MetaMask + browser-side endorsement
│       │   └── TrustStream.abi.json         # Auto-exported by deploy.js
│       └── utils/hash.js                    # Browser SHA-256
│
├── network/
│   ├── contracts/TrustStream.sol            # Ethereum contract (video + image)
│   ├── chaincode/truststream/javascript/    # ★ Fabric chaincode (source of truth)
│   │   ├── index.js                         #   13 functions
│   │   └── package.json
│   ├── scripts/deploy.js                    # Deploy + auto-export ABI bundle
│   ├── deployment.json
│   ├── contract-address.json
│   └── hardhat.config.js
│
└── README.md
```

> **Note:** the chaincode is the source of truth in `network/chaincode/`. Copy it into `fabric-samples/chaincode/truststream/` before deploying, and keep the two in sync after edits.

---

## Smart Contract Overview

`TrustStream.sol` is deployed on **Ethereum Sepolia Testnet** at `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9` (verified on Sourcify).

### 3-Org Consortium

| Organization | Role | Action |
|-------------|------|--------|
| NewsAgency (Org1) | Submitter | Registers videos, segments, and images. Auto-endorses on registration. |
| Broadcaster (Org2) | Endorser | Endorses registered media |
| Auditor (Org3) | Endorser | Final endorsement and verification |

### Shared `MediaStatus` Enum

| Value | Meaning |
|-------|---------|
| `Active` | Default after registration |
| `Revoked` | Taken down (status flip only) |
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
- **Storage-pointer view functions** — `memory` → `storage` everywhere, avoiding stack-too-deep on wide structs.
- **Wide-struct mappings are `internal`** — auto-generated public getters for 14-field structs were the source of stack-too-deep errors during Etherscan / Sourcify verification (which doesn't enable viaIR by default).
- **`REQUIRED_ENDORSEMENTS = 2`** (NewsAgency auto-endorse + 1 of {Broadcaster, Auditor} = quorum).
- **`TAMPER_THRESHOLD = 2`** (2 distinct reporters → Disputed).

---

## Optional — Redeploy the Smart Contract

`deploy.js` is the single source of truth — it auto-exports the ABI bundle to both backend and frontend.

```bash
cd network
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

After deploying:

- `backend/src/config/TrustStream.abi.json` — auto-updated (used by the backend)
- `frontend/src/services/TrustStream.abi.json` — auto-updated (used by `wallet.js` for browser-side endorsement)
- Update `VITE_CONTRACT_ADDRESS` in `frontend/.env` to the new address
- Restart both dev servers

> **Important:** the frontend's `wallet.js` uses the auto-exported ABI bundle to call `endorseSegment` and `endorseImage` directly from the browser via MetaMask. After redeploying, the ABI update is automatic — you only need to change `VITE_CONTRACT_ADDRESS`.
>
> **Hardhat config:** `viaIR: true` and the optimizer are enabled. The contract is also designed to compile in non-IR mode (the Etherscan / Sourcify default), so verification works out of the box.
>
> Redeploying the Ethereum contract does **not** affect the Fabric ledger — they are independent. Existing Fabric proofs remain valid and queryable.

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

Same as above minus `truststream.chain_hash` (images aren't segmented). The image detail page notes this as N/A explicitly.

### Sidecar Storage

- **Video:** `seg_NNN.c2pa` saved next to `seg_NNN.ts` (offline verification)
- **Image:** pinned to IPFS as `c2paSidecarCid` — no local sidecar file

---

## Forensics (AI-Free)

All forensic checks are deterministic — no machine-learning models, no hallucinations, no opaque scores.

### Video forensics (4 modules)

1. **Compression analysis** — bitrate variance, GOP structure, encoder fingerprint
2. **Temporal coherence** — per-frame variance and jump detection
3. **AV sync** — audio/video drift across segments
4. **Motion / structural** — keyframe distribution

### Image forensics (2 modules)

1. **Compression analysis** — JPEG quantization-table parsing
2. **EXIF metadata** — presence, consistency, camera fingerprint

```
risk = 0.60 × Compression + 0.40 × Metadata
```

Bands: Authentic / Suspicious / Likely Manipulated.

---

## Forensic Analysis Modules

```text
backend/src/services/
├── compression.service.js   ← Module 1: Compression forensics
├── temporal.service.js      ← Module 2: Temporal consistency analysis
├── avsync.service.js        ← Module 3: Audio-video sync analysis
└── forensic.service.js      ← Module 4: Score fusion engine
```

### Module 1 — Compression Forensics

Uses FFmpeg/FFprobe to measure frame size and bitrate per frame. Original camera footage produces stable frame sizes; re-encoded video produces erratic spikes, because re-encoding breaks the compression pattern tied to the original codec and camera hardware.

### Module 2 — Temporal Consistency

Analyses pixel-level differences and timestamp gaps between consecutive frames. Naturally recorded scenes transition smoothly; spliced footage shows a statistically anomalous jump where two clips were joined.

### Module 3 — AV Sync Analysis

Compares mouth movement against audio energy peaks and computes the time offset. Real speech is inherently synchronised; dubbed or replaced audio cannot reproduce the original lip-sync timing.

### Module 4 — Score Fusion Engine

```
FinalRiskScore = (Compression × 0.35) + (Metadata × 0.20)
               + (Temporal × 0.25) + ((1 − AVSync) × 0.20)
```

| Score Range | Status Label | Meaning |
|-------------|-------------|---------|
| 0.00 – 0.30 | ✅ Authentic | Original source, not tampered |
| 0.31 – 0.60 | ⚠️ Suspicious | Re-encoded or platform-processed |
| 0.61 – 1.00 | 🚨 Likely Manipulated | Heavy manipulation detected |

---

## Experimental Results

Validated in a laboratory environment against three categories of source files (recorded April 2026):

| Test Case | Media Input | Risk Score | Verdict | Forensic Observations |
|-----------|-------------|------------|---------|----------------------|
| Original camera footage | Direct camera capture | 25% | ✅ Authentic | Frame sizes fully stable; metadata matches expected camera output |
| YouTube music video | Platform-transcoded | 39% | ⚠️ Suspicious | Internal transcoding altered natural frame size variation |
| Re-encoded viral clip | Messenger-compressed | 47% | ⚠️ Suspicious | Timestamp discontinuity and metadata stripping detected |

---

## Revocation Timeline Visual

A vertical, chronological audit interface showing the **complete lifecycle** of any media item.

| Event type | Color | Events included |
|-----------|-------|-----------------|
| `local` | Gray | Upload accepted, segments prepared |
| `c2pa` | Purple | C2PA signing events |
| `ipfs` | Teal | IPFS pin events |
| `register` | Blue | On-chain registration |
| `endorsement` | Green | Broadcaster / Auditor endorsements |
| `tamper` | Amber | Tamper reports |
| `disputed` / `revoked` | Red | Status flips |

### API endpoint

```
GET /api/upload/blockchain/revocation-timeline?id=<mediaId>&kind=video|image
```

**How the backend builds it:**

1. Reads all on-chain TxLogs for the given `mediaId` and `kind` from Ethereum Sepolia
2. Merges with the local catalog manifest — picking up C2PA signing and IPFS upload events that aren't emitted as contract events
3. Sorts everything chronologically (oldest first)
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
      "detail": "3 segment(s) prepared for provenance."
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

`TimeLinePage.jsx`, rendered at `/timeline/:kind/:id`:

- Fetches the timeline on mount
- Status badge at the top: **Active** (green) / **Disputed** (amber) / **Revoked** (red)
- Each event is a card on a vertical left-ruled timeline with a colour-coded dot
- TX hashes link to `https://sepolia.etherscan.io/tx/<hash>`; IPFS CIDs link to the Pinata gateway
- Total event count in the header, immutability proof footer
- Fully theme-aware (dark + light), with a ← Back button

### Where the link appears

- On every Home feed card: **View Timeline** alongside **View Details**
- On `VideoDetail.jsx` and `Imagedetail.jsx`: a **View Audit Trail** button, next to the **Fabric Audit** button
- Directly by URL: `/timeline/video/:videoId` or `/timeline/image/:imageId`

> The **Fabric ledger history** (`GetMediaHistory`) is the permissioned-ledger counterpart to this view — reachable from the **📜 Show ledger history** button on each detail page. The Revocation Timeline covers the Ethereum side; ledger history covers Fabric.

---

## Blockchain Info

| Item | Value |
|------|-------|
| Public Network | Ethereum Sepolia Testnet |
| Chain ID | 11155111 |
| RPC Provider | Alchemy |
| Contract Address | `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9` |
| Verified On | Sourcify |
| Etherscan | https://sepolia.etherscan.io |
| Permissioned Network | Hyperledger Fabric 2.5.16 |
| Channel / Chaincode | `mychannel` / `truststreamcc` v1.3 (sequence 3) |
| Fabric Endorsement | `AND('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')` |
| Fabric Consensus | Raft (etcdraft), single ordering node |
| Fabric State DB | CouchDB |

---

## IPFS Info

| Item | Value |
|------|-------|
| Pinning Service | Pinata |
| Gateway | [gateway.pinata.cloud/ipfs](https://gateway.pinata.cloud/ipfs) |
| Video content | `.ts` segments + metadata JSON + forensic report |
| Image content | Image bytes + C2PA sidecar JSON + metadata JSON |
| Batch upload (video) | 2 segments per batch, rate-limit aware, auto-retry |

---

## Storage Summary

| Asset | Local | IPFS | Ethereum | Fabric | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Video original MP4** | ❌ Temp | ❌ | ❌ | ❌ | Deleted after FFmpeg |
| **Video HLS segments** | ✅ `public/streams/` | ✅ Pinned | *(hash)* | *(merkle root)* | Local for fast HLS playback |
| **Video .c2pa sidecars** | ✅ Next to segments | *(in metadata)* | *(hash)* | — | Offline verification |
| **Video metadata JSON** | — | ✅ Pinned | *(cid)* | *(cid)* | Sole source for sync recovery |
| **Image bytes** | ❌ Deleted after pin | ✅ Pinned | *(hash)* | *(hash)* | IPFS-only |
| **Image C2PA sidecar** | ❌ Never written | ✅ Pinned | *(hash)* | *(hash)* | IPFS-only |
| **Manifest catalog** | ✅ `data/catalog/*` | — | — | — | Cache; reproducible from chain |

---

## Immutability Guarantees

The thesis core promise is **"uploaded content cannot be deleted."** Enforced at five layers:

* **Ethereum contract:** No `delete*` function. Only `revoke*` (status flip). Records stay in storage forever.
* **Fabric chaincode:** No delete function either. `RevokeMedia` writes a revocation *on top of* the record; `GetMediaHistory` still returns the original registration with its transaction ID. **Verified in practice** — a revoked record returns two versions, the earlier one still showing `status=active`.
* **IPFS:** Content-addressed. Even if Pinata unpins, the CID resolves on any node holding the content, and the anchored hashes let any third party detect substitution.
* **HTTP API:** No `DELETE` routes. The only mutations are tamper reports and status flips.
* **Catalog service:** `removeManifest()` exists for internal sync hygiene only, never exposed via a route.

---

## Design Decisions & Limitations

Stated plainly, because a defensible limitation is stronger than a hidden one.

### Asymmetric registration vs revocation — deliberate

| Action | Who is required |
|--------|-----------------|
| **Register** (grant trust) | **All three** organizations must endorse |
| **Revoke** (withdraw trust) | **Any one** organization can initiate |

Claiming something is authentic is hard; withdrawing that claim is easy. This asymmetry is intentional: a fake clip circulating with an "authentic" seal is far more damaging than a genuine clip briefly placed under suspicion. If any consortium member finds evidence of manipulation, it should be able to raise the alarm immediately rather than wait for the publisher's permission.

Abuse is deterred by **accountability, not prohibition** — every revocation permanently records which organization performed it and why, visible to anyone via `GetMediaHistory`.

### Endorsement policy is not authorization

The `AND(3)` policy guarantees that all three orgs' peers executed identical code and agreed on the result. It does **not** mean three humans approved. Chaincode does not currently restrict *which* org may call `RevokeMedia` — consistent with the design above, but worth stating explicitly.

### Known limitations

| Limitation | Impact | Path forward |
|-----------|--------|--------------|
| Single ordering node | No crash fault tolerance in the ordering service | Configure 3 or 5 Raft consenters in `configtx.yaml` (requires rebuilding the network) |
| No Private Data Collections | All three orgs see all data; confidentiality is consortium-wide, not org-to-org | Add PDCs — a natural fit for source protection in journalism |
| No ABAC | Authorization is at organization level (MSP ID) only, not per-role within an org | Register identities with attributes and assert them in chaincode |
| CouchDB indexes not defined | Rich queries scan the full database | Add index definitions under `META-INF/statedb/couchdb/indexes/` |
| SQLite CA database | Fine at this scale; no HA or high concurrency | Fabric CA also supports PostgreSQL / MySQL — a `db` config change |
| Fabric ledger is machine-local | `sync-from-blockchain` restores from Ethereum + IPFS only | Run Fabric on a shared host, or export/import channel data |
| Single-host deployment | Not representative of true multi-org infrastructure | Kubernetes (e.g. Fabric Operator) for a production topology |

### Choices made and why

- **JavaScript chaincode over Go** — matches the backend language; Go would offer marginally better runtime performance, immaterial at this transaction volume.
- **Docker Compose over Kubernetes** — reproducibility and simplicity for a single-host prototype.
- **SSE over WebSockets** — traffic is one-way and `EventSource` reconnects automatically.
- **No `--init-required`** — the ledger starts empty and records are created on demand, so there is nothing to seed.
- **No channel ACLs** — all three organizations are equal participants; per-resource ACLs would add configuration without changing behaviour.

---

## Git Push Notes

Do **not** push:

```text
.env                    (both backend/ and frontend/)
private keys
Pinata JWT
node_modules
temporary uploaded files
```

Both `.env` files are already covered by `.gitignore`. Verify before a first push:

```bash
git check-ignore backend/.env frontend/.env
```

Typical flow on a feature branch:

```bash
git checkout -b dev
git add -A
git status                    # review before committing
git commit -m "Describe the change"
git push -u origin dev
```

> `git checkout -b dev` creates a **local** branch from your current work; the matching `origin/dev` on GitHub is updated by the push. This does not create a duplicate branch — a local branch and its remote counterpart are two copies of the same branch.

---

## What's New

### v4 — Fabric Events, Revocation, History & Rich Query (August 2026)
* **Chaincode events:** `RegisterVideoProof` / `RegisterImageProof` / `RevokeMedia` now emit `MediaRegistered` / `MediaRevoked`. Because Fabric delivers events only after a block commits, receiving one proves the write was unanimously endorsed and final.
* **Live Fabric Audit Dashboard:** new `/fabric-audit` page with summary tiles, filters, per-org **and per-peer** endorsement display, and a green **Live** badge. New records appear the instant their block commits, over SSE — no polling.
* **Fabric revocation:** new `RevokeMedia` chaincode function plus `POST /:videoId/revoke` and `/images/:imageId/revoke`, which withdraw the endorsement on **Ethereum and Fabric simultaneously**. Previously `revokeVideoOnChain` existed in the service layer but was never wired to a route — the app could not revoke at all.
* **Verification now distinguishes failure modes:** `VerifyVideoProof` / `VerifyImageProof` return `{ valid, hashMatches, revoked }` separately, so "the file was altered" and "the consortium withdrew its endorsement" are never conflated.
* **Ledger history:** `GetMediaHistory` exposes Fabric's history index — every version of a record with its transaction ID — surfaced through a **Show ledger history** button on detail pages.
* **Rich queries:** `QueryByOrg`, `QueryByMediaType`, `QueryRevoked` using CouchDB Mango selectors, exposed at `/blockchain/fabric-query`. CouchDB had been configured since the beginning but never actually used for queries.
* **Chaincode upgraded to v1.3 (sequence 3)** — 7 functions grew to **13**. Existing ledger records survived the upgrade untouched.
* **Container auto-restart:** `restart: unless-stopped` added to all compose files and applied to running containers, so Docker Desktop starting is enough to bring the whole network back.
* **`upgrade-truststream-cc.sh`:** reusable script that installs on all 6 peers, collects all 3 approvals, and commits — with the connection-timeout handling the Node chaincode build needs.
* **Admin pipeline shows Fabric:** both upload panels now display a **Fabric 3-org endorsement** step alongside the Ethereum step.
* **Clerk gate made optional:** `VITE_REQUIRE_ADMIN_AUTH` controls whether `/admin` requires sign-in; the Clerk integration remains intact.

### v3 — Hyperledger Fabric Proof Layer (August 2026)
* **Fabric network built out:** 3 organizations × 2 peers, CA-issued identities, CouchDB state database, Raft ordering, and genuine gossip leader election (`useLeaderElection: true`).
* **Unanimous endorsement policy:** `AND('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')` — verified by observing that a 2-org endorsement commits as INVALID and leaves state unchanged.
* **`truststreamcc` chaincode:** `RegisterVideoProof`, `RegisterImageProof`, `EndorseMedia`, `GetMediaProof`, `VerifyVideoProof`, `VerifyImageProof`.
* **Backend Fabric Gateway service:** `fabric.service.js` connects over gRPC with the Org1 identity and submits transactions.
* **Per-peer endorsement tracking:** raw protobuf endorsement signatures are decoded to identify which physical peer (peer0 / peer1) signed for each organization — proven non-deterministic across runs and by forcing failover.
* **Frontend proof card:** detail pages show Fabric status, ledger record, MSP identity, channel, chaincode, and consortium endorsements.

### v2 — Live News Streaming + Revocation Timeline (May 2026)
* **Live news streaming** with real-time per-segment hash verification during HLS playback.
* **Revocation Timeline Visual** at `/timeline/:kind/:id`, linked from every feed card and detail page.
* **Contract redeployed** to `0x3ee8f0B4b1DFa9D79068aEB1cC9D369Ab6DC53F9`; ABI auto-exported to backend and frontend.
* **Browser-side endorsement** via MetaMask in `wallet.js`.

### v1 — Image Flow + Facebook Timeline (March 2026)
* **Full image upload pipeline:** IPFS-only, zero local persistence.
* **`image-forensics.service.js`:** AI-free image risk scoring (JPEG quant + EXIF).
* **Facebook-style feed** with mixed video + image posts.
* **`Imagedetail.jsx`** with 7-assertion C2PA display and forensic panel.
* **Unified `/feed` endpoint** and `sync-from-blockchain` covering both media kinds.
* **Smart contract extended** with the complete image entity.
* **Admin page** with tabbed Video / Image upload and an animated pipeline visualiser.
