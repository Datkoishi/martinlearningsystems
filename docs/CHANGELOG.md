# Changelog

## Unreleased

- Thêm data foundation versioned cho EduAssess và seed FIXED DEMO idempotent.
- Thêm rich-content schema/validator, student-safe API projection và tests chống lộ đáp án.
- Thay màn hình bootstrap bằng player DEMO responsive có stimulus, hình, công thức, bảng và câu hỏi tương tác.
- Thêm bộ tài liệu vận hành/domain/progress baseline.
- Thêm Exam Package V1 staging, validator bảo mật, local source retention, MySQL repository và idempotency.
- Thêm Import Lab hiển thị validation report; production import mặc định tắt trước RBAC.
- Nâng ZIP parser runtime lên `yauzl 3.4.0`; runtime audit không còn advisory.
- Thêm reviewer preview dựng từ ZIP nguồn bằng cùng Rich Content renderer, kèm asset/answer/explanation.
- Thêm migration `import_reviews` và technical decision transaction bất biến làm gate trước academic approval.
- Thêm user/global role, password scrypt, opaque session, CSRF, login throttling và audit qua migration `005_identity_access.sql`.
- Bảo vệ Import Lab bằng Editor/Reviewer role phía server; reviewer identity lấy từ session và transaction chặn self-review.
- Thêm academic approval bất biến, migration `006_academic_publish.sql` và endpoint publish có CSRF/RBAC.
- Normalize Exam Package sang versioned content bằng transaction nguyên tử, hash/report revalidation, UUID reference remap và idempotent retry; formal assessment vẫn khóa.
- Thêm published FIXED catalog/student-safe asset delivery, role Student và UI catalog/player responsive.
- Thêm migration `007_attempt_snapshots.sql`, student/scoring snapshots tách biệt, hash toàn vẹn, owner scoping, audit và idempotent attempt creation.
