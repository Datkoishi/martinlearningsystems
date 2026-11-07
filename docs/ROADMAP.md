# Roadmap

1. **Phase 0/1a — hoàn thành kỹ thuật:** audit, docs baseline, rich-content/data foundation, student-safe FIXED DEMO.
2. **Phase 1b — hoàn thành hạ tầng kỹ thuật:** ZIP staging, validation, session/RBAC, technical/academic review, atomic version publish và local catalog delivery đã có; S3/CDN promotion là hardening tiếp theo.
3. **Phase 2 — hoàn thành player core:** published FIXED catalog, immutable attempt snapshot, autosave idempotent, submit transaction, scoring version và conservative reveal policy đã có. Tenant-scoped access vẫn là production prerequisite.
4. **Phase 3 — đang triển khai:** indexed question metadata, approved/licensed pool, deterministic hard-constraint engine và immutable technical run đã có; tiếp theo là blueprint governance/publish và Student attempt từ ASSEMBLED snapshot.
5. **Phase 4:** evidence framework, recommendations và cấu hình pilot lớp 5/9/12 có approval.
6. **Phase 5+:** teacher/guardian/school scope, manual essay, operations hardening; sau đó Word/PDF nâng cao.

Task kế tiếp cụ thể: `ASM-001b` — version/approval gate cho blueprint, publish ASSEMBLED snapshot vào catalog và tạo Student attempt mà không chạy lại engine khi reload; giữ formal assessment khóa.
