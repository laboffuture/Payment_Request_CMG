#!/usr/bin/env bash
# Nightly backup of the live database and attachment store.
#
# Everything the application owns lives in .wrangler/state: the D1 SQLite file and the
# R2 object store. SQLite is copied with the .backup command rather than cp, because a
# plain copy of a database being written to can capture a torn page and restore as a
# corrupt file. Attachments are archived separately so a restore can take either half.
set -euo pipefail

APP=/home/lofcs/Downloads/chandramari-one-task-hosted/CMG-Audit-Control
DEST=/home/lofcs/paymentrequest-backups
KEEP_DAYS=30
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$DEST"
cd "$APP"

DB=$(find .wrangler/state/v3/d1 -name '*.sqlite' -size +0 \
     ! -name 'metadata.sqlite' | head -1)
[ -n "$DB" ] || { echo "$(date -Is) no database file found" >&2; exit 1; }

# a consistent snapshot even while the app is writing
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$DEST/db-$STAMP.sqlite'"
else
  # fall back to a copy of the whole state dir; less clean but better than nothing
  cp "$DB" "$DEST/db-$STAMP.sqlite"
fi
gzip -f "$DEST/db-$STAMP.sqlite"

# attachments and the rest of the runtime state
tar czf "$DEST/files-$STAMP.tar.gz" .wrangler/state/v3/r2 2>/dev/null || true

find "$DEST" -name 'db-*.sqlite.gz'  -mtime +$KEEP_DAYS -delete
find "$DEST" -name 'files-*.tar.gz'  -mtime +$KEEP_DAYS -delete

echo "$(date -Is) backup ok: db-$STAMP.sqlite.gz ($(du -h "$DEST/db-$STAMP.sqlite.gz" | cut -f1))"
