#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${BACKUP_ROOT:-${PROJECT_ROOT}/backups}"
BACKUP_DIR="${BACKUP_DIR:-${BACKUP_ROOT}/${TIMESTAMP}}"
BACKUP_HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-alpine:3.20}"

cd "${PROJECT_ROOT}"

load_dotenv_value() {
  local key="$1"
  local default_value="$2"
  local value=""
  if [ -f ".env" ]; then
    value="$(grep -E "^${key}=" ".env" | tail -n 1 | sed -E "s/^${key}=//" || true)"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
  fi
  if [ -n "${value}" ]; then
    printf "%s" "${value}"
  else
    printf "%s" "${default_value}"
  fi
}

POSTGRES_DB="${POSTGRES_DB:-$(load_dotenv_value POSTGRES_DB exercise)}"
POSTGRES_USER="${POSTGRES_USER:-$(load_dotenv_value POSTGRES_USER exercise)}"

default_project_name() {
  basename "${PROJECT_ROOT}" | tr "[:upper:]" "[:lower:]" | tr -cd "[:alnum:]_-"
}

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(load_dotenv_value COMPOSE_PROJECT_NAME "$(default_project_name)")}"
export COMPOSE_PROJECT_NAME

volume_name() {
  printf "%s_%s" "${COMPOSE_PROJECT_NAME}" "$1"
}

mkdir -p "${BACKUP_DIR}"
BACKUP_DIR_ABS="$(cd "${BACKUP_DIR}" && pwd)"

echo "Creating PostgreSQL logical backup..."
docker compose exec -T postgres pg_dump --clean --if-exists --no-owner --no-acl \
  -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "${BACKUP_DIR_ABS}/postgres.sql"

echo "Flushing and archiving Redis volume..."
docker compose exec -T redis redis-cli SAVE >/dev/null
docker run --rm \
  -v "$(volume_name redis_data):/volume:ro" \
  -v "${BACKUP_DIR_ABS}:/backup" \
  "${BACKUP_HELPER_IMAGE}" \
  tar -czf /backup/redis_data.tgz -C /volume .

echo "Archiving Qdrant volume..."
docker run --rm \
  -v "$(volume_name qdrant_data):/volume:ro" \
  -v "${BACKUP_DIR_ABS}:/backup" \
  "${BACKUP_HELPER_IMAGE}" \
  tar -czf /backup/qdrant_data.tgz -C /volume .

echo "Archiving MinIO volume..."
docker run --rm \
  -v "$(volume_name minio_data):/volume:ro" \
  -v "${BACKUP_DIR_ABS}:/backup" \
  "${BACKUP_HELPER_IMAGE}" \
  tar -czf /backup/minio_data.tgz -C /volume .

(
  cd "${BACKUP_DIR_ABS}"
  sha256sum postgres.sql redis_data.tgz qdrant_data.tgz minio_data.tgz > backup_manifest.sha256
)

cat > "${BACKUP_DIR_ABS}/backup_metadata.env" <<EOF
created_at=${TIMESTAMP}
compose_project_name=${COMPOSE_PROJECT_NAME}
postgres_db=${POSTGRES_DB}
postgres_user=${POSTGRES_USER}
EOF

echo "Backup completed: ${BACKUP_DIR_ABS}"
echo "Verify with: cd '${BACKUP_DIR_ABS}' && sha256sum -c backup_manifest.sha256"
