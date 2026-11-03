#!/bin/sh
# Pulls the latest app image and restarts the app if it changed.
# Run every minute by shopping-list-update.timer.
set -eu
cd "${DEPLOY_DIR:-/opt/shopping-list}"

image=$(docker compose config --images app)
before=$(docker image inspect -f '{{.Id}}' "$image" 2>/dev/null || true)
docker compose pull --quiet app
after=$(docker image inspect -f '{{.Id}}' "$image")

if [ "$before" != "$after" ] || [ -z "$(docker compose ps -q --status running app)" ]; then
  echo "Desplegando $image ($after)"
  docker compose up -d --remove-orphans
  docker image prune -f >/dev/null
fi
