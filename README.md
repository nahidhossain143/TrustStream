# TrustStream 📡
### Decentralized Trust and Provenance for C2PA-Compliant Live News Streaming (Video + Image)

> A research-based, tamper-resistant, **Facebook-style decentralized live news streaming platform** integrating **Hyperledger Fabric (3-org permissioned consortium)**, **C2PA v2.2 Provenance Manifests**, **IPFS via Pinata**, **SHA-256 Chain Hashing**, **HLS Streaming**, and **AI-free forensic analysis** to verify the authenticity of every video segment AND every news image in near real-time.

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
- [Daily Startup](#daily-startup-both-platforms)
- [How to Use](#how-to-use)
- [API Reference](#api-reference)
- [Security & Hardening](#security--hardening)
- [Project Structure](#project-structure)
- [Hyperledger Fabric Network Topology](#hyperledger-fabric-network-topology)
- [Fabric Chaincode Reference](#fabric-chaincode-reference)
- [Tamper Reports & Dispute Governance](#tamper-reports--dispute-governance)
- [C2PA Implementation](#c2pa-implementation)
- [Public Verification (No Login Required)](#public-verification-no-login-required)
- [Forensics (AI-Free)](#forensics-ai-free)
- [Forensic Analysis Modules](#forensic-analysis-modules)
- [Revocation Timeline Visual](#revocation-timeline-visual)
- [Fabric Audit Dashboard](#fabric-audit-dashboard)
- [Performance Benchmarking (Hyperledger Caliper)](#performance-benchmarking-hyperledger-caliper)
- [IPFS Info](#ipfs-info)
- [Storage Summary](#storage-summary)
- [Immutability Guarantees](#immutability-guarantees)
- [Troubleshooting](#troubleshooting)
- [What's New](#whats-new)

---

## Project Overview

TrustStream is a **full Facebook-style decentralized live news streaming platform** with end-to-end authentication pipelines for **both video and image** media, anchored entirely on a **Hyperledger Fabric permissioned ledger** — no public blockchain, no wallets, no gas.

### Permissioned Ledger Layer (Hyperledger Fabric)

A genuine 3-organization Fabric network, not a single-node stub:

- **Org1 (NewsAgency)** — submits and registers media
- **Org2 (Broadcaster)** — endorsing peer
- **Org3 (Auditor)** — endorsing peer, and the only org that can clear a disputed status back to active
- Every write (registration, revocation, tamper report, dispute clearance) requires the channel's `AND(Org1MSP.peer, Org2MSP.peer, Org3MSP.peer)` endorsement policy — **unanimous 3-of-3**, not a majority
- `truststreamcc` chaincode (JavaScript) is the single source of truth for on-chain state — no per-segment blockchain transactions, one registration per video/image anchored by a Merkle root over all segments
- `backend/src/services/fabric.service.js` connects via Fabric Gateway + gRPC; submits proofs, verifies, revokes, reports tamper, clears disputes, reads history, runs rich queries, and maintains a long-lived chaincode event listener

### Smart Contract Layer — Chaincode

`truststreamcc` implements the full consortium governance model directly in chaincode:

- `RegisterVideoProof`, `RegisterImageProof`, `EndorseMedia`, `GetMediaProof`
- `ReportTamper`, `ClearDispute` — 2-of-3 org tamper threshold (excluding the registering org's own report) auto-flips status to `disputed`; only the Auditor (Org3MSP) can clear it back to `active`
- `RevokeMedia`, `GetMediaHistory`, `QueryByOrg`, `QueryByMediaType`, `QueryRevoked`
- `VerifyVideoProof`, `VerifyImageProof`
- **No delete function anywhere — only status flips** (`active` → `disputed` → `active`, or → `revoked`), naturally enforcing the thesis core promise: *"uploaded content cannot be deleted"*

### Backend

All services handle both the video and image flow:

- `fabric.service.js` — every chaincode function above, wrapped with the `FABRIC_ENABLED` guard, endorsing-peer decoding (which physical peer of each org signed), and `txId`/`blockNumber` capture from the commit status
- `c2pa.service.js` — real, ES256-signed C2PA manifests via `@contentauth/c2pa-node`, embedded directly into image bytes and the source MP4 (3 assertions + automatic hash-binding each), plus a custom-signed JSON sidecar per video segment (6 assertions, MPEG-TS isn't C2PA-embeddable); `truststream.consortium` embeds the Fabric channel/chaincode/MSP identities instead of any chain address
- `ipfs.service.js` — DRY refactor with `uploadImageToIPFS`, `uploadImageMetadataToIPFS`, and `uploadVideoSourceToIPFS` for the C2PA-embedded source MP4
- `catalog.service.js` — flat JSON manifest store with a `kind: "video" | "image"` discriminator
- `timeline.service.js` — rebuilds a chronological audit trail per media item by diffing consecutive versions from `GetMediaHistory`, merged with local C2PA/IPFS pipeline events
- `image-forensics.service.js` — AI-free image risk scoring via JPEG quantization table parsing + EXIF metadata analysis

### Image Upload Pipeline

`POST /api/upload/image` exposes the complete pipeline:

```
multer (temp uploads/) → SHA-256 → image forensics → C2PA (in-memory) →
  IPFS pin (image bytes) → IPFS pin (C2PA sidecar JSON) → IPFS pin (metadata JSON) →
  Fabric RegisterImageProof (unanimous 3-org endorsement) → unconditional temp-file cleanup
```

The flow is **fully IPFS-only** — image bytes and the C2PA sidecar both live as content-addressed IPFS pins. The temporary local file is unconditionally deleted after the pipeline completes. The local catalog stores only manifest metadata (sha256, CIDs, status), which is reproducible from the Fabric ledger at any time via `POST /api/upload/sync-from-blockchain`.

### Unified Feed + Cross-Kind Sync

- `GET /api/upload/feed` — unified endpoint that merges videos and images, sorted newest-first, drives the timeline
- `POST /api/upload/sync-from-blockchain` — recovers BOTH media kinds from Fabric's `QueryByMediaType` rich query plus IPFS metadata; videos and images both rebuild from the ledger on a fresh machine

### Frontend (Facebook-Style Timeline)

The Home page is a centered single-column vertical feed (max-width 3xl). Each post is a fully self-contained card:

- Avatar, media-kind pill (🎬 VIDEO / 🖼 IMAGE), time-ago
- Inline media — video posters with custom thumbnails, images shown at natural ratio
- Status pills: 🏛 Fabric, 📋 C2PA, 📌 IPFS, ⚠ Disputed (when applicable)
- Click-to-play video opens a fullscreen modal with HLS playback + auto per-segment hash verification + tamper overlay
- Click-to-zoom image opens a fullscreen lightbox served directly from the IPFS gateway
- "View Details" link on each card jumps to `/video/:id` or `/image/:id`
- "View Timeline" link on each card jumps to `/timeline/:kind/:id` — the Revocation Timeline Visual

A sticky filter pill bar at the top toggles between **All / Video / Image**.

The `VideoDetail.jsx` page renders metadata, the Fabric Proof card (status, channel, chaincode, MSP, per-org endorsement grid, tamper/dispute governance, Check Authenticity, ledger history), IPFS info, C2PA details (segment sidecars + a source-MP4 real-embedded-manifest card), and per-segment hash table. The parallel `Imagedetail.jsx` page follows the same structure with the real embedded C2PA manifest shown directly.

The Admin page uses a tab switcher to separate Video Upload from Image Upload, each rendering an animated step-by-step pipeline visualization:
- **Image:** 5 steps — Upload → Hash → C2PA → IPFS → Fabric
- **Video:** 6 steps — Upload → FFmpeg → Hash → Forensic → C2PA → IPFS → Fabric

The Video Upload form also accepts an optional **thumbnail image**, which becomes the `<video poster>` shown before HLS playback.

All components are fully theme-aware (dark + light), `api.js` provides complete coverage for all flows (`videoAPI`, `imageAPI`, `feedAPI`, `syncAPI`, `timelineAPI`), and `App.jsx` includes `/image/:imageId`, `/timeline/:kind/:id`, and `/fabric-audit` routes alongside the existing video route.

### Net Result

- Backend services fully Fabric-aware, no dual-chain writes
- Frontend Facebook timeline aesthetic with proper detail pages for both kinds
- **Revocation Timeline Visual** — full media lifecycle viewable as an interactive vertical timeline, built entirely from Fabric's own version history
- **Tamper reporting + Auditor-only dispute clearance** governance built directly into the chaincode
- **Immutability preserved at all four layers** (see [Immutability Guarantees](#immutability-guarantees) below)
- Full end-to-end test passed: image upload → forensic → C2PA → IPFS → Fabric registration → tamper report → dispute → Auditor clear → sync recovery
- **Demo ready.**

---

## Research Gaps

| Gap | Description | How TrustStream Addresses It |
|-----|-------------|------------------------------|
| G1 | Lack of empirical validation for news processing workloads | Benchmarkable pipeline with FFmpeg, manifest indexing, IPFS, Fabric proof, and forensic risk scoring |
| G2 | Centralized trust models incompatible with multi-org consortia | 3-org unanimous endorsement (NewsAgency, Broadcaster, Auditor) on a permissioned Hyperledger Fabric channel, shared by video and image flows |
| G3 | Verification latency as media volume increases | Browser-side hashing, background sync, parallel batch IPFS, cached HLS playback, per-segment hash-on-load verification |
| G4 | Centralized image storage in news platforms | IPFS-only image flow — image bytes AND the C2PA sidecar both live as pinned content; no local copy after pipeline completes |
| G5 | Reliance on AI / ML deepfake detectors that hallucinate | AI-free forensic module — JPEG quantization tables + EXIF for images, temporal + AV-sync analysis for video, all deterministic |
| G6 | Public blockchains carry cost, latency, and governance mismatched to a closed news consortium | A permissioned Fabric channel gives the consortium unanimous-endorsement guarantees with no gas cost and sub-second finality |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                              TrustStream                              │
├───────────────┬──────────────────────────┬────────────────────────────┤
│   Frontend    │         Backend          │      Decentralized Layers  │
│  React 19     │   Node.js + Express 5    │  Hyperledger Fabric 2.5.16 │
│  Tailwind 3   │   FFmpeg + SHA-256       │  IPFS via Pinata           │
│  hls.js       │   Local manifest catalog │  truststreamcc chaincode   │
│  React Router │   C2PA service           │  3-Org Consortium (AND-3)  │
│  Dark/Light   │   Video / Image forensics│  C2PA v2.2 Provenance      │
│  Clerk Auth   │   Fabric Gateway + gRPC  │  Immutable status flips    │
└───────┬───────┴──────────┬───────────────┴──────────────┬─────────────┘
        │                  │                               │
        ▼                  ▼                               ▼
   FB-style feed     Segment Hashes               Immutable Ledger
   Image lightbox    Image SHA-256                3-Org Endorsement
   Video modal       Merkle root anchoring         Ledger History
   Per-card poster   In-memory C2PA sign           IPFS Content CID
   Forensic risk     Catalog cache (rebuildable)   Tamper / Disputed Status
   Revocation Timeline                             Revocation Timeline API
```

### Video Upload Flow (HLS + local cache + IPFS + ledger)

```text
Admin uploads MP4 + (optional) thumbnail image (Clerk authenticated)
  → Thumbnail saved to /public/thumbnails/<videoId>.<ext> (served via /thumbnails/*)
  → FFmpeg segments MP4 into ~2s .ts chunks (target length is
    HLS_SEGMENT_SECONDS; forced keyframes make the cuts land close to
    it, but the true length of each chunk is measured via ffprobe
    afterwards, not assumed - see Segment Duration below)
  → SHA-256 hash per segment
  → Chain hash: SHA-256(currentHash + prevHash)
  → Merkle root computed over all segment hashes
  → AI-free video forensics (compression, temporal, AV sync, motion)
  → Write local manifest JSON in backend/data/catalog
  → Response sent immediately (video playable right away)
  → Embed real ES256-signed C2PA manifest into the source MP4 (JUMBF)
  → [Background]:
       → Generate C2PA sidecar JSON per segment (6 assertions, ES256 signed —
         .ts isn't C2PA-embeddable, so this stays a custom signed sidecar)
       → Save .c2pa sidecar file alongside each .ts segment (offline verify)
       → Pin the C2PA-embedded source MP4 to IPFS  → sourceIpfsCid
       → Upload each segment to IPFS via Pinata (parallel batches)
       → Upload forensic report JSON to IPFS
       → Upload video metadata JSON (with C2PA + forensics) to IPFS
       → RegisterVideoProof on Hyperledger Fabric  ← needs all 3 orgs to endorse
       → Store txId, block number in manifest
```

#### Segment duration: why ~2 seconds, and how it's actually enforced

HLS segment length is a direct trade-off in this system, not just a streaming-quality knob: because every segment gets its own hash, chain-hash, forensic sub-score, and C2PA sidecar, **shorter segments give finer-grained tamper localization** (a splice can be pinpointed to within one segment's duration) **at the cost of more per-video overhead** (more IPFS pin calls, more `.c2pa` sidecar files, more Fabric metadata entries). Two seconds was chosen as a reasonable default for that trade-off; it's configurable via `HLS_SEGMENT_SECONDS` if a deployment wants coarser localization with less overhead, or finer localization at the cost of more files.

Two implementation details make this correct rather than approximate:

- **`-hls_time N` is only a target.** FFmpeg cuts HLS segments at the nearest existing keyframe, not at an exact time offset — if the source's GOP (keyframe interval) doesn't divide evenly into `N` seconds, actual segment lengths drift from the target, sometimes significantly. The fix is `-force_key_frames "expr:gte(t,n_forced*N)"`, which inserts an actual keyframe at every `N`-second boundary before segmenting, so the cuts land where requested.
- **The real duration is still measured, not assumed.** Even with forced keyframes, encoder frame-alignment introduces small drift, and the *final* segment of any video is essentially always shorter than the target (whatever duration remains). Each segment's actual length is probed via `ffprobe -show_entries format=duration` immediately after FFmpeg produces it, and that measured value — not a hardcoded constant — is what gets stored, hashed into the C2PA `c2pa.transcoded` action's `segment_duration` parameter, and summed into the video's reported total duration (`totalDurationSeconds`). A real 7.3-second test upload produced segments of `2.02s, 2.19s, 2.19s, 1.50s` — close to the 2s target for the first three, and correctly short for the last — rather than a video-processing pipeline reporting a fabricated `4 × 2s = 8.0s`.

### Image Upload Flow (IPFS-ONLY, zero local persistence)

```text
Admin uploads JPG / PNG / WebP (Clerk authenticated)
  → Multer saves to public/uploads/ TEMP DIR ONLY
  → SHA-256 hash directly from temp file
  → AI-free image forensics
       → JPEG quantization-table parsing (compression score)
       → EXIF metadata analysis (metadata score)
       → Error Level Analysis, global + regional (ELA score)
       → Risk = 0.45 × Compression + 0.30 × Metadata + 0.25 × ELA
       → Bands: Authentic / Suspicious / Likely Manipulated
  → Write local manifest in data/catalog/images/ (cache index, NOT canonical bytes)
  → Response sent immediately
  → [Background]:
       → Embed real ES256-signed C2PA manifest into the image bytes (JUMBF)
       → Pin the C2PA-embedded image bytes to IPFS  → ipfsCid
       → Recompute sha256Hash from the embedded bytes (they're now canonical)
       → Pin metadata JSON to IPFS (includes forensics)
       → RegisterImageProof on Hyperledger Fabric  ← needs all 3 orgs to endorse
       → UNCONDITIONALLY unlink the temp file
  → Final state: image bytes (with embedded C2PA) only on IPFS,
    hash anchored on the Fabric ledger, manifest cache reproducible from chain
```

### Verification Flow

```text
Video (during HLS playback - automatic, per segment):
  Browser downloads .ts segment via hls.js
    → Compute SHA-256 locally (Web Crypto API)
    → POST /api/upload/verify with { videoId, segmentIndex, clientHash }
    → Backend compares manifest.sha256Hash locally
    → Verify .c2pa sidecar ES256 signature
    → Returns { isMatch, c2pa }
    → [If tampered]:
         → Pause video, show red overlay
         → POST /api/upload/report-tamper → chaincode ReportTamper()
         → 2 distinct (non-uploader) orgs → chaincode auto-flips status to disputed

Video / Image "Check Authenticity" (manual, on detail pages):
  Backend re-hashes the local content (video: recomputes the Merkle root
  from segments on disk; image: re-fetches from IPFS and re-hashes)
    → POST /:id/verify-fabric or /images/:id/verify-fabric
    → Calls VerifyVideoProof / VerifyImageProof on the Fabric ledger
    → Returns { fileIntact, fabric: { valid, hashMatches, revoked, disputed }, authentic }
```

### Sync / Recovery Flow

```text
New machine / fresh start
  → POST /api/upload/sync-from-blockchain
  → queryLedger("QueryByMediaType", ["video"]) and (["image"])
  → For each proof:
       → fetchJsonFromIPFS(metadataCid) for full segment list / image details
       → Rebuild local manifest in data/catalog/<id>.json or data/catalog/images/<id>.json
  → Both kinds restored without ever touching the original uploader machine
```

### Revocation Timeline Flow

```text
User clicks "View Timeline" on any media card
  → Frontend calls GET /api/upload/blockchain/revocation-timeline?id=xxx&kind=video|image
  → Backend calls GetMediaHistory(kind, id) on the Fabric chaincode
  → Every historical version of the ledger record is diffed against the
    previous one to derive events: register, tamper report, disputed,
    dispute cleared, revoked
  → Merged with local catalog events (upload accepted, C2PA signed, IPFS pinned)
  → Events sorted chronologically (oldest → newest)
  → Response: { mediaId, kind, status, title, events[] }
  → Frontend renders TimeLinePage.jsx:
       → Vertical timeline — each event is a color-coded card
       → Event types: local, c2pa, ipfs, register, tamper, disputed, cleared, revoked
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
| API Security | `helmet` (security headers), `express-rate-limit` (per-IP throttling), origin-restricted CORS, centralized route-param validation |
| Index / Catalog | Local JSON manifest catalog (videos + images) |
| Video Processing | FFmpeg (HLS segmentation, ~2s target chunks — configurable via `HLS_SEGMENT_SECONDS`, actual duration measured per segment via `ffprobe`) |
| Hashing | SHA-256 (Node.js crypto + Web Crypto API) + Chain Hash + Merkle root |
| Provenance Standard | C2PA v2.2 via `@contentauth/c2pa-node` (real embedded manifests for images + source MP4, ES256/X.509; custom ES256-signed sidecar for video segments) |
| Decentralized Storage | IPFS via Pinata (segments + C2PA-embedded image + C2PA-embedded source MP4 + metadata JSON) |
| Forensics | AI-free — JPEG quantization, EXIF, temporal coherence, AV sync |
| Permissioned Ledger | Hyperledger Fabric 2.5.16, `truststreamcc` chaincode (JavaScript) |
| Fabric SDK | `@hyperledger/fabric-gateway`, `@grpc/grpc-js`, `@hyperledger/fabric-protos` |
| Fabric State DB | CouchDB (enables rich queries) |
| Fabric Consensus | Raft (etcdraft) |
| Streaming | HLS (HTTP Live Streaming) |

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | v22 LTS | [nodejs.org](https://nodejs.org) |
| FFmpeg | Latest (must be on PATH) | [ffmpeg.org/download.html](https://ffmpeg.org/download.html) |
| Git | Latest | [git-scm.com](https://git-scm.com) |
| Docker Desktop | Latest | Required for Hyperledger Fabric containers |
| WSL 2 + Ubuntu | Ubuntu 22.04 or 24.04 | **Windows only** — Fabric scripts are bash |

> **Disk space:** the Fabric network plus Docker images needs roughly **10 GB free**. Running with a nearly-full disk causes Docker's VM filesystem to go read-only, which breaks the peers in confusing ways. Keep at least 15 GB free.
>
> **Note on setup topology:** the backend and frontend can run either natively on Windows (PowerShell) or inside WSL — only Docker Desktop and the Fabric network scripts (`network.sh`, `addOrg3.sh`) strictly require WSL/bash. If the backend runs on Windows while Fabric runs in WSL, the `FABRIC_*_PATH` variables in `backend/.env` must use UNC paths (`//wsl.localhost/<distro>/home/<user>/...`), not Linux paths.

---

## How to Run — Windows

### Step 1 — Install WSL 2 + Ubuntu

Open **PowerShell as Administrator**:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart when prompted, then open Ubuntu from the Start menu and create your Linux username and password.

### Step 2 — Enable the WSL backend in Docker Desktop

Open Docker Desktop → **Settings**:

- **General** → tick **Use the WSL 2 based engine**
- **Resources → WSL Integration** → tick your Ubuntu distro
- Click **Apply & Restart**

Verify from the Ubuntu terminal:

```bash
docker ps
```

### Step 3 — Clone the repository

```bash
git clone https://github.com/nahidhossain143/TrustStream.git
cd TrustStream
```

### Step 4 — Install dependencies (inside WSL, for Fabric tooling) and Node.js + FFmpeg + jq

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg jq
node -v && ffmpeg -version | head -1
```

> `jq` is required by the Fabric `network.sh` / `addOrg3.sh` scripts and is not installed by default on a clean Ubuntu image.

### Step 5 — Install Hyperledger Fabric

```bash
mkdir -p ~/fabric-project && cd ~/fabric-project
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.16 docker samples binary
```

This downloads the Fabric binaries (`peer`, `orderer`, `configtxgen`, …), the sample networks, and the Docker images.

> **`fabric-nodeenv` image:** the default image set above doesn't include `hyperledger/fabric-nodeenv`, which is required to build JavaScript chaincode. Pull it separately: `docker pull hyperledger/fabric-nodeenv:2.5`.

### Step 6 — Copy the chaincode into fabric-samples

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

> **`network.sh deployCC` only installs and approves for Org1 + Org2 by default**, even with Org3 already joined to the channel. Check the result:
> ```bash
> peer lifecycle chaincode querycommitted -C mychannel -n truststreamcc
> ```
> If `Org3MSP: false`, install and approve for Org3 manually:
> ```bash
> export PATH=${PWD}/../bin:$PATH
> export FABRIC_CFG_PATH=$PWD/../config/
> source scripts/envVar.sh
> setGlobals 3
> peer lifecycle chaincode install truststreamcc.tar.gz
> PACKAGE_ID=$(peer lifecycle chaincode queryinstalled --output json | jq -r '.installed_chaincodes[] | select(.label=="truststreamcc_1.0") | .package_id')
> peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls \
>   --cafile "${PWD}/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem" \
>   --channelID mychannel --name truststreamcc --version 1.0 --package-id "$PACKAGE_ID" --sequence 1 \
>   --signature-policy "AND('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')"
> ```
> (bump `-ccv`/`--version` and `-ccs`/`--sequence` to match whatever version you deployed if it isn't the first). Re-run `queryinstalled` to confirm the correct package-id has a `references` entry before assuming it's fixed — if Org3's peer already had an older package installed, indexing `installed_chaincodes[0]` can silently bind the wrong one.

Expected after a successful commit:

```text
Version: 1.0, Sequence: 1, Endorsement Plugin: escc, Validation Plugin: vscc,
Approvals: [Org1MSP: true, Org2MSP: true, Org3MSP: true]
```

### Step 9 — Configure the backend

Create `backend/.env`:

```env
PINATA_JWT=your_pinata_jwt
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs

# Comma-separated list of frontend origin(s) allowed by CORS. Leave unset
# for local dev (falls back to wide-open with a startup warning) - set it
# before deploying.
FRONTEND_ORIGIN=http://localhost:5173

# Target HLS segment length in seconds (default 2 if unset). Shorter =
# finer-grained tamper localization, more IPFS/C2PA overhead per video.
# HLS_SEGMENT_SECONDS=2

FABRIC_ENABLED=true
FABRIC_MSP_ID=Org1MSP
FABRIC_CHANNEL_NAME=mychannel
FABRIC_CHAINCODE_NAME=truststreamcc
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com

# Replace <distro> with your WSL distro name (check with `wsl -l -v`) and
# <username> with the output of `whoami` inside WSL.
FABRIC_TLS_CERT_PATH=//wsl.localhost/<distro>/home/<username>/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
FABRIC_CERT_PATH=//wsl.localhost/<distro>/home/<username>/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/cert.pem
FABRIC_KEY_DIR=//wsl.localhost/<distro>/home/<username>/fabric-project/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore

# Optional - only needed if you want the C2PA signing identity somewhere
# other than backend/certs/c2pa/ (generated by generate-c2pa-cert.sh).
# C2PA_CERT_CHAIN_PATH=./certs/c2pa/signing-chain.pem
# C2PA_SIGNING_KEY_PATH=./certs/c2pa/leaf-key.pem
# C2PA_TRUST_ANCHOR_PATH=./certs/c2pa/root-cert.pem
```

> If running the backend natively on Windows (not inside WSL), the `FABRIC_*_PATH` values must be UNC paths as shown above. If the backend itself runs inside WSL, use plain Linux paths (`/home/<username>/...`) instead — a `\\wsl.localhost\...` path from inside WSL will fail with `ENOENT`.

> Before first run, generate the C2PA signing identity: `backend/scripts/generate-c2pa-cert.sh` (requires `openssl` — available in Git Bash / WSL). Writes to `backend/certs/c2pa/` (gitignored).

### Step 10 — Configure the frontend

Create `frontend/.env`:

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:3001
VITE_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs

VITE_FABRIC_CHANNEL_NAME=mychannel
VITE_FABRIC_CHAINCODE_NAME=truststreamcc
VITE_FABRIC_MSP_ID=Org1MSP
VITE_FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com

# Set to "true" to require Clerk sign-in on /admin.
# Left unset (or false), /admin opens directly — convenient for demos.
VITE_REQUIRE_ADMIN_AUTH=false
```

### Step 11 — Install dependencies

```bash
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
cd network  && npm install && cd ..
```

### Step 12 — Run

**Terminal 1 — backend** (from wherever `backend/.env`'s paths resolve — Windows PowerShell or WSL, matching how you configured `FABRIC_*_PATH`):

```bash
cd TrustStream/backend
node src/server.js
```

Expected:

```text
Server running on port 3001
[fabric] chaincode event listener started
```

**Terminal 2 — frontend**:

```bash
cd TrustStream/frontend
npm run dev
```

Expected:

```text
VITE v7.x.x ready in xxx ms
➜ Local: http://localhost:5173/   (or 5174 if 5173 busy)
```

---

## How to Run — macOS

macOS needs no WSL; Docker Desktop and the terminal are enough. Follow the same steps as Windows above, but:

- Skip Step 1 (no WSL)
- Use plain Linux-style `~/fabric-project/...` paths for `FABRIC_*_PATH` in `backend/.env` (no UNC paths needed)
- Install Node/FFmpeg/jq via Homebrew instead of `apt-get`: `brew install node ffmpeg jq`

### Adding the second peer per organization (optional but recommended)

The stock test-network gives each org one peer. For fault tolerance, `fabric-samples/test-network` includes a `start-truststream-network.sh`-style helper pattern that registers `peer1` identities, starts the containers, joins them to the channel, and installs the chaincode on both peers per org — see the Fabric docs for `addOrg3.sh`'s peer-count options if you want this.

---

## Daily Startup (Both Platforms)

The Fabric containers are configured with `restart: unless-stopped`, so **starting Docker Desktop brings all containers back automatically.**

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

Expected: **14** (6 peers + 1 orderer + 4 CAs + 6 CouchDB — plus 3 chaincode containers spun up after the first `deployCC`, for 17 total once chaincode has run at least once).

If containers are stopped for any reason, just re-run `./network.sh up createChannel -c mychannel -ca -s couchdb` from `fabric-samples/test-network` — the chaincode stays committed on the channel and does not need to be redeployed unless you change it.

### Running Services Checklist

| Service | URL / Location | Where |
|---------|----------------|-------|
| Backend API | http://localhost:3001 | Terminal 1 |
| Frontend | http://localhost:5173 (or 5174) | Terminal 2 |
| Fabric Audit Dashboard | http://localhost:5173/fabric-audit | Browser |
| Admin upload | http://localhost:5173/admin | Browser |
| Hyperledger Fabric | Docker containers | `docker ps` |
| IPFS Storage | Pinata | Always live |
| Local HLS cache (videos) | `backend/public/streams` | Local |
| Local thumbnails | `backend/public/thumbnails` | Local |
| Local manifest catalog | `backend/data/catalog` | Local |

---

## How to Use

### Upload a Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Sign in with Clerk (if `VITE_REQUIRE_ADMIN_AUTH=true`)
3. Switch to the **Video Upload** tab
4. Enter a title and optional description
5. Drag & drop or pick an MP4 file
6. (Optional) Add a thumbnail image — this becomes the video's poster shown before playback
7. Click **Upload & Generate Hashes**
8. Pipeline panel updates in real time (6 steps): Upload → FFmpeg → Hash → Forensics → C2PA → IPFS → Fabric

### Upload an Image (Admin)
1. Same admin page, switch to the **Image Upload** tab
2. Enter title + optional description
3. Drag & drop or pick a JPG / PNG / WebP (max 20 MB)
4. Click **Upload & Authenticate Image**
5. Pipeline panel (5 steps): Upload → Hash → C2PA → IPFS → Fabric
6. After completion, the temp local file is unconditionally deleted — only IPFS + the Fabric ledger hold the canonical content

### Browse the Feed (Home)
1. Go to `http://localhost:5173`
2. Single-column Facebook-style timeline with mixed video + image posts, newest first
3. Search box (debounced) filters by title/description server-side; media-type pills (All / Video / Image) and a status dropdown (All / Verified / Disputed / Revoked) narrow the results further — all three combine, and all three are enforced by the backend, not just hidden client-side
4. **Load more** fetches the next page from the server rather than paginating an already-downloaded list, so the feed stays fast regardless of catalog size
5. Click a video card → fullscreen modal player (auto-verifies each segment, uses uploaded thumbnail as poster)
6. Click an image card → fullscreen lightbox (zoomable, IPFS-served)
7. Each card shows: avatar, time-ago, status pills (Fabric / C2PA / IPFS / Disputed), title, description

### Verify Any File (No Login)
1. Click **🔍 Verify Content** in the navbar, or go to `http://localhost:5173/verify`
2. Drag & drop (or browse for) any JPG / PNG / WebP / MP4 — up to 100 MB, no account needed
3. Shows whether it's genuine TrustStream-registered content, which record it matches (with a link to full details), and the underlying C2PA validation detail (signer, algorithm, trust state)
4. See [Public Verification](#public-verification-no-login-required) for how the two-tier check (embedded-manifest vs. hash fallback) works

### View Full Details
- Click **View Details** on any card
- **Video detail page:** a Watch card with a local-cache/direct-from-IPFS playback toggle (see [Storage Summary](#storage-summary)), metadata, Fabric Proof card (endorsements, tamper/dispute, Check Authenticity, ledger history), IPFS, C2PA (segment sidecars + real-embedded source MP4 manifest), per-segment hash table
- **Image detail page:** metadata, forensics (risk score + 3 modules + notes), Fabric Proof card, IPFS, C2PA (real embedded manifest), tamper/dispute status

### View Revocation Timeline
- Click **View Timeline** on any card, or navigate to `/timeline/video/:id` or `/timeline/image/:id`
- Full media lifecycle rendered as a vertical timeline: upload → C2PA sign → IPFS pin → Fabric registration → tamper reports → disputed / cleared / revoked (if applicable)
- Immutability proof footer confirms no events can be deleted from this log

### Manual Verify (Image)
- On the image detail page, click **Verify Hash**
- Backend recomputes SHA-256, compares against the stored hash
- Use **Check Authenticity** for a Fabric ledger cross-check (re-fetches from IPFS, re-hashes, calls `VerifyImageProof`)

### Report Tamper & Clear Dispute
- Any org can call **Report Tamper** on a video or image detail page
- The chaincode excludes the registering org's own report from the count; once **2 distinct other orgs** have reported, status flips to **Disputed**
- Only the **Auditor** can clear a dispute back to **Active** via the **Clear Dispute (Auditor only)** button — the prior tamper reports remain visible in the ledger history, they're just not erased

### Restore from Blockchain
- Hit `POST /api/upload/sync-from-blockchain` (button available on detail pages and via API)
- Runs `QueryByMediaType` against the Fabric ledger → fetches metadata from IPFS → rebuilds local catalog for both videos AND images
- A fresh machine can fully recover the platform without ever touching the original uploader

---

## API Reference

### Video

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload MP4 + (optional) thumbnail → segment → hash → forensics → C2PA → IPFS → Fabric |
| `GET` | `/api/upload/videos` | List all videos |
| `GET` | `/api/upload/videos/:videoId` | Get one video's full summary |
| `GET` | `/api/upload/videos/:videoId/segments` | Per-segment hashes, CIDs, C2PA data |
| `GET` | `/api/upload/videos/:videoId/forensics` | Forensic report for one video |
| `GET` | `/api/upload/ipfs/:videoId/:segmentIndex` | Per-segment IPFS details |
| `GET` | `/api/upload/ipfs-playlist/:videoId` | IPFS-backed M3U8 playlist |
| `GET` | `/api/upload/c2pa/:videoId/:segmentIndex` | ES256 signature verification for one segment's `.c2pa` sidecar |
| `GET` | `/api/upload/:videoId/source-c2pa` | Real C2PA validation of the embedded source-MP4 manifest — fetches the actual bytes from IPFS and re-verifies signature + cert-chain trust + hash-binding |
| `POST` | `/api/upload/verify` | Local hash check for one segment (browser-computed vs stored) |
| `POST` | `/api/upload/:videoId/verify-fabric` | Re-hash + check against the Fabric ledger (Merkle root) |
| `POST` | `/api/upload/report-tamper` | Report a video as possibly tampered (chaincode `ReportTamper`) |
| `POST` | `/api/upload/:videoId/clear-dispute` | Auditor-only: clear a Disputed video back to Active |

### Image

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload/image` | Upload image (JPG/PNG/WebP) → hash → forensics → C2PA → IPFS → Fabric |
| `GET` | `/api/upload/images` | List all images |
| `GET` | `/api/upload/images/:imageId` | Get one image's full summary |
| `GET` | `/api/upload/images/:imageId/forensics` | Image forensic report |
| `GET` | `/api/upload/images/:imageId/c2pa` | Real C2PA validation — fetches the actual pinned bytes from IPFS and re-verifies the embedded manifest's signature + cert-chain trust + hash-binding |
| `POST` | `/api/upload/images/verify` | Local hash check |
| `POST` | `/api/upload/images/:imageId/verify-fabric` | Re-fetch from IPFS + check against the Fabric ledger |
| `POST` | `/api/upload/images/report-tamper` | Report an image as possibly tampered |
| `POST` | `/api/upload/images/:imageId/clear-dispute` | Auditor-only: clear a Disputed image back to Active |

### Unified Feed, Sync & Revocation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/upload/feed` | Mixed video + image feed (newest-first), server-side search + filter + pagination — drives the FB-style home page. Query params: `search` (title/description substring), `mediaType` (`all`\|`video`\|`image`), `status` (`all`\|`verified`\|`disputed`\|`revoked`), `page`, `limit` (max 50). Returns `{ total, page, totalPages, hasMore, counts, feed }` |
| `POST` | `/api/upload/public-verify` | **No login required.** Upload any image/MP4/`.ts` segment; re-runs the real C2PA validation directly against the uploaded bytes (works even on a file never re-uploaded to TrustStream), falling back to exact SHA-256 matching for non-embeddable content. Returns `{ matched, matchType, sha256Hash, c2pa, match }` |
| `POST` | `/api/upload/sync-from-blockchain` | Restore both videos AND images from the Fabric ledger + IPFS |
| `POST` | `/api/upload/:videoId/revoke` | Revoke a video (status flip, chaincode `RevokeMedia`) |
| `POST` | `/api/upload/images/:imageId/revoke` | Revoke an image |
| `GET` | `/api/upload/blockchain/revocation-timeline` | **Full media lifecycle timeline** — query params: `id` (mediaId) + `kind` (`video` or `image`) |

### Hyperledger Fabric

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/upload/blockchain/fabric-audit` | All Fabric records with per-org, per-peer endorsements |
| `GET` | `/api/upload/blockchain/fabric-events` | **SSE stream** of `MediaRegistered` / `MediaRevoked` / `MediaDisputed` / `MediaDisputeCleared` |
| `GET` | `/api/upload/blockchain/fabric-history/:kind/:id` | Full ledger history of one record |
| `GET` | `/api/upload/blockchain/fabric-query` | Rich query — `?by=org&value=Org2MSP`, `?by=type&value=video`, `?by=revoked` |

### Static

| Path | Serves |
|------|--------|
| `/streams/<videoId>/playlist.m3u8` + segments | Local HLS cache |
| `/thumbnails/<videoId>.<ext>` | Uploaded video poster images |

> Note: there are **NO** `DELETE` endpoints anywhere in the API. Once content is uploaded, only revoke (status flip), tamper-report, and dispute-clearing are possible. See [Immutability Guarantees](#immutability-guarantees).

---

## Security & Hardening

Beyond the blockchain/C2PA provenance layer, the API itself follows standard defensive practices for a publicly-reachable service.

### Path-traversal fix (a real vulnerability found and fixed during this work)

Every video/image lookup route resolves `req.params.videoId` / `:imageId` directly into a filesystem path — `data/catalog/<id>.json`. Before this pass, that ID was never validated: a request like

```
GET /api/upload/videos/..%2f..%2fpackage.json
```

could walk the catalog directory's path upward via `../` segments and cause the server to read (and return, as if it were a manifest) an arbitrary `.json` file elsewhere on disk. This is a classic **path traversal / arbitrary file read** vulnerability (CWE-22). Since `videoId`/`imageId` are always server-generated `crypto.randomUUID()` values, the fix is a strict allowlist: a centralized Express `router.param()` validator rejects any `videoId`, `imageId`, `id`, `segmentIndex`, or `kind` route parameter that doesn't match its expected shape (UUID v4, a non-negative integer, or the literal `video`/`image`, respectively) with `400 Bad Request`, before any route handler — including ones added in the future — ever touches the filesystem. Verified against both a raw `../../` payload and its URL-encoded form (`%2e%2e%2f`); both are now rejected while legitimate UUIDs still resolve normally.

### Rate limiting

`express-rate-limit`, applied in two tiers:

| Scope | Window | Limit | Rationale |
|---|---|---|---|
| Whole API (`/api/upload/*`) | 15 min | 600 req/IP | Generous enough for feed polling, detail pages, and per-segment verification during normal HLS playback, while still bounding a single client |
| `POST /api/upload` and `POST /api/upload/image` | 60 min | 20 req/IP | Each call triggers FFmpeg, forensic analysis, IPFS pinning, and a Fabric ledger write — expensive enough to need a tighter ceiling |
| `POST /api/upload/public-verify` | 15 min | 15 req/IP | Public, unauthenticated endpoint — tightest limit since anyone on the internet can reach it |

### Other hardening

- **`helmet`** — standard security headers (`X-Content-Type-Options`, `X-Frame-Options`, HSTS, etc). Content-Security-Policy is deliberately disabled (this is a JSON API + static file server, not an HTML-rendering app) and `Cross-Origin-Resource-Policy` is relaxed to `cross-origin` so the frontend — a different origin — can still load `/streams` and `/thumbnails` assets directly.
- **CORS locked to a known origin** — `origin: '*'` (wide open) replaced with an allowlist read from `FRONTEND_ORIGIN` (comma-separated for multiple deployed origins), falling back to `*` only for local dev convenience, with a startup warning so it can't be silently forgotten before a real deployment.
- **Input validation** — title/description length caps (200 / 5000 chars) on both upload routes, rejecting empty titles, so a single malformed request can't bloat the catalog or the C2PA `CreativeWork` assertion embedded in every asset.
- **`trust proxy`** — set for Render/most PaaS hosts, so rate limiting and any IP-based logic see the real client IP instead of the reverse proxy's.
- **Centralized JSON error handling** — a global Express error-handling middleware replaces the framework's default HTML stack-trace page with a clean JSON `{ error }` response, and classifies Multer errors (bad file type, size limit exceeded) as `400`s rather than generic `500`s.

---

## Project Structure

```text
TrustStream/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── fabric.service.js            # Pooled Gateway connection, submit/evaluate, protobuf endorsement decoding, event listener
│   │   │   ├── catalog.service.js           # Local manifest read/write/list (kind: video|image)
│   │   │   ├── c2pa.service.js              # C2PA v2.2: real embedded manifests (image + source MP4) via @contentauth/c2pa-node, ES256-signed JSON sidecar per video segment
│   │   │   ├── ipfs.service.js              # Pinata upload (image, source MP4, segment, JSON), gateway, fetch (JSON + raw buffer)
│   │   │   ├── merkle.service.js            # Merkle tree build/proof/verify over segment hashes (video registration root)
│   │   │   ├── timeline.service.js          # Revocation timeline built from GetMediaHistory
│   │   │   ├── forensics.service.js         # All 4 video forensic modules (compression, temporal, AV sync, score fusion) in one file
│   │   │   └── image-forensics.service.js   # Image forensics (JPEG quant + EXIF)
│   │   ├── routes/
│   │   │   └── upload.routes.js             # All video + image endpoints, unified /feed (search/filter/pagination), public-verify, sync, timeline (mounted at /api/upload); rate limiting + ID validation
│   │   └── server.js                        # Express entry — helmet, restricted CORS, global error handler, serves /streams + /thumbnails, starts Fabric event listener
│   ├── scripts/
│   │   └── generate-c2pa-cert.sh            # One-time: generates the root+leaf ES256 cert chain used to sign C2PA manifests
│   ├── certs/c2pa/                          # C2PA signing identity (gitignored — private key material)
│   │   ├── signing-chain.pem                # leaf + root cert chain (used by LocalSigner)
│   │   ├── leaf-key.pem                     # leaf private key, PKCS#8
│   │   └── root-cert.pem                    # trust anchor (used for verify-time trust)
│   ├── data/
│   │   └── catalog/
│   │       ├── <videoId>.json               # Video manifest cache
│   │       └── images/<imageId>.json        # Image manifest cache (no canonical bytes)
│   └── public/
│       ├── uploads/                         # Multer temp dir — emptied after each pipeline
│       ├── streams/<videoId>/               # HLS segments + .c2pa sidecars + playlist.m3u8 (source.c2pa.mp4 pinned to IPFS then deleted)
│       └── thumbnails/<videoId>.<ext>       # Video poster images
│
├── frontend/
│   └── src/
│       ├── context/
│       │   └── ThemeContext.jsx             # Dark/Light theme state
│       ├── pages/
│       │   ├── Home.jsx                     # FB-style feed — server-side search/filter/pagination (videos + images mixed)
│       │   ├── VideoDetail.jsx              # Video full details (metadata, Fabric proof, IPFS, C2PA, segments)
│       │   ├── Imagedetail.jsx              # Image full details (metadata, forensics, Fabric proof, IPFS, C2PA)
│       │   ├── TimeLinePage.jsx             # Full media lifecycle visual timeline (video + image)
│       │   ├── FabricAudit.jsx              # Live Fabric audit dashboard (SSE)
│       │   ├── PublicVerify.jsx             # No-login verify-by-upload — drag & drop, real C2PA + hash-fallback check
│       │   └── Admin.jsx                    # Tabbed upload (Video + Image), thumbnail picker, pipeline UI — gated by Clerk when VITE_REQUIRE_ADMIN_AUTH=true
│       ├── components/
│       │   ├── VideoPlayer.jsx              # hls.js + per-segment SHA-256 + tamper overlay + posterUrl
│       │   ├── NewsCard.jsx                 # Reusable card (legacy; current Home uses inline cards)
│       │   ├── ForensicPanel.jsx            # Visualizes the 4 video forensic modules
│       │   ├── VerificationBadge.jsx        # Multi-layer verification badge
│       │   ├── Navbar.jsx                   # Reader navbar (logo + theme toggle + live badge + Verify Content link)
│       │   └── SyncButton.jsx               # Sync-from-blockchain trigger
│       ├── services/
│       │   ├── api.js                       # videoAPI, imageAPI, feedAPI, syncAPI, timelineAPI
│       │   └── hash.js                      # Browser SHA-256 (Web Crypto API)
│
├── network/
│   ├── chaincode/truststream/javascript/    # ★ Fabric chaincode (source of truth)
│   │   ├── index.js                         # TrustStreamContract — register, endorse, tamper, dispute, revoke, query
│   │   └── package.json
│   └── README.md
│
└── benchmarking/                            # Hyperledger Caliper performance suite — see Performance Benchmarking below
    ├── networkconfig.yaml                   # Fabric connection profile + Org1 identity for Caliper
    ├── benchmarks/config.yaml               # Round definitions (workers, rate control, workload module paths)
    ├── workloads/*.js                       # register/query workload modules against truststreamcc
    └── report.html                          # Generated after each run
```

> **Note:** the chaincode is the source of truth in `network/chaincode/`. Copy it into `fabric-samples/chaincode/truststream/` before deploying, and keep the two in sync after edits.

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
│ peer0 :7051    │          │ peer0 :9051    │          │ peer0 :11051   │
│ CouchDB        │          │ CouchDB        │          │ CouchDB        │
└────────────────┘          └────────────────┘          └────────────────┘
```

Every write to `truststreamcc` requires the channel's `AND(Org1MSP.peer, Org2MSP.peer, Org3MSP.peer)` endorsement policy — a peer from all 3 orgs must simulate and sign the exact same proposal before the orderer will let it commit.

---

## Fabric Chaincode Reference

`truststreamcc` — JavaScript chaincode (`fabric-contract-api`), source at `network/chaincode/truststream/javascript/index.js`.

| Function | What it does |
|----------|-------------|
| `RegisterVideoProof(videoId, title, metadataCid, merkleRoot, totalSegments)` | Creates a new video proof, `status: "active"`. Fails if the ID already exists. |
| `RegisterImageProof(imageId, title, sha256Hash, ipfsCid, metadataCid, c2paHash)` | Creates a new image proof, `status: "active"`. |
| `EndorseMedia(mediaType, mediaId)` | Marks an org's explicit endorsement flag (registration already implies all 3 endorsed, since the channel's endorsement policy required it to commit at all). |
| `GetMediaProof(mediaType, mediaId)` | Reads the current state of one proof. |
| `ReportTamper(mediaType, mediaId)` | A single org flags a proof as possibly tampered. The org that originally created the proof is excluded from counting toward its own item's dispute. Idempotent per org. Once **2** distinct non-creator orgs have reported, `status` flips to `"disputed"` and a `MediaDisputed` event fires. |
| `ClearDispute(mediaType, mediaId)` | **Org3MSP (Auditor) only** — resets `status` to `"active"` and clears the tamper-report map. Fails for any other org, and fails if the item isn't currently disputed. Prior tamper reports remain visible via `GetMediaHistory`. |
| `RevokeMedia(mediaType, mediaId, reason)` | Marks a proof `"revoked"` (from `active` or `disputed`). Fails if already revoked. Emits `MediaRevoked`. |
| `GetMediaHistory(mediaType, mediaId)` | Every version this key has ever held, from the ledger's own history index — the basis for the Revocation Timeline. |
| `QueryMedia(queryString)` / `QueryByOrg(mspId)` / `QueryByMediaType(mediaType)` / `QueryRevoked()` | CouchDB rich queries (Mango selectors) — evaluate-only, never submitted as a write. |
| `VerifyVideoProof(videoId, merkleRoot)` / `VerifyImageProof(imageId, sha256Hash)` | Compares a freshly computed hash against the ledger record; `valid` is `true` only if the hash matches **and** the record is neither revoked nor disputed. |

Chaincode events emitted: `MediaRegistered`, `MediaRevoked`, `MediaDisputed`, `MediaDisputeCleared` — the backend's `fabric.service.js` maintains a long-lived listener and re-broadcasts them over SSE at `/api/upload/blockchain/fabric-events`; `FabricAudit.jsx` subscribes with `EventSource`.

---

## Tamper Reports & Dispute Governance

The chaincode implements a 2-of-3 tamper-dispute mechanism directly, with the same governance intent as a multi-party consortium requires:

- **Per-org dedup** — reporting twice from the same org only ever counts once (`tamperReports[orgName] = true`, an idempotent map write)
- **Uploader self-exclusion** — the org that registered a proof cannot count toward disputing its own item; a self-report is still recorded (`uploaderSelfReportAt`) for audit purposes, just not counted toward the threshold
- **Threshold** — once **2** distinct non-creator orgs have called `ReportTamper`, `status` flips to `disputed` automatically
- **Recovery** — only the **Auditor** (`Org3MSP`) can call `ClearDispute`, resetting status to `active`; this is not a delete — the dispute and every prior tamper report remain visible in `GetMediaHistory`
- **Guards** — `ReportTamper` is blocked once a proof is `revoked`; `ClearDispute` requires the proof to currently be `disputed`

This was verified end-to-end via direct `peer chaincode invoke` calls as each org: a single org's report never disputes an item; two distinct non-creator orgs' reports do; a non-Auditor's `ClearDispute` attempt is rejected with `"Only Org3MSP (Auditor) may clear a dispute"`; the Auditor's clears successfully.

---

## C2PA Implementation

TrustStream implements **C2PA v2.2** using the official [`@contentauth/c2pa-node`](https://www.npmjs.com/package/@contentauth/c2pa-node) bindings (Adobe's Rust `c2pa-rs` core) — real, spec-compliant manifests, ES256 (P-256 ECDSA) signed against an X.509 certificate chain, independently re-verifiable by any C2PA-compliant tool, not just TrustStream's own backend.

This is applied to the two artifact classes the format actually supports:

- **Images** — a signed manifest is embedded directly into the image bytes (JUMBF box) before the file is pinned to IPFS, so the canonical decentralized copy is itself the provenance record.
- **Video (source MP4)** — the same real embedding is applied to the original upload, before FFmpeg ever splits it into HLS segments.

HLS `.ts` segments are **not** a C2PA-embeddable container (the spec covers MP4/MOV/JPEG/PNG/WAV/etc — not raw MPEG-TS), so per-segment provenance stays a TrustStream-specific signed JSON sidecar with sequential chain-hash linking, using the same real ES256 identity, raw-signed rather than JUMBF-embedded.

### Signing identity

A self-signed dev/thesis PKI: a root CA cert and a leaf `TrustStream C2PA Signer` cert issued by that root (`c2pa-rs` rejects a bare self-signed leaf at sign time, so a real 2-level chain is required even for local use). Generate with:

```bash
backend/scripts/generate-c2pa-cert.sh
```

Output goes to `backend/certs/c2pa/` (gitignored — private key material). Swap these files for a CA-issued chain in production without touching any signing code — `c2pa.service.js` just reads whatever PEM files are at `C2PA_CERT_CHAIN_PATH` / `C2PA_SIGNING_KEY_PATH` / `C2PA_TRUST_ANCHOR_PATH` (defaulting to `backend/certs/c2pa/`).

### Image — real embedded manifest (3 assertions + automatic hash-binding)

| Assertion Label | Description |
|----------------|-------------|
| `c2pa.hash.data` | SHA-256 hard binding — added automatically by the Builder, not hand-built |
| `c2pa.actions` | Created (with IPTC `digitalSourceType`) + Published |
| `stds.schema-org.CreativeWork` | Image metadata |
| `truststream.consortium` | 3-org endorsement + Fabric ledger + IPFS |

No `c2pa.ingredient` assertion — a fresh upload has no parent asset, so claiming one (as the earlier HMAC-based implementation did) was a spec misuse, corrected in this rewrite.

### Video source MP4 — real embedded manifest (same shape as images)

Same 3 assertions (`c2pa.actions`, `stds.schema-org.CreativeWork`, `truststream.consortium`) plus automatic hash-binding, embedded into the original MP4 and pinned to IPFS as the video's "source of record" (`sourceIpfsCid`, distinct from the per-segment `.ts` pins). Verify directly: `GET /api/upload/:videoId/source-c2pa`.

### Video segment — custom signed JSON sidecar (6 assertions)

| # | Assertion Label | Description |
|---|----------------|-------------|
| 1 | `c2pa.hash.data` | SHA-256 hard binding |
| 2 | `c2pa.actions` | Created + Transcoded (FFmpeg) + Published |
| 3 | `stds.schema-org.CreativeWork` | Segment metadata |
| 4 | `c2pa.timestamp` | TrustStream-internal proof-of-existence hash chain (not an RFC 3161 TSA) |
| 5 | `truststream.consortium` | 3-org endorsement + Fabric ledger + IPFS |
| 6 | `truststream.chain_hash` | Sequential chain-hash provenance |

Signed with a real ES256 signature over the JSON payload (`LocalSigner.sign()`, raw IEEE-P1363 r‖s), verified against the same signing cert's public key via Node's built-in `crypto.verify()` — asymmetric, not the previous HMAC-SHA256 shared-secret scheme, but not JUMBF-embedded either (see the MPEG-TS limitation above).

### Verification

| Artifact | Endpoint | What it does |
|---|---|---|
| Image | `GET /api/upload/images/:imageId/c2pa` | Fetches the actual pinned bytes from IPFS, runs the real C2PA validation pipeline (signature + cert-chain trust + hash-binding) |
| Video source MP4 | `GET /api/upload/:videoId/source-c2pa` | Same, against `sourceIpfsCid` |
| Video segment | `GET /api/upload/c2pa/:videoId/:segmentIndex` | ES256 signature verify against the `.c2pa` sidecar JSON |

A `validation_state: "Trusted"` result means: the ES256 signature is valid, the signing cert chains up to TrustStream's configured trust anchor, and the current bytes still hash-match what was signed — a genuine cryptographic check against live IPFS content, not a stored-value comparison.

### Storage

- **Image:** embedded directly in the pinned file at `ipfsCid` — no separate sidecar
- **Video source MP4:** embedded directly in the pinned file at `sourceIpfsCid` — no separate sidecar
- **Video segments:** `seg_NNN.c2pa` saved next to `seg_NNN.ts` (offline verification)

---

## Public Verification (No Login Required)

`http://localhost:5173/verify` — a drag-and-drop page anyone can use, no Clerk account needed, built on top of the real C2PA work above. `POST /api/upload/public-verify` runs two independent checks, in order:

1. **Embedded-manifest re-validation.** Because a genuine TrustStream image or source MP4 carries its own signed C2PA manifest (see [C2PA Implementation](#c2pa-implementation)), the file is *self-describing* — verification doesn't need to already know which catalog entry it came from. The uploaded bytes are run straight through `verifyEmbeddedAsset()` (the same `Reader.fromAsset` + trust-anchor pipeline used everywhere else in the app), and if the manifest is present and signed by TrustStream's own cert chain, its `instance_id` (`urn:truststream:image:<id>` or `urn:truststream:<id>:source`) is parsed to look up the matching catalog record. This means the check still works on a copy of the file the visitor downloaded independently — it was never re-uploaded to TrustStream for this request to succeed.
2. **Hash fallback.** For content that was never C2PA-embeddable to begin with — a raw `.ts` HLS segment (see the MPEG-TS limitation under [C2PA Implementation](#c2pa-implementation)) — there's nothing to re-validate, so the endpoint falls back to an exact SHA-256 comparison against every stored image hash and every video segment hash in the catalog.

The response distinguishes the two (`matchType: "embedded-c2pa"` vs `"hash-match"` vs `"none"`), and separately reports whatever C2PA data *was* found even when there's no catalog match — e.g. a file carrying a real C2PA manifest signed by a different, untrusted party surfaces as `c2pa.exists: true, c2pa.valid: false`, distinct from a file with no provenance data at all.

Verified end-to-end (see [What's New](#whats-new)) against three real cases: a genuine TrustStream image downloaded fresh from its IPFS gateway URL (→ `embedded-c2pa`, `validation_state: "Trusted"`), an unrelated image (→ `none`), and a raw `.ts` segment pulled directly off disk (→ `hash-match`).

---

## Forensics (AI-Free)

All forensic checks are deterministic — no machine-learning models, no hallucinations, no opaque scores.

### Video forensics (4 modules)

1. **Compression analysis** — bitrate variance, GOP structure, encoder fingerprint, plus a localized windowed anomaly detector
2. **Temporal coherence** — per-frame variance and jump detection, plus windowed SSIM (Wang et al., 2004) between consecutive frames, with confirmed scene cuts weighted directly into the segment score
3. **AV sync** — audio/video drift across segments
4. **Motion / structural** — keyframe distribution

The risk score combines module outputs into a 0..1 scalar; bands: Authentic / Suspicious / Likely Manipulated.

### Image forensics (3 modules)

1. **Compression analysis** — JPEG quantization-table parsing (manipulation often re-saves with non-standard tables)
2. **EXIF metadata** — presence, consistency, camera fingerprint
3. **Error Level Analysis (ELA)** — global re-save PSNR plus a regional/block-level scan for spliced regions, grounded in Krawetz's 2007 *"A Picture's Worth: Digital Image Analysis and Forensics"* — JPEG's own 8×8 block structure means an untampered image degrades uniformly across blocks on re-save, while a pasted/spliced region (different generation history or quality) stands out with a distinctly different error level. `analyzeRegionalELA` re-saves the image, diffs both versions per 8×8 block, and flags blocks whose error is well above the image's own median (`hotThreshold = median × 2.5 + 4`); `elaScore` is `max(globalScore, regionalScore)`, so a spliced region invisible to the whole-image PSNR check can still trigger the module.

Risk formula:
```
risk = 0.45 × Compression + 0.30 × Metadata + 0.25 × ELA
```

Same Authentic / Suspicious / Likely Manipulated bands. The image detail page renders both modules with notes.

---

## Forensic Analysis Modules

Four quantitative forensic modules all live inside **`forensics.service.js`** (one file — see the note above), analyzing video file properties to detect signs of re-encoding, frame splicing, or audio replacement — independently of C2PA or Fabric verification.

### Module 1 — Compression Forensics

Uses FFmpeg/FFprobe to measure per-packet byte size, GOP (I-frame) interval regularity, declared-vs-observed FPS, and container/stream duration consistency. Natively encoded video maintains a stable compression pattern; re-encoding or splicing tends to break it. A 3-tier encoder-tag trust check (recognized TrustStream pipeline tag / generic ffmpeg-libx264 tag / unrecognized tool) avoids penalizing TrustStream's own FFmpeg-based HLS pipeline while still flagging unrecognized re-encoders.

The whole-window bitrate-variation ratio is now paired with a **localized/windowed anomaly scan** (`localizedAnomalyRatio`): a sliding window (40 packets, stride 20) over the packet-size sequence, scoring the worst local coefficient-of-variation instead of only the whole-clip average — the general principle, grounded in the double-compression/splice-localization literature, that block/window-level statistics catch localized tampering that a single global ratio averages away. `compressionScore` takes `max(wholeClipScore, localizedScore)`, so a splice confined to a few seconds of a longer clip no longer gets diluted by the rest of the clip being clean; a dedicated note fires when the localized signal is what actually triggered the score.

### Module 2 — Temporal Consistency

Analyzes pixel-level differences (mean brightness, edge energy, texture variance) between consecutive downsampled grayscale frames (160×90 @ 3fps), now combined with a **windowed Mean SSIM (Structural Similarity Index)** computed per 8×8 block between consecutive frames — Wang, Bovik, Sheikh & Simoncelli, *"Image Quality Assessment: From Error Visibility to Structural Similarity,"* IEEE Trans. Image Processing, 2004. SSIM captures luminance/contrast/structure change together rather than raw pixel-diff magnitude alone, so it's less prone to false-firing on legitimate brightness shifts and more sensitive to actual structural discontinuities at a splice boundary. SSIM anomaly is weighted 0.30 into the per-frame fusion and 0.35 into the module's overall `temporalAnomalyScore` (up from pixel-diff motion alone), and also feeds scene-cut detection alongside the existing motion-spike trigger. A frame-to-frame anomaly above threshold is logged as a candidate scene cut and contributes directly to that segment's own score bucket, so a real splice shows up in the segment-level score instead of being averaged away across quiet segments elsewhere in the clip.

### Module 3 — AV Sync Analysis

Compares motion in a fixed center-lower region of the frame (a mouth-position proxy — no actual face detection) against audio energy, searching a ±700ms lag window for the best correlation. Flags `dubbedOrManipulated` when the best-lag correlation is below 0.45 **or** the offset is at least 180ms (a simple OR of the two conditions, not a combined threshold). This is the algorithmically weakest module — it degrades on off-center framing or multiple speakers, which is disclosed in the report's own `limitations` array.

### Module 4 — Score Fusion Engine

**Segment-level formula:**
```
segmentRiskScore = (Compression × 0.35) + (Metadata × 0.20) + (Temporal × 0.25) + ((1 - AVSync) × 0.20)
```

**Video-level formula:**
```
videoRiskScore = 0.60 × segmentAverage + 0.40 × peakSegment
```

Weighting the peak segment more than an even split means a single tampered segment can't hide behind several clean ones, without letting one segment fully dominate the result either.

**Calibration caveat:** every score-conversion threshold above (e.g. the 0.35/0.9, 0.12/0.55 constants behind the compression scores, the 0.45/180ms AV-sync thresholds, and the module fusion weights themselves) was tuned against a small set of adversarial test clips, not a statistically validated dataset. This is a direct, still-open target for the thesis's Future Work item on large-scale evaluation (ROC/AUC/FPR analysis against a labeled dataset) — an evaluation harness for this is a natural next build.

**Verdict thresholds:**

| Score Range | Status Label | Meaning |
|-------------|-------------|---------|
| 0.00 – 0.30 | ✅ Authentic | Original source, not tampered. |
| 0.31 – 0.60 | ⚠️ Suspicious | Re-encoded or processed. |
| 0.61 – 1.00 | 🚨 Likely Manipulated | Heavy manipulation detected. |

---

## Revocation Timeline Visual

The Revocation Timeline is a purpose-built visual audit interface showing the **complete chronological lifecycle** of any media item, built entirely from `GetMediaHistory` — Fabric's own version history for that ledger key.

### What it shows

| Event type | Color | Source |
|-----------|-------|--------|
| `local` | Gray | Upload accepted (local catalog) |
| `c2pa` | Purple | C2PA manifest signed |
| `ipfs` | Teal | Content pinned to IPFS |
| `register` | Blue | `RegisterVideoProof` / `RegisterImageProof` committed |
| `tamper` | Amber | A distinct org's `ReportTamper` call |
| `disputed` | Red | Chaincode auto-flip to Disputed (2nd non-creator report) |
| `cleared` | Neutral | Auditor's `ClearDispute` |
| `revoked` | Red | `RevokeMedia` |

### API endpoint

```
GET /api/upload/blockchain/revocation-timeline?id=<mediaId>&kind=video|image
```

`timeline.service.js` diffs each consecutive version returned by `GetMediaHistory` to derive tamper/dispute/clear/revoke events, and merges in local-only events (upload, C2PA sign, IPFS pin) that never touch the ledger.

### Where the link appears

- On every Home feed card: **View Timeline** link alongside **View Details**
- On `VideoDetail.jsx` and `Imagedetail.jsx`: an **Immutable Audit Trail** button
- Directly navigable via URL: `/timeline/video/:videoId` or `/timeline/image/:imageId`

---

## Fabric Audit Dashboard

`http://localhost:5173/fabric-audit`

A browsable view of everything the consortium has committed to `mychannel`, since Fabric — being permissioned — has no public block explorer like Etherscan. Summary tiles, filters (all/ready/revoked/degraded/skipped), per-org **and** per-peer endorsement display, and a green **Live** badge — new records appear the instant their block commits, over SSE (no polling), via `GET /api/upload/blockchain/fabric-events`.

---

## Performance Benchmarking (Hyperledger Caliper)

`benchmarking/` contains a [Hyperledger Caliper](https://hyperledger-caliper.github.io/caliper/) suite that load-tests `truststreamcc` directly against the live 3-org network, measuring throughput, end-to-end registration latency, endorsement confirmation time, and behavior under concurrent load.

### Reproducing it

```bash
cd benchmarking
npm install
npm install @hyperledger/fabric-gateway@1.7.1 @grpc/grpc-js@1.13.1   # Caliper's own `caliper bind` hits a spawn bug on Windows; installing the SDK directly works around it
npx caliper launch manager --caliper-workspace . --caliper-networkconfig networkconfig.yaml --caliper-benchconfig benchmarks/config.yaml --caliper-flow-only-test
```

`networkconfig.yaml` connects as the NewsAgency (Org1MSP) admin identity with Fabric service discovery enabled, so every write still needs live endorsement from all 3 orgs' peers — Caliper isn't measuring against a relaxed policy. `benchmarks/config.yaml` defines the rounds; `workloads/*.js` implement them against `RegisterVideoProof`, `RegisterImageProof`, and `GetMediaProof`.

### Results

Six rounds, 301 total transactions, **0 failures**:

| Round | Workers | Txns | Send Rate (TPS) | Avg Latency | Min – Max Latency | Throughput (TPS) |
|---|---|---|---|---|---|---|
| Register video proof | 1 | 20 | 5.3 | **4.67s** | 2.87s – 6.47s | 3.0 |
| Register image proof | 1 | 20 | 5.3 | **1.20s** | 0.23s – 2.17s | 4.8 |
| Register image proof | 5 | 60 | 15.3 | **0.52s** | 0.14s – 0.96s | 14.5 |
| Register image proof | 10 | 100 | 25.2 | **0.46s** | 0.15s – 1.00s | 23.0 |
| Query (`GetMediaProof`) | 5 | 100 | 25.2 | **0.02s** | 0.01s – 0.05s | 25.2 |

Full per-round detail (Caliper's generated report) is written to `benchmarking/report.html` on every run.

### What this shows, against the four metrics this benchmark was built to measure

1. **Throughput** scales close to linearly with concurrency for the write path: ~4.8 TPS at 1 worker → 14.5 TPS at 5 → 23.0 TPS at 10, with zero failures — the network isn't saturated in this range.
2. **End-to-end registration latency**: image registration (1.20s at 1 worker) is markedly faster than video registration (4.67s at 1 worker) in this run; the two weren't tested at matched worker counts back-to-back, so before treating that gap as a real video-vs-image cost difference rather than run-order/warm-up skew, it's worth re-running both at identical worker counts in the same pass.
3. **Endorsement confirmation time** *is* the latency figure above, not a separate number — every write here requires unanimous endorsement from all 3 orgs' peers before Caliper marks it committed, so "avg latency" already includes proposal → endorsement → ordering → commit end to end.
4. **Concurrency scaling**: image-registration latency actually *improved* going from 1→5→10 workers (1.20s → 0.52s → 0.46s avg) while throughput kept climbing — the single-worker case is dominated by one-time gRPC/TLS/discovery setup, which amortizes away under concurrency (see the connection-pooling note below). Read throughput (25.2 TPS, 20ms avg latency) is, as expected, far faster than any write path, since queries skip endorsement and ordering entirely.

**Scale caveat:** this is a small run (≤100 tx/round) on a single-machine Docker deployment (all peers/orderer/CouchDB on one host) — good for validating the methodology and directional results, not a production-representative topology or load. A follow-up run at higher transaction counts and more concurrency levels (e.g. 20, 50 workers) would be needed to find the network's actual saturation point.

### A real optimization this benchmarking exposed

Profiling why single-worker latency was so much higher than 5/10-worker latency led to a genuine fix in the backend itself (not just the benchmark): `fabric.service.js` was opening a brand-new gRPC connection — full TLS handshake plus a Fabric service-discovery round trip — on *every single call*, then closing it immediately after. This is a well-known Fabric anti-pattern; the Gateway API is meant to be connected once and reused. Refactoring to a single pooled connection (still correctly bypassed by the long-lived chaincode event listener, which needs its own connection so its reconnect loop can't tear down the shared one) was verified with a direct A/B timing test — 10 identical calls, old pattern vs new:

| | Avg latency/call | Total (10 calls) |
|---|---|---|
| Old (fresh connect per call) | 231.0ms | 2310ms |
| New (pooled connection) | 30.3ms | 303ms |

**~7.6x faster**, and this improves every real request the app makes — upload, verify, revoke, tamper report — not just the benchmark numbers.

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

| Asset | Local | IPFS | Fabric Ledger | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Video original MP4** | ❌ Temp | ❌ | ❌ | Deleted after FFmpeg |
| **Video HLS segments** | ✅ `public/streams/` | ✅ Pinned | *(covered by Merkle root)* | Local copy serves live playback (see note below); IPFS copy is independently verifiable and playable via the "🌐 Direct from IPFS" toggle on the video detail page |
| **Video .c2pa sidecars** | ✅ Next to segments | *(in metadata JSON)* | — | Allows offline verification |
| **Video metadata JSON** | — | ✅ Pinned | *(cid anchored)* | Sole source for sync recovery |
| **Video forensic report** | — | ✅ Pinned | *(cid in metadata)* | — |
| **Video thumbnail** | ✅ `public/thumbnails/` | — | — | Poster image, not part of provenance |
| **Image bytes** | ❌ Deleted after pin | ✅ Pinned | *(hash anchored)* | IPFS-only |
| **Image C2PA sidecar** | ❌ Never written to disk | ✅ Pinned | *(hash anchored)* | IPFS-only |
| **Image metadata JSON** | — | ✅ Pinned | *(cid anchored)* | Includes sidecar CID + forensics |
| **Manifest catalog (cache)**| ✅ `data/catalog/*` | — | — | Reproducible from the ledger via sync |

> **Note:** The local manifest catalog is just a cache — every byte of canonical content lives on IPFS, every authoritative status lives on the Fabric ledger.

### Why video HLS segments still keep a local copy (and images don't)

Images are genuinely IPFS-only — the temp upload is deleted unconditionally right after pinning, with zero canonical bytes ever kept on the server. Video segments are the one exception, and it's a measured decision, not an oversight: **HLS playback means fetching dozens of segments in sequence while someone is actively watching**, and public IPFS gateways are not fast enough for that.

Measured directly against Pinata's own gateway (the same one this deployment pins to) for a single 2-second segment:

| Request | Result |
|---|---|
| 1st fetch (cold) | **8.07 seconds** for one segment |
| 2nd–5th fetch (same segment, seconds later) | **HTTP 429 — rate limited** |
| Local disk read (5×) | **71–95 milliseconds**, every time |

An 8-second stall to load a 2-second clip — followed by the gateway refusing further requests almost immediately — would make real-time playback unusable, not just slower. So the local HLS cache stays as the default serving path (this is a standard pattern: IPFS as the durable, verifiable source of truth; a local/CDN-style cache for latency-sensitive serving — not a compromise unique to this system). What *did* change: every video detail page now has a **"🌐 Direct from IPFS"** toggle that re-points the same player at a playlist built entirely from IPFS gateway URLs (`GET /api/upload/ipfs-playlist/:videoId`), with an explicit warning about the latency — so the decentralization claim is independently checkable by any viewer, on demand, rather than either (a) asserted without proof or (b) forced onto everyone's default viewing experience at the cost of a broken player.

---

## Immutability Guarantees

The thesis core promise is **"uploaded content cannot be deleted."** This is enforced at four layers:

* **Chaincode:** There is NO delete function anywhere. Only `RevokeMedia` and `ClearDispute` (both status flips, never a deletion). The proof document stays in the ledger's state and version history forever. Status guards prevent revoked media from accepting further tamper reports.
* **IPFS:** Content-addressed by definition. Even if Pinata unpins, the CID still resolves on any other IPFS node that has the content. Hashes anchored on the Fabric ledger let any third party detect substitution.
* **HTTP API:** There are NO `DELETE` routes. The mutation endpoints are `report-tamper`, `clear-dispute`, `revoke` (with per-layer guard rails). The Admin UI exposes no delete affordance.
* **Catalog service:** `removeManifest()` exists for internal sync hygiene only, NOT exposed via any route. The Revocation Timeline endpoint reads and displays the catalog merge — but never deletes from it.

*The Revocation Timeline Visual reinforces all four layers by making the full immutable event log visible and navigable by any user, sourced directly from `GetMediaHistory`.*

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| `docker ps` shows nothing | Docker Desktop off, or WSL integration off | Open Docker Desktop, enable WSL integration in Settings, then `./network.sh up createChannel -c mychannel -ca -s couchdb` |
| Fabric call fails even with `FABRIC_ENABLED=true` | `.env`'s cert/key path wrong | Re-derive the actual path: `find organizations/peerOrganizations/org1.example.com/users -name "*.pem" -o -name "*.crt"` from `fabric-samples/test-network` |
| `ENOENT ... ca.crt` | Wrong WSL distro name in `FABRIC_TLS_CERT_PATH` etc, or using a Linux path when the backend runs on Windows | Check the actual distro name with `wsl -l -v`; use a `//wsl.localhost/<distro>/...` UNC path if the backend runs on Windows |
| `docker build failed: No such image: hyperledger/fabric-nodeenv` | `install-fabric.sh`'s default image set doesn't include the Node chaincode builder image | `docker pull hyperledger/fabric-nodeenv:2.5` |
| `Failed to parse channel configuration, make sure you have jq installed` | `jq` missing | `sudo apt-get install -y jq` |
| Chaincode committed but `Org3MSP: false` | `network.sh deployCC` only installs/approves for Org1+Org2 by default | Manually install + approve for Org3 (see [How to Run — Windows](#how-to-run--windows), Step 8) |
| Fabric status stuck on "registering" | Chaincode/peer connection slow or hung | Wait and refresh; if still stuck, check the backend terminal for a Fabric error |
| Pinata upload forbidden | Pinata plan limit or expired/invalid JWT | Generate a new Pinata JWT, or check the account's storage/plan limit |
| `ledger already exists` message | Channel/network already created | Not an error — ignore and continue |
| Frontend port 5173 busy | Another process already running | Vite switches to 5174 automatically — check the terminal for the actual URL |
| `.env` pushed to GitHub by mistake | — | Rotate the Pinata JWT and any other secret immediately; add `.env` to `.gitignore` |

---

## What's New

### v11 — Verifiable IPFS Playback, Deployment-Breaking URL Fix (September 2026)

* **Measured, not assumed, the local-vs-IPFS video storage trade-off:** prompted by wanting HLS segments to be IPFS-only like images already are, actually benchmarked Pinata's gateway against local disk for segment fetches — 8.07s for a single cold fetch, then `HTTP 429` rate-limiting on every request after. Confirmed that serving live playback directly from a public IPFS gateway would make video unwatchable, not just slower, so the local HLS cache stays as the default serving path. See [Storage Summary](#storage-summary) for the numbers and reasoning.
* **Added a "🌐 Direct from IPFS" toggle** on the video detail page instead: re-points the existing player at a playlist built entirely from IPFS gateway URLs (the backend's `/api/upload/ipfs-playlist/:videoId` route already existed but nothing in the frontend called it), with an explicit latency warning. Lets anyone independently verify the decentralization claim on demand without it costing every viewer a broken default experience.
* **Fixed a real spec bug this surfaced:** `/ipfs-playlist/:videoId` hardcoded `EXT-X-TARGETDURATION:2`, which the v10 segment-duration fix immediately invalidated — real segments now measured up to 2.19s, violating RFC 8216's requirement that target duration be `>=` the longest segment. Now computed as `ceil(max(measured segment durations))`.
* **Fixed a deployment-breaking bug found while auditing this:** `Home.jsx` and `Admin.jsx` hardcoded `http://localhost:3001` for video/thumbnail/playlist URLs in four places, which would have silently broken every video and thumbnail the moment the frontend and backend deployed to different domains. Replaced with a single `API_ORIGIN` constant (derived from `VITE_API_URL`, same variable the API client already used) as the one source of truth.

### v10 — Correct, Configurable HLS Segment Duration (September 2026)

* **Fixed a real correctness bug:** every segment's duration was hardcoded to `2` regardless of what FFmpeg actually produced. `-hls_time N` is only a *target* — FFmpeg cuts at the nearest existing keyframe, so real segment lengths drift whenever the source's GOP structure doesn't divide evenly into `N` seconds, and the final segment of any video is essentially always shorter than the target. This meant every duration shown in the UI (`totalSegments × 2`) was an approximation dressed up as an exact value.
* **Fix:** `-force_key_frames "expr:gte(t,n_forced*N)"` added to the FFmpeg command so segment cuts land close to the intended boundary, and each segment's *actual* duration is now measured via `ffprobe` immediately after segmenting rather than assumed. The measured value flows through everywhere duration was previously fabricated: the catalog, the C2PA segment sidecar's `segment_duration` parameter, and a new `totalDurationSeconds` field (sum of real per-segment durations) that the frontend now displays instead of computing `totalSegments × 2`.
* **Made configurable:** target segment length is now `HLS_SEGMENT_SECONDS` (default 2) instead of a magic number in the FFmpeg command string, documented as an explicit trade-off (shorter = finer tamper localization, more per-video IPFS/C2PA overhead; longer = the reverse).
* **Verified** with a real 7.3-second test upload: measured segment durations came back `2.02s, 2.19s, 2.19s, 1.50s` (summing to the correct `7.90s` total) rather than a fabricated `4 × 2s = 8.0s`.

### v9 — API Hardening, Feed Search, Public Verification (September 2026)

* **Found and fixed a real path-traversal vulnerability (CWE-22):** every video/image lookup route resolved `:videoId`/`:imageId` directly into a catalog filesystem path with no validation — a crafted ID containing `../` segments could read arbitrary `.json` files outside the catalog directory. Fixed with a centralized Express `router.param()` validator (UUID/integer/enum allowlists) that applies to every route using those param names, present and future, verified against both raw and URL-encoded traversal payloads. See [Security & Hardening](#security--hardening).
* **API hardening:** `helmet` security headers, CORS restricted from wide-open (`origin: '*'`) to an `FRONTEND_ORIGIN` allowlist, two-tier `express-rate-limit` (600 req/15min general, 20 req/hour on uploads, 15 req/15min on public-verify), title/description length validation, `trust proxy` for correct client-IP detection behind Render's reverse proxy, and a global JSON error handler replacing Express's default HTML stack-trace page.
* **Server-side feed search, filtering, and pagination:** `GET /api/upload/feed` previously shipped the entire catalog to the browser on every load and paginated client-side. It now does real server-side search (title/description), media-type and status (verified/disputed/revoked) filtering, and pagination (`page`/`limit`, capped at 50/page) — tested against the live catalog (251 entries from earlier Caliper benchmark runs) with correct result counts for search, media-type, and status filters.
* **Public "Verify by Upload" page** (`/verify`, no login required): re-runs the real C2PA validation pipeline directly against whatever file a visitor drops in — genuinely self-contained verification, since a valid TrustStream manifest is embedded in the file itself and doesn't require the file to already be known to the server. Falls back to exact SHA-256 hash matching for content that was never C2PA-embeddable to begin with (raw `.ts` HLS segments). Verified against three real cases: a genuine image re-downloaded from its IPFS gateway URL (`embedded-c2pa`, `validation_state: "Trusted"`), an unrelated image (no match), and a raw segment file pulled off disk (`hash-match`). See [Public Verification](#public-verification-no-login-required).
* **Motivation:** requested as part of making both the frontend and backend "more professional" ahead of deployment — the path-traversal find in particular came directly out of implementing the ID-validation hardening, not from a separate audit pass.

### v8 — Real, Spec-Compliant C2PA (September 2026)

* **Replaced hand-rolled JSON manifests + HMAC-SHA256 with the official C2PA implementation:** `@contentauth/c2pa-node` (Adobe's Rust `c2pa-rs` core) now signs with ES256 (P-256 ECDSA) against a real X.509 certificate chain, embedding genuine JUMBF manifests directly into image bytes and the source MP4 — independently re-verifiable by any C2PA-compliant tool, not just TrustStream's own backend. The previous implementation was a custom JSON structure that merely reused C2PA's assertion *labels*; it never produced anything spec-parseable and was signed with a symmetric shared secret.
* **Signing identity:** a self-signed root CA + leaf "TrustStream C2PA Signer" cert (`backend/scripts/generate-c2pa-cert.sh`, gitignored output in `backend/certs/c2pa/`) — `c2pa-rs` rejects a bare self-signed leaf at sign time, so a real 2-level chain is required even for local/dev use. Swappable for a CA-issued chain in production without touching signing code.
* **Images:** the manifest is embedded directly into the pinned file (`ipfsCid`) — no more separate `.c2pa` sidecar JSON pinned alongside it. Dropped the `c2pa.ingredient` assertion (a fresh upload has no parent asset; claiming one was a spec misuse in the old implementation). `sha256Hash` is now recomputed from the embedded bytes before Fabric registration, so the on-chain hash matches what IPFS actually serves.
* **Video:** the *original* MP4 — a genuinely C2PA-embeddable container, unlike the `.ts` HLS segments produced from it — gets a real embedded manifest before FFmpeg ever touches it, pinned to IPFS separately as the video's "source of record" (`sourceIpfsCid`, verify via `GET /:videoId/source-c2pa`). Per-segment sidecars stay a TrustStream-specific signed JSON scheme (MPEG-TS isn't C2PA-embeddable) but now use a real ES256 signature over the payload, verified via Node's `crypto.verify()` against the same signing cert — asymmetric, not the previous shared-secret HMAC.
* **New verification model:** `GET /images/:imageId/c2pa` and `GET /:videoId/source-c2pa` now fetch the actual bytes from IPFS and run the full C2PA validation pipeline (signature + cert-chain trust + hash-binding against live content) rather than recomputing a stored HMAC — a `validation_state: "Trusted"` result is a genuine cryptographic guarantee, not a self-consistency check.
* **Verified end-to-end through the real upload API** (not just standalone scripts): real image and video uploads produced manifests that came back `validation_state: "Trusted"` after being independently re-fetched from IPFS and re-validated, and successfully registered on the Fabric ledger with all 3 orgs' endorsement.

### v7 — Literature-Grounded Forensics Upgrade (September 2026)

* **Windowed/localized compression anomaly detection:** `analyzeCompressionAndMetadata` now pairs the existing whole-clip bitrate-variation ratio with a sliding-window scan (`localizedAnomalyRatio`, window 40 packets / stride 20) over per-packet sizes, taking `max(wholeClipScore, localizedScore)` — closing the exact "Known limitation" the v6 audit documented (single whole-window ratios averaging out a localized splice). Grounded in the general block/window-level-statistics-outperform-global-statistics principle from the double-compression/splice-localization literature (window scanning implemented directly, without the ML/SVM classifiers those papers actually train, to preserve the AI-free design constraint).
* **SSIM-based temporal consistency:** `analyzeTemporalConsistency` adds windowed Mean SSIM (Wang, Bovik, Sheikh & Simoncelli, *"Image Quality Assessment: From Error Visibility to Structural Similarity,"* IEEE Trans. Image Processing, 2004) computed per 8×8 block between consecutive frames, alongside the existing pixel-diff motion statistics. Weighted 0.30 into per-frame fusion and 0.35 into the module's `temporalAnomalyScore`, and feeds scene-cut detection. SSIM jointly captures luminance/contrast/structure change instead of raw pixel-diff magnitude, reducing false positives on legitimate brightness shifts while catching structural discontinuities pixel-diff alone can miss.
* **Regional/block-level Error Level Analysis for images:** `analyzeELA` (image-forensics.service.js) adds a block-level scan (Krawetz, 2007, *"A Picture's Worth: Digital Image Analysis and Forensics"*) alongside the existing whole-image re-save PSNR check — `analyzeRegionalELA` diffs an 8×8-block grid between the original and a re-saved copy, flagging blocks whose error exceeds `median × 2.5 + 4`. `elaScore = max(globalScore, regionalScore)`, so a spliced region invisible to whole-image PSNR can still trigger the module. Image risk formula corrected in this same pass to reflect what the code has always computed: `0.45×Compression + 0.30×Metadata + 0.25×ELA` (the README previously and incorrectly documented a 2-module `0.60/0.40` formula with no ELA term).
* **Verified against real generated media**, not just unit-level assertions: synthetic MP4/JPEG test files run through the actual functions confirmed sane, non-degenerate, differentiated output — e.g. `meanSSIM: 0.974` / `ssimAnomalyScore: 0` on genuinely smooth synthetic footage (no false alarm), and a regional ELA score (`0.385`) meaningfully diverging from the global PSNR-based score (`0.146`) on a re-saved JPEG, proving the regional pass captures signal the global check alone misses. Also confirmed via a real upload through the live `/api/upload` endpoint that the updated modules execute correctly inside the production pipeline, not just in isolation.
* **Researched, not implemented:** Benford's Law analysis of JPEG DCT coefficient distributions (Fu, Shi & Su, 2007) was reviewed as a candidate image-forensics addition but not built — it requires decoding the JPEG's Huffman-encoded entropy scan to recover raw DCT coefficients, which the project's hand-written JPEG parser doesn't currently do (it only reads the DQT/quantization-table markers). Left as a genuine future-work item rather than a shortcut implementation.

### v6 — Hyperledger Caliper Benchmarking + Connection-Pooling Fix (September 2026)

* **Performance benchmarking suite added:** `benchmarking/` runs Hyperledger Caliper directly against the live 3-org network (see [Performance Benchmarking](#performance-benchmarking-hyperledger-caliper)) — throughput, end-to-end registration latency, endorsement confirmation time, and behavior under concurrent load (1/5/10 workers), all with 0 failures across 301 transactions.
* **Real optimization found via benchmarking, not just measured:** `fabric.service.js` was opening and tearing down a fresh gRPC + TLS + service-discovery connection on *every single call* — a known Fabric anti-pattern. Refactored to a single pooled connection (the long-lived chaincode event listener deliberately keeps its own separate connection so its reconnect loop can't tear down the shared one). Verified with a direct A/B timing test: ~7.6x faster per call (231.0ms → 30.3ms avg), improving every real request the app makes, not just benchmark numbers.
* **Admin session auto-logout:** `/admin` now supports a hard 24-hour session cap (`useSession()`'s `createdAt` + a single `setTimeout` to `signOut()`), independent of Clerk's own dashboard-configured session lifetime, gated behind `VITE_REQUIRE_ADMIN_AUTH=true`.
* **Raw ledger JSON viewer:** both the Fabric Audit dashboard and the individual video/image detail pages now have a "View raw ledger JSON" toggle showing the exact `fabricResult` document as stored on the chaincode — no need to open CouchDB's Fauxton UI to see what's actually on the ledger.
* **Fabric Audit dashboard gained dispute visibility:** disputed-status filter/stat box, per-record tamper-reporting-org list, and TX ID/block number display — previously only shown on individual detail pages.
* **Dead code removed:** a full README audit against the actual codebase found a second, orphaned username/password auth system (`auth.routes.js`, `AuthContext.jsx`, `Login.jsx`, `ProtectedRoute.jsx`) sitting alongside the live Clerk-based auth — mounted on the backend but never called by the frontend, no `/login` route pointing at it. Deleted, along with `news.routes.js` (not even mounted in `server.js`). Also fixed a phantom file reference in the README itself (`forensic.service.js` doesn't exist — the score-fusion logic actually lives in `forensics.service.js`) and documented `merkle.service.js` and `benchmarking/`, both of which were missing from Project Structure.
* **Forensic module files were also duplicated dead code:** `compression.service.js`, `temporal.service.js`, and `avsync.service.js` were never `require()`'d anywhere — `forensics.service.js` has always contained its own complete inline copy of all four modules (confirmed by diffing the two copies). Deleted the three orphaned files. While auditing this, also found and fixed three README claims that didn't match the actual running code: Module 1's "sliding-window anomaly scan" doesn't exist (bitrate/GOP scores are single whole-window ratios, not localized), Module 3's dubbed-detection is a plain OR of two thresholds (not the combined-condition logic previously described), and the video-level fusion formula is `0.60×avg + 0.40×peak`, not `0.50/0.50` as documented.

### v5 — Fully Migrated to Hyperledger Fabric, Ethereum Removed (September 2026)

* **Ethereum entirely removed:** `TrustStream.sol`, Hardhat tooling, `wallet.js`, MetaMask UI, the `web3` dependency, and every Ethereum-shaped API route (`/blockchain/txlogs`, `/blockchain/receipt/:txHash`, `/blockchain/network-status`, `/blockchain/wallet-balances`, per-segment tx/gas fields) are gone. TrustStream is now a **single-chain, permissioned Hyperledger Fabric system** — no public testnet, no wallets, no gas.
* **Chaincode governance parity:** `truststreamcc` gained `ReportTamper` and `ClearDispute` — a 2-of-3 org tamper-dispute threshold (excluding the registering org's own report) with Auditor-only recovery, ported from the old Solidity contract's design intent and verified end-to-end via direct `peer chaincode invoke` calls as each org.
* **`txId`/`blockNumber` capture:** every chaincode submit now captures the Fabric transaction ID and committed block number from the Gateway's commit status, becoming the Fabric-native replacement for what used to be an Ethereum `txHash`/`blockNumber` in the UI.
* **Revocation Timeline rebuilt on `GetMediaHistory`:** `timeline.service.js` now diffs consecutive ledger versions to derive register/tamper/disputed/cleared/revoked events, instead of reading an Ethereum TxLog ring buffer.
* **C2PA consortium assertion is Fabric-native:** `truststream.consortium` now embeds the channel name, chaincode name, and each org's MSP ID instead of a chain address/contract.
* **Frontend:** Navbar's MetaMask connect button removed; `VideoDetail.jsx`/`Imagedetail.jsx` lost their Ethereum "Blockchain Info" panels and gained a Tamper Reports & Dispute section (Report Tamper / Clear Dispute buttons, dispute banner); Admin's duplicate "Blockchain 3-org endorsement" pipeline step (redundant with the Fabric step) was removed.
* **Known scope reduction vs the old Ethereum contract:** registration stays whole-media (one Merkle root per video, one hash per image) rather than per-segment — idiomatic Fabric usage that avoids N chain transactions per upload, at the cost of per-segment endorsement/tx granularity in the UI.
