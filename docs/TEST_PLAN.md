# Test plan

Ưu tiên P0: rich content schema (valid/invalid/unsafe link/alt), asset references, fixed order/version, shared stimulus/group policy, answer leakage, import idempotency/reference/license, autosave/submit idempotency, scoring types, IDOR/tenant, insufficient evidence.

Mỗi feature cần happy path, edge case và negative authorization nếu có quyền. Gate hiện tại: `npm test --prefix backend`, `npm run build --prefix frontend`; DB migration smoke bằng MySQL 8.4; browser responsive/a11y khi preview tooling khả dụng. 20 acceptance cases từ master prompt giữ ID `AC-01`…`AC-20` trong report khi triển khai.

Import gates bổ sung: ZIP/binary sai, path traversal/symlink/encryption/zip bomb, duplicate path, checksum/size/MIME, unsafe SVG, missing rich asset, missing/extra answer, group/stimulus/exam refs, rights, idempotency và source bytes preserved. HTTP/auth/MySQL integration phải pass trước khi đổi `IMP-001a` sang VERIFIED.

Reviewer gates: preview phải được dựng từ source ZIP, asset/answer đúng; package INVALID không lộ preview; report hash được bind; decision transaction chỉ từ READY_FOR_REVIEW; lần quyết định thứ hai trả 409; status không bao giờ tự chuyển PUBLISHED; negative authorization bắt buộc sau AUTH-001.
