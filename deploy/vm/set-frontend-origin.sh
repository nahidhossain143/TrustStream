#!/usr/bin/env bash
# -----------------------------------------------------------------
#  Locks CORS down to the deployed frontend and restarts the API.
#
#    ./set-frontend-origin.sh https://truststream.vercel.app
#
#  Several origins can be given comma-separated. No trailing slash.
# -----------------------------------------------------------------
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

origin="${1:?Usage: $0 https://your-app.vercel.app}"
origin="${origin%/}"
ENV_FILE="$BACKEND_DIR/.env"
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found - run 3-backend.sh first."

if grep -q '^FRONTEND_ORIGIN=' "$ENV_FILE"; then
  sed -i "s|^FRONTEND_ORIGIN=.*|FRONTEND_ORIGIN=$origin|" "$ENV_FILE"
else
  echo "FRONTEND_ORIGIN=$origin" >> "$ENV_FILE"
fi
sudo systemctl restart "$SERVICE_NAME"
echo "FRONTEND_ORIGIN=$origin - $SERVICE_NAME restarted."
