#!/usr/bin/env bash
# Installs the nightly backup and the weekly certificate renewal as cron jobs.
#
# Both used to exist only as lines of text in DEPLOY.md, which means they were
# running only if somebody had typed them in by hand - and nothing anywhere
# would say so if they had not. Run this once on the server and the schedule is
# actually in place:
#
#   bash scripts/install-backup-cron.sh
#
# Safe to run more than once: it replaces its own entries rather than adding a
# second copy of them.

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/hatim/hatim_Backend}"
LOG_DIR="${LOG_DIR:-/srv/hatim/logs}"
MARKER="# managed-by:install-backup-cron"

mkdir -p "$LOG_DIR"

# PATH is set explicitly because cron runs with a minimal one that often has no
# /usr/local/bin - so `docker` was not found and the renewal silently never ran.
CRON_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

backup_line="30 2 * * * PATH=$CRON_PATH; cd $APP_DIR && bash scripts/backup-db.sh >> $LOG_DIR/backup.log 2>&1 $MARKER"
# The whole renewal wrapped in a subshell before the redirect. Written flat, the
# `>>` bound only to `docker compose restart nginx`, so certbot's own output - the
# part that says whether the certificate actually renewed - went to cron's mail
# instead of the log the script tells you to read.
renew_line="15 3 * * 1 PATH=$CRON_PATH; cd $APP_DIR && (docker compose run --rm certbot renew --quiet && docker compose restart nginx) >> $LOG_DIR/certbot.log 2>&1 $MARKER"

# Keep everything the user already had, drop only the lines this script owns,
# then append the current versions.
existing="$(crontab -l 2>/dev/null | grep -v "$MARKER" || true)"

printf '%s\n%s\n%s\n' "$existing" "$backup_line" "$renew_line" \
    | sed '/^$/d' \
    | crontab -

echo "Installed. Current schedule:"
crontab -l | grep "$MARKER"

echo
echo "Check tomorrow that it ran:  tail $LOG_DIR/backup.log"
echo "Encrypt the dumps by creating a passphrase file:"
echo "  openssl rand -base64 32 > /srv/hatim/backup.key && chmod 600 /srv/hatim/backup.key"
echo "  ...then copy that key somewhere OTHER than this server."
echo "Send the dumps off-box by setting BACKUP_REMOTE in the cron entry, e.g."
echo "  BACKUP_REMOTE=user@otherhost:/backups/hatim"
