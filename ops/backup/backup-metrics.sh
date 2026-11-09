#!/usr/bin/env bash

set -Eeuo pipefail

: "${BACKUP_ROOT:=/backups}"
: "${BACKUP_MAX_AGE_SECONDS:=90000}"
status_directory="$BACKUP_ROOT/status"
metrics_directory="$BACKUP_ROOT/metrics"

[[ "$BACKUP_ROOT" == /* && "$BACKUP_ROOT" != '/' ]] || exit 1
[[ "$BACKUP_MAX_AGE_SECONDS" =~ ^[0-9]+$ ]] || exit 1

read_epoch() {
  local file="$1"
  local fallback="${2:-0}"
  if [[ ! -f "$file" ]]; then
    printf '%s\n' "$fallback"
    return
  fi
  local value
  value="$(<"$file")"
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$value"
}

now_epoch="$(date -u '+%s')"
healthy=1
success_epoch="$(read_epoch "$status_directory/last_success_epoch" 0)" || { success_epoch=0; healthy=0; }
verify_epoch="$(read_epoch "$status_directory/last_verify_success_epoch" 0)" || { verify_epoch=0; healthy=0; }
failure_epoch="$(read_epoch "$status_directory/last_failure_epoch" 0)" || { failure_epoch=0; healthy=0; }
restore_epoch="$(read_epoch "$status_directory/last_restore_success_epoch" 0)" || { restore_epoch=0; healthy=0; }

if (( success_epoch == 0 )); then
  age_seconds=-1
  healthy=0
else
  age_seconds=$(( now_epoch - success_epoch ))
  (( age_seconds >= 0 && age_seconds <= BACKUP_MAX_AGE_SECONDS )) || healthy=0
fi
(( verify_epoch > 0 && verify_epoch >= success_epoch - 300 )) || healthy=0
(( failure_epoch <= success_epoch )) || healthy=0

mkdir -p "$metrics_directory"
chmod 755 "$metrics_directory"
temporary="$(mktemp "$metrics_directory/.eduassess_backup.prom.XXXXXX")"
cleanup_metrics() {
  rm -f -- "$temporary"
}
trap cleanup_metrics EXIT
cat > "$temporary" <<EOF
# HELP eduassess_backup_healthy Whether backup freshness, verification, and failure ordering are healthy.
# TYPE eduassess_backup_healthy gauge
eduassess_backup_healthy $healthy
# HELP eduassess_backup_last_success_timestamp_seconds Unix timestamp of the last successful backup.
# TYPE eduassess_backup_last_success_timestamp_seconds gauge
eduassess_backup_last_success_timestamp_seconds $success_epoch
# HELP eduassess_backup_last_verify_success_timestamp_seconds Unix timestamp of the last successful backup verification.
# TYPE eduassess_backup_last_verify_success_timestamp_seconds gauge
eduassess_backup_last_verify_success_timestamp_seconds $verify_epoch
# HELP eduassess_backup_last_failure_timestamp_seconds Unix timestamp of the last backup failure.
# TYPE eduassess_backup_last_failure_timestamp_seconds gauge
eduassess_backup_last_failure_timestamp_seconds $failure_epoch
# HELP eduassess_backup_age_seconds Age of the last successful backup, or -1 when unavailable.
# TYPE eduassess_backup_age_seconds gauge
eduassess_backup_age_seconds $age_seconds
# HELP eduassess_backup_last_restore_success_timestamp_seconds Unix timestamp of the last successful restore rehearsal.
# TYPE eduassess_backup_last_restore_success_timestamp_seconds gauge
eduassess_backup_last_restore_success_timestamp_seconds $restore_epoch
EOF
chmod 644 "$temporary"
mv -f "$temporary" "$metrics_directory/eduassess_backup.prom"
trap - EXIT

(( healthy == 1 ))
