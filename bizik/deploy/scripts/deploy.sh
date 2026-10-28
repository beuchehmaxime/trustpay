#!/usr/bin/env bash
# =============================================================================
# Bizik - server-side deploy. Run on the VPS (by CI over SSH, or manually).
# Pulls the images from GHCR and recreates the stack.
#
#   Deploy a specific build:  IMAGE_TAG=<sha> ./deploy.sh
#   Restart what is running:  ./deploy.sh          (keeps the running tag)
#
# Do NOT run `docker compose -f docker-compose.prod.yml up -d` by hand. The
# image names are ${REGISTRY}/qatiqa-*:${IMAGE_TAG}, and REGISTRY lives in
# .env.production, which compose only reads when passed --env-file. Without it
# the name resolves to "/qatiqa-backend:latest" and docker answers
# "invalid reference format". Use this script, which passes it.
# =============================================================================
set -euo pipefail

APP_DIR="/opt/bizik"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

cd "$APP_DIR"

# ---- Which build to run ------------------------------------------------------
# With no IMAGE_TAG, take the tag the backend is ALREADY running rather than
# whatever .env.production happens to say. That file holds `latest`, and
# `latest` is whatever was pushed last - deploying it once silently rolled
# production back to an older build, because the local `latest` was stale. The
# running container is the only honest answer to "what is live right now".
if [ -z "${IMAGE_TAG:-}" ]; then
  RUNNING_TAG="$(docker inspect --format '{{index .Config.Image}}' bizik-backend 2>/dev/null | awk -F: '{print $NF}' || true)"
  if [ -n "$RUNNING_TAG" ] && [ "$RUNNING_TAG" != "latest" ]; then
    IMAGE_TAG="$RUNNING_TAG"
    echo "[deploy] no IMAGE_TAG given - keeping the running build ($IMAGE_TAG)"
  fi
fi

if [ -n "${IMAGE_TAG:-}" ]; then
  export IMAGE_TAG
  echo "[deploy] deploying IMAGE_TAG=$IMAGE_TAG"
else
  echo "[deploy] WARNING: no IMAGE_TAG and nothing running - falling back to .env.production"
fi

# GHCR auth is configured once via `docker login ghcr.io` (see the guide).
echo "[deploy] pulling images..."
$COMPOSE pull

echo "[deploy] applying stack..."
$COMPOSE up -d --remove-orphans "$@"

echo "[deploy] pruning old images..."
docker image prune -f >/dev/null 2>&1 || true

echo "[deploy] health:"
$COMPOSE ps
