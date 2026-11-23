#!/bin/sh
# The beta's daily backup (stage 18): the database and the photos, kept 7 days
# on the server (cron, deploy.md). Backups hold testers' data: they are deleted
# with everything else when the test ends.
#
# A run never leaves something that looks like a backup but isn't (D142): each
# file is written under a `.part` name, checked (the dump's table of contents is
# read back by pg_restore and must list table data; the photo archive must hold
# media/), and only then renamed. A failure or an interruption logs one line,
# "backup FAILED at <time> (<step>)", removes its partial files and exits
# non-zero. Old backups are pruned only after a good run, and the newest
# BACKUP_KEEP_MIN good ones always stay, so days without a run never empty the
# folder. Empty dumps (from older versions of this script) are removed.
#
# Settings: BACKUP_DIR (where), BACKUP_KEEP_DAYS (7), BACKUP_KEEP_MIN (3),
# BACKUP_PRUNE (yes; "no" keeps every older backup for this run).
set -eu
# Home mode runs this from Git Bash on Windows, which would rewrite container
# paths such as /app/var into Windows paths before docker sees them.
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")"
dest=${BACKUP_DIR:-/var/backups/datingapp-beta}
keep_days=${BACKUP_KEEP_DAYS:-7}
keep_min=${BACKUP_KEEP_MIN:-3}
prune=${BACKUP_PRUNE:-yes}
umask 077
mkdir -p "$dest"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
db="$dest/db-$stamp.dump"
media="$dest/media-$stamp.tgz"
step=start

finish() {
  status=$?
  rm -f "$db.part" "$db.part.toc" "$media.part" "$media.part.toc"
  if [ "$status" -ne 0 ]; then
    echo "backup FAILED at $(date -u +%Y-%m-%dT%H:%M:%SZ) ($step)" >&2
  fi
  exit "$status"
}
trap finish EXIT
# A closed window, Ctrl+C or a shutdown still runs the cleanup above.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Partial files from a run that was killed outright (no cleanup) are never backups.
find "$dest" -maxdepth 1 -type f \( -name 'db-*.dump.part*' -o -name 'media-*.tgz.part*' \) -exec rm -f {} +

step="database dump"
docker compose exec -T postgres pg_dump -U postgres --format=custom datingapp > "$db.part"
step="database check"
test -s "$db.part"
docker compose exec -T postgres pg_restore --list < "$db.part" > "$db.part.toc"
tables=$(grep -c ' TABLE DATA ' "$db.part.toc")
test "$tables" -gt 0

step="photos archive"
docker compose exec -T api tar czf - -C /app/var media > "$media.part"
step="photos check"
tar tzf "$media.part" > "$media.part.toc"
grep -q '^media/' "$media.part.toc"

step="publish"
mv "$db.part" "$db"
mv "$media.part" "$media"
echo "backup: $db and media-$stamp.tgz ($tables tables; $(wc -c < "$db" | tr -d ' ') and $(wc -c < "$media" | tr -d ' ') bytes)"

step="prune"
# An empty dump holds nothing: always removed.
find "$dest" -maxdepth 1 -type f -name 'db-*.dump' -empty | while IFS= read -r empty; do
  rm -f "$empty"
  echo "removed empty ${empty##*/}"
done
if [ "$prune" = yes ]; then
  keep=$(find "$dest" -maxdepth 1 -type f -name 'db-*.dump' ! -empty | sed 's|.*/db-||; s|\.dump$||' | sort -r | head -n "$keep_min" | tr '\n' ' ')
  find "$dest" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'media-*.tgz' \) -mtime +"$keep_days" | sort |
    while IFS= read -r old; do
      name=${old##*/}
      old_stamp=$(printf '%s\n' "$name" | sed 's/^db-//; s/^media-//; s/\.dump$//; s/\.tgz$//')
      case " $keep " in *" $old_stamp "*) continue ;; esac
      rm -f "$old"
      echo "pruned $name"
    done
fi
