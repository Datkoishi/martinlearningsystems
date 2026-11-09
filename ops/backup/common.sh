#!/usr/bin/env bash

set -Eeuo pipefail

backup_log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

backup_fail() {
  backup_log "ERROR: $*"
  return 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || backup_fail "Thiếu command bắt buộc: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || backup_fail "Thiếu biến môi trường bắt buộc: $name"
}

resolve_secret_env() {
  local name="$1"
  local file_name="${name}_FILE"
  local direct_value="${!name:-}"
  local secret_file="${!file_name:-}"
  if [[ -n "$direct_value" && -n "$secret_file" ]]; then
    backup_fail "$name và $file_name không được cấu hình đồng thời."
    return 1
  fi
  if [[ -z "$secret_file" ]]; then
    [[ "$direct_value" != *$'\n'* && "$direct_value" != *$'\r'* ]] || backup_fail "$name phải nằm trên một dòng."
    return
  fi
  [[ "$secret_file" == /* && -f "$secret_file" && -r "$secret_file" ]] || {
    backup_fail "$file_name phải là file tuyệt đối có thể đọc."
    return 1
  }
  local value
  value="$(<"$secret_file")"
  [[ -n "$value" && "$value" != *$'\n'* && "$value" != *$'\r'* ]] || {
    backup_fail "$file_name phải chứa đúng một secret không rỗng trên một dòng."
    return 1
  }
  printf -v "$name" '%s' "$value"
}

require_uint_range() {
  local name="$1"
  local value="${!name:-}"
  local minimum="$2"
  local maximum="$3"
  [[ "$value" =~ ^[0-9]+$ ]] || backup_fail "$name phải là số nguyên không âm."
  (( 10#$value >= minimum && 10#$value <= maximum )) || backup_fail "$name phải nằm trong khoảng $minimum–$maximum."
}

require_boolean() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" == 'true' || "$value" == 'false' ]] || backup_fail "$name chỉ nhận true hoặc false."
}

validate_absolute_path() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" == /* && "$value" != '/' && "$value" != *'/../'* && "$value" != */.. ]] || {
    backup_fail "$name phải là đường dẫn tuyệt đối an toàn và không được là root."
  }
}

validate_backup_config() {
  : "${BACKUP_ROOT:=/backups}"
  : "${IMPORT_STORAGE_PATH:=/source/imports}"
  : "${BACKUP_RETENTION_DAYS:=14}"
  : "${BACKUP_INTERVAL_SECONDS:=86400}"
  : "${BACKUP_MAX_AGE_SECONDS:=90000}"
  : "${BACKUP_STALE_LOCK_SECONDS:=21600}"
  : "${BACKUP_RUN_ON_START:=true}"

  resolve_secret_env MYSQL_PASSWORD
  require_env MYSQL_HOST
  require_env MYSQL_PORT
  require_env MYSQL_DATABASE
  require_env MYSQL_USER
  require_env MYSQL_PASSWORD
  [[ "$MYSQL_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || backup_fail 'MYSQL_HOST có ký tự không hợp lệ.'
  [[ "$MYSQL_DATABASE" =~ ^[A-Za-z0-9_]+$ ]] || backup_fail 'MYSQL_DATABASE có ký tự không hợp lệ.'
  [[ "$MYSQL_USER" =~ ^[A-Za-z0-9_.-]+$ ]] || backup_fail 'MYSQL_USER có ký tự không hợp lệ.'
  require_uint_range MYSQL_PORT 1 65535
  require_uint_range BACKUP_RETENTION_DAYS 1 3650
  require_uint_range BACKUP_INTERVAL_SECONDS 60 604800
  require_uint_range BACKUP_MAX_AGE_SECONDS 60 1209600
  require_uint_range BACKUP_STALE_LOCK_SECONDS 300 604800
  require_boolean BACKUP_RUN_ON_START
  (( BACKUP_MAX_AGE_SECONDS >= BACKUP_INTERVAL_SECONDS )) || {
    backup_fail 'BACKUP_MAX_AGE_SECONDS phải lớn hơn hoặc bằng BACKUP_INTERVAL_SECONDS.'
  }
  validate_absolute_path BACKUP_ROOT
  validate_absolute_path IMPORT_STORAGE_PATH
}

atomic_write_status() {
  local target="$1"
  local value="$2"
  local temporary="${target}.tmp.$$"
  printf '%s\n' "$value" > "$temporary"
  chmod 600 "$temporary"
  mv -f "$temporary" "$target"
}

resolve_backup_directory() {
  local requested="${1:-$BACKUP_ROOT/latest}"
  local sets_root
  local resolved
  sets_root="$(realpath "$BACKUP_ROOT/sets")" || {
    backup_fail 'Không tìm thấy BACKUP_ROOT/sets.'
    return 1
  }
  resolved="$(realpath "$requested")" || {
    backup_fail "Không tìm thấy backup: $requested"
    return 1
  }
  [[ "$resolved" == "$sets_root"/backup-* ]] || {
    backup_fail 'Backup path nằm ngoài BACKUP_ROOT/sets.'
    return 1
  }
  [[ "$(basename "$resolved")" =~ ^backup-[0-9]{8}T[0-9]{6}Z-[0-9]{5}$ ]] || {
    backup_fail 'Backup id không hợp lệ.'
    return 1
  }
  [[ -f "$resolved/READY" ]] || {
    backup_fail 'Backup chưa có READY marker.'
    return 1
  }
  printf '%s\n' "$resolved"
}

mysql_connection_args() {
  printf '%s\0' \
    '--protocol=TCP' \
    "--host=$MYSQL_HOST" \
    "--port=$MYSQL_PORT" \
    "--user=$MYSQL_USER"
}
