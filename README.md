TrustStream: Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming

TrustStream is a research-based framework designed to combat the growing crisis of trust in digital news caused by Generative AI and deepfakes. By integrating Hyperledger Fabric with C2PA-compliant video processing, this project provides a decentralized, scalable architecture for ensuring the authenticity and integrity of digital news content.
📖 Introduction

The rapid advancement of synthetic media has made it increasingly difficult to verify the credibility of digital news. While the Coalition for Content Provenance and Authenticity (C2PA) offers cryptographic standards, existing models are often centralized and lack empirical validation for high-volume news streaming.

TrustStream addresses these gaps by:

    Moving away from centralized trust models to a multi-organization consortium.

    Integrating blockchain technology to create an immutable record of media provenance.

    Benchmarking performance metrics like throughput and latency for real-world news workloads.

🛠 Methodology

The TrustStream framework operates through a four-step pipeline to ensure secure and verifiable news processing:

    Ingestion: News video files are collected and segmented into granular chunks (2s, 4s, or 6s) using FFmpeg for efficient processing.

    Hashing: Each segment is cryptographically hashed using a C2PA-compliant generator.

    Endorsement & Validation: A consortium of organizations (simulated as 3, 5, or 7 members) executes endorsement policies to sign and validate the hashes.

    Benchmarking: System performance is evaluated using Hyperledger Caliper to measure Transactions Per Second (TPS) and commit latency.

🔬 Research Gaps Addressed

    G1: Lack of Empirical Validation – Lack of systematic benchmarking for news processing workloads.

    G2: Centralized Trust Models – Incompatibility with multi-organization news consortia.

    G3: Verification Latency – Delays in timely verification as media volume increases.

👥 Contributors

    Nadia Supti (ID: 20220104002) 

    Sumaiya Aftab (ID: 20220104116) 

    Md Nahid Hossain (ID: 20220104146) 

Program: B.Sc. in Computer Science and Engineering Institution: Ahsanullah University of Science and Technology (AUST) Date: February 2026 
📜 Conclusion

TrustStream bridges the gap between theoretical provenance standards and real-world operational requirements. It offers a robust, decentralized solution to combat misinformation and restore public confidence in digital media.


how to run:
# TrustStream 📡
> Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming

A tamper-resistant digital news platform that uses **SHA-256 chain hashing** + **PostgreSQL** to verify the integrity of every video segment in real-time.

---

## Prerequisites

Make sure these are installed on your machine:

| Tool | Download |
|------|----------|
| Node.js (v18+) | https://nodejs.org |
| PostgreSQL (v18) | https://www.postgresql.org/download/windows |
| FFmpeg | https://ffmpeg.org/download.html |
| Git | https://git-scm.com |

---

## Setup Guide

### 1. Clone the repository

```bash
git clone https://github.com/nahidhossain143/TrustStream.git
cd TrustStream
```

---

### 2. PostgreSQL Setup

Open **pgAdmin** or use psql:

```sql
CREATE DATABASE truststream;
```

Then run the schema:

```bash
# Add PostgreSQL to PATH first (adjust version if needed)
set PATH=%PATH%;C:\Program Files\PostgreSQL\18\bin

psql -U postgres -h 127.0.0.1 -p 5432 -d truststream -f backend/src/config/schema.sql
```

---

### 3. Backend Setup

```bash
cd backend
npm install
```

Open `backend/src/config/db.js` and update your PostgreSQL password:

```js
const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'truststream',
  user: 'postgres',
  password: 'YOUR_POSTGRES_PASSWORD', // ← change this
  ...
});
```

Start the backend:

```bash
node src/server.js
```

You should see:
```
✅ PostgreSQL connected successfully
Server running on http://localhost:3001
```

---

### 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: **http://localhost:5173**

---

## How to Use

### Upload News Video (Admin)
1. Go to `http://localhost:5173/admin`
2. Enter a news title
3. Select an MP4 video file
4. Click **Upload & Generate Hashes**
5. Backend will: segment video → generate SHA-256 hash for each segment → save to DB

### Watch & Verify (Home)
1. Go to `http://localhost:5173`
2. Select a news video from the sidebar
3. As each segment plays, the browser computes its hash and compares with the DB
4. **🛡️ Authentic** = segment is untampered
5. **⚠️ Tampered** = segment has been modified

---

## Project Structure

```
TrustStream/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js          # PostgreSQL connection
│   │   │   └── schema.sql     # Database schema
│   │   ├── models/
│   │   │   └── video.model.js # DB query functions
│   │   ├── routes/
│   │   │   ├── upload.routes.js  # Upload + verify API
│   │   │   └── news.routes.js
│   │   └── server.js
│   └── public/
│       └── streams/           # Generated .ts segments
└── frontend/
    └── src/
        ├── pages/
        │   ├── Home.jsx       # Video player + verification
        │   └── Admin.jsx      # Upload panel
        └── components/
            ├── VideoPlayer.jsx
            └── VerificationBadge.jsx
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload video |
| GET | `/api/upload/videos` | List all videos |
| GET | `/api/upload/videos/:id/segments` | Get segment hashes |
| POST | `/api/upload/verify` | Verify a segment hash |

---

## Tech Stack

- **Frontend:** React.js + Tailwind CSS + hls.js
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Video Processing:** FFmpeg
- **Hashing:** SHA-256 (Web Crypto API + Node crypto)
- **Streaming:** HLS (HTTP Live Streaming)
