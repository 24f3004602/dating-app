#!/bin/sh
# The key for the encrypted backup copies (D149). This computer keeps only the public half
# (backup-key.asc beside .env, or BACKUP_KEY_FILE), which can lock copies but never open them.
# The private half and its passphrase live only in the owner's password manager, so the copies
# in Google Drive can't be read by Google, by someone in the Drive account, or by someone who
# has this computer.
#
#   sh backup-key.sh new <folder>
#       Makes a key pair: the public key goes to backup-key.asc; private-key.asc, passphrase.txt
#       and README.txt go to <folder>, for the password manager. Refuses to replace a key.
#   sh backup-key.sh check <private-key.asc> <passphrase file> <copy.gpg> [original]
#       Proves that the key and passphrase open a copy, and that it equals the original when
#       one is given. Nothing decrypted is kept.
#
# Keys are ed25519 with a cv25519 encryption subkey, and ask for the classic OpenPGP format
# (MDC, not AEAD), so any GnuPG since 2.1 can open the copies, including GnuPG 2.2 on older
# Linux and macOS.
set -eu
umask 077
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
cleanup() {
  gpgconf --homedir "$work/g" --kill gpg-agent > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$work/g"
g() { gpg --homedir "$work/g" --batch --no-tty --quiet --pinentry-mode loopback "$@"; }
usage="usage: backup-key.sh new <folder> | check <private-key.asc> <passphrase file> <copy.gpg> [original]"

case ${1-} in
new)
  folder=${2:?$usage}
  pub=${BACKUP_KEY_FILE:-$here/backup-key.asc}
  if [ -e "$pub" ]; then
    echo "$pub already exists. Copies made with it open only with its own private key; move it aside first." >&2
    exit 1
  fi
  if [ -e "$folder/private-key.asc" ]; then
    echo "$folder already holds a private key." >&2
    exit 1
  fi
  mkdir -p "$folder"
  # 32 random characters: letters, digits, - and _.
  head -c 24 /dev/urandom | base64 | tr '+/' '-_' > "$folder/passphrase.txt"
  test "$(tr -d '\n' < "$folder/passphrase.txt" | wc -c | tr -d ' ')" -eq 32
  made=$(date -u +%Y-%m-%d)
  g --passphrase-file "$folder/passphrase.txt" \
    --default-preference-list "AES256 AES192 AES SHA512 SHA384 SHA256 ZLIB BZIP2 ZIP Uncompressed" \
    --quick-gen-key "Kinaara beta backups ($made)" future-default default never
  fpr=$(g --with-colons --list-keys | awk -F: '$1 == "fpr" { print $10; exit }')
  test -n "$fpr"
  g --armor --export "$fpr" > "$work/public.asc"
  g --passphrase-file "$folder/passphrase.txt" --armor --export-secret-keys "$fpr" > "$folder/private-key.asc"
  grep -q 'BEGIN PGP PRIVATE KEY BLOCK' "$folder/private-key.asc"
  cat > "$folder/README.txt" <<EOF
The key to Kinaara's encrypted backup copies, made $made.
Fingerprint: $fpr

Without this key and its passphrase nobody can open the copies in Google Drive, not even you.

1. In your password manager, make an entry named "Kinaara backup key".
   Password: the line in passphrase.txt.
   Notes: all of private-key.asc, from -----BEGIN to -----END.
2. Check the saved entry: copy its notes into a new file in this folder named check-key.asc,
   and its password into check-passphrase.txt (Notepad, then Save as). Tell Claude.
3. Once the check passes, this folder is deleted from the laptop. Keep the entry for as long
   as any copy may be needed.
EOF
  mv "$work/public.asc" "$pub"
  echo "made key $fpr: the public key is $pub; the private key, passphrase and README are in $folder"
  ;;
check)
  key=${2:?$usage}
  pass=${3:?$usage}
  copy=${4:?$usage}
  original=${5-}
  # A passphrase pasted into Notepad may end in CR LF or a space: only its first line, trimmed.
  tr -d '\r' < "$pass" | head -n 1 | sed 's/[[:space:]]*$//' > "$work/passphrase"
  g --passphrase-file "$work/passphrase" --import "$key"
  g --passphrase-file "$work/passphrase" --output "$work/plain" --decrypt "$copy"
  if [ -n "$original" ]; then
    if ! cmp -s "$work/plain" "$original"; then
      echo "${copy##*/} opens, but it differs from ${original##*/}." >&2
      exit 1
    fi
    echo "the key and passphrase open ${copy##*/}; it is identical to ${original##*/}"
  else
    echo "the key and passphrase open ${copy##*/} ($(wc -c < "$work/plain" | tr -d ' ') bytes inside)"
  fi
  ;;
*)
  echo "$usage" >&2
  exit 2
  ;;
esac
