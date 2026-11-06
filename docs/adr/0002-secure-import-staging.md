# ADR-0002: Import ZIP fail-closed và publish tách biệt

- Status: Accepted
- Date: 2026-11-07

## Decision

POST import nhận raw ZIP có giới hạn, đọc lazy và không extract entry ra filesystem. Security violation ở cấp ZIP bị từ chối trước lưu. Gói qua lớp an toàn được lưu nguyên bản, validate thành report và ghi `ImportJob`; package invalid vẫn được giữ để sửa/đối chiếu. `(packageId, SHA-256)` chống duplicate. Publish là workflow riêng và chưa được bật.

Import API mặc định tắt ở production để rollout có chủ đích, dù session/RBAC/audit foundation đã được bổ sung trong ADR-0004. Storage/repository dùng adapter để chuyển local volume sang S3-compatible mà không đổi domain validation.

## Consequences

Giảm path traversal/zip bomb/malicious SVG risk và không tạo dữ liệu live nửa vời. Giới hạn hiện tại giữ ZIP trong RAM tối đa 25 MiB; gói lớn hơn cần streaming upload/storage ở phase hardening. Upload đồng thời cùng package có unique DB guard nhưng có thể để orphan file cục bộ; cần reservation/cleanup job trước production.
