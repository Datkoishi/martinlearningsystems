# Feature matrix

| ID | Feature | Role | Pri | Status | Module path | Test ref | Doc | Dependency / source |
|---|---|---|---|---|---|---|---|---|
| FND-001 | Data model versioned cho source/exam/question/stimulus/group/asset | Editor | P0 | VERIFIED | `database/init/002_eduassess_foundation.sql` | DB-SMOKE-01 PASS | DATA_MODEL | MySQL 8.4 |
| RC-001 | Rich content schema + server validation | Editor/Reviewer | P0 | VERIFIED | `backend/src/domain/rich-content.js` | UT-RC-01/02 PASS | RICH_CONTENT_SCHEMA | none |
| API-001 | Student-safe FIXED exam projection | Student | P0 | VERIFIED | `backend/src/domain/exam-presentation.js` | UT-SEC-01 PASS | API_SPEC | reveal policy pending |
| UI-001 | Responsive renderer hình/math/table/stimulus/group | Student | P0 | IMPLEMENTED | `frontend/src` | frontend build PASS; browser QA BLOCKED | ARCHITECTURE | API-001 |
| DEMO-001 | Fixture/seed Toán 5 có nhãn DEMO | QA | P0 | IMPLEMENTED | `demo-exam.js`, `003_demo_fixed_exam.sql` | UT-FIXED-01 PASS | PROJECT_OVERVIEW | academic approval N/A |
| AUTH-001 | Opaque session + CSRF + server-side Editor/Reviewer RBAC | Editor/Reviewer | P0 | VERIFIED | `backend/src/auth`, `frontend/src/AuthPanel.jsx`, `005_identity_access.sql` | UT-AUTH-01–05 + HTTP-AUTH-01 + DB-AUTH-01 PASS | PERMISSIONS | tenant scope pending |
| IMP-001a | Import ZIP staging + validation + idempotency | Editor | P0 | VERIFIED | `backend/src/imports`, `frontend/src/ImportPanel.jsx` | UT-IMP-01–06 + DB/HTTP PASS | EXAM_PACKAGE_SPEC | AUTH-001 |
| IMP-001b | Reviewer preview + immutable technical decision | Reviewer | P0 | VERIFIED | `reviewer-preview.js`, `ReviewerPreview.jsx`, `004_import_reviews.sql` | UT-REV-01–04 + DB/HTTP PASS | API_SPEC | AUTH-001; academic gate separate |
| IMP-001c | Academic approval + atomic publish | Academic Reviewer | P0 | NOT_STARTED | — | AC-01/02/09 | EXAM_PACKAGE_SPEC | IMP-001b + publish model |
| PLAY-001 | Attempt/autosave/submit/scoring | Student | P0 | NOT_STARTED | — | AC-04/10–13 | ROADMAP | auth + attempt schema |
| ASM-001 | Deterministic assembled exam | Editor/Student | P0 | NOT_STARTED | — | AC-05–07/20 | ASSEMBLY_ENGINE | approved pool |
| ASMNT-001 | Evidence-based assessment | Student/Teacher | P0 | NOT_STARTED | — | AC-14 | ASSESSMENT_ENGINE | approved framework |
