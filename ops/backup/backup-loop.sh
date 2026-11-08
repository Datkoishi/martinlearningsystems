#!/usr/bin/env bash

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIRECTORY/common.sh"

validate_backup_config

stop_requested=false
request_stop() {
  stop_requested=true
  [[ -n "${sleep_pid:-}" ]] && kill "$sleep_pid" 2>/dev/null || true
}
trap request_stop TERM INT

if [[ "$BACKUP_RUN_ON_START" != 'true' ]]; then
  sleep "$BACKUP_INTERVAL_SECONDS" &
  sleep_pid=$!
  wait "$sleep_pid" || true
  sleep_pid=''
fi

while [[ "$stop_requested" != 'true' ]]; do
  if ! "$SCRIPT_DIRECTORY/backup-once.sh"; then
    backup_log 'Backup attempt failed; healthcheck will report unhealthy until a later success.'
  fi
  [[ "$stop_requested" == 'true' ]] && break
  sleep "$BACKUP_INTERVAL_SECONDS" &
  sleep_pid=$!
  wait "$sleep_pid" || true
  sleep_pid=''
done

backup_log 'Backup loop stopped.'
