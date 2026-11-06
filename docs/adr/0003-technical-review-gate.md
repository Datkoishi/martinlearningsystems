# ADR-0003: Tách technical review khỏi academic approval

- Status: Accepted
- Date: 2026-11-07

## Decision

Package qua validation có thể được preview từ source ZIP và nhận đúng một decision scope `TECHNICAL`. Record lưu reviewer ID, reason, decision, actor source và SHA-256 validation report. Transaction khóa ImportJob; APPROVE → `TECHNICALLY_APPROVED`, REJECT → `REJECTED`. Không transition sang `PUBLISHED`.

Development reviewer header chỉ dùng khi import feature được bật trong môi trường cô lập. Production vẫn fail-closed cho đến khi có identity/RBAC và academic reviewer role.

## Consequences

Hạ tầng preview/audit có thể kiểm chứng mà không giả vờ có phê duyệt học thuật. Review là bất biến nên sửa nội dung cần package mới. Answer payload nhạy cảm chỉ tồn tại ở reviewer route và phải được bảo vệ bằng auth trước deployment.
