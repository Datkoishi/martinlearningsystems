# Feature matrix

| ID | Feature | Role | Pri | Status | Module path | Test ref | Doc | Dependency / source |
|---|---|---|---|---|---|---|---|---|
| FND-001 | Data model versioned cho source/exam/question/stimulus/group/asset | Editor | P0 | IMPLEMENTED | `database/init/002_eduassess_foundation.sql` | DB execution BLOCKED | DATA_MODEL | MySQL 8.4 |
| RC-001 | Rich content schema + server validation | Editor/Reviewer | P0 | VERIFIED | `backend/src/domain/rich-content.js` | UT-RC-01/02 PASS | RICH_CONTENT_SCHEMA | none |
| API-001 | Student-safe FIXED exam projection | Student | P0 | VERIFIED | `backend/src/domain/exam-presentation.js` | UT-SEC-01 PASS | API_SPEC | reveal policy pending |
| UI-001 | Responsive renderer hình/math/table/stimulus/group | Student | P0 | IMPLEMENTED | `frontend/src` | frontend build PASS; browser QA BLOCKED | ARCHITECTURE | API-001 |
| DEMO-001 | Fixture/seed Toán 5 có nhãn DEMO | QA | P0 | IMPLEMENTED | `demo-exam.js`, `003_demo_fixed_exam.sql` | UT-FIXED-01 PASS | PROJECT_OVERVIEW | academic approval N/A |
| IMP-001 | Import ZIP staging/validate/publish | Editor/Reviewer | P0 | NOT_STARTED | — | AC-01/02/09/17 | EXAM_PACKAGE_SPEC | storage/auth |
| PLAY-001 | Attempt/autosave/submit/scoring | Student | P0 | NOT_STARTED | — | AC-04/10–13 | ROADMAP | auth + attempt schema |
| ASM-001 | Deterministic assembled exam | Editor/Student | P0 | NOT_STARTED | — | AC-05–07/20 | ASSEMBLY_ENGINE | approved pool |
| ASMNT-001 | Evidence-based assessment | Student/Teacher | P0 | NOT_STARTED | — | AC-14 | ASSESSMENT_ENGINE | approved framework |
