# Test report

## 2026-11-07 — TASK-001

| Test | Kết quả | Bằng chứng |
|---|---|---|
| 3 test bootstrap API/health | PASS | Node test runner |
| UT-RC-01 valid image/math/merged cell | PASS | validator accepts |
| UT-RC-02 unsafe link/missing alt | PASS | 2 validation errors |
| UT-SEC-01 student answer leakage | PASS | no answerKey/explanation/correctOptionIds |
| UT-FIXED-01 order/group/image/math/table | PASS | order `[1,2,3]`, atomic group, nodes present |
| Frontend production build | PASS | Vite, 30 modules transformed |
| HTTP loopback integration | BLOCKED | sandbox denied `listen` with EPERM; controller/route payload covered without socket |
| MySQL migration execution | BLOCKED | chưa khởi động Docker/MySQL trong task; `docker compose config --quiet` PASS |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Lệnh đã chạy: `npm test --prefix backend` (lần đầu 6 pass/1 blocked do EPERM; sau khi tách controller thuần: **8/8 PASS**), `npm run build --prefix frontend` (**PASS**, 30 modules), `npm test` (**PASS**), `docker compose config --quiet` (**PASS**), `git diff --check` (**PASS**).

## 2026-11-07 — TASK-002

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-IMP-01 valid package | PASS | checksum/refs/rich content/rights; READY_FOR_REVIEW |
| UT-IMP-02 checksum mismatch | PASS | INVALID + exact error path |
| UT-IMP-03 unsafe SVG | PASS | UNSAFE_SVG dù checksum đúng |
| UT-IMP-04 missing answer key | PASS | exact answer field path |
| UT-IMP-05 invalid binary | PASS | INVALID_ZIP trước staging |
| UT-IMP-06 source retention + idempotency | PASS | source SHA preserved; duplicate same job; one DB record |
| Backend regression | PASS | 14/14 tests |
| Frontend production build | PASS | Vite, 31 modules |
| Runtime dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerabilities after yauzl 3.4.0 |
| Full dev dependency audit | PARTIAL | 2 moderate từ nodemon→minimatch; runtime không bị ảnh hưởng, npm chưa áp dụng được fix |
| Backend production image | PASS | Docker build; `npm ci --omit=dev` audit 0; user `node` ghi được `/app/.data/imports` |
| DB-SMOKE-01 MySQL migration/seed/import JSON | PASS | MySQL 8.4 temp: 18 tables, 1 demo exam, READY_FOR_REVIEW + JSON errors=0 |
| HTTP route integration | BLOCKED | sandbox không mở loopback trong Node test; service/controller được test trực tiếp |
| Browser QA | BLOCKED | không có browser QA tool trong workflow |
