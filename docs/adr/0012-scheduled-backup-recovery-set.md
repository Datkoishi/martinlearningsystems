# ADR-0012 — Scheduled backup recovery set và guarded restore check

## Bối cảnh

Database chứa metadata/version/publication nhưng asset published vẫn đọc entry trong source ZIP trên `import_data`. Chỉ dump MySQL hoặc chỉ snapshot volume đều không khôi phục được hệ thống. Rehearsal thủ công chứng minh restore một lần nhưng không tạo schedule, retention, staleness signal hay guard chống restore nhầm production.

## Quyết định

- Compose cung cấp profile opt-in `backup`; image versioned được CI/GHCR build riêng, job chạy khi start rồi theo `BACKUP_INTERVAL_SECONDS`.
- Mỗi recovery set dump MySQL bằng single transaction trước, sau đó archive volume import read-only. Import source/report được ghi trước DB job và bất biến, nên DB snapshot không tham chiếu file chưa có; archive có thể chứa file mới hơn nhưng chỉ là dữ liệu dư.
- Set gồm dump, import archive, migration ledger, schema invariants, manifest, SHA-256 và `READY` marker ghi cuối. `latest` chỉ trỏ set đã verify.
- Directory lock chặn concurrent run và chỉ bị stale-clean sau timeout. Job bị từ chối không được xóa lock của job khác.
- Retention chỉ xóa directory `backup-*` hoàn tất có `READY`, không chạm partial/current set.
- Health fail khi chưa có verified success, success quá tuổi hoặc failure mới hơn success. Alert delivery dùng orchestrator/monitoring ngoài repo.
- Restore checker yêu cầu host riêng, database prefix `eduassess_restore_` và exact confirmation; verify checksum, restore, so ledger/schema invariants, drop rehearsal database rồi mới ghi success marker; failure path vẫn thử cleanup.
- `backup_data` named volume là local baseline. Production phải map encrypted/off-site storage hoặc replication agent và giới hạn quyền đọc.

## Hệ quả

Backup có thể chạy và cảnh báo độc lập với backend, retry không ghi đè set cũ và artifact không chứa credential. DB + archive được quản lý như một recovery unit, giúp tránh restore metadata mà thiếu source asset.

Container backup cần quyền đọc file import mode 0600 và ghi destination, nên chạy root trong image MySQL nhưng root filesystem read-only, mount source read-only và `no-new-privileges`. Điều này không thay encryption/off-site/retention policy ở hạ tầng. Dump/archive lớn vẫn cần capacity planning, bandwidth control và RPO/RTO thực tế.

Object-storage promotion không nằm trong quyết định này; nó là OPS-001d với dual-read, hash verification và rollback riêng.
