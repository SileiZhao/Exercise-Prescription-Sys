#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${1:-}"
BACKUP_HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-alpine:3.20}"
CONFIRM_RESTORE="${CONFIRM_RESTORE:-}"

if [ -z "${BACKUP_DIR}" ]; then
  echo "Usage: CONFIRM_RESTORE=yes $0 /absolute/or/relative/backup-dir" >&2
  exit 2
fi

if [ "${CONFIRM_RESTORE}" != "yes" ]; then
  echo "Refusing to restore without explicit confirmation." >&2
  echo "Run with CONFIRM_RESTORE=yes after verifying the target environment." >&2
  exit 2
fi

cd "${PROJECT_ROOT}"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ".env"
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-exercise}"
POSTGRES_USER="${POSTGRES_USER:-exercise}"

default_project_name() {
  basename "${PROJECT_ROOT}" | tr "[:upper:]" "[:lower:]" | tr -cd "[:alnum:]_-"
}

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(default_project_name)}"
export COMPOSE_PROJECT_NAME

volume_name() {
  printf "%s_%s" "${COMPOSE_PROJECT_NAME}" "$1"
}

BACKUP_DIR_ABS="$(cd "${BACKUP_DIR}" && pwd)"

for required_file in postgres.sql redis_data.tgz qdrant_data.tgz minio_data.tgz backup_manifest.sha256; do
  if [ ! -f "${BACKUP_DIR_ABS}/${required_file}" ]; then
    echo "Missing backup file: ${BACKUP_DIR_ABS}/${required_file}" >&2
    exit 2
  fi
done

(
  cd "${BACKUP_DIR_ABS}"
  sha256sum -c backup_manifest.sha256
)

echo "Stopping services with file-backed volumes..."
docker compose stop redis qdrant minio

restore_volume() {
  local volume="$1"
  local archive="$2"
  docker run --rm \
    -v "$(volume_name "${volume}"):/volume" \
    -v "${BACKUP_DIR_ABS}:/backup:ro" \
    "${BACKUP_HELPER_IMAGE}" \
    sh -c "find /volume -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /backup/${archive} -C /volume"
}

echo "Restoring Redis volume..."
restore_volume redis_data redis_data.tgz

echo "Restoring Qdrant volume..."
restore_volume qdrant_data qdrant_data.tgz

echo "Restoring MinIO volume..."
restore_volume minio_data minio_data.tgz

echo "Starting database for logical restore..."
docker compose up -d postgres

echo "Restoring PostgreSQL database..."
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${BACKUP_DIR_ABS}/postgres.sql"

echo "Starting restored data services..."
docker compose up -d redis qdrant minio

echo "Restore completed from: ${BACKUP_DIR_ABS}"
echo "Start application services explicitly after verification: docker compose up -d backend frontend"
