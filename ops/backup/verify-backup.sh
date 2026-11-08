#!/usr/bin/env bash

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIRECTORY/common.sh"

: "${BACKUP_ROOT:=/backups}"
validate_absolute_path BACKUP_ROOT

for command_name in realpath sha256sum tar awk grep; do
  require_command "$command_name"
done

backup_directory="$(resolve_backup_directory "${1:-$BACKUP_ROOT/latest}")"

for required_file in database.sql imports.tar.gz ledger.tsv invariants.tsv manifest.env SHA256SUMS READY; do
  [[ -f "$backup_directory/$required_file" ]] || backup_fail "Backup thiếu $required_file."
done
[[ -s "$backup_directory/database.sql" ]] || backup_fail 'database.sql rỗng.'
[[ -s "$backup_directory/imports.tar.gz" ]] || backup_fail 'imports.tar.gz rỗng.'
grep -qx 'BACKUP_FORMAT_VERSION=1' "$backup_directory/manifest.env" || backup_fail 'Backup format không hỗ trợ.'
grep -q 'schema_migrations' "$backup_directory/database.sql" || backup_fail 'Dump không chứa migration ledger.'

(
  cd "$backup_directory"
  sha256sum --check --strict SHA256SUMS >/dev/null
) || backup_fail 'Checksum backup không hợp lệ.'

unsafe_entry="$({ tar -tzf "$backup_directory/imports.tar.gz" || backup_fail 'Không đọc được import archive.'; } |
  awk '/^\// || /(^|\/)\.\.(\/|$)/ { print; exit }')"
[[ -z "$unsafe_entry" ]] || backup_fail 'Import archive chứa path không an toàn.'

mkdir -p "$BACKUP_ROOT/status"
atomic_write_status "$BACKUP_ROOT/status/last_verify_success_epoch" "$(date -u '+%s')"
atomic_write_status "$BACKUP_ROOT/status/last_verify_success_id" "$(basename "$backup_directory")"
backup_log "Backup verified: $(basename "$backup_directory")"
