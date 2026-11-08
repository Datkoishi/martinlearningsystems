# Roadmap

1. **Phase 0/1a — hoàn thành kỹ thuật:** audit, docs baseline, rich-content/data foundation, student-safe FIXED DEMO.
2. **Phase 1b — hoàn thành hạ tầng kỹ thuật:** ZIP staging, validation, session/RBAC, technical/academic review, atomic version publish và local catalog delivery đã có; S3/CDN promotion là hardening tiếp theo.
3. **Phase 2 — hoàn thành player core:** published FIXED catalog, immutable attempt snapshot, autosave idempotent, submit transaction, scoring version và conservative reveal policy đã có. Tenant-scoped access vẫn là production prerequisite.
4. **Phase 3 — core hoàn thành:** indexed question metadata, approved/licensed pool, deterministic hard-constraint engine, BlueprintVersion approval, immutable publication, catalog và Student attempt từ ASSEMBLED snapshot đã có. Authoring revision/history optimization/assignment là mở rộng tiếp theo.
5. **Production track — đang làm:** fail-fast runtime, Nginx hardening, versioned migration gate và scheduled DB+import backup/retention/restore-check đã có. Còn encrypted off-site destination + alert wiring, TLS/secret deployment, observability, tenant scope và S3/CDN.
6. **Phase 4:** evidence framework, recommendations và cấu hình pilot lớp 5/9/12 có approval.
7. **Phase 5+:** teacher/guardian/school scope, manual essay, operations hardening; sau đó Word/PDF nâng cao.

Task production kế tiếp: `OPS-001d` — promotion archive-backed media sang S3-compatible storage với dual-read/hash/rollback trước cutover. Task sản phẩm kế tiếp vẫn là `ASM-001c`.
