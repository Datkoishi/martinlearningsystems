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
