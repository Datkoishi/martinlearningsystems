# Test plan

Ưu tiên P0: rich content schema (valid/invalid/unsafe link/alt), asset references, fixed order/version, shared stimulus/group policy, answer leakage, import idempotency/reference/license, autosave/submit idempotency, scoring types, IDOR/tenant, insufficient evidence.

Mỗi feature cần happy path, edge case và negative authorization nếu có quyền. Gate hiện tại: `npm test --prefix backend`, `npm run build --prefix frontend`; DB migration smoke bằng MySQL 8.4; browser responsive/a11y khi preview tooling khả dụng. 20 acceptance cases từ master prompt giữ ID `AC-01`…`AC-20` trong report khi triển khai.
