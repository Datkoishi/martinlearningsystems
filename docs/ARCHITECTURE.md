# Kiến trúc

## Hiện tại

```mermaid
flowchart LR
  Browser[Browser] -->|HTTPS 1.2/1.3| Edge[Nginx TLS/static + reverse proxy\nHSTS / CSP / healthz]
  Edge --> UI[React/Vite\nRichContent renderer]
  Edge -->|/api + /socket.io| API[Express API]
  UI -->|session cookie + CSRF| API
  Runtime[Fail-fast config\nlive/ready + graceful drain] --> API
  Deploy[Compose / release job] --> Migrator[One-shot migration runner\nsequence + SHA-256 + advisory lock]
  MigrationSQL[database/init/*.sql] --> Migrator
  Migrator --> Ledger[(schema_migrations)]
  Migrator --> DB
  Backup[Opt-in backup loop\ndump + checksum + retention] --> DB
  Backup --> ImportVolume[(import_data read-only)]
  Backup --> BackupStore[(backup_data / off-site target)]
  Backup --> BackupHealth[health + restore marker]
  BackupHealth --> BackupMetrics[node_exporter textfile]
  API --> Metrics[Protected metrics listener\nHTTP / readiness / object outcomes]
  Metrics --> Prometheus[Prometheus internal]
  BackupMetrics --> Prometheus
  Prometheus --> Alertmanager[Alertmanager webhook]
  API --> Identity[Identity/access\nopaque session + global RBAC]
  Identity --> IdentityDB[(users / roles / sessions / audit)]
  UI -->|GET /api/exams/demo-fixed| API
  API --> Present[Exam presentation\nstudent-safe projection]
  Present --> Validate[Rich content validator]
  API -. slices kế tiếp .-> DB[(MySQL 8.4)]
  DB --> Versions[Exam / Question / Stimulus versions]
  Assets[Dual-read asset delivery\nobject preferred + archive fallback] -. assetId .-> UI
  Promoter[Media promotion CLI\nPUT + GET/hash + DB cutover] --> ObjectStore[(S3-compatible bucket)]
  Promoter --> Store
  Promoter --> DB
  Assets --> ObjectStore
  Lab[Import Lab] -->|application/zip| Import[Import service]
  Import --> SafeZip[Path/size/ratio/checksum/MIME validation]
  Import --> Store[(Local import volume)]
  Import --> Jobs[(MySQL import_jobs)]
  Jobs --> Review[Reviewer preview + immutable technical decision]
  Review --> ReviewAudit[(import_reviews)]
  Review --> Audit[(audit_logs)]
  Review --> Academic[Academic approval]
  Academic --> Publish[Revalidate + normalize\natomic publish]
  Publish --> Catalog[(Versioned content tables)]
  Publish --> Publication[(import_publications)]
  UI -->|public safe projection| CatalogAPI[Published FIXED catalog]
  CatalogAPI --> Catalog
  CatalogAPI --> Present
  CatalogAPI --> Store
  UI -->|Student session + CSRF + idempotency| Attempt[Attempt service]
  Attempt --> CatalogAPI
  Attempt --> AttemptDB[(exam_attempts + responses\nstudent/scoring snapshots)]
  Attempt --> Score[Deterministic scoring v1\nreveal projection]
  Score --> ScoreDB[(score revisions +\nidempotent operations)]
  Admin[Super Admin] --> GradingAssignment[Explicit grading assignment]
  Grader[Manual Grader] --> GradingAssignment
  GradingAssignment --> ManualScore[Manual essay scoring / regrade]
  ManualScore --> ScoreDB
  ScoreDB --> Evidence[Assessment evidence reader\nFINAL revisions only]
  Specialist[Assessment Specialist] --> Framework[Versioned evidence framework\nthresholds + coverage rules]
  Framework --> FrameworkReview[Independent academic review\nconfig hash binding]
  FrameworkReview --> Assessment[Assessment engine v1\ncoverage before level]
  Evidence --> Assessment
  Assessment --> AssessmentDB[(assessment results\nevidence + interpretation hash)]
  AssessmentDB -->|owner-scoped interpretation| UI
  Lab --> Assembly[Assembly Lab\nEditor-only blueprint]
  Assembly --> Pool[Published FIXED question pool\nmetadata + derivative license]
  Assembly --> Engine[Deterministic backtracking\nseed + hard quotas]
  Engine --> AssemblyDB[(assembly_runs\nstudent/scoring snapshots + hashes)]
  AssemblyDB --> Approval[BlueprintVersion\nindependent immutable review]
  Approval --> AssemblyPub[ASSEMBLED publication\npublished snapshots]
  AssemblyPub --> Catalog
  Catalog --> Attempt
  Attempt --> Audit
```

Backend được giữ modular monolith để phù hợp repo nhỏ. `backend/src/domain` chứa logic thuần; route chỉ chuyển HTTP. Frontend không render raw HTML/SVG từ payload. Asset DEMO là SVG nội bộ tin cậy; asset import tương lai phải sanitize/convert và phục vụ từ storage.

Runtime production parse/validate toàn bộ boolean/integer/origin quan trọng trước khi listen. `NODE_ENV=production` bắt buộc HTTPS origin, secure cookie và database password không mặc định; DB/object/metrics secret hỗ trợ file mount và từ chối cấu hình đồng thời plaintext + `_FILE`. Express chỉ tin số proxy hop được cấu hình; liveness không chạm DB, readiness phụ thuộc DB và trạng thái draining. SIGTERM/SIGINT chỉ xử lý một lần, ngừng readiness rồi đóng realtime/HTTP/metrics/pool trong deadline hữu hạn. Nginx production terminate TLS 1.2/1.3, redirect HTTP, bật HTTP/2/HSTS/CSP và không gọi font CDN bên thứ ba.

`backend/src/operations/metrics.js` giữ registry in-process không phụ thuộc public API: counter/histogram HTTP chỉ label method, route template và status; readiness/error code và published asset outcome đều bounded. Listener port 9464 yêu cầu Bearer token constant-time, không đi qua Nginx và không publish host port. `ops/backup/backup-metrics.sh` dùng atomic rename tạo textfile world-readable trong volume metrics nhưng status/source backup vẫn private. Node exporter chỉ bật textfile collector. Prometheus đọc token từ secret file; Alertmanager đọc webhook URL từ secret file. Overlay tách `app_network` internal, `edge_network` cho port publish và `egress_network` cho backend/object + Alertmanager/webhook.

`backend/src/operations/migration-runner.js` là upgrade boundary trước backend. Runner yêu cầu file `NNN_name.sql` liên tục, hash SHA-256 bất biến, giữ MySQL advisory lock theo database và ghi từng kết quả `APPLIED | ADOPTED | SKIPPED | BOOTSTRAPPED` vào `schema_migrations`. Compose không giao schema cho entrypoint MySQL; one-shot `migrate` hoàn tất mới mở backend. Database cũ không ledger bị chặn cho đến khi operator backup/xác minh và dùng `--adopt-existing`; sentinel schema ngăn adopt prefix thiếu hoặc không nhất quán. Seed DEMO bị skip mặc định. Vì MySQL DDL implicit-commit, restore rehearsal và recovery có review vẫn là bắt buộc.

`ops/backup` là data-protection boundary opt-in, được đóng gói thành image riêng trong CI/GHCR. Loop tạo MySQL single-transaction dump trước, rồi archive local import volume chỉ đọc; mỗi set có manifest, ledger/schema invariants, SHA-256 và `READY` marker cuối cùng. Lock chống concurrent run, retention chỉ chạm complete set, health fail khi failure mới hơn success hoặc set quá tuổi và cùng logic phát metrics. Restore checker chỉ nhận database prefix `eduassess_restore_`, yêu cầu xác nhận drop chính xác, so ledger/invariants và cleanup target. Compose `backup_data` là local baseline; encryption/off-site replication và receiver delivery thật thuộc target deployment.

`backend/src/imports` có repository/storage adapters. Runtime dùng MySQL + local persistent volume; tests dùng repository memory + thư mục tạm. ZIP được đọc trong bộ nhớ ở giới hạn request 25 MiB, giải nén logic tối đa 50 MiB và không ghi entry ra filesystem. Gói có path/symlink/encryption/tỷ lệ nén nguy hiểm bị từ chối trước staging.

`backend/src/auth` xác thực password scrypt, tạo opaque session/CSRF token và chỉ lưu hash token trong MySQL. Cookie session là `HttpOnly`, `SameSite=Strict`; role guard chạy phía server. Import ghi creator/audit trong transaction. Preview không lưu bản nội dung mới: service đọc lại `source.zip`, dựng projection reviewer và phục vụ asset theo `assetId` với `no-store`. Technical và academic decision khóa ImportJob bằng `SELECT ... FOR UPDATE`, cấm creator tự review và ghi hai scope bất biến trong `import_reviews`.

Publish đọc lại archive, xác minh source SHA-256, revalidate và so canonical report hash với approval. `package-publication.js` dựng plan UUID nội bộ, đổi rich asset/answer-option references và giữ stable identity để tạo version kế tiếp. Repository khóa job và commit source/license/assets/stimuli/questions/groups/exam/publication/audit/status trong một transaction. Nếu bất kỳ insert nào lỗi, toàn bộ rollback; nếu client retry sau commit, `import_publications.import_job_id` trả lại publication cũ. `storage_key` tiếp tục là archive reference bất biến; object promotion không rewrite/xóa source này.

`backend/src/storage` là media delivery boundary. Asset `ARCHIVE` đọc source ZIP; asset `OBJECT` ưu tiên GET object content-addressed và xác minh size/SHA-256, rồi mới fallback archive khi flag cho phép. Promotion xác minh archive, dùng conditional PUT, GET/read-after-write verification rồi transactionally đổi `storage_backend` và ghi event/audit. DB không bao giờ trỏ object chưa verify. Rollback xác minh lại archive trước transaction, giữ object key/bytes để retry và đánh dấu rollback để batch không tự promote lại. `media_asset_storage_events` là ledger bất biến; operator dùng CLI thay vì SQL tay.

`backend/src/catalog` chỉ đọc ExamVersion `PUBLISHED + non-formal`. FIXED dựng lại relational graph rồi chạy student-safe presentation; ASSEMBLED đọc immutable publication snapshot và kiểm tra hash/metadata binding. Projection loại answer/explanation. Public asset query chỉ chấp nhận reference student-visible từ FIXED graph hoặc ASSEMBLED student snapshot, sau đó xác minh bytes với metadata hash/size.

`backend/src/attempts` tạo hai snapshot tách biệt: student snapshot được trả cho player, scoring snapshot chứa answer key chỉ nằm server-side. Cả hai được canonical-hash; create transaction khóa lại ExamVersion, ghi attempt + audit nguyên tử và unique `(student_user_id, idempotency_key)`. Service đọc idempotency record trước khi dựng snapshot để retry luôn nhận đúng bản cũ dù catalog đã thay đổi. Lookup luôn scope theo owner.

Autosave dùng optimistic concurrency với `answer_revision`: repository khóa owned attempt, replay operation cũ theo `(student, operation type, idempotency key, request hash)`, rồi patch response map + tăng revision + ghi ACK/audit trong cùng transaction. Read attempt/result dùng một repeatable-read transaction để metadata, responses và score không bị xé giữa hai commit.

Submit khóa attempt, chỉ chấm response đã commit và tạo một immutable `attempt_score_revisions` row bằng `eduassess-scoring-v1`. Public result là projection riêng: PRACTICE final mới có correct answer; mock/diagnostic/pending chỉ có summary, không bao giờ map raw scoring snapshot, explanation hoặc essay rubric. Answered essay chuyển sang manual pending; assessment/competency interpretation vẫn là boundary khác.

`backend/src/manual-scoring` là human-scoring boundary. Super Admin tạo assignment gắn chính xác Attempt + current score revision + grader; `MANUAL_GRADER` chỉ query theo `assigned_to_user_id`. Preview kiểm hash hai attempt snapshot, chỉ ghép nội dung/bài làm/rubric của câu ESSAY được giao và không trả Student identity. Complete transaction khóa assignment/current revision, tạo score revision USER mới, đổi pointer/status, đóng assignment, lưu exact idempotency response và audit. Regrade tạo revision kế tiếp thay vì sửa revision đã có; rubric không đi qua Student result projection.

`backend/src/assembly` tách engine thuần, service projection/hash/governance và MySQL repository. Repository lọc QuestionVersion published thuộc graph FIXED non-formal, provenance/license derivative còn hiệu lực và metadata assembly đầy đủ. Engine biến direct/atomic/split group thành selection unit, sắp thứ tự bằng seeded SHA-256 rank rồi backtrack hard constraints. Service lưu student/scoring snapshot riêng cùng selection/snapshot hash. BlueprintVersion cần Reviewer độc lập; review bind hashes. Revision giữ Blueprint identity, chỉ nối tiếp latest `REJECTED|PUBLISHED`, khóa identity/version trong transaction và không sửa snapshot cũ. Owner/Reviewer queue là projection metadata phân trang, không mang answer/scoring payload. Publication transaction tạo ExamVersion ASSEMBLED cùng published snapshot/hash/audit. Catalog dispatch theo mode: FIXED dựng graph, ASSEMBLED đọc snapshot; attempt dùng chung flow và không gọi engine.

`backend/src/assessment` giữ assessment tách khỏi scoring. Specialist tạo config framework 1.0.0 có version/hash; threshold, minimum evidence, difficulty/task coverage và guidance nằm trong config thay vì hardcode. Academic Reviewer độc lập bind decision với config hash. Repository chỉ đọc current `FINAL` score revision của owned Student attempt có grade/subject/purpose khớp. Engine chỉ gán một trong bốn mức khi mọi global/indicator coverage gate đạt; nếu thiếu bất kỳ gate nào, result không có level và trả đúng `Chưa đủ bằng chứng`. Evidence snapshot nội bộ và interpretation được hash/lưu bất biến; public projection bỏ raw evidence và answer payload. Teacher aggregation chưa mở do chưa có tenant/class scope.

## Boundaries kế tiếp

`import`, `catalog`, `exam-player`, `attempt`, `scoring`, `manual-scoring`, `assembly`, `assessment`, `identity/access`, `audit`, `operations`. Attempt/scoring/manual regrade, ASSEMBLED revision/governance/delivery, Student-owned assessment, runtime safety, TLS/secrets, migration, backup/restore, S3 promotion và metrics/alert baseline đã có; identity vẫn mới global role. Framework production thật còn chờ academic approval. Target/off-site/webhook delivery, bucket identity/CDN, tenant/school/class scope, Teacher reporting và assembly failure/history optimization là boundary tiếp theo. Không tách microservice trước khi có nhu cầu vận hành thực.
