#!/usr/bin/env bash
set -Eeuo pipefail

: "${DEPLOY_SHA:?DEPLOY_SHA is required}"

APP_DIR="${BRIN_APP_DIR:-/home/jetson/brin-edge-web}"
ENV_FILE="${BRIN_ENV_FILE:-${APP_DIR}/deploy/jetson.env}"
API_IMAGE="ghcr.io/skirnola/ssh-brin-web-api"
WEB_IMAGE="ghcr.io/skirnola/ssh-brin-web-web"
ROLLBACK_TAG="rollback-${GITHUB_RUN_ID:-manual}-$(date +%s)"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "Deployment repository not found: ${APP_DIR}" >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Private deployment environment not found: ${ENV_FILE}" >&2
  exit 1
fi

cd "${APP_DIR}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked changes exist in ${APP_DIR}; refusing to overwrite them." >&2
  git status --short >&2
  exit 1
fi

echo "Updating stable deployment checkout to ${DEPLOY_SHA}"
git fetch --quiet origin main
git checkout --quiet main
git merge --ff-only "${DEPLOY_SHA}"

export IMAGE_TAG="${DEPLOY_SHA}"
compose=(docker compose --env-file "${ENV_FILE}" -f compose.yaml -f compose.production.yaml)

previous_api_container="$("${compose[@]}" ps -q api 2>/dev/null || true)"
previous_web_container="$("${compose[@]}" ps -q web 2>/dev/null || true)"
previous_api_image=""
previous_web_image=""

if [[ -n "${previous_api_container}" ]]; then
  previous_api_image="$(docker inspect --format '{{.Image}}' "${previous_api_container}")"
fi
if [[ -n "${previous_web_container}" ]]; then
  previous_web_image="$(docker inspect --format '{{.Image}}' "${previous_web_container}")"
fi

rollback() {
  echo "Deployment health check failed; attempting rollback." >&2
  if [[ -z "${previous_api_image}" || -z "${previous_web_image}" ]]; then
    echo "No complete previous deployment is available for automatic rollback." >&2
    "${compose[@]}" logs --tail=100 >&2 || true
    return 1
  fi

  docker tag "${previous_api_image}" "${API_IMAGE}:${ROLLBACK_TAG}"
  docker tag "${previous_web_image}" "${WEB_IMAGE}:${ROLLBACK_TAG}"
  export IMAGE_TAG="${ROLLBACK_TAG}"
  "${compose[@]}" up -d --no-build --pull never --force-recreate api web caddy

  for _ in {1..30}; do
    if curl --fail --silent --show-error http://127.0.0.1:3000/api/v1/health >/dev/null \
      && curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null; then
      echo "Rollback completed using ${ROLLBACK_TAG}." >&2
      return 0
    fi
    sleep 2
  done

  echo "Rollback did not become healthy; manual intervention is required." >&2
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --tail=100 >&2 || true
  return 1
}

echo "Pulling immutable ARM64 images"
docker pull "${API_IMAGE}:${DEPLOY_SHA}"
docker pull "${WEB_IMAGE}:${DEPLOY_SHA}"

echo "Recreating services"
if ! "${compose[@]}" up -d --no-build --pull never --force-recreate api web caddy; then
  rollback
  exit 1
fi

echo "Waiting for API and web health checks"
healthy=false
for _ in {1..45}; do
  if curl --fail --silent --show-error http://127.0.0.1:3000/api/v1/health >/dev/null \
    && curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "${healthy}" != "true" ]]; then
  rollback
  exit 1
fi

"${compose[@]}" ps
printf '%s\n' "${DEPLOY_SHA}" > "${APP_DIR}/.last-successful-deploy"
echo "Deployment ${DEPLOY_SHA} is healthy."
