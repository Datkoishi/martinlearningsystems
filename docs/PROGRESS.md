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
