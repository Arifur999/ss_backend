#!/usr/bin/env bash
# Nightly database dump.
#
# The VPS holds the only copy of this data now, so this script is what stands
# between a dead disk and starting the business over from an empty database.
# Run by the deploy user's crontab; see DEPLOY.md.
#
# Restore a dump with:
#   docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" \
#     -d "$POSTGRES_DB" --clean --if-exists < /srv/hatim/backups/db-....dump

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/hatim/hatim_Backend}"
BACKUP_DIR="${BACKUP_DIR:-/srv/hatim/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

cd "$APP_DIR"

# The database name and user live in the same .env the containers read, so
# there is one place to change them rather than two that can drift apart.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/db-$(date +%F-%H%M).dump"

# -Fc is the compressed custom format: smaller than plain SQL and restorable
# table by table if only part of the data needs to come back.
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$out"

# A dump that died halfway through is more dangerous than no dump at all - it
# looks like a backup right up until the day it is needed. Refuse to keep one.
if [ ! -s "$out" ]; then
    rm -f "$out"
    echo "$(date -Is) FAILED: pg_dump produced an empty file" >&2
    exit 1
fi

find "$BACKUP_DIR" -name 'db-*.dump' -mtime "+$KEEP_DAYS" -delete

echo "$(date -Is) ok: $out ($(du -h "$out" | cut -f1))"
