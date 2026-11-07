# ADR-0006 — Immutable student/scoring attempt snapshots

## Status

Accepted — 2026-11-07.

## Context

Published content có thể có version mới sau khi Student bắt đầu. Player cần payload không chứa đáp án, trong khi scorer tương lai cần đúng answer key/points tại thời điểm đó. Retry do mạng không được tạo attempt hoặc snapshot khác, và Student không được đọc attempt của người khác.

## Decision

- Catalog chỉ nhận `PUBLISHED + FIXED + non-formal` và dựng full internal graph trước khi tạo student-safe projection.
- Khi bắt đầu, lưu riêng `student_snapshot_json` và `scoring_snapshot_json`; public response chỉ chứa student snapshot.
- Tính SHA-256 trên canonical JSON của cả hai và kiểm tra lại khi đọc.
- Unique `(student_user_id, idempotency_key)`; service trả record cũ trước khi dựng snapshot mới, transaction khóa lại ExamVersion trước insert.
- Insert attempt và `ATTEMPT_STARTED` audit trong cùng transaction.
- Repository lookup luôn có `student_user_id`; tài nguyên không thuộc owner trả như không tồn tại.
- Asset chỉ công khai nếu có reference student-visible trong published graph; explanation-only asset bị loại.

## Consequences

Attempt giữ nguyên nội dung và scoring basis dù catalog thay đổi; answer key không đi qua client; retry an toàn và IDOR bị chặn ở data access. Đổi lại snapshot chiếm thêm dung lượng và mọi thay đổi schema cần migration/compatibility. Autosave, submit, scoring, reveal, retention và formal assessment vẫn là quyết định riêng.
