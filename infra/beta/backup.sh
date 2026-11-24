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
# An encrypted copy (D149): when BACKUP_COPY_DIR is set (here, or in .env beside
# this script; set it empty to skip), each checked file is also encrypted to the
# public key in backup-key.asc (made by backup-key.sh; the private key is only in
# the owner's password manager) and written there, e.g. a Google Drive folder, as
# <name>.gpg. Each copy is written under `.part`, must list as a complete OpenPGP
# message and be bigger than its original, and only then is renamed. Copies older
# than BACKUP_KEEP_DAYS go too (by the time in their names), keeping the newest
# BACKUP_KEEP_MIN. A failed copy logs "backup FAILED at <time> (encrypted copy:
# <step>)" after the backup's own line: the backup on this computer is still good.
#
# Settings: BACKUP_DIR (where), BACKUP_KEEP_DAYS (7), BACKUP_KEEP_MIN (3),
# BACKUP_PRUNE (yes; "no" keeps every older backup and copy for this run),
# BACKUP_COPY_DIR (the copies' folder; off when unset and not in .env),
# BACKUP_KEY_FILE (./backup-key.asc).
set -eu
# Home mode runs this from Git Bash on Windows, which would rewrite container
# paths such as /app/var into Windows paths before docker sees them.
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")"
dest=${BACKUP_DIR:-/var/backups/datingapp-beta}
keep_days=${BACKUP_KEEP_DAYS:-7}
keep_min=${BACKUP_KEEP_MIN:-3}
prune=${BACKUP_PRUNE:-yes}
if [ -n "${BACKUP_COPY_DIR+set}" ]; then
  copy_dir=$BACKUP_COPY_DIR
else
  # Only this one line of .env is read.
  copy_dir=$(sed -n 's/^BACKUP_COPY_DIR=//p' .env 2> /dev/null | tail -n 1 | tr -d '\r')
  case $copy_dir in
    \"*\") copy_dir=${copy_dir#\"}; copy_dir=${copy_dir%\"} ;;
    \'*\') copy_dir=${copy_dir#\'}; copy_dir=${copy_dir%\'} ;;
  esac
fi
key_file=${BACKUP_KEY_FILE:-$PWD/backup-key.asc}
gnupg_home=""
umask 077
mkdir -p "$dest"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
db="$dest/db-$stamp.dump"
media="$dest/media-$stamp.tgz"
step=start

finish() {
  status=$?
  rm -f "$db.part" "$db.part.toc" "$media.part" "$media.part.toc"
  if [ -n "$copy_dir" ]; then
    rm -f "$copy_dir/db-$stamp.dump.gpg.part" "$copy_dir/media-$stamp.tgz.gpg.part"
  fi
  if [ -n "$gnupg_home" ]; then
    rm -rf "$gnupg_home"
  fi
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

[ -n "$copy_dir" ] || exit 0

step="encrypted copy: key"
command -v gpg > /dev/null
test -s "$key_file"
step="encrypted copy: folder"
# Only the last folder is made: if the drive itself is missing (Google Drive not
# running or signed out), this fails.
[ -d "$copy_dir" ] || mkdir "$copy_dir"
find "$copy_dir" -maxdepth 1 -type f -name '*.gpg.part' -exec rm -f {} +
# gpg wants a home folder; nothing secret is ever in it.
gnupg_home=$(mktemp -d)
for file in "$db" "$media"; do
  name=${file##*/}
  step="encrypted copy: $name"
  # stdin from /dev/null: the scheduled task's headless console has none, and gpg warns.
  gpg --homedir "$gnupg_home" --batch --no-tty --quiet --yes --no-autostart --compress-algo none \
    --recipient-file "$key_file" --output "$copy_dir/$name.gpg.part" --encrypt "$file" < /dev/null
  # Complete: the copy ends exactly where its last packet says it does (offset + header +
  # length, from gpg's listing; a cut-off copy is shorter), and it is bigger than the original.
  size=$(wc -c < "$copy_dir/$name.gpg.part" | tr -d ' ')
  declared=$(gpg --homedir "$gnupg_home" --batch --no-tty --no-autostart --list-only --list-packets \
    "$copy_dir/$name.gpg.part" < /dev/null 2> /dev/null |
    sed -n 's/^# off=\([0-9][0-9]*\) .* hlen=\([0-9][0-9]*\) plen=\([0-9][0-9]*\).*/\1 + \2 + \3/p' | tail -n 1)
  test -n "$declared"
  test "$(($declared))" -eq "$size"
  test "$size" -gt "$(wc -c < "$file")"
  mv "$copy_dir/$name.gpg.part" "$copy_dir/$name.gpg"
done
echo "encrypted copy: db-$stamp.dump.gpg and media-$stamp.tgz.gpg in $copy_dir"

step="encrypted copy: prune"
if [ "$prune" = yes ]; then
  # By the time in the names, not the files' dates, which a sync client may change.
  cutoff=$(date -u -d "$keep_days days ago" +%Y%m%d%H%M%S)
  keep=$(find "$copy_dir" -maxdepth 1 -type f -name 'db-*.dump.gpg' | sed 's|.*/db-||; s|\.dump\.gpg$||' |
    grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort -r | head -n "$keep_min" | tr '\n' ' ')
  find "$copy_dir" -maxdepth 1 -type f \( -name 'db-*.dump.gpg' -o -name 'media-*.tgz.gpg' \) | sort |
    while IFS= read -r old; do
      name=${old##*/}
      old_stamp=$(printf '%s\n' "$name" | sed 's/^db-//; s/^media-//; s/\.dump\.gpg$//; s/\.tgz\.gpg$//')
      case " $keep " in *" $old_stamp "*) continue ;; esac
      digits=$(printf '%s' "$old_stamp" | tr -d 'TZ')
      case $digits in '' | *[!0-9]*) continue ;; esac
      [ "${#digits}" -eq 14 ] || continue
      [ "$digits" -lt "$cutoff" ] || continue
      rm -f "$old"
      echo "pruned copy $name"
    done
fi
