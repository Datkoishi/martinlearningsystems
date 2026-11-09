#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for script_file in "$SCRIPT_DIRECTORY"/*.sh; do
  bash -n "$script_file"
done

test_root="$(mktemp -d)"
cleanup_test() {
  rm -rf -- "$test_root"
}
trap cleanup_test EXIT

backup_directory="$test_root/sets/backup-20261108T000000Z-00001"
mkdir -p "$backup_directory/import-source" "$test_root/status"
printf 'fixture\n' > "$backup_directory/import-source/source.zip"
tar -czf "$backup_directory/imports.tar.gz" -C "$backup_directory/import-source" .
rm -rf -- "$backup_directory/import-source"
printf 'CREATE TABLE schema_migrations (version VARCHAR(255));\n' > "$backup_directory/database.sql"
printf '001_init.sql\t1\t%s\tAPPLIED\n' "$(printf 'a%.0s' {1..64})" > "$backup_directory/ledger.tsv"
printf 'COLUMN_COUNT\t1\nLEDGER_COUNT\t1\nTABLE_COUNT\t1\n' > "$backup_directory/invariants.tsv"
printf 'BACKUP_FORMAT_VERSION=1\nBACKUP_ID=backup-20261108T000000Z-00001\n' > "$backup_directory/manifest.env"
(
  cd "$backup_directory"
  sha256sum database.sql imports.tar.gz ledger.tsv invariants.tsv manifest.env > SHA256SUMS
)
touch "$backup_directory/READY"
ln -s "sets/$(basename "$backup_directory")" "$test_root/latest"

BACKUP_ROOT="$test_root" "$SCRIPT_DIRECTORY/verify-backup.sh" >/dev/null
now_epoch="$(date -u '+%s')"
printf '%s\n' "$now_epoch" > "$test_root/status/last_success_epoch"
printf '%s\n' "$((now_epoch - 1))" > "$test_root/status/last_failure_epoch"
BACKUP_ROOT="$test_root" BACKUP_MAX_AGE_SECONDS=60 "$SCRIPT_DIRECTORY/healthcheck.sh"
metrics_file="$test_root/metrics/eduassess_backup.prom"
grep -qx 'eduassess_backup_healthy 1' "$metrics_file"
grep -qx "eduassess_backup_last_success_timestamp_seconds $now_epoch" "$metrics_file"
grep -Eq '^eduassess_backup_age_seconds [0-9]+$' "$metrics_file"

stub_directory="$test_root/stubs"
concurrent_root="$test_root/concurrent"
concurrent_imports="$test_root/concurrent-imports"
mkdir -p "$stub_directory" "$concurrent_root/.backup.lock" "$concurrent_imports"
printf '#!/usr/bin/env bash\nexit 0\n' > "$stub_directory/mysql"
printf '#!/usr/bin/env bash\nexit 0\n' > "$stub_directory/mysqldump"
chmod +x "$stub_directory/mysql" "$stub_directory/mysqldump"
printf '%s\n' "$now_epoch" > "$concurrent_root/.backup.lock/created_epoch"
if PATH="$stub_directory:$PATH" BACKUP_ROOT="$concurrent_root" IMPORT_STORAGE_PATH="$concurrent_imports" \
  MYSQL_HOST=mysql MYSQL_PORT=3306 MYSQL_DATABASE=mls MYSQL_USER=user MYSQL_PASSWORD=fixture \
  BACKUP_RETENTION_DAYS=14 BACKUP_INTERVAL_SECONDS=60 BACKUP_MAX_AGE_SECONDS=60 \
  BACKUP_STALE_LOCK_SECONDS=300 BACKUP_RUN_ON_START=true "$SCRIPT_DIRECTORY/backup-once.sh" >/dev/null 2>&1; then
  printf 'backup cạnh tranh phải bị từ chối.\n' >&2
  exit 1
fi
[[ -f "$concurrent_root/.backup.lock/created_epoch" ]] || {
  printf 'job bị từ chối không được xóa lock của job khác.\n' >&2
  exit 1
}

printf '%s\n' "$((now_epoch + 1))" > "$test_root/status/last_failure_epoch"
if BACKUP_ROOT="$test_root" BACKUP_MAX_AGE_SECONDS=60 "$SCRIPT_DIRECTORY/healthcheck.sh"; then
  printf 'healthcheck phải fail khi failure mới hơn success.\n' >&2
  exit 1
fi
grep -qx 'eduassess_backup_healthy 0' "$metrics_file"

secret_file="$test_root/mysql-password"
printf 'fixture-from-file\n' > "$secret_file"
MYSQL_HOST=mysql MYSQL_PORT=3306 MYSQL_DATABASE=mls MYSQL_USER=user MYSQL_PASSWORD_FILE="$secret_file" \
  BACKUP_ROOT="$test_root/secret-config" IMPORT_STORAGE_PATH="$concurrent_imports" \
  BACKUP_RETENTION_DAYS=14 BACKUP_INTERVAL_SECONDS=60 BACKUP_MAX_AGE_SECONDS=60 \
  BACKUP_STALE_LOCK_SECONDS=300 BACKUP_RUN_ON_START=true \
  bash -c "source '$SCRIPT_DIRECTORY/common.sh'; validate_backup_config; [[ \"\$MYSQL_PASSWORD\" == fixture-from-file ]]"

printf 'tampered\n' >> "$backup_directory/database.sql"
if BACKUP_ROOT="$test_root" "$SCRIPT_DIRECTORY/verify-backup.sh" >/dev/null 2>&1; then
  printf 'verify phải fail khi checksum bị sửa.\n' >&2
  exit 1
fi

if BACKUP_ROOT='/' IMPORT_STORAGE_PATH='/source/imports' MYSQL_HOST=mysql MYSQL_PORT=3306 \
  MYSQL_DATABASE=mls MYSQL_USER=user MYSQL_PASSWORD=fixture BACKUP_RETENTION_DAYS=14 \
  BACKUP_INTERVAL_SECONDS=60 BACKUP_MAX_AGE_SECONDS=60 BACKUP_STALE_LOCK_SECONDS=300 \
  BACKUP_RUN_ON_START=true bash -c "source '$SCRIPT_DIRECTORY/common.sh'; validate_backup_config" >/dev/null 2>&1; then
  printf 'config phải từ chối BACKUP_ROOT là root.\n' >&2
  exit 1
fi

printf 'backup script tests: PASS\n'
