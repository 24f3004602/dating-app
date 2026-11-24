#!/bin/sh
# Tests backup.sh (D142) against a stand-in `docker`: no container is touched.
# A good run, an empty dump, an archive without photos, docker failing, a run
# interrupted by TERM or HUP (a closed window), leftovers from a killed run, and
# pruning (7 days, the newest 3 good ones kept, empty dumps removed). The encrypted
# copy (D149) with real GnuPG and a throwaway key from backup-key.sh: copies open to
# the originals, .env's setting, no key, no drive, gpg failing, a cut-off copy, and
# pruning copies by the time in their names.
#   sh backup-test.sh [path/to/backup.sh]     (CI runs it in beta-stack)
set -u
script=${1:-$(dirname "$0")/backup.sh}
keyscript=$(dirname "$script")/backup-key.sh
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

# 9. The key (backup-key.sh): made once, never replaced.
check "gpg is installed" "command -v gpg > /dev/null"
keys="$work/keys"
BACKUP_KEY_FILE="$keys/public.asc" sh "$keyscript" new "$keys/owner" > "$work/key.log" 2>&1; s=$?
check "key: made (public key, private key, passphrase)" "[ $s -eq 0 ] && [ -s '$keys/public.asc' ] && [ -s '$keys/owner/private-key.asc' ] && [ -s '$keys/owner/passphrase.txt' ]"
BACKUP_KEY_FILE="$keys/public.asc" sh "$keyscript" new "$keys/again" > "$work/key2.log" 2>&1; s=$?
check "key: an existing key is never replaced" "[ $s -ne 0 ] && [ ! -e '$keys/again/private-key.asc' ]"
echo wrong > "$work/wrong.txt"
mkdir -p "$work/gh"
copyrun() { PATH="$work/bin:$PATH" BACKUP_DIR="$1" BACKUP_COPY_DIR="$2" BACKUP_KEY_FILE="${3:-$keys/public.asc}" sh "$work/beta/backup.sh" > "$1.log" 2>&1; }

# 10. A good run with a copy (a folder name with a space, like Google Drive's): both files
# encrypted, complete, in the classic format, and they open to the originals.
d="$work/t10"; mkdir -p "$work/my drive"; c="$work/my drive/Kinaara backups"
MODE=ok copyrun "$d" "$c"; s=$?
check "copy: exits 0" "[ $s -eq 0 ]"
check "copy: two copies, nothing partial" "[ \$(count '$c' '*.gpg') -eq 2 ] && [ \$(count '$c' '*.part') -eq 0 ]"
check "copy: logs its line after the backup's" "grep -q '^backup: ' $d.log && grep -q '^encrypted copy: db-.*\.dump\.gpg and media-.*\.tgz\.gpg in ' $d.log"
dump=$(ls "$d"/db-*.dump); arc=$(ls "$d"/media-*.tgz); dname=${dump##*/}; aname=${arc##*/}
check "copy: the dump's copy opens to the dump" "sh '$keyscript' check '$keys/owner/private-key.asc' '$keys/owner/passphrase.txt' '$c/$dname.gpg' '$dump' > /dev/null 2>&1"
check "copy: the archive's copy opens to the archive" "sh '$keyscript' check '$keys/owner/private-key.asc' '$keys/owner/passphrase.txt' '$c/$aname.gpg' '$arc' > /dev/null 2>&1"
check "copy: a wrong passphrase doesn't open it" "! sh '$keyscript' check '$keys/owner/private-key.asc' '$work/wrong.txt' '$c/$dname.gpg' > /dev/null 2>&1"
check "copy: the classic format (MDC, not AEAD)" "gpg --homedir '$work/gh' --batch --list-only --list-packets '$c/$dname.gpg' 2>&1 | grep -q '^:encrypted data packet:'"
check "copy: the copy is not the plain file" "! cmp -s '$c/$dname.gpg' '$dump'"

# 11. The folder comes from .env when the environment doesn't name it (quoted, CR LF);
# an empty BACKUP_COPY_DIR in the environment turns the copy off.
printf 'OTHER=1\r\nBACKUP_COPY_DIR="%s"\r\n' "$work/env copies" > "$work/beta/.env"
d="$work/t11"; MODE=ok PATH="$work/bin:$PATH" BACKUP_DIR="$d" BACKUP_KEY_FILE="$keys/public.asc" sh "$work/beta/backup.sh" > "$d.log" 2>&1; s=$?
check ".env: copies go to its folder" "[ $s -eq 0 ] && [ \$(count '$work/env copies' '*.gpg') -eq 2 ]"
d="$work/t11b"; BACKUP_COPY_DIR= MODE=ok PATH="$work/bin:$PATH" BACKUP_DIR="$d" BACKUP_KEY_FILE="$keys/public.asc" sh "$work/beta/backup.sh" > "$d.log" 2>&1; s=$?
check ".env: an empty BACKUP_COPY_DIR here turns it off" "[ $s -eq 0 ] && ! grep -q 'encrypted copy' $d.log"
rm -f "$work/beta/.env"

# 12. No key: the backup stays, the copy fails with one line.
d="$work/t12"; MODE=ok copyrun "$d" "$work/t12-copies" "$work/missing.asc"; s=$?
check "no key: exits non-zero" "[ $s -ne 0 ]"
check "no key: the backup itself is published" "[ \$(count $d 'db-*.dump') -eq 1 ] && grep -q '^backup: ' $d.log"
check "no key: logs FAILED (encrypted copy: key)" "grep -q '(encrypted copy: key)$' $d.log"

# 13. The drive is missing (Google Drive not running): FAILED at the folder, no folder made.
d="$work/t13"; MODE=ok copyrun "$d" "$work/no-such-drive/Kinaara backups"; s=$?
check "no drive: exits non-zero, logs FAILED (encrypted copy: folder)" "[ $s -ne 0 ] && grep -q '(encrypted copy: folder)$' $d.log"
check "no drive: nothing made" "[ ! -e '$work/no-such-drive' ]"

# 14. gpg fails halfway: no partial copy remains, and FAILED names the file.
mkdir -p "$work/badgpg"
cat > "$work/badgpg/gpg" <<'EOF'
#!/bin/sh
prev=
for a in "$@"; do
  [ "$prev" = --output ] && printf 'partial' > "$a"
  prev=$a
done
exit 2
EOF
chmod +x "$work/badgpg/gpg"
d="$work/t14"; c="$work/t14-copies"
MODE=ok PATH="$work/badgpg:$work/bin:$PATH" BACKUP_DIR="$d" BACKUP_COPY_DIR="$c" BACKUP_KEY_FILE="$keys/public.asc" sh "$work/beta/backup.sh" > "$d.log" 2>&1; s=$?
check "gpg fails: exits non-zero, FAILED names the dump" "[ $s -ne 0 ] && grep -q '(encrypted copy: db-.*\.dump)$' $d.log"
check "gpg fails: no partial copy remains" "[ \$(count $c '*') -eq 0 ]"

# 15. A cut-off copy (gpg's output truncated) fails the check and is removed.
mkdir -p "$work/cutgpg"
cat > "$work/cutgpg/gpg" <<EOF
#!/bin/sh
"$(command -v gpg)" "\$@"; s=\$?
prev=; out=
for a in "\$@"; do [ "\$prev" = --output ] && out=\$a; prev=\$a; done
if [ -n "\$out" ] && [ -f "\$out" ]; then head -c 100 "\$out" > "\$out.cut" && mv "\$out.cut" "\$out"; fi
exit \$s
EOF
chmod +x "$work/cutgpg/gpg"
d="$work/t15"; c="$work/t15-copies"
MODE=ok PATH="$work/cutgpg:$work/bin:$PATH" BACKUP_DIR="$d" BACKUP_COPY_DIR="$c" BACKUP_KEY_FILE="$keys/public.asc" sh "$work/beta/backup.sh" > "$d.log" 2>&1; s=$?
check "cut-off copy: exits non-zero, FAILED names the dump" "[ $s -ne 0 ] && grep -q '(encrypted copy: db-.*\.dump)$' $d.log"
check "cut-off copy: nothing left in the folder" "[ \$(count $c '*') -eq 0 ]"

# 16. Pruning copies by the time in their names: older than 7 days go, the newest 3 stay
# (the new one and 2 old), names that aren't times are never touched or counted.
d="$work/t16"; c="$work/t16-copies"; mkdir -p "$c"
old() { printf 'x' > "$c/db-$1.dump.gpg"; printf 'x' > "$c/media-$1.tgz.gpg"; }
old 20200101T000000Z; old 20200102T000000Z; old 20200103T000000Z; old 20200104T000000Z
printf 'x' > "$c/notes.txt"; printf 'x' > "$c/db-latest.dump.gpg"
MODE=ok copyrun "$d" "$c"
check "copy prune: the newest 3 stay" "[ -f '$c/db-20200104T000000Z.dump.gpg' ] && [ -f '$c/db-20200103T000000Z.dump.gpg' ] && [ -f '$c/media-20200103T000000Z.tgz.gpg' ] && [ \$(count '$c' 'db-2*.dump.gpg') -eq 3 ]"
check "copy prune: older ones go, with their archives" "[ ! -f '$c/db-20200102T000000Z.dump.gpg' ] && [ ! -f '$c/media-20200101T000000Z.tgz.gpg' ] && grep -q 'pruned copy db-20200101T000000Z.dump.gpg' $d.log"
check "copy prune: other files stay" "[ -f '$c/notes.txt' ] && [ -f '$c/db-latest.dump.gpg' ]"
d="$work/t16b"; c="$work/t16b-copies"; mkdir -p "$c"; old 20200101T000000Z
BACKUP_PRUNE=no MODE=ok copyrun "$d" "$c"
check "copy prune: BACKUP_PRUNE=no keeps old copies" "[ -f '$c/db-20200101T000000Z.dump.gpg' ]"

echo "passed $pass, failed $failed"
[ "$failed" -eq 0 ]
