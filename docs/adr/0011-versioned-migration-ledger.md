# ADR-0011 — Versioned migration ledger và restore gate

## Bối cảnh

MySQL entrypoint chỉ chạy `database/init/*.sql` khi volume mới, nên database hiện hữu không có lịch sử upgrade đáng tin cậy. Chạy SQL thủ công không ngăn hai deployment cùng migrate, không phát hiện file cũ bị sửa và không tạo bằng chứng restore trước rollout. Seed DEMO cũng không được phép tự xuất hiện trong production.

## Quyết định

- Backend image chứa runner và cùng bộ SQL versioned dùng trong source/CI.
- Migration có tên `NNN_name.sql`, sequence liên tục từ 001 và SHA-256 bất biến.
- `schema_migrations` ghi version, sequence, checksum, operation, execution time, actor và timestamp; operation gồm `APPLIED`, `ADOPTED`, `SKIPPED`, `BOOTSTRAPPED`.
- Runner lấy MySQL advisory lock theo database, kiểm tra toàn bộ ledger/source trước apply và retry thành công là no-op.
- Compose không mount SQL vào MySQL entrypoint. Service `migrate` chạy sau MySQL healthy; backend chỉ chạy khi service này thành công.
- `003_demo_fixed_exam.sql` được skip mặc định và chỉ apply bằng `--include-demo` ở database mới trước lần migrate đầu tiên.
- Database có application schema nhưng chưa ledger bị chặn. `--adopt-existing` là thao tác operator rõ ràng sau backup/restore; sentinel table/column/enum xác minh prefix và từ chối partial/later evidence.
- File đã ghi ledger không được sửa/đổi tên/xóa. Drift phải phục hồi đúng release artifact, không sửa ledger.

## Hệ quả

Fresh install, upgrade và retry có cùng release gate; concurrent migration và source drift fail-closed. Database từ entrypoint cũ có thể chuyển sang ledger mà không chạy lại DDL, nhưng adoption cần bằng chứng vận hành và không thay thế data validation.

MySQL DDL implicit-commit nên một file lỗi có thể để lại schema một phần dù runner chưa ghi row. Recovery là dừng rollout, giữ log, restore hoặc repair có review trên bản sao rồi mới retry. Vì vậy backup checksum + isolated restore rehearsal là yêu cầu release; lịch backup, encryption/off-site retention, RPO/RTO và cảnh báo vẫn phải được cấu hình ở hạ tầng đích.

## Bằng chứng

MySQL 8.4 smoke bao phủ fresh apply/retry, demo opt-in, existing-schema adoption, partial/inconsistent schema, advisory lock timeout, legacy entrypoint compatibility, backend image packaging và dump/restore đối chiếu table/column/ledger/fixture. Chi tiết ở `docs/TEST_REPORT.md` và `docs/RUNBOOK.md`.
