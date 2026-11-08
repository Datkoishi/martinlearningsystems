# EduAssess — Martin Learning Systems

Nền tảng web đánh giá năng lực học sinh. Repo hiện có luồng import → technical review → academic review → atomic publish, catalog chung cho FIXED/ASSEMBLED, attempt/scoring cho Student và deterministic assembly có blueprint version/approval/publish gate. Stack gồm React + Vite, Node.js + Express + Socket.IO, MySQL và Docker Compose.

## Yêu cầu

- Node.js 24 LTS+
- npm 10+
- Docker Desktop (bao gồm Docker Compose v2)

## Chạy toàn bộ bằng Docker

```bash
cp .env.example .env
# Cập nhật mật khẩu trong .env trước khi chạy
docker compose up --build
```

Sau khi các container sẵn sàng:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api
- Backend liveness: http://localhost:3000/api/live
- Backend readiness: http://localhost:3000/api/ready
- MySQL: `localhost:3307`, database `mls_db`

Compose chạy service một lần `migrate` sau khi MySQL healthy và chỉ khởi động backend khi toàn bộ migration hợp lệ. Seed `003_demo_fixed_exam.sql` bị bỏ qua theo mặc định; chỉ bật rõ trên database mới trong môi trường demo bằng lệnh ở Runbook.

Dừng hệ thống:

```bash
docker compose down
```

Thêm `-v` nếu muốn xóa cả dữ liệu MySQL đã lưu: `docker compose down -v`.

## Chạy development không dùng container cho Node.js

Khởi động riêng MySQL bằng Docker:

```bash
docker compose up -d mysql
```

Đổi `MYSQL_HOST=localhost` trong `.env`, sau đó mở hai terminal:

```bash
npm install --prefix backend
npm run dev:backend
```

```bash
npm install --prefix frontend
npm run dev:frontend
```

Vite tự proxy `/api` và `/socket.io` sang backend tại cổng 3000.

## Kiểm tra

```bash
npm test --prefix backend
npm run build --prefix frontend
```

API demo: `GET /api/exams/demo-fixed`. Dữ liệu hiển thị có nhãn `[DEMO]`, chưa phải nội dung học thuật được duyệt. Catalog thật ở `/#catalog`; chỉ liệt kê ExamVersion `PUBLISHED + (FIXED|ASSEMBLED) + non-formal`. Student có thể tạo attempt, khôi phục câu trả lời đã được server xác nhận, autosave theo revision và nộp bài idempotent.

Import Lab ở `/#imports`. Backend yêu cầu session đăng nhập, role phía server và CSRF cho mọi thao tác ghi; production vẫn mặc định tắt import cho đến khi cấu hình vận hành được duyệt. Tạo user đầu tiên bằng password qua stdin, không đưa credential vào command history:

```bash
read -s EDUASSESS_NEW_PASSWORD
printf '%s' "$EDUASSESS_NEW_PASSWORD" | docker compose exec -T backend npm run auth:create-user -- \
  --email editor@example.com --display-name "Content Editor" --roles CONTENT_EDITOR
unset EDUASSESS_NEW_PASSWORD
```

Các role bootstrap hiện hỗ trợ `STUDENT`, `CONTENT_EDITOR`, `ACADEMIC_REVIEWER` và `SUPER_ADMIN`; nên cấp mỗi người đúng role cần thiết. Sau khi đăng nhập ở Import Lab, Editor có thể tải ZIP. Gói nguồn và validation report được lưu dưới `IMPORT_STORAGE_PATH`; không commit thư mục này.

Package `READY_FOR_REVIEW` có thể mở bằng chính Rich Content renderer khi session có role `ACADEMIC_REVIEWER`. Reviewer ID lấy từ session, Editor không đọc được answer payload và người nhập package không thể tự review. Workflow tách technical review, academic approval và publish. Publish đọc lại ZIP, kiểm tra hash/report rồi ghi source, license, asset, question/stimulus/group và `ExamVersion` trong một transaction; retry trả publication cũ thay vì nhân đôi. `FORMAL_ASSESSMENT` vẫn bị khóa cho đến khi có formal approval policy.

Catalog công khai không trả answer key/explanation hoặc asset chỉ xuất hiện trong lời giải. Các API ghi attempt yêu cầu session `STUDENT`, CSRF và `Idempotency-Key`; server lưu riêng student snapshot và scoring snapshot, kèm SHA-256 toàn vẹn. Chỉ chủ sở hữu đọc được attempt và API không bao giờ trả scoring snapshot. Scoring hiện hỗ trợ choice, đúng/sai, số có tolerance và short text; bài tự luận đã trả lời chuyển `PENDING_MANUAL_SCORING`, không dùng AI để kết luận. Chỉ bài `PRACTICE` đã chấm `FINAL` mới mở đáp án đúng; lời giải và rubric không được mở ở slice này.

Assembly Lab ở `/#assembly`: Editor tạo deterministic technical run, xem owned governance queue và tạo immutable revision trên cùng Blueprint identity sau version rejected/published; Academic Reviewer chọn snapshot từ queue, mở answer payload, ghi một quyết định bất biến và publish bản approved. Engine chỉ đọc QuestionVersion `PUBLISHED` trong graph FIXED non-formal, có metadata đầy đủ và license `derivative_assembly`; quota/source diversity/group policy là điều kiện cứng. Queue không chứa answer/scoring snapshot. Publication tạo `ExamVersion(mode=ASSEMBLED)` cùng student/scoring snapshot riêng; catalog và Student attempt dùng đúng snapshot đã publish, không reassemble khi reload. Formal assessment vẫn khóa.

Tài liệu bắt đầu tại `docs/PROJECT_OVERVIEW.md`; trạng thái thực tế tại `docs/IMPLEMENTATION_STATUS.md` và `docs/FEATURE_MATRIX.md`.

## Runtime production

Compose mặc định dùng `NODE_ENV=development` để local HTTP hoạt động. Production dùng overlay `docker-compose.production.yml` (Docker Compose 2.24.4+) để chỉ publish Nginx 80/443, giữ MySQL/API/Prometheus/Alertmanager trên network nội bộ, mount TLS/DB/metrics/webhook bằng Docker secrets và bật root filesystem read-only ở các service phù hợp.

Sao chép `ops/production/production.env.example` ra vị trí ngoài Git, sửa origin/port và đường dẫn tới secret thật. DB password, metrics token và webhook URL phải là file một dòng; certificate/key là PEM. Sau đó validate trước khi chạy:

```bash
docker compose --env-file /secure/eduassess/production.env \
  -f docker-compose.yml -f docker-compose.production.yml \
  --profile backup config --quiet

docker compose --env-file /secure/eduassess/production.env \
  -f docker-compose.yml -f docker-compose.production.yml \
  --profile backup up -d --build
```

Các gate bắt buộc gồm:

- `NODE_ENV=production`;
- `CLIENT_ORIGIN` là origin HTTPS chính xác, không kèm path;
- `COOKIE_SECURE=true`;
- `MYSQL_PASSWORD_FILE`/Docker secret chứa giá trị không mặc định;
- `TRUST_PROXY` đúng số reverse proxy tin cậy (`1` khi backend chỉ nằm sau một proxy);
- `SHUTDOWN_GRACE_MS` nằm trong 1–60 giây.

Backend từ chối khởi động nếu cấu hình production không an toàn hoặc sai kiểu. Orchestrator dùng `/api/live` cho liveness và `/api/ready` cho readiness; khi nhận `SIGTERM`/`SIGINT`, readiness chuyển `503` trước khi đóng Socket.IO, HTTP, metrics listener và MySQL pool. Nginx terminate TLS 1.2/1.3, redirect HTTP 308, bật HSTS/CSP/security headers, health `/healthz`, giới hạn upload 26 MiB và không tải font từ bên thứ ba.

Metrics backend chạy listener riêng port 9464, không publish ra host và yêu cầu Bearer token ít nhất 32 ký tự. Prometheus đọc token bằng file, scrape HTTP/readiness/object fallback/failure và backup textfile metrics; 8 alert rules chuyển sang Alertmanager webhook đọc từ secret file. UI Prometheus/Alertmanager không được publish. Xem cách rotate secret, kiểm tra target/rule và rollback ở `docs/RUNBOOK.md`.

Migration runner dùng ledger SHA-256, sequence liên tục và advisory lock; retry sau khi thành công là no-op. Kiểm tra trạng thái bằng:

```bash
npm run db:migrate:status --prefix backend
```

Database hiện hữu chưa có ledger phải được backup, restore thử trên bản sao và xác minh trước khi chạy một lần với `--adopt-existing`; không sửa file SQL đã được ghi ledger. Quy trình chi tiết và lệnh backup/restore nằm trong `docs/RUNBOOK.md`.

Backup scheduler là Compose profile opt-in, không tự bật ở local:

```bash
docker compose --profile backup up -d backup
docker compose --profile backup ps backup
```

Job ghép MySQL single-transaction dump với archive của `import_data`, kiểm tra SHA-256, giữ retention và phát health signal khi backup lỗi hoặc quá hạn. Named volume `backup_data` chỉ là baseline local; production phải map nó sang storage mã hóa/off-site và alert trên container health. Restore rehearsal có guard riêng trong `docs/RUNBOOK.md`.

Published media có thể được promote theo batch sang AWS S3 hoặc endpoint S3-compatible. Tính năng mặc định tắt; rollout phải giữ `OBJECT_STORAGE_ARCHIVE_FALLBACK=true`, chạy migration và kiểm tra trước:

```bash
docker compose exec -T backend npm run media:status
docker compose exec -T backend npm run media:promote -- --limit 100 --dry-run
docker compose exec -T backend npm run media:promote -- --limit 100
```

Object key là content-address theo SHA-256. CLI chỉ cut over DB sau PUT + GET/hash/size verification; retry không upload/ghi event trùng. Rollback một asset dùng `npm run media:rollback -- --asset-id <uuid>` và chỉ chuyển về archive sau khi source archive được verify. Object không bị xóa khi rollback. Xem cấu hình, thứ tự rollout và incident guard trong `docs/RUNBOOK.md`.

Bundle production trong repo đã được smoke end-to-end bằng certificate/secret fixture. Đây chưa phải xác nhận deploy trên host thật: operator vẫn phải provision certificate/domain, webhook có thể nhận alert, encrypted off-site backup, bucket/workload identity/CDN và tenant-scoped access trước khi phục vụ dữ liệu thật.

## CI/CD

Workflow `.github/workflows/ci-cd.yml` chạy khi mở pull request hoặc push lên `main`:

1. Cài dependency bằng `npm ci`.
2. Chạy test backend và build frontend.
3. Build Docker image backend, frontend và backup.
4. Khi push vào `main`, publish image lên GitHub Container Registry (GHCR) với tag `latest` và commit SHA.

Để package trên GHCR có thể được pull công khai, đổi visibility của package trong GitHub Package settings sau lần publish đầu tiên. Việc deploy tiếp lên VPS/Kubernetes cần thêm thông tin máy chủ đích và secrets tương ứng.

## Bảo mật cấu hình

File `.env` có chứa mật khẩu thật và đã được Git bỏ qua. Chỉ commit `.env.example`; không commit `.env` hoặc đưa mật khẩu vào workflow.
