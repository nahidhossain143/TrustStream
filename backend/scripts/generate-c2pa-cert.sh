#!/usr/bin/env bash
# -----------------------------------------------------------------
#  Generates TrustStream's C2PA signing identity: a self-signed root
#  CA and a leaf "TrustStream C2PA Signer" cert issued by that root
#  (ES256 / P-256 ECDSA throughout). c2pa-rs rejects a bare self-signed
#  leaf at sign time, so a real (if self-issued) 2-level chain is
#  required even for local/dev use.
#
#  Run once per machine/deployment. Output goes to backend/certs/c2pa/
#  (gitignored - this is private key material, even though it's a
#  self-signed dev identity with no external CA trust).
#
#  Requires: openssl. On Windows, run via Git Bash / WSL.
# -----------------------------------------------------------------
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/certs/c2pa"
mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

export MSYS_NO_PATHCONV=1  # avoid Git-Bash mangling the -subj path-like strings

echo "Generating root CA..."
openssl ecparam -name prime256v1 -genkey -noout -out root-key.pem
openssl req -new -x509 -key root-key.pem -out root-cert.pem -days 3650 \
  -subj "/C=BD/O=Ahsanullah University of Science and Technology/OU=TrustStream Root CA/CN=TrustStream Root CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

echo "Generating leaf signing cert..."
openssl ecparam -name prime256v1 -genkey -noout -out leaf-key.pem
openssl req -new -key leaf-key.pem -out leaf.csr \
  -subj "/C=BD/O=Ahsanullah University of Science and Technology/OU=TrustStream News Network/CN=TrustStream C2PA Signer"

printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\nextendedKeyUsage=critical,emailProtection\n" > leaf-ext.cnf
openssl x509 -req -in leaf.csr -CA root-cert.pem -CAkey root-key.pem -CAcreateserial \
  -out leaf-cert.pem -days 3650 -extfile leaf-ext.cnf

echo "Converting leaf key to PKCS#8 (required by @contentauth/c2pa-node)..."
openssl pkcs8 -topk8 -nocrypt -in leaf-key.pem -out leaf-key-pkcs8.pem
mv leaf-key-pkcs8.pem leaf-key.pem

echo "Building full chain (leaf + root)..."
cat leaf-cert.pem root-cert.pem > signing-chain.pem

rm -f leaf.csr leaf-ext.cnf root-cert.srl

echo "Verifying chain..."
openssl verify -CAfile root-cert.pem leaf-cert.pem

echo ""
echo "Done. Files written to $CERT_DIR:"
echo "  signing-chain.pem  - leaf+root cert chain (used by LocalSigner)"
echo "  leaf-key.pem       - leaf private key, PKCS#8 (used by LocalSigner)"
echo "  root-cert.pem       - trust anchor (used for verify-time trust)"
echo ""
echo "These are dev/thesis identity files (self-signed root, not a CA-issued"
echo "chain). Swap them for a real CA-issued chain in production without"
echo "changing any signing code - c2pa.service.js just reads whatever PEM"
echo "files are at these paths (overridable via C2PA_CERT_CHAIN_PATH /"
echo "C2PA_SIGNING_KEY_PATH / C2PA_TRUST_ANCHOR_PATH)."
