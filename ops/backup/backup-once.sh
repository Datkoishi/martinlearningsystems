#!/usr/bin/env bash

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIRECTORY/common.sh"

validate_backup_config
for command_name in mysql mysqldump tar sha256sum find mktemp realpath; do
  require_command "$command_name"
done
[[ -d "$IMPORT_STORAGE_PATH" && -r "$IMPORT_STORAGE_PATH" ]] || backup_fail 'IMPORT_STORAGE_PATH không tồn tại hoặc không đọc được.'

umask 077
mkdir -p "$BACKUP_ROOT/sets" "$BACKUP_ROOT/status"

lock_directory="$BACKUP_ROOT/.backup.lock"
partial_directory=''
finalized_directory=''
backup_succeeded=false
lock_acquired=false

release_resources() {
  local exit_code=$?
  trap - EXIT
  if [[ -n "$partial_directory" && -d "$partial_directory" ]]; then
    rm -rf -- "$partial_directory"
  fi
  if [[ "$backup_succeeded" != 'true' && -n "$finalized_directory" ]]; then
    rm -f -- "$finalized_directory/READY"
  fi
  if [[ "$lock_acquired" == 'true' ]]; then
    rm -f -- "$lock_directory/created_epoch"
    rmdir "$lock_directory" 2>/dev/null || true
  fi
  if [[ "$backup_succeeded" != 'true' ]]; then
    atomic_write_status "$BACKUP_ROOT/status/last_failure_epoch" "$(date -u '+%s')" || true
  fi
  exit "$exit_code"
}
trap release_resources EXIT

if mkdir "$lock_directory" 2>/dev/null; then
  lock_acquired=true
else
  lock_epoch_file="$lock_directory/created_epoch"
  if [[ -f "$lock_epoch_file" && "$(<"$lock_epoch_file")" =~ ^[0-9]+$ ]]; then
    lock_age=$(( $(date -u '+%s') - $(<"$lock_epoch_file") ))
    if (( lock_age > BACKUP_STALE_LOCK_SECONDS )); then
      backup_log 'Removing stale backup lock.'
      rm -rf -- "$lock_directory"
      mkdir "$lock_directory" || backup_fail 'Không thể lấy backup lock sau khi dọn stale lock.'
      lock_acquired=true
    else
      backup_fail 'Một backup job khác đang chạy.'
    fi
  else
    backup_fail 'Backup lock tồn tại nhưng không có metadata hợp lệ; cần operator kiểm tra.'
  fi
fi
printf '%s\n' "$(date -u '+%s')" > "$lock_directory/created_epoch"

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
backup_id="backup-${timestamp}-$(printf '%05d' "$RANDOM")"
partial_directory="$(mktemp -d "$BACKUP_ROOT/sets/.partial-${timestamp}-XXXXXX")"
final_directory="$BACKUP_ROOT/sets/$backup_id"
[[ ! -e "$final_directory" ]] || backup_fail 'Backup id đã tồn tại.'

export MYSQL_PWD="$MYSQL_PASSWORD"
mapfile -d '' -t mysql_args < <(mysql_connection_args)
mysql "${mysql_args[@]}" --batch --skip-column-names --execute='SELECT 1' >/dev/null

mysqldump "${mysql_args[@]}" \
  --single-transaction \
  --quick \
  --skip-lock-tables \
  --routines \
  --triggers \
  --hex-blob \
  --set-gtid-purged=OFF \
  --no-tablespaces \
  --default-character-set=utf8mb4 \
  "$MYSQL_DATABASE" > "$partial_directory/database.sql"

mysql "${mysql_args[@]}" --database="$MYSQL_DATABASE" --batch --skip-column-names \
  --execute='SELECT version, sequence_number, checksum_sha256, operation FROM schema_migrations ORDER BY sequence_number' \
  > "$partial_directory/ledger.tsv"

mysql "${mysql_args[@]}" --database="$MYSQL_DATABASE" --batch --skip-column-names \
  --execute="SELECT 'COLUMN_COUNT', COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
             UNION ALL SELECT 'LEDGER_COUNT', COUNT(*) FROM schema_migrations
             UNION ALL SELECT 'TABLE_COUNT', COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
             ORDER BY 1" \
  > "$partial_directory/invariants.tsv"

tar --create --gzip --file "$partial_directory/imports.tar.gz" --directory "$IMPORT_STORAGE_PATH" .

printf '%s\n' \
  'BACKUP_FORMAT_VERSION=1' \
  "BACKUP_ID=$backup_id" \
  "CREATED_AT_UTC=$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  "DATABASE=$MYSQL_DATABASE" \
  'DATABASE_DUMP=database.sql' \
  'IMPORT_ARCHIVE=imports.tar.gz' \
  > "$partial_directory/manifest.env"

(
  cd "$partial_directory"
  sha256sum database.sql imports.tar.gz ledger.tsv invariants.tsv manifest.env > SHA256SUMS
  sha256sum --check --strict SHA256SUMS >/dev/null
)
touch "$partial_directory/READY"
chmod -R go-rwx "$partial_directory"
mv "$partial_directory" "$final_directory"
partial_directory=''
finalized_directory="$final_directory"

"$SCRIPT_DIRECTORY/verify-backup.sh" "$final_directory"

while IFS= read -r -d '' expired_directory; do
  [[ "$expired_directory" != "$final_directory" && -f "$expired_directory/READY" ]] || continue
  backup_log "Removing expired backup: $(basename "$expired_directory")"
  rm -rf -- "$expired_directory"
done < <(find "$BACKUP_ROOT/sets" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -mtime "+$BACKUP_RETENTION_DAYS" -print0)

[[ ! -e "$BACKUP_ROOT/latest" || -L "$BACKUP_ROOT/latest" ]] || backup_fail 'BACKUP_ROOT/latest tồn tại nhưng không phải symlink.'
ln -sfn "sets/$backup_id" "$BACKUP_ROOT/latest"
atomic_write_status "$BACKUP_ROOT/status/last_success_epoch" "$(date -u '+%s')"
atomic_write_status "$BACKUP_ROOT/status/last_success_id" "$backup_id"
backup_succeeded=true
backup_log "Backup completed: $backup_id"
printf '{"backupId":"%s","status":"READY"}\n' "$backup_id"
