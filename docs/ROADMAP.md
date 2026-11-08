# Roadmap

1. **Phase 0/1a — hoàn thành kỹ thuật:** audit, docs baseline, rich-content/data foundation, student-safe FIXED DEMO.
2. **Phase 1b — hoàn thành hạ tầng kỹ thuật:** ZIP staging, validation, session/RBAC, technical/academic review, atomic version publish, catalog delivery, S3-compatible promotion/rollback và object fallback telemetry đã có; bucket identity/CDN là deployment hardening tiếp theo.
3. **Phase 2 — hoàn thành player core:** published FIXED catalog, immutable attempt snapshot, autosave idempotent, submit transaction, scoring version và conservative reveal policy đã có. Tenant-scoped access vẫn là production prerequisite.
4. **Phase 3 — core hoàn thành:** indexed question metadata, approved/licensed pool, deterministic hard-constraint engine, BlueprintVersion approval, immutable publication, catalog và Student attempt từ ASSEMBLED snapshot đã có. Authoring revision/history optimization/assignment là mở rộng tiếp theo.
5. **Production track — bundle repo đã verified:** Node 24 runtime, fail-fast, TLS edge/Docker secrets, versioned migration gate, scheduled DB+import recovery set, S3-compatible media cutover/rollback, protected Prometheus metrics và Alertmanager rules đã pass full-stack fixture smoke. Còn deploy trên host/domain thật, encrypted off-site destination, xác nhận webhook delivery, bucket workload identity/CDN và tenant scope.
6. **Phase 4:** evidence framework, recommendations và cấu hình pilot lớp 5/9/12 có approval.
7. **Phase 5+:** teacher/guardian/school scope, manual essay, operations hardening; sau đó Word/PDF nâng cao.

Task production kế tiếp: `OPS-001f` — target provisioning/go-live evidence: certificate/domain thật, encrypted off-site backup, alert delivery drill, bucket identity/CDN và tenant boundary. Task sản phẩm kế tiếp vẫn là `ASM-001c`.
