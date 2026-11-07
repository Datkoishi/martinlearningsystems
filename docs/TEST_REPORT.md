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

## 2026-11-07 — TASK-003

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-REV-01 reviewer projection | PASS | rebuilt from ZIP; source/asset/answer/explanation preserved |
| UT-REV-02 immutable technical decision | PASS | report hash; TECHNICALLY_APPROVED; never PUBLISHED; second decision rejected |
| UT-REV-03 invalid-package leakage | PASS | INVALID package returns IMPORT_NOT_PREVIEWABLE |
| Backend regression | PASS | 17/17 tests |
| Frontend production build | PASS | Vite, 32 modules |
| DB-REV-01 migration + repository transaction | PASS | MySQL 8.4, 19 tables, review count 1, status TECHNICALLY_APPROVED |
| DB-REV-02 repeated decision | PASS | real repository returns 409 IMPORT_NOT_REVIEWABLE |
| HTTP/auth negative cases | BLOCKED | auth chưa triển khai; production API disabled |
| Browser reviewer QA | BLOCKED | không có browser QA tool trong workflow |

## 2026-11-07 — TASK-004

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-AUTH-01 password hashing | PASS | scrypt salt/hash; plaintext không xuất hiện; đúng/sai password được kiểm tra |
| UT-AUTH-02 opaque session + CSRF + revoke | PASS | DB-side token hash; CSRF bind session; logout làm cookie cũ nhận 401 |
| UT-AUTH-03 generic invalid credential + audit | PASS | 401 chung, audit outcome `DENIED` |
| UT-AUTH-04 server-side role guard | PASS | Editor được phép upload, bị từ chối reviewer scope |
| UT-AUTH-05 cookie parser + login throttle | PASS | malformed cookie fail-closed; vượt limit nhận 429 |
| UT-REV-04 self-review | PASS | unit + MySQL transaction trả `SELF_REVIEW_FORBIDDEN`; reviewer khác ghi decision/audit thành công |
| Backend regression | PASS | 23/23 tests |
| Frontend production build | PASS | Vite, 34 modules |
| DB-AUTH-01 migration/bootstrap | PASS | MySQL 8.4 temp, 23 tables, 2 user bằng production CLI; DB chỉ lưu scrypt hash |
| HTTP-AUTH-01 authorization matrix | PASS | unauth preview 401; Editor upload thiếu CSRF 403, request hợp lệ tới validator 400, preview 403; Reviewer upload 403, preview 404, review thiếu CSRF 403, review 404; logout 204; revoked session 401 |
| Runtime dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerabilities |
| Compose config / production image | PASS | Compose config hợp lệ; backend image chứa bootstrap CLI; health 200 |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Các container, image và network MySQL/backend tạm dùng cho DB/HTTP test đã được dừng và xóa sau kiểm thử. Password thử nghiệm được truyền qua stdin; một lần PTY ban đầu có echo cục bộ nên flow đã được sửa và xác minh lại với echo tắt, không ghi credential vào source/commit.

## 2026-11-07 — TASK-005

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-PUB-01 separate academic gate | PASS | academic trước technical bị từ chối; scope ACADEMIC bất biến; chưa tự publish |
| UT-PUB-02 normalize + idempotency | PASS | source/license/assets/stimulus/question/group/exam plan; UUID asset/option refs; retry trả cùng publication |
| UT-PUB-03 source tamper | PASS | source bytes đổi sau approval trả `PACKAGE_HASH_CHANGED`, không publication |
| UT-PUB-04 formal policy gate | PASS | `FORMAL_ASSESSMENT_DISABLED` sau đủ content approvals |
| Backend regression | PASS | 27/27 tests |
| Frontend production build | PASS | Vite, 34 modules |
| DB-PUB-01 migration 006 | PASS | MySQL 8.4 temp, 24 tables; academic statuses/scope và `import_publications` tồn tại |
| DB-PUB-02 real transaction/idempotency | PASS | first publish + retry cùng ID; 1 publication/exam/question; job PUBLISHED |
| DB-PUB-03 rollback | PASS | duplicate giữa transaction → `ER_DUP_ENTRY`; source count 0 và job vẫn ACADEMICALLY_APPROVED |
| HTTP-PUB-01 auth/CSRF matrix | PASS | unauth 401; Editor academic 403; Reviewer thiếu CSRF 403; missing job academic/publish 404; academic trên published job 409 |
| Production image | PASS | backend image build và CLI-created Editor/Reviewer login 200 |
| Runtime dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerabilities |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Container API/MySQL, image và network thử nghiệm TASK-005 chỉ chứa dữ liệu giả lập; tất cả đã được dừng và xóa, không thể khôi phục nhưng không có dữ liệu người dùng.

## 2026-11-07 — TASK-006

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-PLAY-01 catalog projection | PASS | không answer/explanation/correctOptionIds; lọc asset chỉ dùng trong lời giải |
| UT-PLAY-02 snapshot separation | PASS | student snapshot sạch; scoring snapshot giữ answer key server-side |
| UT-PLAY-03 idempotent retry | PASS | cùng key trả cùng attempt/snapshot dù catalog object đổi |
| UT-PLAY-04 key misuse | PASS | cùng Student/key cho đề khác trả `IDEMPOTENCY_KEY_REUSED` |
| UT-PLAY-05 ownership + integrity | PASS | Student khác nhận null/404; tamper scoring snapshot fail-closed |
| UT-PLAY-06 formal lock | PASS | `FORMAL_ASSESSMENT_DISABLED` |
| UT-PLAY-07 asset integrity | PASS | size/SHA-256 mismatch bị chặn |
| Backend regression | PASS | 34/34 tests |
| Frontend production build | PASS | Vite, 36 modules |
| DB-PLAY-01 migration 007 | PASS | MySQL 8.4 temp, 25 tables; FK/index/enum đúng |
| DB-PLAY-02 snapshot transaction | PASS | 1 attempt, student JSON 0 answer key, scoring JSON 1 answer key, 1 `ATTEMPT_STARTED` audit |
| DB-PLAY-03 student-visible asset query | PASS | visible stimulus asset được trả; explanation-only asset trả null trên MySQL 8.4 |
| HTTP-PLAY-01 catalog/authorization | PASS | public catalog 200; unauth 401; Editor 403; Student thiếu CSRF 403 |
| HTTP-PLAY-02 idempotency/IDOR | PASS | first 201, retry 200 cùng ID/hash; owner 200; Student khác 404; public body không scoring/answer |
| Runtime dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerabilities |
| Compose config | PASS | `docker compose config --quiet` |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Container MySQL và backend process tạm chỉ dùng fixture giả lập đã được dừng/xóa. Cookie/response tạm dưới `/tmp` cũng đã xóa; không có dữ liệu người dùng.
