# Kiến trúc

## Hiện tại

```mermaid
flowchart LR
  Browser[Browser] --> Edge[Nginx static + reverse proxy\nCSP / 26 MiB upload / healthz]
  Edge --> UI[React/Vite\nRichContent renderer]
  Edge -->|/api + /socket.io| API[Express API]
  UI -->|session cookie + CSRF| API
  Runtime[Fail-fast config\nlive/ready + graceful drain] --> API
  API --> Identity[Identity/access\nopaque session + global RBAC]
  Identity --> IdentityDB[(users / roles / sessions / audit)]
  UI -->|GET /api/exams/demo-fixed| API
  API --> Present[Exam presentation\nstudent-safe projection]
  Present --> Validate[Rich content validator]
  API -. slices kế tiếp .-> DB[(MySQL 8.4)]
  DB --> Versions[Exam / Question / Stimulus versions]
  Assets[Archive-backed asset delivery\nS3/CDN chưa triển khai] -. assetId .-> UI
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

Runtime production parse/validate toàn bộ boolean/integer/origin quan trọng trước khi listen. `NODE_ENV=production` bắt buộc HTTPS origin, secure cookie và database password không mặc định. Express chỉ tin số proxy hop được cấu hình; liveness không chạm DB, readiness phụ thuộc DB và trạng thái draining. SIGTERM/SIGINT chỉ xử lý một lần, ngừng readiness rồi đóng realtime/HTTP/pool trong deadline hữu hạn. Nginx phục vụ static cùng CSP/security headers và không gọi font CDN bên thứ ba.

`backend/src/imports` có repository/storage adapters. Runtime dùng MySQL + local persistent volume; tests dùng repository memory + thư mục tạm. ZIP được đọc trong bộ nhớ ở giới hạn request 25 MiB, giải nén logic tối đa 50 MiB và không ghi entry ra filesystem. Gói có path/symlink/encryption/tỷ lệ nén nguy hiểm bị từ chối trước staging.

`backend/src/auth` xác thực password scrypt, tạo opaque session/CSRF token và chỉ lưu hash token trong MySQL. Cookie session là `HttpOnly`, `SameSite=Strict`; role guard chạy phía server. Import ghi creator/audit trong transaction. Preview không lưu bản nội dung mới: service đọc lại `source.zip`, dựng projection reviewer và phục vụ asset theo `assetId` với `no-store`. Technical và academic decision khóa ImportJob bằng `SELECT ... FOR UPDATE`, cấm creator tự review và ghi hai scope bất biến trong `import_reviews`.

Publish đọc lại archive, xác minh source SHA-256, revalidate và so canonical report hash với approval. `package-publication.js` dựng plan UUID nội bộ, đổi rich asset/answer-option references và giữ stable identity để tạo version kế tiếp. Repository khóa job và commit source/license/assets/stimuli/questions/groups/exam/publication/audit/status trong một transaction. Nếu bất kỳ insert nào lỗi, toàn bộ rollback; nếu client retry sau commit, `import_publications.import_job_id` trả lại publication cũ. Media storage key hiện là archive-backed (`source.zip#entry`), nên source ZIP published không được cleanup trước khi có object-storage promotion.

`backend/src/catalog` chỉ đọc ExamVersion `PUBLISHED + non-formal`. FIXED dựng lại relational graph rồi chạy student-safe presentation; ASSEMBLED đọc immutable publication snapshot và kiểm tra hash/metadata binding. Projection loại answer/explanation. Public asset query chỉ chấp nhận reference student-visible từ FIXED graph hoặc ASSEMBLED student snapshot, sau đó xác minh bytes với metadata hash/size.

`backend/src/attempts` tạo hai snapshot tách biệt: student snapshot được trả cho player, scoring snapshot chứa answer key chỉ nằm server-side. Cả hai được canonical-hash; create transaction khóa lại ExamVersion, ghi attempt + audit nguyên tử và unique `(student_user_id, idempotency_key)`. Service đọc idempotency record trước khi dựng snapshot để retry luôn nhận đúng bản cũ dù catalog đã thay đổi. Lookup luôn scope theo owner.

Autosave dùng optimistic concurrency với `answer_revision`: repository khóa owned attempt, replay operation cũ theo `(student, operation type, idempotency key, request hash)`, rồi patch response map + tăng revision + ghi ACK/audit trong cùng transaction. Read attempt/result dùng một repeatable-read transaction để metadata, responses và score không bị xé giữa hai commit.

Submit khóa attempt, chỉ chấm response đã commit và tạo một immutable `attempt_score_revisions` row bằng `eduassess-scoring-v1`. Public result là projection riêng: PRACTICE final mới có correct answer; mock/diagnostic/pending chỉ có summary, không bao giờ map raw scoring snapshot, explanation hoặc essay rubric. Answered essay chuyển sang manual pending; assessment/competency interpretation vẫn là boundary khác.

`backend/src/assembly` tách engine thuần, service projection/hash/governance và MySQL repository. Repository lọc QuestionVersion published thuộc graph FIXED non-formal, provenance/license derivative còn hiệu lực và metadata assembly đầy đủ. Engine biến direct/atomic/split group thành selection unit, sắp thứ tự bằng seeded SHA-256 rank rồi backtrack hard constraints. Service lưu student/scoring snapshot riêng cùng selection/snapshot hash. BlueprintVersion cần Reviewer độc lập; review bind hashes. Publication transaction tạo ExamVersion ASSEMBLED cùng published snapshot/hash/audit. Catalog dispatch theo mode: FIXED dựng graph, ASSEMBLED đọc snapshot; attempt dùng chung flow và không gọi engine.

## Boundaries kế tiếp

`import`, `catalog`, `exam-player`, `attempt`, `scoring`, `assembly`, `assessment`, `identity/access`, `audit`, `operations`. Attempt/scoring, ASSEMBLED delivery và runtime safety baseline đã có; identity vẫn mới global role. Migration ledger/runner, backup-restore rehearsal, Blueprint authoring revision, tenant/school scope và manual scoring/regrade là boundary tiếp theo. Không tách microservice trước khi có nhu cầu vận hành thực.
