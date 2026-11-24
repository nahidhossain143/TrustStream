#!/usr/bin/env bash
# -----------------------------------------------------------------
#  Step 1 of 4 - system prerequisites.
#
#  Opens ports 80/443 in the host firewall, then installs Git, jq,
#  FFmpeg, OpenSSL, Docker Engine, Node.js 22 and Caddy. Safe to
#  re-run. Works on Ubuntu 22.04/24.04, x86_64 or arm64 (Oracle
#  Ampere).
#
#  Afterwards: log out and SSH back in (so your user picks up the
#  docker group), then run 2-fabric-network.sh.
# -----------------------------------------------------------------
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

step "Opening ports 80/443 in the host firewall"
# Oracle's Ubuntu images ship iptables rules that REJECT all inbound traffic
# except SSH - a second firewall on top of the VCN security list, and the
# usual reason "I opened the port in the console but it still times out".
# Done before Docker is installed so the saved ruleset can't capture
# Docker's own (container-IP-specific) chains.
fw_changed=0
if sudo iptables -S INPUT | grep -q -- '-j REJECT'; then
  for port in 80 443; do
    if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
      reject_line=$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT" {print $1; exit}')
      sudo iptables -I INPUT "$reject_line" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
      fw_changed=1
      echo "    opened tcp/$port"
    else
      echo "    tcp/$port already open"
    fi
  done
  if [ "$fw_changed" = 1 ] && command -v netfilter-persistent >/dev/null; then
    sudo netfilter-persistent save
  fi
else
  echo "    no REJECT rule in the INPUT chain - nothing to open"
fi
if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
fi

step "Installing base packages (git, jq, ffmpeg, openssl, curl)"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git jq ffmpeg openssl gnupg apt-transport-https

mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if [ "$mem_kb" -lt 7500000 ] && ! swapon --show | grep -q .; then
  step "Less than 8 GB RAM - adding a 4 GB swap file so the Fabric network fits"
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if ! command -v docker >/dev/null; then
  step "Installing Docker Engine"
  curl -fsSL https://get.docker.com | sudo sh
else
  step "Docker already installed ($(docker --version))"
fi
# Cap container log size: the peers and orderer log constantly, and unbounded
# json logs are a classic way to fill the disk - which turns Docker's storage
# read-only and breaks the peers in confusing ways.
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }' \
    | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl restart docker
fi
sudo systemctl enable --now docker >/dev/null
sudo usermod -aG docker "$USER"

node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$node_major" -lt 22 ]; then
  step "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  step "Node.js already installed ($(node -v))"
fi

if ! command -v caddy >/dev/null; then
  step "Installing Caddy (HTTPS reverse proxy)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y
  sudo apt-get install -y caddy
else
  step "Caddy already installed ($(caddy version | head -1))"
fi

step "Done"
echo "  git $(git --version | awk '{print $3}'), node $(node -v), ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}'), $(docker --version), caddy $(caddy version | awk '{print $1}')"
echo
echo "  NEXT: log out and SSH back in (so '$USER' gets docker access), then run:"
echo "        $REPO_DIR/deploy/vm/2-fabric-network.sh"
