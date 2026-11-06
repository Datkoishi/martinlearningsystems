# ADR-0003: Tách technical review khỏi academic approval

- Status: Accepted
- Date: 2026-11-07

## Decision

Package qua validation có thể được preview từ source ZIP và nhận đúng một decision scope `TECHNICAL`. Record lưu reviewer ID, reason, decision, actor source và SHA-256 validation report. Transaction khóa ImportJob; APPROVE → `TECHNICALLY_APPROVED`, REJECT → `REJECTED`. Không transition sang `PUBLISHED`.

Reviewer identity lấy từ authenticated session và route yêu cầu `ACADEMIC_REVIEWER` hoặc `SUPER_ADMIN`. ImportJob lưu creator; transaction từ chối creator tự review. Production vẫn fail-closed bằng feature flag cho đến khi rollout/configuration được duyệt.

## Consequences

Hạ tầng preview/audit có thể kiểm chứng mà không giả vờ có phê duyệt học thuật. Review là bất biến nên sửa nội dung cần package mới. Answer payload nhạy cảm chỉ tồn tại ở reviewer route và phải được bảo vệ bằng auth trước deployment.
