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
