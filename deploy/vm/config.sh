# Shared settings for the TrustStream VM deploy scripts (sourced, not run).
# Any of these can be overridden by exporting it before running a script,
# e.g.  DOMAIN=truststream.duckdns.org ./4-https.sh

# Pinned to the exact versions the project was developed and tested against.
FABRIC_VERSION="${FABRIC_VERSION:-2.5.16}"
FABRIC_CA_VERSION="${FABRIC_CA_VERSION:-1.5.17}"
# fabric-samples commit the local test-network was built from. Its main
# branch moves independently of the 2.5.16 binaries/images, so it's pinned
# rather than tracking main.
FABRIC_SAMPLES_COMMIT="${FABRIC_SAMPLES_COMMIT:-6354d2501298da94f41650dc23647020a3f02576}"
# install-fabric.sh from Fabric's main branch, pinned. Deliberately NOT the
# copy under the v2.5.16 tag: that one maps x86_64->amd64 but not
# aarch64->arm64, so on an ARM VM (Oracle Ampere) it requests a
# "linux-aarch64" binary tarball that doesn't exist.
INSTALL_FABRIC_COMMIT="${INSTALL_FABRIC_COMMIT:-f1f5e006a6301b5c98611b24a7ec4aeeda6c283a}"

FABRIC_HOME="${FABRIC_HOME:-$HOME/fabric-project}"
FABRIC_SAMPLES="$FABRIC_HOME/fabric-samples"
TEST_NETWORK="$FABRIC_SAMPLES/test-network"

CHANNEL_NAME="${CHANNEL_NAME:-mychannel}"
CC_NAME="${CC_NAME:-truststreamcc}"
CC_VERSION="${CC_VERSION:-1.0}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"
# Unanimous 3-of-3 endorsement - the project's core trust model.
CC_POLICY="AND('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_DIR/backend"
BACKEND_PORT="${BACKEND_PORT:-3001}"
SERVICE_NAME="truststream-backend"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

if [ "$(id -u)" -eq 0 ]; then
  die "Run this as your normal login user (e.g. 'ubuntu'), not root - the scripts call sudo themselves."
fi
