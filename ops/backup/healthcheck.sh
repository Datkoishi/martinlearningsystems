#!/usr/bin/env bash

set -Eeuo pipefail

: "${BACKUP_ROOT:=/backups}"
: "${BACKUP_MAX_AGE_SECONDS:=90000}"
status_directory="$BACKUP_ROOT/status"
success_file="$status_directory/last_success_epoch"
failure_file="$status_directory/last_failure_epoch"
verify_file="$status_directory/last_verify_success_epoch"

[[ "$BACKUP_MAX_AGE_SECONDS" =~ ^[0-9]+$ ]] || exit 1
[[ -f "$success_file" && -f "$verify_file" ]] || exit 1
success_epoch="$(<"$success_file")"
verify_epoch="$(<"$verify_file")"
[[ "$success_epoch" =~ ^[0-9]+$ && "$verify_epoch" =~ ^[0-9]+$ ]] || exit 1

now_epoch="$(date -u '+%s')"
(( now_epoch - success_epoch <= BACKUP_MAX_AGE_SECONDS )) || exit 1
(( verify_epoch >= success_epoch - 300 )) || exit 1

if [[ -f "$failure_file" ]]; then
  failure_epoch="$(<"$failure_file")"
  [[ "$failure_epoch" =~ ^[0-9]+$ ]] || exit 1
  (( failure_epoch <= success_epoch )) || exit 1
fi

exit 0
