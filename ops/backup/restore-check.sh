#!/usr/bin/env bash

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIRECTORY/common.sh"

: "${BACKUP_ROOT:=/backups}"
validate_absolute_path BACKUP_ROOT
for command_name in mysql sha256sum realpath; do
  require_command "$command_name"
done
require_env RESTORE_MYSQL_HOST
require_env RESTORE_MYSQL_PORT
require_env RESTORE_MYSQL_USER
require_env RESTORE_MYSQL_PASSWORD
require_env RESTORE_CHECK_DATABASE
require_env RESTORE_CHECK_CONFIRM_DROP
[[ "$RESTORE_MYSQL_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || backup_fail 'RESTORE_MYSQL_HOST có ký tự không hợp lệ.'
[[ "$RESTORE_MYSQL_PORT" =~ ^[0-9]+$ ]] && (( 10#$RESTORE_MYSQL_PORT >= 1 && 10#$RESTORE_MYSQL_PORT <= 65535 )) || {
  backup_fail 'RESTORE_MYSQL_PORT không hợp lệ.'
}
[[ "$RESTORE_MYSQL_USER" =~ ^[A-Za-z0-9_.-]+$ ]] || backup_fail 'RESTORE_MYSQL_USER có ký tự không hợp lệ.'
[[ "$RESTORE_CHECK_DATABASE" =~ ^eduassess_restore_[A-Za-z0-9_]+$ ]] || {
  backup_fail 'RESTORE_CHECK_DATABASE phải dùng prefix eduassess_restore_.'
}
[[ "$RESTORE_CHECK_CONFIRM_DROP" == "$RESTORE_CHECK_DATABASE" ]] || {
  backup_fail 'RESTORE_CHECK_CONFIRM_DROP phải khớp chính xác database rehearsal.'
}

backup_directory="$(resolve_backup_directory "${1:-$BACKUP_ROOT/latest}")"
"$SCRIPT_DIRECTORY/verify-backup.sh" "$backup_directory"

export MYSQL_PWD="$RESTORE_MYSQL_PASSWORD"
restore_args=(
  '--protocol=TCP'
  "--host=$RESTORE_MYSQL_HOST"
  "--port=$RESTORE_MYSQL_PORT"
  "--user=$RESTORE_MYSQL_USER"
)
database_created=false
actual_ledger=''
actual_invariants=''
cleanup_restore_check() {
  local exit_code=$?
  trap - EXIT
  [[ -z "$actual_ledger" ]] || rm -f "$actual_ledger"
  [[ -z "$actual_invariants" ]] || rm -f "$actual_invariants"
  if [[ "$database_created" == 'true' ]]; then
    mysql "${restore_args[@]}" --execute="DROP DATABASE IF EXISTS \`$RESTORE_CHECK_DATABASE\`" >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup_restore_check EXIT

mysql "${restore_args[@]}" --execute="DROP DATABASE IF EXISTS \`$RESTORE_CHECK_DATABASE\`; CREATE DATABASE \`$RESTORE_CHECK_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
database_created=true
mysql "${restore_args[@]}" "$RESTORE_CHECK_DATABASE" < "$backup_directory/database.sql"

actual_ledger="$(mktemp)"
actual_invariants="$(mktemp)"

mysql "${restore_args[@]}" --database="$RESTORE_CHECK_DATABASE" --batch --skip-column-names \
  --execute='SELECT version, sequence_number, checksum_sha256, operation FROM schema_migrations ORDER BY sequence_number' \
  > "$actual_ledger"
mysql "${restore_args[@]}" --database="$RESTORE_CHECK_DATABASE" --batch --skip-column-names \
  --execute="SELECT 'COLUMN_COUNT', COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
             UNION ALL SELECT 'LEDGER_COUNT', COUNT(*) FROM schema_migrations
             UNION ALL SELECT 'TABLE_COUNT', COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
             ORDER BY 1" \
  > "$actual_invariants"

expected_ledger_hash="$(sha256sum "$backup_directory/ledger.tsv" | awk '{print $1}')"
actual_ledger_hash="$(sha256sum "$actual_ledger" | awk '{print $1}')"
expected_invariant_hash="$(sha256sum "$backup_directory/invariants.tsv" | awk '{print $1}')"
actual_invariant_hash="$(sha256sum "$actual_invariants" | awk '{print $1}')"
[[ "$actual_ledger_hash" == "$expected_ledger_hash" ]] || backup_fail 'Restore ledger không khớp backup.'
[[ "$actual_invariant_hash" == "$expected_invariant_hash" ]] || backup_fail 'Restore schema invariants không khớp backup.'

mysql "${restore_args[@]}" --execute="DROP DATABASE IF EXISTS \`$RESTORE_CHECK_DATABASE\`"
database_created=false
mkdir -p "$BACKUP_ROOT/status"
atomic_write_status "$BACKUP_ROOT/status/last_restore_success_epoch" "$(date -u '+%s')"
atomic_write_status "$BACKUP_ROOT/status/last_restore_success_id" "$(basename "$backup_directory")"
backup_log "Restore rehearsal passed: $(basename "$backup_directory")"
