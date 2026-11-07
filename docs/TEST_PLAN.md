# Test plan

Ưu tiên P0: rich content schema (valid/invalid/unsafe link/alt), asset references, fixed order/version, shared stimulus/group policy, answer leakage, import idempotency/reference/license, autosave/submit idempotency, scoring types, IDOR/tenant, insufficient evidence.

Mỗi feature cần happy path, edge case và negative authorization nếu có quyền. Gate hiện tại: `npm test --prefix backend`, `npm run build --prefix frontend`; DB migration smoke bằng MySQL 8.4; browser responsive/a11y khi preview tooling khả dụng. 20 acceptance cases từ master prompt giữ ID `AC-01`…`AC-20` trong report khi triển khai.

Import gates bổ sung: ZIP/binary sai, path traversal/symlink/encryption/zip bomb, duplicate path, checksum/size/MIME, unsafe SVG, missing rich asset, missing/extra answer, group/stimulus/exam refs, rights, idempotency và source bytes preserved. HTTP/auth/MySQL integration phải pass trước khi đổi `IMP-001a` sang VERIFIED.

Reviewer gates: preview phải được dựng từ source ZIP, asset/answer đúng; package INVALID không lộ preview; report hash được bind; decision transaction chỉ từ READY_FOR_REVIEW; lần quyết định thứ hai trả 409; status không bao giờ tự chuyển PUBLISHED; Editor nhận 403 ở preview và Reviewer nhận 403 ở upload; creator tự review nhận `SELF_REVIEW_FORBIDDEN`.

Auth gates: password hash không chứa plaintext; credential sai không phân biệt account tồn tại; raw session/CSRF token không lưu DB; revoked/expired session trả 401; cookie/CSRF mismatch trả 403; role guard fail-closed; login throttling trả 429; audit login/import/review; production cookie Secure qua cấu hình.

Publish gates: academic decision chỉ sau technical approval; reject/decision thứ hai bất biến; source SHA và canonical validation report phải khớp; validator chạy lại; asset/option refs chuyển UUID nội bộ; toàn bộ source/license/content/version/reference/publication/audit/status commit hoặc rollback; retry không duplicate; formal assessment luôn bị khóa; Editor/unauth/missing CSRF nhận 403/401.
