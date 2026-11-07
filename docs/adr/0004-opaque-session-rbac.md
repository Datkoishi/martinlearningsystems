# ADR-0004: Opaque session, CSRF và server-side role guard

- Status: Accepted
- Date: 2026-11-07

## Decision

Backoffice dùng session token ngẫu nhiên trong cookie `HttpOnly`, `SameSite=Strict`; MySQL chỉ giữ SHA-256 token hash, expiry và revoke timestamp. CSRF token riêng được bind với session, đặt ở cookie đọc được và phải khớp header trên request ghi. Password dùng scrypt với salt ngẫu nhiên và chỉ bootstrap qua stdin.

Import routes enforce global role phía server: Editor upload/read report; Reviewer xem answer preview và ghi technical decision; Super Admin có cả hai. Reviewer ID luôn lấy từ session. ImportJob lưu creator và review transaction cấm self-review. Login, logout, import và review ghi audit event.

## Consequences

Session có thể revoke tức thời và role không phụ thuộc claims do client gửi. XSS vẫn là rủi ro đối với CSRF token/UI action nên frontend không render raw HTML, CSP/asset policy tiếp tục cần hardening. In-process login limiter, global roles, không MFA/recovery và thiếu session cleanup/rotation chưa đủ cho public multi-tenant production; các hạng mục này phải hoàn thành trước rollout tương ứng.
