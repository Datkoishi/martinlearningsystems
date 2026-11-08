# Implementation status

## Hoạt động

- Bootstrap Docker/React/Express/MySQL, health endpoint, CI build/test.
- Rich-content validator 1.0.0 và renderer React không dùng raw HTML.
- FIXED DEMO có hai section, stimulus, group atomic, hình, math, table, single/multiple/number input.
- API student-safe loại answer key/explanation; unit tests bảo vệ leakage/order/content.
- Additive MySQL foundation + idempotent DEMO seed; đã smoke test trên container MySQL 8.4 cô lập.
- Exam Package ZIP staging: kiểm tra path/limit/checksum/MIME/SVG/rich content/reference/answer/license, local source retention, MySQL job adapter và duplicate detection.
- Import Lab responsive hiển thị report theo field/path và ba gate technical → academic → publish.
- Reviewer preview dùng cùng Rich Content renderer, phục vụ asset từ ZIP và hiển thị answer key/explanation.
- Technical review transaction bất biến, bind validation-report hash; trạng thái chỉ `TECHNICALLY_APPROVED`/`REJECTED`, không publish.
- Identity foundation có user/role, opaque session token chỉ lưu hash, password scrypt, CSRF double-submit bind với session, login throttling và audit.
- Import/reviewer APIs enforce role phía server; reviewer lấy từ session, Editor không đọc answer payload và không thể tự review package đã nhập.
- Academic approval là record bất biến riêng, bind package/report hash. Publish revalidate source ZIP rồi normalize toàn bộ content trong một MySQL transaction; retry idempotent và rollback không để dữ liệu live nửa vời.
- Published question/option/rich asset references được đổi sang UUID nội bộ; version cũ không bị update. `FORMAL_ASSESSMENT` fail-closed.
- Catalog công khai chỉ trả đề `PUBLISHED + FIXED + non-formal`, student-safe projection và asset thực sự xuất hiện trong phần học sinh nhìn thấy; bytes asset được kiểm tra size/SHA-256 từ archive gốc.
- Student có thể tạo/đọc attempt của chính mình. Retry theo `(student, Idempotency-Key)` trả đúng snapshot cũ; student/scoring snapshot lưu riêng, có hash toàn vẹn và audit `ATTEMPT_STARTED`.
- Autosave ghi patch câu trả lời theo monotonic `answerRevision`, server ACK toàn bộ response map, retry cùng request trả đúng ACK và stale revision trả `409` để client merge rồi lưu lại.
- Submit khóa attempt trong transaction, tạo đúng một immutable score revision và đóng quyền sửa. Scorer versioned hỗ trợ choice, multiple partial-credit opt-in, đúng/sai theo mệnh đề, số có tolerance, short text normalize; essay đã trả lời chờ chấm thủ công.
- Reveal fail-closed: chỉ `PRACTICE + FINAL` mở đáp án đúng; `MOCK_EXAM`, `DIAGNOSTIC` và pending manual chỉ trả tổng điểm/trạng thái; không mở explanation/rubric.
- UI `/#catalog` khôi phục attempt từ server, autosave debounced với trạng thái ACK/retry/conflict và hiển thị kết quả theo reveal policy.
- QuestionVersion có metadata assembly relational/indexed; Exam Package validator giữ metadata all-or-none và publication lưu nguyên metadata đã duyệt.
- Assembly engine `eduassess-assembly-v1` lọc published FIXED non-formal graph + derivative license, giải exact quota/source/points/time/group/family constraints theo seed và fail có cấu trúc khi pool thiếu.
- Successful assembly run lưu immutable blueprint/seed/selection/source distribution cùng student/scoring snapshot tách biệt, hash toàn vẹn, idempotency và audit; Assembly Lab chỉ trả student-safe owner preview.
- Mỗi run tạo Blueprint identity/version `NEEDS_REVIEW`; Reviewer độc lập xem answer/lời giải, asset scoped, ghi một decision bind hashes. APPROVED publish nguyên tử thành ExamVersion ASSEMBLED và published snapshot riêng.
- Catalog chung hiển thị FIXED/ASSEMBLED; attempt từ ASSEMBLED sao chép đúng published snapshot, dùng chung autosave/submit/scoring và không reassemble khi reload/retry.
- Editor tạo immutable revision trên cùng Blueprint identity từ latest `REJECTED|PUBLISHED`; transaction cấp version tuần tự, chặn source stale/nhánh song song và giữ exact idempotency. Version/run cũ không bị sửa.
- Assembly Lab có owned governance queue và revision form; Reviewer workspace có queue mặc định `NEEDS_REVIEW`. Queue lọc status/purpose/title, phân trang, loại self-review và không mang answer/scoring snapshot.
- Assessment Specialist tạo framework config 1.0.0 có stable identity, version/hash, purpose, minimum evidence, difficulty/task-type coverage, bốn mức có threshold và rule-based guidance. Config mới luôn `NEEDS_REVIEW`; Academic Reviewer độc lập ghi một decision bất biến bind hash.
- Assessment engine `eduassess-assessment-v1` chỉ đọc current score revision `FINAL` của owned Student attempt khớp grade/subject/exam purpose. Scoring ratio chỉ là evidence input; thiếu attempt/items/difficulty/task type trả đúng `Chưa đủ bằng chứng` và không ép level.
- Assessment result lưu evidence snapshot nội bộ + interpretation/hash bất biến, exact idempotency và audit. Student API/UI chỉ trả interpretation owner-scoped; raw evidence, submitted/correct answer và scoring snapshot không xuất hiện trong public payload.
- Migration 013 và repository transaction đã pass MySQL 8.4 thật; canonical timestamp hash được chuẩn hóa ISO sau khi integration gate phát hiện round-trip mismatch.
- Production config fail-fast kiểm tra typed env, HTTPS origin, secure cookie và DB secret; Express trust proxy chỉ theo hop count cấu hình.
- Runtime có liveness/readiness tách biệt, readiness chuyển not-ready khi drain và graceful shutdown có deadline; Docker health dùng readiness.
- MySQL Compose health query bằng application user/database nên không báo sẵn sàng trong temporary initialization server; migrator chỉ chạy sau khi schema target thực sự truy cập được.
- Frontend Nginx có CSP/security headers, `/healthz`, upload 26 MiB và static asset cache; browser không còn tải Google Fonts bên thứ ba.
- Versioned migration runner kiểm tra sequence/checksum, giữ MySQL advisory lock, skip DEMO mặc định và fail-closed với schema hiện hữu chưa adopt hoặc schema áp dụng một phần.
- Compose dùng one-shot migrator làm gate trước backend; backend image/CI chứa đúng migration source. Fresh/retry/adopt/demo/lock/drift/partial-schema đã được smoke trên MySQL 8.4.
- Backup single-transaction đã được checksum, restore vào database cô lập và đối chiếu table/column/ledger/fixture; runner xác minh bản restore thành công.
- Compose profile/image backup chạy ngay + theo interval, ghép DB dump với read-only import archive, checksum/READY, lock, retention và health fail khi lỗi/quá hạn; CI publish artifact versioned cùng backend/frontend.
- Restore checker có database prefix/exact-confirm guard, đối chiếu ledger/schema invariants, cleanup target trước success marker và thử cleanup lại trên failure path; CI chạy syntax/tamper/health/concurrency tests.
- Published media hỗ trợ S3-compatible object storage opt-in: content-addressed conditional PUT, read-after-write hash/size, transaction cutover, object-first/archive-fallback delivery và immutable promotion/rollback event + audit.
- Operator CLI có status, dry-run, batch/single promote, explicit re-promote sau rollback và rollback chỉ sau archive verification; migration 012 giữ mọi asset cũ ở ARCHIVE mặc định.
- Runtime/CI/container baseline đã nâng từ Node 20 EOL lên Node 24 LTS.
- Production Compose overlay chỉ publish TLS edge 80/443; MySQL/API/metrics/Prometheus/Alertmanager nằm trên network nội bộ. DB/metrics/TLS/webhook đọc qua file-mounted Docker secrets; plaintext DB secret và direct service ports từ base Compose bị reset.
- Nginx production redirect HTTP 308, terminate TLS 1.2/1.3, bật HTTP/2 + HSTS/CSP; frontend/backend/backup/MySQL health và one-shot migration đã pass full-stack fixture smoke.
- Backend có protected Prometheus listener riêng: HTTP counter/histogram theo route template, readiness/error và published asset archive/object/fallback/failure; graceful shutdown đóng cả metrics server.
- Backup health ghi atomic node_exporter textfile metrics; Prometheus scrape bằng credentials file, Alertmanager dùng webhook URL file và 8 alert rules cho backend/5xx/object/backup/restore signals.

## Partial / giới hạn

- Chưa có timer/deadline server-side, attempt limit/new-attempt policy, manual essay scoring UI hay score regrade workflow.
- Assembly chưa có failed-run persistence, option shuffle, soft optimization/student history hoặc assignment policy; editor revision form hiện tối ưu cho Blueprint một section dù API hỗ trợ schema nhiều section.
- Math hiển thị semantic LaTeX text, chưa dùng KaTeX/MathJax.
- SVG DEMO là asset nội bộ tin cậy; package upload hiện từ chối SVG không an toàn nhưng chưa có pipeline convert/sanitize nâng cao.
- Chưa có browser visual QA trong sandbox.
- Session chưa có rotation/idle timeout, recovery/MFA hay distributed rate limit; role hiện global và chưa có tenant/school scope.
- TLS/secret/monitoring bundle đã verified bằng fixture nhưng chưa được deploy với domain/certificate/secret manager thật; import feature flag mặc định tắt để rollout có chủ đích.
- Object promotion + fallback/failure telemetry đã có nhưng bucket/identity/CDN/replication thực tế chưa được provision; archive fallback vẫn phải bật khi rollout.
- Backup schedule/metrics/alerts đã có trong repo nhưng production chưa map encrypted/off-site destination, xác nhận webhook delivery, lịch restore-check và RPO/RTO dashboard trên hạ tầng đích.
- Assessment framework trên UI chỉ là `[DEMO]`; threshold/guidance dùng thật vẫn `ACADEMIC_APPROVAL_PENDING`. Teacher cross-student/reporting chưa mở vì chưa có tenant/school/class ownership.

## Chưa làm

Target production provisioning, off-site backup + alert delivery drill, object bucket/identity/CDN, tenant-scoped RBAC, account lifecycle/recovery/MFA, assembly failure/history optimization, manual essay/regrade, framework học thuật production/pilot và Teacher/guardian/school reporting.
