#!/usr/bin/env bash
# -----------------------------------------------------------------
#  Step 2 of 4 - the 3-org Hyperledger Fabric network + chaincode.
#
#  Brings up the same topology as local development: orderer,
#  Org1 (NewsAgency), Org2 (Broadcaster), Org3 (Auditor), each with
#  its own Fabric CA and CouchDB, on channel "mychannel", then
#  deploys truststreamcc with the unanimous AND(Org1,Org2,Org3)
#  endorsement policy - including the manual Org3 install/approve
#  that network.sh deployCC doesn't do on its own.
#
#  Refuses to touch an existing network unless FRESH=1 is set,
#  because tearing it down deletes every registered proof.
# -----------------------------------------------------------------
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

docker info >/dev/null 2>&1 \
  || die "Docker isn't usable by '$USER' yet. Log out, SSH back in (docker group), and re-run."

if docker ps -a --format '{{.Names}}' | grep -qx 'peer0.org1.example.com'; then
  [ "${FRESH:-0}" = "1" ] \
    || die "A Fabric network already exists on this VM. Re-run with FRESH=1 to WIPE it (deletes ALL ledger data) and start over."
  warn "FRESH=1 - the existing network and all of its ledger data will be deleted"
fi

step "Fetching fabric-samples @ ${FABRIC_SAMPLES_COMMIT:0:7}"
mkdir -p "$FABRIC_HOME"
if [ ! -d "$FABRIC_SAMPLES/.git" ]; then
  git clone --quiet --filter=blob:none https://github.com/hyperledger/fabric-samples.git "$FABRIC_SAMPLES"
fi
git -C "$FABRIC_SAMPLES" fetch --quiet origin
git -C "$FABRIC_SAMPLES" -c advice.detachedHead=false checkout --quiet "$FABRIC_SAMPLES_COMMIT"

if ! "$FABRIC_SAMPLES/bin/peer" version 2>/dev/null | grep -q "v$FABRIC_VERSION"; then
  step "Downloading Fabric $FABRIC_VERSION binaries + Docker images (Fabric CA $FABRIC_CA_VERSION)"
  cd "$FABRIC_SAMPLES"
  curl -sSLf -o install-fabric.sh \
    "https://raw.githubusercontent.com/hyperledger/fabric/$INSTALL_FABRIC_COMMIT/scripts/install-fabric.sh"
  chmod +x install-fabric.sh
  # Run from inside fabric-samples so bin/ and config/ land right here.
  ./install-fabric.sh --fabric-version "$FABRIC_VERSION" --ca-version "$FABRIC_CA_VERSION" docker binary
else
  step "Fabric $FABRIC_VERSION binaries already present"
fi

step "Pulling fabric-nodeenv:2.5 (builds JavaScript chaincode; not part of the image set above)"
docker pull --quiet hyperledger/fabric-nodeenv:2.5

step "Copying truststreamcc chaincode into fabric-samples"
mkdir -p "$FABRIC_SAMPLES/chaincode/truststream"
rm -rf "$FABRIC_SAMPLES/chaincode/truststream/javascript"
cp -r "$REPO_DIR/network/chaincode/truststream/javascript" "$FABRIC_SAMPLES/chaincode/truststream/"
rm -rf "$FABRIC_SAMPLES/chaincode/truststream/javascript/node_modules"

cd "$TEST_NETWORK"

step "Clearing any leftover network state"
./network.sh down || true

step "Starting orderer + Org1 (NewsAgency) + Org2 (Broadcaster), CAs + CouchDB; creating channel '$CHANNEL_NAME'"
./network.sh up createChannel -c "$CHANNEL_NAME" -ca -s couchdb

step "Adding Org3 (Auditor)"
(cd addOrg3 && ./addOrg3.sh up -c "$CHANNEL_NAME" -ca -s couchdb)

step "Deploying $CC_NAME v$CC_VERSION (sequence $CC_SEQUENCE) with endorsement policy $CC_POLICY"
./network.sh deployCC -c "$CHANNEL_NAME" -ccn "$CC_NAME" \
  -ccp ../chaincode/truststream/javascript -ccl javascript \
  -ccv "$CC_VERSION" -ccs "$CC_SEQUENCE" -ccep "$CC_POLICY"

# --- Org3 ------------------------------------------------------------------
# deployCC only installs/approves for Org1 + Org2 (enough to commit under the
# channel's MAJORITY lifecycle policy). With an AND(...) endorsement policy
# Org3's peer must also run the chaincode, or every write fails endorsement.
export PATH="$FABRIC_SAMPLES/bin:$PATH"
export FABRIC_CFG_PATH="$FABRIC_SAMPLES/config/"
export TEST_NETWORK_HOME="$TEST_NETWORK"
set +u  # envVar.sh reads unset vars (OVERRIDE_ORG, VERBOSE)
. scripts/envVar.sh
set -u
as_org() { set +u; setGlobals "$1"; set -u; }
org3_approved() {
  peer lifecycle chaincode querycommitted -C "$CHANNEL_NAME" -n "$CC_NAME" --output json \
    | jq -r '.approvals.Org3MSP'
}

as_org 3
if [ "$(org3_approved)" != "true" ]; then
  step "Installing + approving $CC_NAME for Org3 (deployCC skips it)"
  peer lifecycle chaincode install "$TEST_NETWORK/$CC_NAME.tar.gz" || echo "    (install reported an error - checking whether it's already installed)"
  package_id=$(peer lifecycle chaincode queryinstalled --output json \
    | jq -r --arg label "${CC_NAME}_${CC_VERSION}" '.installed_chaincodes[]? | select(.label==$label) | .package_id' \
    | head -1)
  [ -n "$package_id" ] || die "Package ${CC_NAME}_${CC_VERSION} is not installed on peer0.org3"
  echo "    package id: $package_id"
  peer lifecycle chaincode approveformyorg -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" --name "$CC_NAME" --version "$CC_VERSION" \
    --package-id "$package_id" --sequence "$CC_SEQUENCE" --signature-policy "$CC_POLICY"
  for _ in $(seq 1 20); do
    [ "$(org3_approved)" = "true" ] && break
    sleep 3
  done
fi
[ "$(org3_approved)" = "true" ] || die "Org3's approval never appeared in querycommitted"
echo "    approvals: $(peer lifecycle chaincode querycommitted -C "$CHANNEL_NAME" -n "$CC_NAME" --output json | jq -c '.approvals')"

step "Smoke test: read query on every org's peer"
for org in 1 2 3; do
  as_org "$org"
  result=$(peer chaincode query -C "$CHANNEL_NAME" -n "$CC_NAME" -c '{"Args":["QueryByMediaType","video"]}')
  echo "    peer0.org$org  QueryByMediaType(video) -> $result"
done

step "Setting restart policies so the network survives a VM reboot"
# Chaincode containers (dev-peer*) are left alone - the peers recreate them
# on demand after a restart.
docker ps --format '{{.Names}}' | grep -v '^dev-peer' | xargs -r docker update --restart unless-stopped >/dev/null

step "Done - Fabric network is up"
docker ps --format 'table {{.Names}}\t{{.Status}}'
echo
echo "  NEXT: $REPO_DIR/deploy/vm/3-backend.sh"
