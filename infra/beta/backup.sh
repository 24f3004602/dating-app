#!/bin/sh
# The beta's daily backup (stage 18): the database and the photos, kept 7 days
# on the server (cron, deploy.md). Backups hold testers' data: they are deleted
# with everything else when the test ends.
set -eu
cd "$(dirname "$0")"
dest=${BACKUP_DIR:-/var/backups/datingapp-beta}
umask 077
mkdir -p "$dest"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T postgres pg_dump -U postgres --format=custom datingapp > "$dest/db-$stamp.dump"
docker compose exec -T api tar czf - -C /app/var media > "$dest/media-$stamp.tgz"
test -s "$dest/db-$stamp.dump"
find "$dest" -type f \( -name 'db-*.dump' -o -name 'media-*.tgz' \) -mtime +7 -delete
echo "backup: $dest/db-$stamp.dump and media-$stamp.tgz"
