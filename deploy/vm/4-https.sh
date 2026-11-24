#!/usr/bin/env bash
# -----------------------------------------------------------------
#  Step 4 of 4 - public HTTPS for the backend via Caddy.
#
#  The frontend is served over HTTPS (Vercel), and browsers block
#  HTTPS pages from calling a plain-HTTP API (mixed content), so the
#  backend needs a real certificate. Caddy gets one from Let's
#  Encrypt automatically and proxies to the API on localhost.
#
#  Requires DOMAIN (e.g. truststream.duckdns.org) to already resolve
#  to this VM's public IP, with tcp/80 + tcp/443 open both in the
#  cloud firewall (Oracle: VCN security list) and on the host
#  (1-install-prereqs.sh does the host side).
# -----------------------------------------------------------------
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

: "${DOMAIN:?Set DOMAIN, e.g.  DOMAIN=truststream.duckdns.org $0}"
command -v caddy >/dev/null || die "Caddy isn't installed - run 1-install-prereqs.sh first."
curl -fsS "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1 \
  || die "The backend isn't answering on localhost:$BACKEND_PORT - run 3-backend.sh first."

resolved=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)
[ -n "$resolved" ] || die "$DOMAIN doesn't resolve yet - create/update the DNS record first."
echo "  $DOMAIN -> $resolved (must be this VM's public IP)"

step "Writing /etc/caddy/Caddyfile"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
# Managed by TrustStream deploy/vm/4-https.sh
$DOMAIN {
	encode gzip
	reverse_proxy localhost:$BACKEND_PORT
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
sudo systemctl enable caddy >/dev/null
sudo systemctl restart caddy

step "Waiting for the Let's Encrypt certificate (up to ~90s)"
for _ in $(seq 1 30); do
  curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1 && break
  sleep 3
done
if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
  step "Done - https://$DOMAIN is live"
  curl -fsS "https://$DOMAIN/health"; echo
  echo
  echo "  Use this as VITE_API_URL on Vercel:  https://$DOMAIN"
else
  sudo journalctl -u caddy -n 30 --no-pager -o cat
  die "https://$DOMAIN isn't reachable yet. Usual causes: ports 80/443 not open in the cloud firewall (Oracle VCN security list), or DNS not pointing at this VM. Caddy keeps retrying on its own - re-run this script after fixing."
fi
