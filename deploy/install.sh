#!/bin/sh
# One-time setup on the Raspberry Pi. Run from a clone of the repo:
#   sudo sh deploy/install.sh
set -eu
DIR=/opt/shopping-list
SRC=$(cd "$(dirname "$0")" && pwd)

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

mkdir -p "$DIR/data"
chown 1000:1000 "$DIR/data"   # the app runs as the "node" user (uid 1000)
install -m 644 "$SRC/docker-compose.yml" "$DIR/docker-compose.yml"
install -m 755 "$SRC/update.sh" "$DIR/update.sh"

if [ ! -f "$DIR/.env" ]; then
  printf 'Pegá el token del Cloudflare Tunnel: '
  read -r token
  umask 077
  printf 'TUNNEL_TOKEN=%s\n' "$token" > "$DIR/.env"
fi

install -m 644 "$SRC/shopping-list-update.service" /etc/systemd/system/
install -m 644 "$SRC/shopping-list-update.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now shopping-list-update.timer

"$DIR/update.sh"
echo
echo "Listo. Probá: curl http://127.0.0.1:8080/api/health"
