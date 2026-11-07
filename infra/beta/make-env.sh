#!/bin/sh
# Writes infra/beta/.env for the closed beta (stage 18, D096), on the server.
# Secrets are generated here and never leave the server. Afterwards, edit .env
# to add the Gmail address and app password, your name and a contact address.
#   usage: ./make-env.sh <domain> <your-email-for-certificate-notices>
set -eu
cd "$(dirname "$0")"
domain=${1:?usage: ./make-env.sh <domain> <your-email>}
acme_email=${2:?usage: ./make-env.sh <domain> <your-email>}
case $domain in
  *[!a-z0-9.-]* | .* | *. ) echo "make-env: '$domain' is not a plain lowercase domain" >&2; exit 2 ;;
esac
if [ -e .env ]; then
  echo "make-env: .env already exists; it holds the database passwords, so it is never overwritten" >&2
  exit 2
fi
secret() { openssl rand -hex 32; }
csp=$(sed -e "s#{API_ORIGIN}#https://api.$domain#g" -e "s#{API_WS_ORIGIN}#wss://api.$domain#g" \
  -e "s#{MEDIA_ORIGIN}#https://$domain#g" app-csp.txt)

umask 077
cat > .env <<EOF
# The closed beta's settings (make-env.sh, $(date -u +%Y-%m-%d)). Keep this file on
# the server only: it holds the database passwords and the app's secret key.
DOMAIN=$domain
ACME_EMAIL=$acme_email
BRAND_NAME=Haanji

# Shown on the tester notice (/terms, /privacy): who runs the test, and an
# address you read. Testers write here for questions, copies of their data or
# complaints.
OPERATOR_NAME=
CONTACT_EMAIL=

# The Gmail account that sends codes: its address, and an app password
# (Google Account > Security > 2-Step Verification > App passwords).
SMTP_USERNAME=
SMTP_PASSWORD=

# Generated. Changing APP_SECRET_KEY later voids live codes, photo links, the
# invite list and staff authenticators (deploy.md).
POSTGRES_PASSWORD=$(secret)
OWNER_PASSWORD=$(secret)
RUNTIME_PASSWORD=$(secret)
APP_SECRET_KEY=$(secret)

# The app's Content-Security-Policy (from app-csp.txt).
APP_CSP="$csp"

# Push for the Android app: none until the EAS project and Firebase are set up.
PUSH_BACKEND=none
EOF
echo "make-env: wrote .env for $domain. Now fill in OPERATOR_NAME, CONTACT_EMAIL, SMTP_USERNAME and SMTP_PASSWORD."
