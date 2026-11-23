#!/bin/sh
# Tests backup.sh (D142) against a stand-in `docker`: no container is touched.
# A good run, an empty dump, an archive without photos, docker failing, a run
# interrupted by TERM or HUP (a closed window), leftovers from a killed run, and
# pruning (7 days, the newest 3 good ones kept, empty dumps removed).
#   sh backup-test.sh [path/to/backup.sh]     (CI runs it in beta-stack)
set -u
script=${1:-$(dirname "$0")/backup.sh}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/beta" "$work/media/media"
echo photo > "$work/media/media/a.jpg"
cp "$script" "$work/beta/backup.sh"
touch "$work/beta/compose.yaml"

# The stand-in: MODE=ok answers like the real stack; MODE=slow writes a little, then waits to be killed;
# MODE=empty-dump gives an empty dump; MODE=no-media gives an archive without media/.
cat > "$work/bin/docker" <<EOF
#!/bin/sh
case "\$*" in
  *pg_dump*)
    [ "\${MODE:-ok}" = empty-dump ] && exit 0
    printf 'PGDMP fake dump\n'
    if [ "\${MODE:-ok}" = slow ]; then echo \$\$ > "$work/slow.pid"; exec sleep 30; fi
    exit 0 ;;
  *"pg_restore --list"*) cat > /dev/null; printf ';\n215; 1259 16390 TABLE public users postgres\n4001; 0 16390 TABLE DATA public users postgres\n' ;;
  *tar*)
    if [ "\${MODE:-ok}" = no-media ]; then tar czf - -C "$work" bin; else tar czf - -C "$work/media" media; fi ;;
  *) echo "unexpected docker call: \$*" >&2; exit 2 ;;
esac
EOF
chmod +x "$work/bin/docker"

pass=0; failed=0
check() { if eval "$2"; then pass=$((pass + 1)); echo "ok   $1"; else failed=$((failed + 1)); echo "FAIL $1"; fi; }
run() { PATH="$work/bin:$PATH" BACKUP_DIR="$1" sh "$work/beta/backup.sh" > "$1.log" 2>&1; }
count() { find "$1" -maxdepth 1 -type f -name "$2" | wc -l | tr -d ' '; }

# 1. A good run publishes one checked dump and archive, and nothing partial.
d="$work/t1"; MODE=ok run "$d"; s=$?
check "good run exits 0" "[ $s -eq 0 ]"
check "good run publishes a dump" "[ \$(count $d 'db-*.dump') -eq 1 ] && [ -s \$(ls $d/db-*.dump) ]"
check "good run publishes an archive" "[ \$(count $d 'media-*.tgz') -eq 1 ]"
check "good run leaves no partial file" "[ \$(count $d '*.part*') -eq 0 ]"
check "good run logs its line" "grep -q '^backup: .* (1 tables; ' $d.log"

# 2. An empty dump fails at the check: nothing published, one FAILED line.
d="$work/t2"; MODE=empty-dump run "$d"; s=$?
check "empty dump exits non-zero" "[ $s -ne 0 ]"
check "empty dump publishes nothing" "[ \$(count $d 'db-*') -eq 0 ] && [ \$(count $d 'media-*') -eq 0 ]"
check "empty dump logs FAILED (database check)" "grep -q '^backup FAILED at .* (database check)$' $d.log"

# 3. An archive without media/ fails at the photos check: nothing published.
d="$work/t3"; MODE=no-media run "$d"; s=$?
check "bad archive exits non-zero" "[ $s -ne 0 ]"
check "bad archive publishes nothing" "[ \$(count $d 'db-*') -eq 0 ] && [ \$(count $d 'media-*') -eq 0 ]"
check "bad archive logs FAILED (photos check)" "grep -q '(photos check)$' $d.log"

# 4. No compose project (docker itself fails): FAILED at the dump.
d="$work/t4"; rm -f "$work/beta/compose.yaml"; PATH="/usr/bin:/bin" BACKUP_DIR="$d" sh "$work/beta/backup.sh" > "$d.log" 2>&1; s=$?
touch "$work/beta/compose.yaml"
check "docker failure exits non-zero" "[ $s -ne 0 ]"
check "docker failure logs FAILED (database dump)" "grep -q '(database dump)$' $d.log"
check "docker failure leaves no file" "[ \$(count $d '*') -eq 0 ]"

# 5. Interrupted mid-dump (a closed window or Ctrl+C): cleanup runs, nothing remains.
# (Background jobs ignore SIGINT in a non-interactive shell, so INT can't be sent this way; a closed window is HUP.)
for sig in TERM HUP; do
  d="$work/t5-$sig"; mkdir -p "$d"
  MODE=slow PATH="$work/bin:$PATH" BACKUP_DIR="$d" sh "$work/beta/backup.sh" > "$d.log" 2>&1 &
  pid=$!
  sleep 2
  kill -s "$sig" "$pid" 2>/dev/null
  kill "$(cat "$work/slow.pid")" 2>/dev/null
  wait "$pid"; s=$?
  check "$sig: exits non-zero" "[ $s -ne 0 ]"
  check "$sig: logs FAILED (database dump)" "grep -q '(database dump)$' $d.log"
  check "$sig: no partial or published file" "[ \$(count $d '*') -eq 0 ]"
done

# 6. Leftovers from a run killed outright are removed by the next run.
d="$work/t6"; mkdir -p "$d"; : > "$d/db-20261101T000000Z.dump.part"; : > "$d/media-20261101T000000Z.tgz.part.toc"
MODE=ok run "$d"
check "old partial files removed" "[ \$(count $d '*.part*') -eq 0 ]"

# 7. Pruning: older than 7 days goes, the newest 3 good ones always stay, empty dumps go.
d="$work/t7"; mkdir -p "$d"
mk() { printf 'x' > "$d/db-$1.dump"; printf 'x' > "$d/media-$1.tgz"; touch -d "$2" "$d/db-$1.dump" "$d/media-$1.tgz"; }
mk 20261001T000000Z "50 days ago"; mk 20261005T000000Z "45 days ago"; mk 20261010T000000Z "40 days ago"; mk 20261020T000000Z "30 days ago"
: > "$d/db-20261021T000000Z.dump"; touch -d "29 days ago" "$d/db-20261021T000000Z.dump"
printf 'x' > "$d/media-20260901T000000Z.tgz"; touch -d "80 days ago" "$d/media-20260901T000000Z.tgz"
MODE=ok run "$d"
check "prune: the new backup stays" "[ \$(count $d 'db-*.dump') -ge 1 ]"
check "prune: the 2 newest older good ones stay (3 kept in all)" "[ -f $d/db-20261020T000000Z.dump ] && [ -f $d/db-20261010T000000Z.dump ] && [ -f $d/media-20261010T000000Z.tgz ]"
check "prune: older ones beyond 3 go, with their archives" "[ ! -f $d/db-20261005T000000Z.dump ] && [ ! -f $d/media-20261005T000000Z.tgz ] && [ ! -f $d/db-20261001T000000Z.dump ]"
check "prune: an empty dump goes" "[ ! -f $d/db-20261021T000000Z.dump ] && grep -q 'removed empty db-20261021T000000Z.dump' $d.log"
check "prune: an orphan archive goes" "[ ! -f $d/media-20260901T000000Z.tgz ]"
check "prune: exactly 3 good dumps remain" "[ \$(count $d 'db-*.dump') -eq 3 ]"

# 8. BACKUP_PRUNE=no keeps every older backup, but still drops empty dumps.
d="$work/t8"; mkdir -p "$d"
printf 'x' > "$d/db-20261001T000000Z.dump"; touch -d "50 days ago" "$d/db-20261001T000000Z.dump"
: > "$d/db-20261002T000000Z.dump"
BACKUP_PRUNE=no MODE=ok run "$d"
check "no prune: the old backup stays" "[ -f $d/db-20261001T000000Z.dump ]"
check "no prune: the empty dump still goes" "[ ! -f $d/db-20261002T000000Z.dump ]"

echo "passed $pass, failed $failed"
[ "$failed" -eq 0 ]
