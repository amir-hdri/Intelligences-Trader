#!/usr/bin/env bash
# Intelligences-Trader — secret generation helper.
#
# Generates cryptographically strong values for every secret consumed by
# docker-compose.yml / .env (JWT_SECRET, REFRESH_SECRET, ADMIN_PASSWORD,
# MASTER_ENCRYPTION_KEY) and prints a ready-to-paste `.env` snippet.
#
# With --write, appends/updates the secrets in ./.env (the file is
# gitignored; never commit it).
#
# Usage:
#   bash scripts/generate-secrets.sh           # print snippet to stdout
#   bash scripts/generate-secrets.sh --write   # merge into ./.env as well
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRITE=false
[ "${1:-}" = "--write" ] && WRITE=true

gen() {
  # 48 random bytes → 64 base64url chars; portable across macOS/Linux.
  openssl rand -base64 48 | tr -d '\n' | tr '+/' '-_' | cut -c1-64
}

JWT_SECRET="$(gen)"
REFRESH_SECRET="$(gen)"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
MASTER_ENCRYPTION_KEY="$(openssl rand -hex 32)"

SNAPSHOT=$(cat <<EOF

# --- Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by scripts/generate-secrets.sh ---
AUTH_REQUIRED=true
JWT_SECRET=$JWT_SECRET
REFRESH_SECRET=$REFRESH_SECRET
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
MASTER_ENCRYPTION_KEY=$MASTER_ENCRYPTION_KEY
EOF
)

if [ "$WRITE" = true ]; then
  printf '%s\n' "$SNAPSHOT" >> "$ROOT/.env"
  chmod 600 "$ROOT/.env" 2>/dev/null || true
  echo "Secrets appended to $ROOT/.env (gitignored). Restart docker compose to apply."
else
  printf '%s\n' "$SNAPSHOT"
  echo "# Copy the block above into your .env, or re-run with --write."
fi
