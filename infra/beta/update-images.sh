#!/bin/sh
# Monthly base-image updates for the beta (D148): pulls the newest postgres:17 and redis:7
# (their floating tags carry the security patches), and restarts only the services whose image
# changed, after a verified backup. Each old image is kept as a rollback tag; if the stack isn't
# healthy again within a few minutes, the old images go back and the run fails loudly. The
# cloudflared image is pinned to a version in compose.tunnel.yaml, so it changes only by an edit.
#   ./update-images.sh            update (home mode: the first Sunday at 04:00, schedule-updates.ps1)
#   ./update-images.sh --check    pull and say what would restart; restart nothing
#   ./update-images.sh --force    restart postgres and redis even if nothing is new (CI checks the path)
# Logs one line per step; "update FAILED (<step>)" on failure (the health check sees the outcome).
set -eu
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")"
mode=${1:-update}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
step=start
log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) update: $*"; }
trap 'status=$?; [ "$status" -eq 0 ] || echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) update FAILED ($step)" >&2' EXIT

running_image() { docker inspect "$(docker compose ps -q "$1")" --format '{{.Image}}'; }
tag_of() { case "$1" in postgres) echo postgres:17 ;; redis) echo redis:7 ;; esac; }
healthy() {
  tries=0
  while [ "$tries" -lt 60 ]; do
    ok=yes
    for svc in "$@"; do
      state=$(docker inspect "$(docker compose ps -q "$svc")" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)
      case "$state" in healthy|running) ;; *) ok=no ;; esac
    done
    [ "$ok" = yes ] && return 0
    tries=$((tries + 1)); sleep 3
  done
  return 1
}

step=pull
docker compose pull --quiet postgres redis
changed=""
for svc in postgres redis; do
  if [ "$mode" = --force ] || [ "$(running_image "$svc")" != "$(docker image inspect "$(tag_of "$svc")" --format '{{.Id}}')" ]; then
    changed="$changed $svc"
  fi
done
if [ -z "$changed" ]; then
  log "nothing new for postgres:17 and redis:7"
  exit 0
fi
if [ "$mode" = --check ]; then
  log "would restart:$changed"
  exit 0
fi

step=backup
BACKUP_DIR=${BACKUP_DIR:-$HOME/datingapp-backups} ./backup.sh

step=rollback-tags
for svc in $changed; do
  docker tag "$(running_image "$svc")" "datingapp-rollback/$svc:$stamp"
done

# Called inside `if`, where `set -e` doesn't apply: every step returns its failure itself.
restart() {
  for svc in "$@"; do docker compose up -d --no-deps --force-recreate "$svc" || return 1; done
  healthy "$@" || return 1
  # The API and the worker reconnect cleanly from a fresh start.
  docker compose restart api worker || return 1
  healthy api worker || return 1
}

step=restart
if restart $changed; then
  log "restarted:$changed; healthy"
  exit 0
fi

step=rollback
log "not healthy after restarting$changed; going back"
for svc in $changed; do
  docker tag "datingapp-rollback/$svc:$stamp" "$(tag_of "$svc")"
done
restart $changed || true
exit 1
