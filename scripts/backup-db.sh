#!/usr/bin/env bash
# Nightly database dump.
#
# The VPS holds the only copy of this data, so this script is what stands
# between a dead disk and starting the business over from an empty database.
# Installed by scripts/install-backup-cron.sh.
#
# Three things it does beyond dumping:
#
#   1. Reads only POSTGRES_USER and POSTGRES_DB out of .env, rather than
#      sourcing the whole file. Sourcing put every secret in the file - JWT
#      keys, Cloudinary, SMTP, the SMS gateway - into this process's
#      environment, where any child process or crash dump would see them, all
#      to read two values.
#   2. Encrypts the dump when a passphrase is configured. A plain pg_dump is
#      every customer's business data in readable form, sitting on disk.
#   3. Copies it off the box when a destination is configured. A backup on the
#      same disk as the database does not survive the failure it exists for.
#
# Restore (plain dump):
#   docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" \
#     -d "$POSTGRES_DB" --clean --if-exists < /srv/hatim/backups/db-....dump
#
# Restore (encrypted):
#   gpg --batch --passphrase-file /srv/hatim/backup.key \
#     --decrypt /srv/hatim/backups/db-....dump.gpg \
#   | docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" \
#       -d "$POSTGRES_DB" --clean --if-exists

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/hatim/hatim_Backend}"
BACKUP_DIR="${BACKUP_DIR:-/srv/hatim/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
# Passphrase for encrypting the dump. Create it once with:
#   openssl rand -base64 32 > /srv/hatim/backup.key && chmod 600 /srv/hatim/backup.key
# Keep a copy somewhere OTHER than this server - without it the backups are
# unreadable, which is the whole point but also the obvious way to lose them.
PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-/srv/hatim/backup.key}"
# Optional off-site destination, anything scp understands:
#   BACKUP_REMOTE=user@otherhost:/backups/hatim
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

cd "$APP_DIR"

# Pull single values out of .env without executing it.
read_env() {
    sed -n "s/^$1=//p" .env | tail -n1 | tr -d '"'\''\r'
}

POSTGRES_USER="$(read_env POSTGRES_USER)"
POSTGRES_DB="$(read_env POSTGRES_DB)"

if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_DB" ]; then
    echo "$(date -Is) FAILED: POSTGRES_USER/POSTGRES_DB not readable from $APP_DIR/.env" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
out="$BACKUP_DIR/db-$(date +%F-%H%M).dump"

# -Fc is the compressed custom format: smaller than plain SQL and restorable
# table by table if only part of the data needs to come back.
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$out"

# A dump that died halfway through is more dangerous than no dump at all - it
# looks like a backup right up until the day it is needed. Size alone does not
# prove much, so the archive's own table of contents is read back: pg_restore
# --list fails on a truncated or corrupt file.
if [ ! -s "$out" ]; then
    rm -f "$out"
    echo "$(date -Is) FAILED: pg_dump produced an empty file" >&2
    exit 1
fi

if ! docker compose exec -T postgres pg_restore --list < "$out" > /dev/null 2>&1; then
    rm -f "$out"
    echo "$(date -Is) FAILED: dump is not readable by pg_restore - not keeping it" >&2
    exit 1
fi

final="$out"

if [ -s "$PASSPHRASE_FILE" ]; then
    gpg --batch --yes --quiet \
        --passphrase-file "$PASSPHRASE_FILE" \
        --symmetric --cipher-algo AES256 \
        --output "$out.gpg" "$out"
    rm -f "$out"
    final="$out.gpg"
else
    echo "$(date -Is) WARNING: $PASSPHRASE_FILE missing - this dump is NOT encrypted" >&2
fi

chmod 600 "$final"

if [ -n "$BACKUP_REMOTE" ]; then
    if scp -q "$final" "$BACKUP_REMOTE/"; then
        echo "$(date -Is) copied off-box to $BACKUP_REMOTE"
    else
        # Deliberately not fatal: a local backup that exists beats failing the
        # whole run because the remote was unreachable tonight. It is loud so
        # the failure is visible in the cron mail / log.
        echo "$(date -Is) WARNING: off-box copy to $BACKUP_REMOTE failed" >&2
    fi
else
    echo "$(date -Is) WARNING: BACKUP_REMOTE unset - the only copy is on this server" >&2
fi

find "$BACKUP_DIR" -name 'db-*.dump' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'db-*.dump.gpg' -mtime "+$KEEP_DAYS" -delete

echo "$(date -Is) ok: $final ($(du -h "$final" | cut -f1))"
