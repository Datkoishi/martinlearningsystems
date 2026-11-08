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
- Thêm migration `008_attempt_scoring.sql`, response revision, exact-operation idempotency và immutable score revisions.
- Thêm autosave server-ACK/retry/conflict recovery, refresh restore và idempotent submit trong published Student player.
- Thêm deterministic scorer `eduassess-scoring-v1` cho choice/true-false/number/text; essay đã trả lời chờ manual scoring.
- Thêm reveal projection fail-closed: chỉ PRACTICE final mở correct answer; mock/diagnostic/pending không mở answer, explanation hoặc rubric.
- Thêm migration `009_assembly_foundation.sql` với indexed curriculum/topic/skill/difficulty/time/family metadata và immutable `assembly_runs`.
- Thêm `eduassess-assembly-v1`: published/licensed pool, seeded SHA rank, hard-quota backtracking, atomic/split group policy, source diversity và structured insufficient-pool errors.
- Thêm Editor-only idempotent assembly API và `/#assembly` technical preview; student/scoring snapshots tách riêng và formal assessment vẫn khóa.
- Thêm migration 010 cho Blueprint identity/version, immutable assembly review và atomic ASSEMBLED publication snapshots.
- Thêm reviewer workspace có answer/lời giải + asset scoped; chặn self-review và bind decision với selection/snapshot hashes.
- Mở catalog/attempt dùng chung cho FIXED/ASSEMBLED; published assembly hash được xác minh và reload/retry không reassemble.
- Thêm production runtime safety baseline: typed fail-fast config, live/ready probes, graceful drain deadline và Docker readiness health.
- Harden Nginx bằng CSP/security headers, health endpoint, upload 26 MiB, static cache và loại font CDN bên thứ ba.
- Thêm migration `011_migration_ledger.sql` và runner versioned có sequence/checksum drift guard, advisory lock, schema adoption fail-closed và seed DEMO opt-in.
- Đóng gói migration trong backend image/CI, thêm one-shot Compose migration gate trước backend và bỏ phụ thuộc MySQL entrypoint init.
- Diễn tập MySQL 8.4 fresh/retry/adopt/demo/lock/inconsistent-schema cùng backup checksum + restore/ledger verification trên database cô lập.
