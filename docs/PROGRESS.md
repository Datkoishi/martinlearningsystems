# Progress

## [2026-11-07 00:21 +07:00] TASK-001 — Rich FIXED exam vertical slice

- Mục tiêu / feature IDs: FND-001, RC-001, API-001, UI-001, DEMO-001.
- Trạng thái: PARTIAL (code/test unit/build hoàn thành; DB/browser QA chưa chạy).
- Phạm vi thực hiện: audit repo; versioned data foundation; rich-content validation; FIXED DEMO student-safe API; responsive React renderer.
- Files created: `backend/src/domain/*`, `database/init/002_*`, `003_*`, `frontend/src/RichContent.jsx`, asset DEMO, `AGENTS.md`, `docs/*`.
- Files modified: `backend/src/app.js`, `backend/test/app.test.js`, `frontend/src/App.jsx`, `frontend/src/styles.css`, `README.md`.
- DB migration / data impact: additive tables + idempotent DEMO seed; chưa execute; không xóa/đổi bảng cũ.
- API / UI behavior: `GET /api/exams/demo-fixed`; UI hiển thị section/group/stimulus/image/math/table và nhập lựa chọn; không gửi answer key/explanation.
- Test commands actually run: `npm test --prefix backend`; `npm run build --prefix frontend`; `npm test`; `docker compose config --quiet`; `git diff --check`.
- Test results: backend 8/8 PASS; frontend build PASS (30 modules); root gate PASS; Compose config PASS; diff check PASS. HTTP listen trong sandbox, DB execution và browser QA vẫn BLOCKED như `TEST_REPORT.md`.
- Document files updated: toàn bộ baseline trong `docs/` và README/AGENTS.
- Security/privacy considerations: chỉ dữ liệu DEMO; student projection loại dữ liệu nhạy cảm; link protocol/alt được validate; không đọc/log `.env`.
- Known issues / trade-offs: chưa auth, import, storage, submit/autosave; math chưa typeset; migration/browser QA chưa chạy.
- Next actionable task: IMP-001a — staging và validator Exam Package.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `2863a02` (`feat(exam): add rich fixed exam foundation`).
- Push status: `PUSH_BLOCKED` — lớp bảo vệ từ chối egress source tới remote GitHub chưa được xác minh; cần chủ repo phê duyệt rõ việc push nhánh này.

## [2026-11-07 00:46 +07:00] TASK-002 — Exam Package staging và validation

- Mục tiêu / feature IDs: IMP-001a.
- Trạng thái: PARTIAL (unit/storage/build/MySQL smoke hoàn thành; HTTP/browser integration chưa chạy).
- Phạm vi thực hiện: raw ZIP upload; safe ZIP reader; checksum/size/MIME/SVG/schema/rich-content/reference/answer/license validation; local source/report storage; MySQL repository; idempotency; Import Lab UI.
- Files created: `backend/src/imports/*`, `backend/test/imports.test.js`, `frontend/src/ImportPanel.jsx`, `docs/adr/0002-secure-import-staging.md`.
- Files modified: backend config/app/package/Dockerfile, frontend App/styles, Docker Compose/env/gitignore, README và docs domain/status/test.
- DB migration / data impact: không thêm migration; dùng bảng `import_jobs` từ 002. Thêm named volume `import_data`; không xóa/sửa dữ liệu cũ.
- API / UI behavior: `POST /api/imports`, `GET /api/imports/:id`, `/#imports`; production default disabled; publish không được triển khai.
- Test commands actually run: `npm test --prefix backend`; `npm test`; `npm audit --prefix backend --omit=dev`; `npm audit --prefix backend`; `docker compose config --quiet`; backend production Docker build + storage write smoke; MySQL 8.4 container migration/seed/ImportJob smoke; `git diff --check`.
- Test results: import tests PASS; backend 14/14 PASS; frontend build PASS; runtime audit 0 vulnerabilities; production image/storage write PASS; DB smoke PASS (18 tables, demo seed, JSON ImportJob). Dev audit còn 2 moderate từ nodemon/minimatch; HTTP/browser QA BLOCKED.
- Document files updated: README, ARCHITECTURE, EXAM_PACKAGE_SPEC, API_SPEC, FEATURE_MATRIX, ROADMAP, IMPLEMENTATION_STATUS, DECISIONS, PERMISSIONS, RUNBOOK, TEST_PLAN, TEST_REPORT, CHANGELOG, ADR, PROGRESS.
- Security/privacy considerations: limits chống zip bomb; cấm traversal/symlink/encryption; checksum/MIME; SVG fail-closed; storage mode hạn chế; production flag off; report API không trả source/answer content.
- Known issues / trade-offs: ZIP giữ trong RAM tối đa 25 MiB; local storage chưa S3; concurrent duplicate có thể để orphan file; chưa RBAC/reviewer/publish.
- Next actionable task: IMP-001b — reviewer preview/approval record bằng renderer thật.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `a1be807` (`feat(import): stage and validate exam packages`).
- Push status: `PUSH_BLOCKED` như TASK-001; không thử lại khi chưa có phê duyệt rõ remote.

## [2026-11-07 00:58 +07:00] TASK-003 — Reviewer preview và technical decision gate

- Mục tiêu / feature IDs: IMP-001b.
- Trạng thái: PARTIAL (service/UI/DB transaction hoàn thành; HTTP auth/browser QA chưa có).
- Phạm vi thực hiện: dựng reviewer projection từ source ZIP; asset endpoint; answer/explanation preview; technical approve/reject transaction bất biến; report hash binding; reviewer UI dùng renderer thật.
- Files created: `database/init/004_import_reviews.sql`, `backend/src/imports/reviewer-preview.js`, `frontend/src/ReviewerPreview.jsx`, `docs/adr/0003-technical-review-gate.md`.
- Files modified: import service/repository/storage, Express routes, import tests/UI/styles và docs domain/status/test.
- DB migration / data impact: mở rộng ImportJob status; thêm `import_reviews` unique theo job. Additive; không xóa/sửa version content đã publish.
- API / UI behavior: GET preview/asset/reviews, POST technical review; decision chỉ `TECHNICALLY_APPROVED|REJECTED`; publish khóa; production import flag vẫn off.
- Test commands actually run: `npm test --prefix backend`; `npm test`; `docker compose config --quiet`; MySQL 8.4 migration + production repository transaction/retry smoke; `git diff --check`.
- Test results: backend 17/17 PASS; frontend build PASS (32 modules); DB migration/review/retry PASS (19 tables, 409 on second decision). HTTP auth/browser QA BLOCKED.
- Document files updated: README, PROJECT_SKILL, ARCHITECTURE, DATA_MODEL/DICTIONARY, EXAM_PACKAGE_SPEC, API_SPEC, FEATURE_MATRIX, ROADMAP, IMPLEMENTATION_STATUS, DECISIONS, PERMISSIONS, RUNBOOK, TEST_PLAN/REPORT, CHANGELOG, ADR, PROGRESS.
- Security/privacy considerations: preview no-store; asset resolved by assetId only; invalid package cannot expose answers; decision bound to report hash; immutable transaction; development actor explicitly untrusted; no publish.
- Known issues / trade-offs: ZIP reparsed per preview/asset request; no auth/RBAC; reviewer ID is development header; no academic approval; local storage remains.
- Next actionable task: AUTH-001 — session identity và Editor/Reviewer server-side role guards.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `5014189` (`feat(review): add immutable technical review gate`).
- Push status: `PUSH_BLOCKED` như TASK-001; không retry remote khi chưa có phê duyệt rõ.

## [2026-11-07 01:21 +07:00] TASK-004 — Session identity và content workflow RBAC

- Mục tiêu / feature IDs: AUTH-001; xác minh lại IMP-001a/IMP-001b qua HTTP authorization matrix.
- Trạng thái: VERIFIED (unit/build/MySQL/production image/HTTP negative authorization hoàn thành; browser visual QA vẫn chưa có tooling).
- Phạm vi thực hiện: user/global roles; password scrypt; opaque session + CSRF; login throttling; bootstrap CLI; audit; Editor/Reviewer route guards; authenticated reviewer identity; self-review prevention; login/session UI.
- Files created: `backend/src/auth/*`, `backend/scripts/create-user.js`, `backend/test/auth.test.js`, `database/init/005_identity_access.sql`, `frontend/src/AuthPanel.jsx`, `frontend/src/auth.js`, `docs/adr/0004-opaque-session-rbac.md`.
- Files modified: Express/import repository/service/tests, Docker/config/env, App/ImportPanel/ReviewerPreview/styles, README và docs domain/status/test/runbook.
- DB migration / data impact: thêm `users`, `user_roles`, `auth_sessions`, `audit_logs`; `import_jobs.created_by_user_id` + FK/index. Additive; session/token chỉ lưu hash; không xóa dữ liệu cũ.
- API / UI behavior: login/me/logout; upload cần Editor + CSRF; preview/assets/reviews cần Reviewer; reviewer ID lấy từ session; creator tự review nhận 409; logout chỉ ẩn identity sau khi server revoke xác nhận.
- Test commands actually run: `npm test`; `docker compose config --quiet`; `npm audit --prefix backend --omit=dev`; production backend image + CLI bootstrap; MySQL 8.4 migration/repository smoke; Docker HTTP authorization matrix; `git diff --check`; `git diff --cached --check`.
- Test results: backend 23/23 PASS; frontend build PASS (34 modules); runtime audit 0 vulnerabilities; Compose/image/health PASS; DB PASS (23 tables, 2 bootstrap users); HTTP status/role/CSRF/logout matrix PASS; real transaction self-review/audit PASS. Browser responsive/a11y QA vẫn BLOCKED do không có browser tool.
- Security/privacy considerations: session cookie HttpOnly/SameSite Strict; production yêu cầu Secure; token/CSRF/password không lưu plaintext; generic credential error; role phía server; answer payload chỉ Reviewer; audit login/import/review. Docker test artifacts đã được xóa.
- Known issues / trade-offs: role mới global, chưa tenant scope/MFA/recovery/session rotation/cleanup/distributed rate limit; local storage chưa S3; technical approval vẫn không phải academic approval/publish.
- Next actionable task: IMP-001c — academic approval riêng biệt và atomic publish transaction.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `8939300` (`feat(auth): secure content workflows with sessions`).
- Push status: `PUSH_BLOCKED` như TASK-001; không retry remote khi chưa có phê duyệt rõ.

## [2026-11-07 08:14 +07:00] TASK-005 — Academic approval và atomic package publication

- Mục tiêu / feature IDs: IMP-001c; AC-01/02/09 publish gate foundation.
- Trạng thái: VERIFIED (unit/build/MySQL transaction/HTTP authorization hoàn thành; browser visual QA vẫn chưa có tooling).
- Phạm vi thực hiện: academic review scope bất biến; package/report hash binding; source revalidation; normalize UUID nội bộ; versioned source/license/media/stimulus/question/group/exam publication; atomic rollback; idempotent retry; formal assessment fail-closed; Reviewer UI ba gate.
- Files created: `backend/src/imports/package-publication.js`, `database/init/006_academic_publish.sql`, `docs/adr/0005-atomic-package-publication.md`.
- Files modified: import service/repository/routes/tests, ImportPanel/ReviewerPreview/styles, README và docs architecture/domain/status/test/runbook.
- DB migration / data impact: mở status `ACADEMICALLY_APPROVED|ACADEMICALLY_REJECTED`; review unique theo job+scope; thêm package hash và `import_publications`. Publish tạo additive version rows; không update version đã publish.
- API / UI behavior: `POST /academic-reviews`; `POST /publish`; technical → academic → publish rõ ràng; retry trả publication cũ; package formal hiển thị khóa; published ExamVersion ID được trả cho UI.
- Test commands actually run: `npm test`; `docker compose config --quiet`; `npm audit --prefix backend --omit=dev`; production Docker build; MySQL 8.4 migration + repository commit/retry/rollback smoke; Docker HTTP auth/CSRF matrix; `git diff --check`; `git diff --cached --check`.
- Test results: backend 27/27 PASS; frontend build PASS (34 modules); runtime audit 0 vulnerabilities; MySQL PASS (24 tables); first publish/retry same record; forced mid-transaction duplicate rollback sạch; HTTP 401/403/404/409 matrix PASS.
- Security/privacy considerations: creator self-review vẫn bị cấm; publisher lấy từ session; source/report hash recheck; generator metadata allowlist bỏ secret-like fields; answer/asset refs remap UUID; `FORMAL_ASSESSMENT` khóa độc lập. Container/image/network test chỉ có dữ liệu giả lập đã xóa vĩnh viễn.
- Known issues / trade-offs: media published còn archive-backed trên local volume; source ZIP không được cleanup; chưa S3/published catalog delivery; role vẫn global; không browser QA.
- Next actionable task: PLAY-001a — published FIXED catalog + student-safe projection và immutable Attempt snapshot foundation.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `9bd80d9` (`feat(import): add academic atomic publication`).
- Push status: `PUSH_BLOCKED` như TASK-001; không retry remote khi chưa có phê duyệt rõ.

## [2026-11-07 08:46 +07:00] TASK-006 — Published FIXED catalog và immutable Attempt snapshot

- Mục tiêu / feature IDs: PLAY-001a; AC-04/10 foundation và answer-leakage/IDOR negative cases.
- Trạng thái: VERIFIED (unit/build/MySQL/HTTP authorization-idempotency hoàn thành; browser visual QA vẫn chưa có tooling).
- Phạm vi thực hiện: catalog chỉ PUBLISHED+FIXED+non-formal; student-safe projection/asset delivery; Student role; tách student/scoring snapshots; canonical integrity hash; owner scoping; atomic audit; idempotent create/read API; responsive catalog/snapshot player.
- Files created: `backend/src/catalog/*`, `backend/src/attempts/*`, `backend/test/catalog-attempts.test.js`, `database/init/007_attempt_snapshots.sql`, `frontend/src/PublishedCatalog.jsx`, `frontend/src/StudentExamView.jsx`, `docs/adr/0006-immutable-attempt-snapshots.md`.
- Files modified: app/auth/presentation/import storage/tests, App/AuthPanel/styles, README và docs architecture/domain/status/test/runbook.
- DB migration / data impact: thêm `exam_attempts` với FK Student/ExamVersion, lifecycle enum, unique `(student_user_id,idempotency_key)`, hai JSON snapshot và SHA-256. Create ghi attempt + `ATTEMPT_STARTED` trong một transaction; không sửa published content.
- API / UI behavior: public `GET /api/catalog/exams[/:id]` và student-visible asset; `POST /api/attempts` yêu cầu Student+CSRF+Idempotency-Key; `GET /api/attempts/:id` owner-only; `/#catalog` preview/login/start/player. Chưa autosave/submit/scoring/reveal.
- Test commands actually run: `npm test`; `docker compose --env-file .env.example config --quiet`; `npm audit --prefix backend --omit=dev`; MySQL 8.4 migration + repository/asset/snapshot smoke; localhost HTTP catalog/auth/CSRF/idempotency/IDOR matrix; `git diff --cached --check`; staged secret fixture scan.
- Test results: backend 34/34 PASS; frontend build PASS (36 modules); runtime audit 0 vulnerabilities; Compose PASS; MySQL PASS (25 tables, snapshot/audit separation, explanation-only asset denied); HTTP first/retry 201/200 cùng ID/hash, unauth 401, Editor/CSRF 403, cross-owner 404, no answer/scoring leakage.
- Security/privacy considerations: public projection loại answer/explanation và answer-only assets; bytes kiểm tra size/hash; scoring snapshot chỉ server-side; tamper fail-closed; lookup scope theo Student; formal assessment vẫn khóa. Container/process/cookie fixture tạm đã xóa; không đọc hoặc log `.env`.
- Known issues / trade-offs: câu trả lời mới ở React memory; chưa autosave/submit/scoring/reveal/retention; archive-backed asset chưa S3/CDN; role vẫn global; browser visual/a11y QA chưa chạy.
- Next actionable task: PLAY-001b — idempotent answer autosave, submit transaction, scoring theo type và reveal policy.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `4a9d47d` (`feat(player): add published exam attempt snapshots`).
- Push status: `PUSH_BLOCKED` như TASK-001; không retry remote khi chưa có phê duyệt rõ.

## [2026-11-07 13:41 +07:00] TASK-007 — Idempotent autosave, submit, scoring và reveal

- Mục tiêu / feature IDs: PLAY-001b; AC-04/10–13.
- Trạng thái: VERIFIED (unit/build/MySQL/HTTP authorization và idempotency hoàn thành; browser visual/a11y QA chưa có tooling).
- Phạm vi thực hiện: response normalization theo type; autosave server ACK + revision conflict recovery; refresh restore; submit transaction; immutable score revision; scoring version; manual-essay pending; purpose/state reveal projection.
- Files created: `backend/src/attempts/scoring-engine.js`, `database/init/008_attempt_scoring.sql`, `docs/adr/0007-idempotent-attempt-scoring.md`.
- Files modified: attempt/catalog/presentation/routes/package validator, backend tests, published Student player/catalog/CSS, README và docs domain/status/test/runbook.
- DB migration / data impact: thêm `answer_revision`, `last_saved_at`, `current_score_revision`; thêm `attempt_responses`, `attempt_operations`, `attempt_score_revisions`. Migration additive; response/operation/score có FK và unique keys; không sửa published content.
- API / UI behavior: PATCH responses owner-only + CSRF/idempotency; submit owner-only + CSRF/idempotency; GET result owner-only; UI debounce chỉ báo saved sau ACK, retry exact request, merge khi conflict và khôi phục server responses sau refresh. PRACTICE final mở correct answer; mock/diagnostic/pending không mở; explanation/rubric luôn ẩn.
- Test commands actually run: `npm test`; `docker compose --env-file .env.example config --quiet`; `npm audit --prefix backend --omit=dev`; MySQL 8.4 migration/repository smoke; `git diff --check`; `git diff --cached --check`; temporary credential/artifact scan.
- Test results: backend 41/41 PASS; frontend build PASS (36 modules); runtime audit 0 vulnerabilities; Compose PASS; MySQL PASS (28 tables, scalar JSON upsert/reload/conflict, 1 score + 1 submit operation + 1 submit audit under retry); HTTP Student/Editor/CSRF/conflict/result matrix PASS.
- Security/privacy considerations: lookup scope theo Student; scoring snapshot/raw result không map public; exact request hash chống key reuse; response/read dùng transaction snapshot; essay không AI-score; formal assessment vẫn khóa. Test containers/data đã xóa; `.env` không bị hiển thị hoặc ghi log.
- Known issues / trade-offs: chưa timer/deadline, attempt limit/new-attempt policy, manual essay scoring/regrade, tenant scope hay browser visual/a11y QA; archive-backed asset chưa S3/CDN.
- Next actionable task: ASM-001a — approved question pool, blueprint validation và deterministic assembly snapshot theo seed.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `4466d2f` (`feat(scoring): add idempotent attempt submission`).
- Push status: `PUSH_BLOCKED` như TASK-001; không retry remote khi chưa có phê duyệt rõ.

## [2026-11-07 14:19 +07:00] TASK-008 — Approved pool và deterministic assembly snapshot

- Mục tiêu / feature IDs: ASM-001a; AC-05–07/20 foundation.
- Trạng thái: VERIFIED (unit/build/MySQL/HTTP authorization-idempotency hoàn thành; browser visual/a11y QA chưa có tooling).
- Phạm vi thực hiện: metadata question bank indexed; approved/licensed pool; Blueprint 1.0.0; seeded SHA-256 candidate rank; hard-constraint backtracking; direct/atomic/split group handling; source diversity; immutable technical run và integrity hashes.
- Files created: `backend/src/assembly/*`, `backend/test/assembly.test.js`, `database/init/009_assembly_foundation.sql`, `frontend/src/AssemblyLab.jsx`, `docs/adr/0008-deterministic-assembly-runs.md`.
- Files modified: import validator/publication/repository, Express routes/tests, shared Student player, App/AuthPanel/styles, README và docs domain/status/test/runbook.
- DB migration / data impact: bổ sung nullable curriculum/topic/skill/difficulty/estimated/family metadata + indexes trên `question_versions`; thêm `assembly_runs` owner/idempotency/blueprint/seed/selection/source/student+scoring snapshots/hashes. Additive; package cũ vẫn dùng FIXED nhưng không eligible assembly khi thiếu metadata.
- API / UI behavior: `POST /api/assemblies` yêu cầu Editor/Admin + CSRF + idempotency; `GET /api/assemblies/:id` owner-only; `/#assembly` tạo/khôi phục technical preview student-safe. Run chưa publish vào catalog và Student không thể tạo attempt từ run.
- Test commands actually run: `npm test`; focused Node tests; `docker compose --env-file .env.example config --quiet`; MySQL 8.4 migration/pool/run/retry smoke; `git diff --check`; `git diff --cached --check`. Runtime `npm audit` được thử nhưng không hoàn tất: sandbox không có DNS và yêu cầu gửi manifest ra npm registry bị policy từ chối do chưa có user authorization cụ thể.
- Test results: backend 48/48 PASS; frontend build PASS (37 modules); Compose PASS; MySQL PASS (29 tables, 3 nguồn/license, atomic group, selection 4 câu, 1 run + 1 audit dưới retry); split-with-stimulus/insufficient-pool/tamper/answer-leakage/role-CSRF negative cases PASS.
- Security/privacy considerations: pool chỉ PUBLISHED trong graph FIXED non-formal, metadata complete, derivative license còn hiệu lực và asset published; public response không scoring/answer/explanation; creator scoping; exact request hash; formal assessment fail-closed; `.env` không bị đọc, hiển thị hoặc chỉnh sửa. Container/script fixture tạm đã xóa.
- Known issues / trade-offs: chưa blueprint identity/version/approval, failed-run persistence, Student publication/attempt integration, option shuffle, soft optimization/history, tenant scope hoặc browser QA; search giới hạn 100.000 node; dependency audit chưa có kết quả mới vì external registry bị chặn.
- Next actionable task: ASM-001b — blueprint approval/publish gate và Student attempt từ immutable ASSEMBLED snapshot, không reassemble khi reload.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `f3ad3b1` (`feat(assembly): add deterministic question assembly`).
- Push status: `PUSH_BLOCKED` như TASK-001; không retry remote khi chưa có phê duyệt rõ.

## [2026-11-07 21:54 +07:00] TASK-009 — Approved ASSEMBLED publication và immutable Student attempt

- Mục tiêu / feature IDs: ASM-001b; AC-08/20 và nối ASM-001a vào shared catalog/PLAY-001.
- Trạng thái: VERIFIED (unit/build/MySQL/HTTP authorization-idempotency hoàn thành; browser visual/a11y QA chưa có tooling).
- Phạm vi thực hiện: Blueprint identity/version; reviewer projection và protected assets; independent immutable approval; snapshot/hash binding; atomic idempotent publish; shared FIXED/ASSEMBLED catalog; Student attempt từ frozen publication không reassemble khi reload/retry.
- Files created: `database/init/010_assembled_publication.sql`, `frontend/src/AssemblyReviewPanel.jsx`, `docs/adr/0009-approved-assembled-publication.md`.
- Files modified: assembly/catalog/attempt repositories và services; Express routes/tests; Assembly Lab/catalog/auth/CSS; README và docs architecture/domain/status/test/runbook.
- DB migration / data impact: `exams.source_id` nullable cho multi-source assembly; thêm `exam_blueprints`, `exam_blueprint_versions`, `assembly_reviews`, `assembly_publications`; bind `assembly_runs.blueprint_version_id`. Run cũ được backfill version 1 ở `REJECTED` để buộc reassemble/review với payload mới; không tự nâng trạng thái.
- API / UI behavior: Reviewer/Admin xem frozen preview + answer/explanation, đọc asset theo run, approve/reject một lần và publish; Editor không được review. Catalog công khai liệt kê FIXED/ASSEMBLED; Student tạo/reload attempt từ snapshot đã publish; formal assessment vẫn khóa.
- Test commands actually run: `npm test`; focused Node tests; `docker compose --env-file .env.example config --quiet`; MySQL 8.4 migration 001–010 + repository/governance/catalog/attempt/public-asset smoke; `git diff --check`; `git diff --cached --check`.
- Test results: backend 52/52 PASS; frontend build PASS (38 modules); Compose PASS; focused assembly/catalog 21/21 PASS; MySQL PASS (33 tables, blueprint version/review/publication/attempt transactions và JSON asset query); retry không duplicate/reassemble; tamper/self-review/role-CSRF/answer-asset leakage negative cases PASS.
- Security/privacy considerations: student snapshot không chứa answer/explanation; scoring/reviewer projection chỉ server-side/role-protected; chỉ asset thuộc selected frozen graph; public asset cần student-visible reference và publication integrity; creator self-review bị cấm; hash mismatch fail-closed; `.env` không được đọc, hiển thị hoặc chỉnh sửa. Container/script fixture tạm đã xóa.
- Known issues / trade-offs: blueprint authoring revision/list-filter queue, failed-run persistence, option shuffle, soft optimization/history, tenant scope và formal-assessment policy chưa có; browser visual/a11y QA vẫn BLOCKED; dependency audit không chạy lại vì không đổi dependency và external registry trước đó bị policy chặn.
- Next actionable task: ASM-001c — authoring revision trên cùng blueprint identity + list/filter governance queue, không sửa version đã duyệt/publish.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `f0edd5d` (`feat(assembly): publish approved assembled exams`).
- Push status: `PUSH_BLOCKED` như TASK-001; không retry remote khi chưa có phê duyệt rõ.

## [2026-11-07 22:23 +07:00] TASK-010 — Production runtime safety baseline

- Mục tiêu / feature IDs: OPS-001a; production fail-fast config, health lifecycle, reverse-proxy/upload/privacy hardening.
- Trạng thái: VERIFIED (unit/full regression/build/Compose/image runtime smoke hoàn thành; browser visual/a11y QA chưa có tooling).
- Phạm vi thực hiện: typed environment validation; HTTPS/Secure/DB-secret production gate; trusted proxy hop; liveness/readiness tách biệt; drain-aware graceful shutdown có deadline; Docker health; Nginx CSP/security headers, 26 MiB upload, health endpoint và bỏ font CDN.
- Files created: `backend/test/config.test.js`, `docs/adr/0010-production-runtime-safety.md`.
- Files modified: backend config/app/server/tests; frontend Nginx/CSS; Compose/env example; README và docs architecture/API/status/roadmap/runbook/test.
- DB migration / data impact: không có migration, không thay schema/data. Migration ledger/runner cho volume hiện hữu được tách thành OPS-001b.
- API / UI behavior: thêm `GET /api/live` process-only và `GET /api/ready` phụ thuộc DB + trạng thái drain; giữ `/api/health` tương thích. UI dùng system font, không phát request Google Fonts; Nginx nhận ZIP 25 MiB qua limit 26 MiB.
- Test commands actually run: `npm test`; focused config/app tests; `docker compose --env-file .env.example config --quiet`; Docker build/run/curl/nginx smoke cho frontend/backend; `git diff --check`; `git diff --cached --check`.
- Test results: backend 59/59 PASS; frontend build PASS (38 modules); Compose PASS; frontend image `/healthz` + CSP/headers + nginx syntax/upload PASS; backend image thiếu secret exit 1, production hợp lệ live 200/ready 503 khi DB vắng, SIGTERM kết thúc trong grace. Một focused run không quyền loopback bị sandbox `EPERM`; full gate có quyền phù hợp PASS.
- Document files updated: README, PROJECT_OVERVIEW/SKILL, ARCHITECTURE, API_SPEC, FEATURE_MATRIX, ROADMAP, IMPLEMENTATION_STATUS, GAP_ANALYSIS, DECISIONS, RUNBOOK, TEST_PLAN/REPORT, CHANGELOG, ADR, PROGRESS.
- Security/privacy considerations: production không chạy với HTTP origin/insecure cookie/password mẫu; proxy trust explicit; readiness hạ trước shutdown; CSP chặn nguồn ngoài mặc định; không gửi metadata trẻ em tới font CDN. Không đọc/hiển thị/chỉnh `.env`; Docker fixture không có dữ liệu người dùng và container/image tạm đã xóa.
- Known issues / trade-offs: chưa TLS/secret-manager deployment, migration ledger/runner, backup-restore rehearsal, distributed rate limit/metrics, S3/CDN, tenant scope hoặc browser QA. `/api/live` cố ý không kiểm DB và không được dùng để route traffic.
- Next actionable task: OPS-001b — versioned migration ledger/runner có advisory lock/checksum và diễn tập backup/restore trên MySQL copy.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `94b18aa` (`feat(ops): harden production runtime`).
- Push status: `PUSHED` — `origin/feat/eduassess-rich-content` cập nhật thành công tới `94b18aa`.

## [2026-11-08 07:33 +07:00] TASK-011 — Versioned migration gate và restore rehearsal

- Mục tiêu / feature IDs: OPS-001b; migration ledger/runner an toàn cho fresh/existing database và bằng chứng backup/restore trước rollout.
- Trạng thái: VERIFIED (unit/full regression/build/Compose/MySQL 8.4/image/backup-restore gates hoàn thành).
- Phạm vi thực hiện: ordered SQL discovery; SHA-256/sequence ledger validation; advisory lock; DEMO opt-in; existing-schema sentinel adoption; partial/inconsistent fail-closed; JSON CLI; one-shot Compose gate; root-context backend image/CI packaging; backup/restore runbook và ADR.
- Files created: `.dockerignore`, `backend/scripts/migrate.js`, `backend/src/operations/migration-runner.js`, `backend/test/migration-runner.test.js`, `database/init/011_migration_ledger.sql`, `docs/adr/0011-versioned-migration-ledger.md`.
- Files modified: env/config/package/Docker/Compose/CI và tài liệu README/architecture/data/status/roadmap/runbook/test/decision.
- DB migration / data impact: thêm `schema_migrations`; fresh runner áp 001–011 và mặc định ghi 003 `SKIPPED`. Legacy entrypoint có thể bootstrap checksum 001–010; schema hiện hữu chỉ ghi `ADOPTED` khi operator dùng flag và sentinel đầy đủ. Không xóa/sửa domain data.
- API / UI behavior: không đổi product API/UI. Thêm `npm run db:migrate`, `npm run db:migrate:status`; Compose chỉ mở backend sau migrator exit 0 và không còn mount init SQL vào MySQL.
- Test commands actually run: focused config/migration tests; `npm test`; `docker compose --env-file .env.example config --quiet`; isolated Compose fresh-volume build/up/query/ready/down; MySQL 8.4 fresh/retry/lock/adopt/inconsistent/demo/legacy-entrypoint/backup-restore smoke; backend image status; `git diff --check`; staged secret-pattern scan.
- Test results: backend 63/63 PASS, frontend build PASS (38 modules), Compose runtime PASS; fresh ledger 11 row + DEMO skipped; lock/adoption/inconsistent/demo cases đúng error/operation; dump 45,894 bytes có SHA-256 và restore khớp 34 table, 269 column, 11 ledger row + fixture. Full test trong sandbox đầu tiên có 3 `listen EPERM`; chạy lại ngoài sandbox PASS.
- Document files updated: AGENTS, README, PROJECT_OVERVIEW/SKILL, ARCHITECTURE, DATA_MODEL/DICTIONARY, FEATURE_MATRIX, ROADMAP, IMPLEMENTATION_STATUS, GAP_ANALYSIS, DECISIONS, RUNBOOK, TEST_PLAN/REPORT, CHANGELOG, ADR, PROGRESS.
- Security/privacy considerations: runner pin configured database, không log password, checksum/file drift fail-closed, concurrent migration bị lock; dump/container chỉ có fixture kỹ thuật và artifact tạm đã xóa. `.env` không được đọc, hiển thị hoặc chỉnh sửa.
- Known issues / trade-offs: MySQL DDL implicit commit nên partial failure cần restore/repair có review; backup mới rehearsal thủ công, chưa có schedule/encryption/off-site retention/RPO-RTO alert; TLS/secret manager, tenant scope, metrics và S3/CDN vẫn pending.
- Next actionable task: OPS-001c — backup scheduling/retention/restore alert và promotion archive-backed media sang S3-compatible storage; task sản phẩm vẫn là ASM-001c.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `237c431` (`feat(ops): add versioned migration gate`).
- Push status: `PUSHED` — `origin/feat/eduassess-rich-content` cập nhật thành công tới `237c431`.

## [2026-11-08 08:16 +07:00] TASK-012 — Scheduled backup recovery set

- Mục tiêu / feature IDs: OPS-001c; tự động backup MySQL + import archive, retention/health và guarded restore rehearsal.
- Trạng thái: VERIFIED (unit/full regression/build/packaged-image/Compose fresh-volume/MySQL restore gates hoàn thành).
- Phạm vi thực hiện: opt-in backup scheduler; DB-first/import-volume recovery set; SHA-256 + manifest/ledger/invariants + READY/latest; concurrent/stale lock; retention; staleness/failure health; prefix/exact-confirm restore cleanup; backup image + CI/GHCR matrix; sửa MySQL temporary-init readiness race.
- Files created: `ops/backup/{Dockerfile,.dockerignore,common.sh,backup-once.sh,backup-loop.sh,verify-backup.sh,healthcheck.sh,restore-check.sh,test.sh}`, `docs/adr/0012-scheduled-backup-recovery-set.md`.
- Files modified: Compose/env/root test/CI, migration CLI connection error boundary và tài liệu README/architecture/status/roadmap/runbook/test/decision.
- DB migration / data impact: không thêm migration và không sửa production data. Restore checker chỉ tạo database có prefix `eduassess_restore_` khi exact confirmation khớp, drop trước success marker và thử cleanup trên failure path.
- API / UI behavior: không đổi product API/UI. Thêm Compose profile/image `backup`; mặc định local không bật. MySQL health giờ query application database/user thay vì root ping để không pass trong temporary init server.
- Test commands actually run: `npm test`; `bash ops/backup/test.sh`; Compose config; backup Docker build + in-image test; nhiều isolated Compose fresh-volume projects; 60-second repeated schedule; concurrency/lock/retention/health; guarded MySQL restore; migration connection-failure JSON; `git diff --check`; secret-pattern scan.
- Test results: backend 63/63 PASS; ops suite PASS; frontend build PASS (38 modules); fresh MySQL migration 11/11 + packaged backup image healthy; DB dump khoảng 45,8 KiB + import archive/ledger/invariants verified; 3 scheduled sets; foreign lock được giữ; failure làm unhealthy rồi success phục hồi; expired complete set bị xóa; restore ledger/schema khớp và target schema count về 0.
- Document files updated: AGENTS, README, PROJECT_OVERVIEW/SKILL, ARCHITECTURE, FEATURE_MATRIX, ROADMAP, IMPLEMENTATION_STATUS, GAP_ANALYSIS, DECISIONS, RUNBOOK, TEST_PLAN/REPORT, CHANGELOG, ADR, PROGRESS.
- Security/privacy considerations: source volume read-only; root filesystem read-only + tmpfs + no-new-privileges; artifact/manifest không chứa credential; path/config/database-name/drop guards fail-closed; checksum tamper bị chặn. Không đọc, hiển thị hoặc chỉnh `.env`; mọi Docker fixture/container/image/volume tạm đã xóa.
- Known issues / trade-offs: named `backup_data` là same-host baseline; production còn phải map encrypted/off-site destination, wire alert delivery và lập lịch restore theo RPO/RTO. Backup image chạy root để đọc source mode 0600 nhưng bị giới hạn mount/capability như trên. S3 asset cutover chưa triển khai.
- Next actionable task: OPS-001d — S3-compatible media promotion với dual-read, hash verification và rollback; task sản phẩm vẫn là ASM-001c.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `1e2dede` (`feat(ops): automate backup recovery checks`).
- Push status: `PUSHED` — `origin/feat/eduassess-rich-content` cập nhật thành công tới `1e2dede`.

## [2026-11-08 12:58 +07:00] TASK-013 — Verified S3-compatible media promotion

- Mục tiêu / feature IDs: OPS-001d; promote archive-backed published media sang S3-compatible storage với dual-read, hash verification, audit và rollback an toàn.
- Trạng thái: VERIFIED (unit/full regression/Node 24 image/Compose/MySQL 8.4/S3-compatible end-to-end gates hoàn thành; browser visual/a11y QA chưa có tooling).
- Phạm vi thực hiện: typed object config; AWS SDK v3 adapter; content-addressed conditional PUT; GET/read-after-write verification; object-first/archive-fallback delivery; batch/single/dry-run CLI; immutable transition/audit; rollback archive verification; re-promotion guard; graceful S3 client shutdown; Node 24 LTS baseline.
- Files created: `backend/src/storage/*`, `backend/src/operations/{media-promotion-service,mysql-media-promotion-repository}.js`, `backend/scripts/media-storage.js`, `backend/test/media-storage.test.js`, `database/init/012_object_storage_promotion.sql`, `docs/adr/0013-content-addressed-object-promotion.md`.
- Files modified: config/catalog/server/migration runner; package/lock/Docker/CI/Compose/env example; AGENTS/README và tài liệu architecture/data/status/roadmap/runbook/test/decision.
- DB migration / data impact: migration 012 thêm backend/object key/promoted/rolled-back timestamps trên `media_assets` và `media_asset_storage_events`; row hiện hữu mặc định ARCHIVE. Archive key không rewrite; rollback giữ object key/bytes. Không sửa/xóa production data.
- API / UI behavior: không thêm public API/UI. Catalog asset tự chọn OBJECT/ARCHIVE theo DB/config và vẫn verify bytes. Operator dùng `media:status`, `media:promote`, `media:rollback`; object storage mặc định tắt và archive fallback mặc định bật.
- Test commands actually run: focused Node tests; full `npm test`; `npm audit --omit=dev`; Compose config; backend/frontend Node 24 Docker builds; 68 backend tests trong `node:24-alpine`; MySQL 8.4 + Adobe S3Mock 5.2.3 migration/status/dry-run/promote/retry/object-read/rollback/event/audit/negative smoke; diff/staged diff/secret-pattern checks.
- Test results: backend 68/68 PASS trên host và Node 24 container; ops suite PASS; frontend build 38 modules; production audit 0 vulnerability; migration 001–012 PASS; fixture 43 bytes đi pending→active→rolledBack, retry no-op, 2 event + 2 audit, object/archive cùng SHA-256; Compose/diff/image runtime PASS (`v24.22.2`).
- Document files updated: AGENTS, README, PROJECT_OVERVIEW/SKILL, ARCHITECTURE, DATA_MODEL/DICTIONARY, FEATURE_MATRIX, ROADMAP, IMPLEMENTATION_STATUS, GAP_ANALYSIS, DECISIONS, RUNBOOK, TEST_PLAN/REPORT, CHANGELOG, ADR, PROGRESS.
- Security/privacy considerations: custom production endpoint buộc HTTPS; credential pair fail-fast và không log; deterministic prefix/key validation; DB cutover chỉ sau hash/size; fallback/rollback fail-closed; event/audit không chứa credential/bytes. Fixture không có dữ liệu người dùng; `.env` không bị hiển thị/chỉnh sửa và không được stage.
- Known issues / trade-offs: bucket/workload identity/CDN/replication/metrics/alert chưa provision; fallback có thể che outage nếu deployment không đo; archive vẫn phải nằm trong recovery set; object orphan content-addressed có thể còn khi PUT thành công nhưng DB commit lỗi; chưa có cleanup policy. Lần đầu tải LocalStack gặp host chỉ còn 136 MiB và Docker read-only; đã xóa npm cache 9.8 GiB có thể tải lại, force-recover Docker, dọn mọi fixture/image smoke và chạy lại bằng S3Mock PASS.
- Next actionable task: OPS-001e — TLS/secret deployment + metrics/alert wiring trên hạ tầng đích, gồm backup/object-store signals; task sản phẩm vẫn là ASM-001c.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `b5a90cc` (`feat(ops): add verified object media promotion`).
- Push status: `PUSHED` — `origin/feat/eduassess-rich-content` cập nhật thành công tới `b5a90cc`.

## [2026-11-08 14:20 +07:00] TASK-014 — Secure production overlay và bounded observability

- Mục tiêu / feature IDs: OPS-001e; TLS/file-secret production bundle, protected metrics và alert wiring cho HTTP/object/backup.
- Trạng thái: VERIFIED trong repo/full-stack fixture smoke; target certificate/domain, encrypted off-site destination và real webhook delivery còn BLOCKED vì chưa có hạ tầng/secret đích.
- Phạm vi thực hiện: production Compose merge reset plaintext secret/direct ports; TLS 1.2/1.3 + HTTP/2/HSTS edge; app/internal/edge/egress networks; `_FILE` secret parsing; protected metrics listener; bounded HTTP/error/readiness/object telemetry; atomic backup textfile metrics; Prometheus scrape/rules; Alertmanager webhook file; rotation/rollback runbook.
- Files created: `backend/src/operations/metrics.js`, `backend/test/metrics.test.js`, `docker-compose.production.yml`, `ops/backup/backup-metrics.sh`, `ops/monitoring/{prometheus,alerts,alertmanager}.yml`, `ops/production/{nginx.production.conf,production.env.example}`, `docs/adr/0014-production-secrets-observability.md`.
- Files modified: backend config/app/server/catalog/storage/tests/Dockerfile; backup secret/health/test scripts; base Compose/env/frontend image; AGENTS/README và architecture/status/roadmap/runbook/test/decision docs.
- DB migration / data impact: không thêm migration, không sửa production data. Full-stack smoke dùng fresh fixture volume rồi xóa toàn bộ volume/container/network/image dự án test.
- API / UI behavior: product API/UI không đổi. Edge HTTP redirect 308 sang HTTPS; `/api/live`/`ready` đi qua TLS. Metrics chạy port nội bộ 9464, không qua Nginx, không token trả 401; Prometheus/Alertmanager UI không publish.
- Test commands actually run: focused/full backend tests; root `npm test`; Node 24 read-only container tests; backup suite; frontend build; production `npm audit`; Compose merge; pinned `promtool`/`amtool`/node_exporter; standalone Nginx TLS smoke; full production Compose build/up/curl/internal query/down; diff/cached diff/secret scan.
- Test results: backend 72/72 PASS trên host và Node 24; ops PASS; Vite build 38 modules; runtime audit 0 vulnerability; Compose PASS; Prometheus config + 8 rules PASS; Alertmanager config/ready PASS; HTTP 308, TLS HTTP/2/HSTS, API live/ready PASS; MySQL/backend/frontend/backup healthy, migrator exit 0, backup READY, protected metrics 401/200, Prometheus backend `up=1` + backup healthy `1`.
- Defects found/fixed during runtime smoke: frontend chỉ nối internal network làm PortBindings không publish nên thêm edge network riêng; backup loop export file secret làm child thấy direct + `_FILE` nên giữ secret file-resolved ở shell job không export; frontend health `localhost` chọn IPv6 trong khi Nginx listen IPv4 nên pin `127.0.0.1`; 5xx ratio denominator được sửa để không làm thấp tỷ lệ khi traffic nhỏ.
- Security/privacy considerations: secret direct/file mutually exclusive; metrics token >=32 và constant-time compare; metric route không chứa UUID/user/content ID; internal services không publish; root filesystem read-only/no-new-privileges ở service phù hợp; fixtures chỉ là kỹ thuật và đã xóa. `.env` không bị đọc, hiển thị, chỉnh sửa hoặc stage.
- Known issues / trade-offs: in-process counters reset khi backend restart; readiness gauge phản ánh probe gần nhất; same-host `backup_data` chưa phải off-site; Alertmanager ready không chứng minh receiver nhận alert; object bucket IAM/CDN/replication và tenant scope chưa provision.
- Next actionable task: OPS-001f — target provisioning/go-live evidence khi có domain/certificate/webhook/off-site/bucket inputs; task sản phẩm vẫn là ASM-001c.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `0ee56a8` (`feat(ops): add secure production observability`).
- Push status: `PUSHED` — `origin/feat/eduassess-rich-content` cập nhật thành công tới `0ee56a8`.

## [2026-11-08 17:50 +07:00] TASK-015 — Immutable Blueprint revisions và governance queues

- Mục tiêu / feature IDs: ASM-001c; authoring revision trên cùng Blueprint identity và queue Editor/Reviewer không sửa version đã duyệt/publish.
- Trạng thái: VERIFIED (unit/API/full regression/frontend build/MySQL 8.4 transaction/query gates hoàn thành; browser visual/a11y QA chưa có tooling).
- Phạm vi thực hiện: full-Blueprint revision command; same-identity sequential versioning; latest terminal guard; stale/parallel branch conflict; idempotent replay; owner/reviewer safe queues có status/purpose/title filter + bounded pagination; Assembly Lab revision/owned queue; Reviewer selectable queue.
- Files created: `backend/test/mysql-assembly-repository.integration.test.js`, `docs/adr/0015-linear-blueprint-revisions.md`.
- Files modified: assembly service/repository/routes/tests; Assembly Lab/Reviewer panel/CSS; README và docs architecture/API/data/status/roadmap/test/decision.
- DB migration / data impact: không thêm migration và không sửa production data; dùng schema 010 hiện có. Revision transaction khóa Blueprint identity/latest version, nối `version_number + 1`; source version/run/snapshot giữ bất biến.
- API / UI behavior: thêm Editor `GET /api/assemblies`, `POST /api/assemblies/:id/revisions`; Reviewer `GET /api/assembly-review-queue`. Chỉ latest `REJECTED|PUBLISHED` được revision; `NEEDS_REVIEW|APPROVED` bị khóa. Queue không có student/scoring snapshot, answer key hoặc explanation; reviewer preview chỉ tải khi mở item.
- Test commands actually run: focused `node --test test/assembly.test.js test/app.test.js`; root `npm test`; isolated MySQL 8.4 migration 001–012 + opt-in repository integration test; frontend build trong root gate; `git diff --check`; `git diff --cached --check`.
- Test results: focused backend/API 21/21 PASS; default backend 74 cases = 73 PASS + 1 opt-in MySQL test SKIP; ops suite PASS; Vite build PASS (38 modules); MySQL integration riêng 1/1 PASS với v1 rejected→v2, exact retry, stale/blocked conflicts và safe filtered queues.
- Security/privacy considerations: Editor queue owner-scoped; Reviewer queue loại self-created run; filter allowlist/bounds; SQL parameterized; queue không lộ answer/scoring payload; creator vẫn không thể tự review. MySQL fixture/container chỉ có dữ liệu kỹ thuật, đã dừng và tự xoá; `.env` không bị hiển thị, chỉnh sửa hoặc stage.
- Known issues / trade-offs: editor revision form hiện hỗ trợ Blueprint một section, trong khi API/domain vẫn nhận nhiều section; chưa persist failed assembly run, branching/merge, soft optimization/history, assignment policy hoặc browser QA.
- Next actionable task: sản phẩm `ASMNT-001` — evidence framework/assessment interpretation có approval; production `OPS-001f` vẫn chờ domain/certificate/webhook/off-site/bucket/tenant inputs thật.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `5a60210` (`feat(assembly): add blueprint revision governance`).
- Push status: `PUSHED` — `origin/feat/eduassess-rich-content` cập nhật thành công tới `5a60210`.

## [2026-11-08 18:55 +07:00] TASK-016 — Approved evidence-based assessment

- Mục tiêu / feature IDs: ASMNT-001; AC-14 và Phase 4 technical slice.
- Trạng thái: `VERIFIED_TECH / ACADEMIC_APPROVAL_PENDING` — hạ tầng/rule engine/API/UI/MySQL đã xác minh; framework `[DEMO]` không phải nội dung học thuật dùng thật.
- Phạm vi thực hiện: framework identity/version/hash; Specialist authoring; independent Academic Reviewer approval; FINAL-score evidence reader; minimum attempt/item/difficulty/task-type/scoring-quality gates; conservative four-level interpretation; rule-based guidance/reassessment; owner-only Student result.
- Files created: `backend/src/assessment/*`, `backend/test/assessment.test.js`, `backend/test/mysql-assessment-repository.integration.test.js`, `database/init/013_evidence_assessment.sql`, `frontend/src/AssessmentWorkspace.jsx`, `docs/adr/0016-approved-evidence-assessment.md`.
- Files modified: auth role/CLI, Express routes/tests, migration shape, App/AuthPanel/CSS, README và docs architecture/domain/API/status/roadmap/test/decision.
- DB migration / data impact: migration 013 thêm `assessment_definitions`, `assessment_framework_versions`, `assessment_framework_reviews`, `assessment_results`; additive, không seed framework thật và không sửa/xóa production data. Config/evidence/interpretation bind SHA-256; review/result bất biến.
- API / UI behavior: `/#assessment`; Specialist tạo config có threshold/coverage/guidance/scoring-version allowlist; Reviewer khác creator duyệt; Student chỉ thấy approved framework, tạo/read result của mình. Thiếu bất kỳ gate nào trả exact `Chưa đủ bằng chứng` và level null. Public payload không có raw evidence/submitted/correct answer.
- Test commands actually run: focused assessment tests; root `npm test` ngoài sandbox; isolated MySQL 8.4 migration 001–013 + opt-in repository integration; migration status/no-drift; `git diff --check`; staged diff/secret-pattern scan.
- Test results: backend 81 cases = 79 PASS + 2 opt-in SKIP; ops backup suite PASS; frontend build PASS (39 modules); MySQL migration 13/13 + assessment integration 1/1 PASS. Integration lần đầu phát hiện Date/ISO hash round-trip mismatch; canonical timestamp được sửa rồi test lại PASS.
- Security/privacy considerations: role/CSRF/idempotency phía server; creator self-review bị cấm; Student query owner-scoped/IDOR 404; chỉ current `FINAL` score revision khớp purpose; formal assessment vẫn khóa; Teacher cross-student chưa mở khi thiếu tenant/class ownership. Fixture MySQL chỉ chứa dữ liệu kỹ thuật, đã dừng/tự xóa; `.env` không bị hiển thị, chỉnh sửa hoặc stage.
- Known issues / trade-offs: chưa có framework học thuật production/pilot được phê duyệt; chưa Teacher/guardian/school reporting, tenant/class assignment, manual essay/regrade hoặc browser visual/a11y QA. AssessmentDefinition schema hỗ trợ version; authoring slice hiện tạo version đầu, workflow revision framework là mở rộng tiếp theo nếu rule thay đổi.
- Tiến độ feature matrix: 20/20 feature đã bắt đầu/triển khai; 18 technical VERIFIED (ASMNT-001 kèm academic pending), 2 IMPLEMENTED chờ browser/academic QA; không còn feature `NOT_STARTED`.
- Next actionable task: `ASMNT-002` — framework học thuật pilot + framework revision và tenant/class-scoped Teacher reporting; hoặc `PLAY-001c` — manual essay/regrade. Production `OPS-001f` vẫn chờ target inputs thật.
- Git branch: `feat/eduassess-rich-content`.
- Commit SHA: `4c0a267` (`feat(assessment): add approved evidence interpretation`).
- Push status: `PUSHED` — feature commit `4c0a267` và báo cáo progress đã được đẩy lên `origin/feat/eduassess-rich-content`.
