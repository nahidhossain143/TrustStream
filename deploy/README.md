# Deploying TrustStream on free tiers

This guide puts the whole system online for free: the React frontend on **Vercel**, and the backend plus the full 3-org Hyperledger Fabric network on one **Oracle Cloud Always Free** ARM VM. Pinata (IPFS) and Clerk (admin sign-in) keep running on their free plans, the same way they do in local development.

```text
Browser ──HTTPS──► Vercel             static React build (frontend/)
   │
   └─────HTTPS──► <name>.duckdns.org
                    └─ Caddy :443 ──► Express API  localhost:3001   (systemd: truststream-backend)
                                         └─ gRPC/TLS ──► Fabric on the same VM, in Docker:
                                                          orderer, peer0.org1/2/3, 4 CAs, 3 CouchDB
```

**Why one big VM?** The Fabric network is about 14 containers and needs roughly 4–6 GB of RAM. Oracle's Always Free Ampere allowance (4 OCPU, 24 GB RAM) is the only free option large enough. PaaS free tiers like Render don't work: they can't run Docker containers, their disk is wiped on restart, and they sleep when idle, which kills the Fabric event listener.

The scripts in [`vm/`](vm/) pin the exact versions the project was tested with: Fabric 2.5.16, Fabric CA 1.5.17, and a fixed fabric-samples commit (see [`vm/config.sh`](vm/config.sh)). They work on Ubuntu 22.04/24.04, on either arm64 or x86_64, so a non-Oracle VM with 8 GB or more of RAM also works.

---

## 1. Create the Oracle Cloud VM

1. Sign up at [cloud.oracle.com](https://cloud.oracle.com) for the free tier. A credit/debit card is required for identity verification, but Always Free resources are not charged.
   **Your home region is permanent**, and Always Free compute exists only there. Pick one close to your users that has Ampere (A1) capacity, for example Singapore, Mumbai or Hyderabad.
2. Go to **Compute → Instances → Create instance**:
   - **Image:** Canonical Ubuntu **22.04** (the version this was tested on; 24.04 also works)
   - **Shape:** Ampere → `VM.Standard.A1.Flex`, **4 OCPU, 24 GB memory**
   - **Networking:** create a new VCN with a public subnet, and keep **Assign a public IPv4 address** checked
   - **SSH keys:** download the generated private key, or paste your own public key
   - **Boot volume:** set a custom size of **100 GB** (Always Free includes 200 GB in total)

   If you get *"Out of capacity"*, try another availability domain or retry later. A1 capacity comes and goes.
3. Open the web ports. Go to **Networking → Virtual cloud networks → (your VCN) → Security Lists → Default Security List → Add Ingress Rules** and add two rules:
   - Source CIDR `0.0.0.0/0`, IP protocol TCP, destination port **80**
   - Source CIDR `0.0.0.0/0`, IP protocol TCP, destination port **443**

   Do **not** open 3001, 7050–11054 or 5984. The API, peers and CouchDB are reached only through Caddy or from the VM itself.
4. Note the instance's **public IP**.

## 2. Get a free hostname (DuckDNS)

Let's Encrypt needs a hostname, not a bare IP. Sign in at [duckdns.org](https://www.duckdns.org), create a subdomain, and set its IP to the VM's public IP. The rest of this guide calls the result `<name>.duckdns.org`.

## 3. Set up the server

```bash
ssh -i <private-key> ubuntu@<public-ip>

git clone https://github.com/nahidhossain143/TrustStream.git ~/TrustStream
# (add  -b dev  while deploy/ hasn't been merged into main yet)

~/TrustStream/deploy/vm/1-install-prereqs.sh   # firewall, Docker, Node 22, FFmpeg, Caddy
exit                                           # log out once so the docker group applies
```

```bash
ssh -i <private-key> ubuntu@<public-ip>

~/TrustStream/deploy/vm/2-fabric-network.sh    # 3-org network + truststreamcc, ~10-15 min
~/TrustStream/deploy/vm/3-backend.sh           # asks for your Pinata JWT
DOMAIN=<name>.duckdns.org ~/TrustStream/deploy/vm/4-https.sh
```

Each script prints a `NEXT:` line telling you what to run after it. Script 3 also prints the Broadcaster and Auditor portal passcodes. Keep them, since you need them to approve uploads.

When script 4 finishes, `https://<name>.duckdns.org/health` should return `{"status":"ok",...}`.

## 4. Deploy the frontend on Vercel

1. On [vercel.com](https://vercel.com), go to **Add New → Project** and import the GitHub repository.
2. Set **Root Directory** to `frontend`. The framework preset (Vite), build command and output directory are detected automatically.
3. Add these **Environment Variables**:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://<name>.duckdns.org` (no trailing slash) |
   | `VITE_CLERK_PUBLISHABLE_KEY` | your key from the Clerk dashboard |
   | `VITE_REQUIRE_ADMIN_AUTH` | `true` |
   | `VITE_IPFS_GATEWAY` | `https://gateway.pinata.cloud/ipfs` |
   | `VITE_FABRIC_CHANNEL_NAME` | `mychannel` |
   | `VITE_FABRIC_CHAINCODE_NAME` | `truststreamcc` |
   | `VITE_FABRIC_MSP_ID` | `Org1MSP` |
   | `VITE_FABRIC_PEER_HOST_ALIAS` | `peer0.org1.example.com` |

4. Click **Deploy** and note the URL, for example `https://truststream.vercel.app`.

`VITE_*` values are compiled into the build. After you change one, redeploy from the Vercel dashboard for the change to take effect.

## 5. Restrict CORS to the frontend

On the VM:

```bash
~/TrustStream/deploy/vm/set-frontend-origin.sh https://<your-project>.vercel.app
```

Until you run this, the API accepts requests from any origin and logs a warning at startup.

## 6. Smoke test

Open the Vercel URL and run one item through the whole pipeline:

1. Upload a small image in **/admin**.
2. Approve it in **/broadcaster**, then in **/auditor**, using the passcodes from step 3.
3. Check that it appears in the public feed with the Fabric, C2PA and IPFS badges.

This is the first real **write** to the new ledger, and it needs all three orgs' peers to endorse it. Script 2 only checked reads.

---

## Operations

| Task | Command (on the VM) |
|---|---|
| Backend logs | `sudo journalctl -u truststream-backend -f` |
| Peer logs | `docker logs -f peer0.org1.example.com` |
| Restart backend | `sudo systemctl restart truststream-backend` |
| Deploy new backend code | `cd ~/TrustStream && git pull && cd backend && npm ci --omit=dev && sudo systemctl restart truststream-backend` |
| Container status | `docker ps --format 'table {{.Names}}\t{{.Status}}'` |

- **Reboots** are safe. The Fabric containers have `restart: unless-stopped` and the backend is a systemd service, so both come back on their own.
- **Chaincode changes** need a Fabric lifecycle upgrade on all three orgs: bump the version and sequence, then install and approve for Org1, Org2 and Org3. These scripts don't automate that. `FRESH=1 2-fabric-network.sh` redeploys from scratch, but it **wipes the ledger**.
- **Where data lives:**
  - The ledger is in Docker volumes on the VM.
  - The local catalog cache is in `backend/data/catalog`. It can be rebuilt with `POST /api/upload/sync-from-blockchain`.
  - The HLS segments are in `backend/public/streams`.

  Back up the VM's boot volume if the data matters.

## Limits to know about

- **One VM runs all three orgs.** This is a demo deployment of the consortium, with the same trust model as local development. A real consortium would run each org's peer on infrastructure that org controls.
- **The ledger starts empty.** Data from a local network isn't migrated.
- **Free-tier limits:** Oracle can reclaim Always Free instances that stay idle for a long time. Pinata's free plan caps storage and file count and rate-limits its gateway. Clerk's development instance shows a "development mode" badge. Check each provider's current limits, since they change.
