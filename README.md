# EduAssess — Martin Learning Systems

Nền tảng web đánh giá năng lực học sinh, hiện đang ở vertical slice đầu tiên: hiển thị đề FIXED giàu nội dung với section, stimulus/nhóm câu, hình, công thức, bảng và payload học sinh không chứa đáp án. Stack hiện tại gồm React + Vite, Node.js + Express + Socket.IO, MySQL và Docker Compose.

## Yêu cầu

- Node.js 20+
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
- Backend health: http://localhost:3000/api/health
- MySQL: `localhost:3307`, database `mls_db`

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

API demo: `GET /api/exams/demo-fixed`. Dữ liệu hiển thị có nhãn `[DEMO]`, chưa phải nội dung học thuật được duyệt và chưa có autosave/nộp bài phía server.

Import Lab ở `/#imports`. Để thử trong môi trường kiểm soát, đặt `ENABLE_IMPORT_API=true`; production mặc định tắt vì chưa có auth/RBAC. Upload ZIP nhị phân:

```bash
curl -X POST http://localhost:3000/api/imports \
  -H 'Content-Type: application/zip' \
  --data-binary @exam-package.zip
```

Gói nguồn và validation report được lưu dưới `IMPORT_STORAGE_PATH`; không commit thư mục này.

Tài liệu bắt đầu tại `docs/PROJECT_OVERVIEW.md`; trạng thái thực tế tại `docs/IMPLEMENTATION_STATUS.md` và `docs/FEATURE_MATRIX.md`.

## CI/CD

Workflow `.github/workflows/ci-cd.yml` chạy khi mở pull request hoặc push lên `main`:

1. Cài dependency bằng `npm ci`.
2. Chạy test backend và build frontend.
3. Build cả hai Docker image.
4. Khi push vào `main`, publish image lên GitHub Container Registry (GHCR) với tag `latest` và commit SHA.

Để package trên GHCR có thể được pull công khai, đổi visibility của package trong GitHub Package settings sau lần publish đầu tiên. Việc deploy tiếp lên VPS/Kubernetes cần thêm thông tin máy chủ đích và secrets tương ứng.

## Bảo mật cấu hình

File `.env` có chứa mật khẩu thật và đã được Git bỏ qua. Chỉ commit `.env.example`; không commit `.env` hoặc đưa mật khẩu vào workflow.
