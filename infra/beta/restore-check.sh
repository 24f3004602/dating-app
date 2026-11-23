#!/bin/sh
# Proves a database backup restores (D142): the dump goes into a throwaway
# PostgreSQL container with no network, with every error fatal, and the tables
# it creates are counted against the dump's own table of contents. The running
# beta is never touched, and the container is removed afterwards. Prints counts
# only: tables, the migration, and rows in a few main tables.
#   ./restore-check.sh <db-*.dump>
# Run it after a release and once a month (deploy.md); CI runs it on every
# beta-stack build.
set -eu
# Git Bash would rewrite container paths into Windows paths.
export MSYS_NO_PATHCONV=1
dump=${1:?usage: restore-check.sh <db-*.dump>}
test -s "$dump"
image=${RESTORE_CHECK_IMAGE:-postgres:17}
name="datingapp-restore-check-$$"

fail() {
  echo "restore check FAILED: $1" >&2
  exit 1
}
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

# Small on purpose: the home-mode laptop runs the beta beside it.
docker run -d --rm --name "$name" --network none --memory 256m -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
  "$image" -c shared_buffers=16MB -c max_connections=10 >/dev/null
# The image starts a temporary server for its first set-up, then the real one.
tries=0
until docker logs "$name" 2>&1 | grep -q 'PostgreSQL init process complete' && docker exec "$name" pg_isready -U postgres -q; do
  tries=$((tries + 1))
  test "$tries" -lt 90 || fail "the scratch database didn't start"
  sleep 1
done

docker exec "$name" createdb -U postgres check
docker exec -i "$name" pg_restore -U postgres -d check --no-owner --no-privileges --exit-on-error < "$dump" ||
  fail "pg_restore reported an error"

listed=$(docker exec -i "$name" pg_restore --list < "$dump" | grep -c ' TABLE DATA ') || fail "no table data in the dump"
sql() { docker exec "$name" psql -U postgres -d check -Atc "$1"; }
tables=$(sql "select count(*) from pg_tables where schemaname = 'public'")
version=$(sql "select version_num from alembic_version")
rows=$(sql "select (select count(*) from users) || ' users, ' || (select count(*) from profiles) || ' profiles, ' || (select count(*) from photos) || ' photos, ' || (select count(*) from matches) || ' matches, ' || (select count(*) from messages) || ' messages'")
test "$tables" -ge "$listed" || fail "$tables tables restored, the dump lists $listed"
echo "restore check: ${dump##*/} restored into a scratch database: $tables tables (the dump lists $listed); migration $version; $rows"
