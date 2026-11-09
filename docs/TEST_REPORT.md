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

## 2026-11-07 — TASK-007

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-PLAY-08 deterministic scoring types | PASS | multiple partial penalty, true/false subparts, numeric tolerance, normalized text và answered essay pending |
| UT-PLAY-09 autosave/recovery/conflict | PASS | exact retry, persisted reload, key misuse và stale revision/currentRevision |
| UT-PLAY-10 submit idempotency/close | PASS | retry cùng result; autosave sau submit bị chặn; PRACTICE final mở correct answer |
| UT-PLAY-11 manual essay privacy | PASS | `PENDING_MANUAL_SCORING`; không answer/rubric trong public result |
| UT-PLAY-12 restricted reveal | PASS | MOCK_EXAM final chỉ có summary, không correct answer |
| UT-IMP-07 partial-credit schema | PASS | package multiple choice từ chối mode ngoài `PER_OPTION_WITH_PENALTY` |
| HTTP-PLAY-03 response/submit/result routes | PASS | Student role + CSRF, Editor 403, missing CSRF 403, structured conflict 409 và owner ID truyền từ session |
| Backend regression | PASS | 41/41 tests |
| Frontend production build | PASS | Vite, 36 modules |
| DB-PLAY-04 migration 008 + repository smoke | PASS | MySQL 8.4, 28 tables; JSON scalar upsert, reload, exact retry, stale conflict, close, owner isolation; 1 score revision và 1 submit audit |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Lệnh đã chạy: `npm test` (cần quyền loopback trong sandbox cho HTTP test), MySQL 8.4 container smoke, `git diff --check`. Container test chỉ có fixture giả lập và đã bị xóa sau kiểm thử; không có dữ liệu thật.

## 2026-11-07 — TASK-008

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-ASM-01 blueprint validation/formal lock | PASS | quota sum lỗi có details; formal trả `FORMAL_ASSESSMENT_DISABLED` |
| UT-ASM-02 deterministic hard constraints | PASS | cùng seed không phụ thuộc pool order; 4 câu, 3 nguồn, exact quotas và atomic group |
| UT-ASM-03 insufficient pool | PASS | 409 `INSUFFICIENT_POOL` với required/compatible counts, không relax quota |
| UT-ASM-04 immutable run/idempotency/privacy | PASS | exact retry, owner scope, tamper fail-closed; public payload không answer key |
| UT-ASM-05 package assembly metadata | PASS | all-or-none validation và publication plan giữ curriculum/topic/difficulty |
| UT-ASM-06 split group stimulus | PASS | câu thuộc `SPLIT_WITH_STIMULUS` được chọn độc lập nhưng snapshot vẫn mang đúng stimulus đã publish |
| HTTP-ASM-01 authorization | PASS | Student 403, Editor thiếu CSRF 403, valid create 201, owner ID lấy từ session |
| Backend regression | PASS | 48/48 tests |
| Frontend production build | PASS | Vite, 37 modules |
| DB-ASM-01 migration/pool/run | PASS | MySQL 8.4, 29 tables; 3 sources, derivative licenses, atomic group; 1 run + 1 audit under retry; scoring snapshot 4 câu |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

MySQL container chỉ chứa fixture kỹ thuật giả lập và đã bị xóa sau smoke test; không có dữ liệu người dùng.

## 2026-11-07 — TASK-009

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-ASM-07 governance | PASS | BlueprintVersion NEEDS_REVIEW; self-review 409; một decision; APPROVED mới publish; retry cùng ExamVersion |
| UT-ASM-08 shared catalog/attempt | PASS | catalog có FIXED + ASSEMBLED; student-safe; attempt reload/retry giữ frozen title và không đọc lại publication/engine |
| UT-ASM-09 reviewer asset scope | PASS | explanation asset không có trong student snapshot; reviewer URL protected; unselected asset bị loại/404 |
| UT-ASM-10 public ASSEMBLED asset integrity | PASS | asset fallback chỉ dùng student-visible publication; snapshot tamper làm asset fail-closed |
| HTTP-ASM-02 role/CSRF | PASS | Editor không mở reviewer preview; Reviewer session mở preview/asset, review và publish; actor lấy từ session |
| Backend regression | PASS | 52/52 tests |
| Frontend production build | PASS | Vite, 38 modules |
| DB-ASM-02 migration/governance/delivery | PASS | MySQL 8.4, 33 tables; migration 010; 1 blueprint version + 1 review + 1 publication + 1 attempt; 3 run audits; publish/attempt retry không duplicate; catalog modes FIXED/ASSEMBLED |
| ASSEMBLED public asset query | PASS | MySQL thực thi JSON student-snapshot authorization query; explanation/unselected asset không được suy ra từ scoring snapshot |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Lệnh chính: `npm test`; focused Node tests; frontend build; Compose config; MySQL 8.4 migration 001–010 + governance/catalog/attempt script; `git diff --check`. MySQL container/script chỉ chứa fixture kỹ thuật và đã bị xóa; `.env` không được đọc hoặc chỉnh sửa.

## 2026-11-07 — TASK-010

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-OPS-01 typed environment defaults | PASS | development giữ HTTP/local defaults; path/port/session/grace được parse xác định |
| UT-OPS-02 production fail-closed | PASS | HTTPS + Secure + DB secret hợp lệ; HTTP origin, insecure cookie, password mẫu, malformed bool/int/path origin bị từ chối |
| UT-OPS-03 live/ready drain semantics | PASS | live 200 độc lập DB; ready 200 khi DB ok; draining/DB outage trả 503 |
| UT-OPS-04 trusted proxy config | PASS | Express nhận đúng hop count cấu hình |
| HTTP-OPS-01 runtime routes | PASS | `/api/live` vẫn 200 trong khi `/api/ready` chuyển 503 khi drain |
| IMG-OPS-01 frontend Nginx | PASS | image build + `nginx -T`; `/healthz` 200; CSP/Permissions/Referrer/nosniff; `client_max_body_size 26m` |
| IMG-OPS-02 backend production | PASS | thiếu secret exit 1 `INVALID_CONFIGURATION`; cấu hình hợp lệ live 200/ready 503 khi DB vắng; SIGTERM kết thúc trong grace |
| Backend regression | PASS | 59/59 tests |
| Frontend production build | PASS | Vite, 38 modules; không còn request font CDN |
| Compose config | PASS | `.env.example`; backend health dùng `/api/ready`, stop grace 15 giây |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Lệnh chính: `npm test`; focused config/app tests; `docker compose --env-file .env.example config --quiet`; Docker build/run/curl/nginx runtime smoke cho frontend/backend; `git diff --check`. Một lần focused test trong sandbox nhận `listen EPERM`; cùng test trong full gate có quyền loopback PASS. Container/image smoke chỉ chứa cấu hình giả lập, đã dừng và xóa; không dùng dữ liệu người dùng.

## 2026-11-08 — TASK-011

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-OPS-05 migration discovery/checksum | PASS | chỉ nhận `NNN_name.sql`, sắp thứ tự liên tục và SHA-256 byte-exact |
| UT-OPS-06 sequence gap | PASS | thiếu sequence fail `MIGRATION_SEQUENCE_INVALID` trước khi chạm DB |
| UT-OPS-07 database pinning | PASS | strip `CREATE DATABASE`/`USE`; lệnh đổi/tạo/xóa database còn lại bị chặn |
| UT-OPS-08 ledger drift | PASS | sequence/checksum/file-missing đều fail-closed |
| DB-OPS-01 fresh/retry | PASS | MySQL 8.4 áp dụng 001–011, `003` SKIPPED mặc định; retry operations rỗng, ledger đủ 11 row |
| DB-OPS-02 advisory lock | PASS | lock bị giữ + timeout 0 trả `MIGRATION_LOCK_TIMEOUT` |
| DB-OPS-03 existing adoption | PASS | không flag trả `MIGRATION_EXISTING_SCHEMA_UNTRACKED`; verified 001–010 ADOPTED, 011 APPLIED |
| DB-OPS-04 inconsistent schema | PASS | schema chỉ có một phần migration 005 bị chặn `MIGRATION_SCHEMA_INCONSISTENT` và báo sentinel thiếu |
| DB-OPS-05 demo opt-in | PASS | database mới với `--include-demo`: 003 APPLIED và có đúng một demo source |
| DB-OPS-06 backup/restore | PASS | dump 45,894 bytes SHA-256 `7f5337f6f93b8d5e76497d4a1313167d3c2a0348d8d35d31c75b05f7470dc842`; source/restore cùng 34 table, 269 column, 11 ledger row và fixture count |
| DB-OPS-07 packaging/legacy compatibility | PASS | backend image chạy status đủ 11 migration; legacy entrypoint 001–011 bootstrap 001–010 rồi runner chỉ APPLIED 011 |
| Backend regression | PASS | 63/63 tests |
| Frontend production build | PASS | Vite, 38 modules |
| Compose fresh-volume runtime | PASS | isolated project: MySQL healthy → migrator exit 0 → backend healthy; ledger 11 row, 003 SKIPPED, content source count 0; MySQL không mount init scripts |

Lệnh chính: focused config/migration tests; `npm test`; `docker compose --env-file .env.example config --quiet`; isolated Compose fresh-volume runtime; MySQL 8.4 fresh/adopt/demo/lock/inconsistent/backup-restore smoke; backend Docker build/status; `git diff --check`. Full test lần đầu trong sandbox bị `listen EPERM` ở 3 HTTP test; chạy lại ngoài sandbox PASS 63/63. Dump/database/container/image chỉ chứa fixture kỹ thuật, đã xóa sau kiểm tra; `.env` không được đọc, hiển thị hoặc chỉnh sửa.

## 2026-11-08 — TASK-012

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-OPS-09 backup scripts | PASS | bash syntax; safe-path/config guard; complete-set verify; byte tamper fail; stale health fail; rejected concurrent job giữ nguyên owner lock |
| DB-OPS-08 scheduled recovery set | PASS | MySQL 8.4 fresh schema; 3 chu kỳ interval 60 giây; mỗi set có DB dump, import archive, ledger/invariants, manifest, checksums và READY; service healthy |
| DB-OPS-09 guarded restore | PASS | restore vào `eduassess_restore_smoke`, ledger/schema invariants khớp, success marker được ghi và target schema count trở về 0 |
| DB-OPS-10 lock/retention/health | PASS | concurrent one-shot exit 1 không xóa foreign lock; failure làm unhealthy; lần success kế tiếp tự phục hồi; complete fixture 20 ngày bị xóa, current sets được giữ |
| Backup image + Compose security/config | PASS | versioned MySQL 8.4-based image; profile opt-in; import volume read-only; root filesystem read-only + tmpfs; no-new-privileges; migration dependency; configurable health grace |
| Compose fresh-init readiness | PASS | phát hiện root-ping race ở lần smoke đầu; đổi sang application DB query; fresh volume sau sửa migrate đủ 11 version rồi backup READY/healthy, dump 45,801 bytes |
| Artifact privacy | PASS | manifest/status/checksum không chứa credential; fixture-only volume/container/image đã xóa |
| Backend regression | PASS | 63/63 tests |
| Operations regression | PASS | syntax/config/path/checksum/health/concurrency suite |
| Frontend production build | PASS | Vite, 38 modules |

Lệnh chính: `npm test`; Compose config; isolated `--profile backup` MySQL/migrate/backup runtime; repeated schedule/concurrency/retention/health; guarded restore-check; cleanup project volumes/images; `git diff --check`. Mọi Docker artifact chỉ chứa fixture kỹ thuật và đã bị xóa; `.env` không được đọc, hiển thị hoặc chỉnh sửa.

## 2026-11-08 — TASK-013

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-OPS-10 object config/storage/promotion | PASS | disabled defaults; production HTTP endpoint reject; content-address validation; collision/read-after-write; dual-read fallback; promote/retry/rollback/integrity negative cases |
| DB-OPS-11 MySQL 8.4 + S3-compatible promotion | PASS | migration 001–012; fixture 43 bytes; dry-run không đổi state; conditional PUT + GET SHA-256; pending→active→rolledBack; 2 immutable event + 2 success audit |
| Object delivery/retention | PASS | object-first read trả đúng SHA-256 khi archive adapter bị khóa; retry `changed=false`; rollback đọc đúng archive và object verified vẫn còn |
| Rollback/re-promotion guards | PASS | rollback chỉ sau archive hash; asset rollback bị loại khỏi batch; promote thiếu `--allow-rolled-back` trả `MEDIA_ASSET_ROLLED_BACK` |
| CLI argument guard | PASS | `status --asset-id` exit 2 JSON; status/rollback/promotion flags bị scope rõ |
| Backend regression | PASS | 68/68 tests trên host; 68/68 riêng trong `node:24-alpine`, source mount read-only |
| Operations/frontend regression | PASS | backup script suite PASS; Vite production build 38 modules |
| Node 24 images | PASS | backend/frontend Docker build; backend runtime `v24.22.2`; backend `npm ci --omit=dev` audit 0 |
| Production dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerability |
| Compose/diff | PASS | `.env.example` Compose config và `git diff --check` |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Lệnh chính: focused config/media/migration tests; full `npm test`; Node 24 container tests; Docker backend/frontend builds; Compose config; MySQL 8.4 + Adobe S3Mock 5.2.3 end-to-end CLI/runtime smoke; production audit; `git diff --check`. Fixture chỉ chứa bytes kỹ thuật, database/container/network/image/thư mục tạm đều đã xóa; `.env` không bị hiển thị hoặc chỉnh sửa, smoke dùng env fixture explicit. Lần thử LocalStack đầu bị Docker read-only do host chỉ còn 136 MiB; npm cache có thể tải lại đã được dọn, Docker phục hồi sạch, sau đó smoke chạy bằng S3Mock và PASS.

## 2026-11-08 — TASK-014

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-OPS-11 secret-file/metrics config | PASS | direct + `_FILE` conflict, relative/multiline/short token/bind/port fail; DB/object/metrics file secret hợp lệ được trim đúng một newline |
| UT-OPS-12 bounded backend metrics | PASS | readiness, HTTP counter/histogram, structured error và object outcome; unmatched path không chứa UUID; listener 401 không token và 200 với Bearer đúng |
| UT-OPS-13 backup metrics/secret lifecycle | PASS | atomic textfile healthy 1→0 theo failure ordering; age/timestamps; password file đọc được nhưng không export từ scheduler loop |
| Backend regression | PASS | 72/72 ngoài sandbox và 72/72 trong `node:24-alpine` với source read-only; lượt sandbox đầu chỉ fail 5 HTTP tests do `listen EPERM` |
| Operations/frontend regression | PASS | backup script suite PASS; Vite production build 38 modules |
| Compose production merge | PASS | Compose v5.6.1; reset direct DB secrets/MySQL+backend ports; only frontend 80/443; internal/edge/egress networks và read-only/secret mounts hợp lệ |
| IMG-OPS-03 TLS edge | PASS | Nginx syntax; HTTP 308; HTTPS HTTP/2 200; HSTS/CSP/Permissions/Referrer/nosniff; `/api/live` và `/api/ready` qua TLS PASS |
| Monitoring config | PASS | Prometheus 3.13.5 `promtool`: config + 8 rules; Alertmanager 0.34.1 `amtool`: receiver config; node_exporter 1.12.1 image/binary PASS |
| Production dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerability; lượt sandbox DNS fail rồi chạy lại có network PASS |
| E2E-OPS-01 full production fixture stack | PASS | MySQL/backend/frontend/backup healthy, migrate exit 0, backup READY; protected metrics 401/200; Prometheus backend `up=1` + backup healthy `1`; Alertmanager ready 200 + 8 loaded rules |
| Target delivery/off-site | BLOCKED | chưa có production domain/certificate, real webhook receiver, encrypted off-site target hoặc bucket identity do người dùng/hạ tầng chưa cung cấp |

Lệnh chính: `npm test --prefix backend` ngoài sandbox; `bash ops/backup/test.sh`; frontend build; Compose merge/config; pinned `promtool`/`amtool`/node_exporter checks; Nginx self-signed TLS smoke; full production Compose build/up/curl/internal Prometheus query/down. Smoke lần đầu phát hiện edge chỉ nối internal network nên port không publish, và backup loop export secret làm lần validate con xung đột; cả hai được sửa rồi full stack chạy lại PASS. Health frontend cũng đổi `localhost` sang `127.0.0.1` sau khi IPv6 loopback bị từ chối. Mọi secret/certificate/database/container/network/volume/image fixture đã xóa; `.env` không bị đọc, hiển thị hoặc chỉnh sửa.

## 2026-11-08 — TASK-015

| Test | Kết quả | Bằng chứng |
|---|---|---|
| UT-ASM-11 revision/queue contract | PASS | cùng Blueprint identity, v1→v2; latest terminal guard; stale/blocked conflict; exact retry; immutable v1; filter validation và no-answer queue |
| HTTP-ASM-03 routes/RBAC/CSRF | PASS | Editor owned queue + revision; missing CSRF 403; Reviewer queue; Editor bị từ chối Reviewer queue; actor/source lấy từ session/path |
| DB-ASM-03 MySQL 8.4 repository | PASS | migration 001–012; real transaction v1 rejected→v2; retry same run; stale/parallel blocked; title/purpose/status query và safe summary |
| Backend regression | PASS | 74 cases: 73 pass + 1 opt-in MySQL integration skip trong default gate; integration case chạy riêng PASS |
| Operations regression | PASS | backup script checksum/path/health suite |
| Frontend production build | PASS | Vite, 38 modules; Editor/Reviewer queues và revision UI compile |
| Diff/schema impact | PASS | `git diff --check`; không thêm migration vì schema 010 đã có identity, version unique và run binding |
| Browser responsive/a11y QA | BLOCKED | không có browser QA tool trong workflow hiện tại |

Lệnh chính: focused `node --test test/assembly.test.js test/app.test.js` ngoài sandbox (21/21); root `npm test` (73 pass, 1 opt-in skip + ops/build PASS); isolated MySQL 8.4 migration 001–012 và `mysql-assembly-repository.integration.test.js` (1/1 PASS); `git diff --check`. MySQL container dùng fixture kỹ thuật, đã dừng và tự xoá; `.env` không bị hiển thị, chỉnh sửa hoặc stage.

## 2026-11-08 — TASK-016

| Gate | Kết quả | Evidence |
|---|---|---|
| UT-ASMNT-01 framework validation | PASS | threshold trong config, đúng bốn mức, purpose/coverage/mapping fail-closed |
| UT-ASMNT-02 insufficient evidence | PASS | exact `Chưa đủ bằng chứng`, level null, lý do attempts/items/difficulty/task type |
| UT-ASMNT-03 sufficient classification | PASS | chỉ phân mức sau mọi coverage gate; guidance theo approved rule |
| UT-ASMNT-04 scoring quality | PASS | unapproved scoring version hoặc điểm ngoài range chặn classification |
| UT-ASMNT-05 approval/idempotency/ownership | PASS | independent review, self-review block, exact retry, result owner scope, no answer/raw evidence public |
| HTTP-ASMNT-01 role/CSRF/API | PASS | Specialist author, Reviewer queue/preview/review, Student available/generate/latest/get; negative roles/CSRF |
| DB-ASMNT-01 MySQL 8.4 repository | PASS | migration 001–013; approve framework; FINAL evidence; immutable result; retry; IDOR; hash round-trip |
| Migration ledger | PASS | 13/13 `APPLIED`, latest `013_evidence_assessment.sql`, no untracked schema/checksum drift |
| Backend regression | PASS | 81 cases = 79 pass + 2 opt-in MySQL tests skipped trong default suite |
| Ops regression | PASS | backup script suite PASS |
| Frontend production build | PASS | Vite 6.4.5, 39 modules, assessment workspace included |

Lần đầu root test trong sandbox có 6 HTTP tests fail vì `listen EPERM`; chạy lại ngoài sandbox đạt regression. Lần đầu MySQL assessment integration phát hiện canonical hash xem `Date` khác chuỗi ISO sau JSON round-trip; canonicalizer được sửa để chuẩn hóa timestamp, sau đó integration 1/1 PASS. MySQL 8.4 fixture chỉ chứa dữ liệu kỹ thuật, đã dừng và tự xoá. `.env` không bị hiển thị, chỉnh sửa hoặc stage.

## 2026-11-09 — TASK-017

| Gate | Kết quả | Evidence |
|---|---|---|
| UT-PLAY-13 manual scoring totals | PASS | giữ nguyên auto score; essay score/feedback tạo FINAL totals và manual scoring version |
| UT-PLAY-14 validation | PASS | thiếu essay grade, duplicate/unknown question, điểm vượt max và feedback sai bị chặn |
| UT-PLAY-15 assignment privacy/idempotency | PASS | assignee-only projection; không Student identity/objective answer; exact retry cùng revision |
| UT-PLAY-16 immutable regrade | PASS | regrade thay riêng essay score, giữ source revision và auto question |
| HTTP-PLAY-04 role/CSRF/API | PASS | chỉ Admin assign; Student 403; grader queue/preview/grade lấy actor từ session; CSRF/key validation |
| DB-PLAY-05 MySQL 8.4 | PASS | migration 001–014; INITIAL revision 1→2; exact retry không duplicate; REGRADE 2→3; 2 assignment + 2 score audit |
| Student reveal privacy | PASS | PRACTICE FINAL có feedback; không rubric/grader identity; snapshot hash được kiểm trước grader preview |
| Migration ledger | PASS | fresh fixture 14 migrations, `003` SKIPPED và latest `014_manual_scoring.sql` |
| Backend regression | PASS | 88 cases = 85 pass + 3 opt-in MySQL tests skipped trong default suite; manual MySQL integration chạy riêng 1/1 PASS |
| Ops regression | PASS | backup script suite PASS |
| Frontend production build | PASS | Vite 6.4.5, 40 modules, Manual Scoring Workspace included |
| Diff | PASS | `git diff --check` |
| Browser responsive/a11y QA | BLOCKED | chưa có browser QA tooling trong workflow hiện tại |

Lượt focused đầu trong sandbox chỉ fail các HTTP tests do `listen EPERM`; chạy lại ngoài sandbox đạt app 15/15. MySQL container dùng fixture kỹ thuật và file secret tạm; migration/integration xong đã xóa container cùng file tạm. `.env` không bị hiển thị, chỉnh sửa hoặc stage.

## 2026-11-09 — TASK-018 Premium frontend và năm dashboard

| Gate | Kết quả | Evidence |
|---|---|---|
| Root regression `npm test` | PASS | backend 88 cases: 85 pass, 3 opt-in MySQL integration skip; ops backup script PASS; frontend Vite 49 modules build PASS |
| Role route contract | PASS | Node assertion: đúng 5 role/dashboard, mỗi role có menu; `SUPER_ADMIN` không thành dashboard thứ sáu |
| Browser public flow | PASS | landing desktop/mobile, login validation, account access, DEMO tải qua API và cập nhật 1/3 câu, catalog công khai hiển thị empty state |
| Docker frontend | PASS | `docker compose up -d --build --no-deps frontend`; `docker compose ps` frontend/backend/MySQL healthy; `/` HTTP 200, `/healthz` = `ok` |
| Compose/diff | PASS | `docker compose config --quiet`; `git diff --check` |
| Authenticated dashboard visual QA | PENDING | phiên này không dùng credential/fixture user; API shape và role route được đối chiếu bằng code, chưa chụp trực tiếp 5 dashboard sau đăng nhập |

Ban đầu `npm run build --prefix frontend` chưa chạy vì thiếu `node_modules`; đã `npm ci` từ lockfile cho frontend/backend rồi build và root test PASS. Browser QA dùng backend Docker local, không tạo hoặc sửa account/attempt. Docker frontend healthcheck base Compose được pin `127.0.0.1` để tránh `localhost` chọn IPv6 trong container.
