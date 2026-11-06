# Kiến trúc

## Hiện tại

```mermaid
flowchart LR
  UI[React/Vite\nRichContent renderer] -->|session cookie + CSRF| API[Express API]
  API --> Identity[Identity/access\nopaque session + global RBAC]
  Identity --> IdentityDB[(users / roles / sessions / audit)]
  UI -->|GET /api/exams/demo-fixed| API
  API --> Present[Exam presentation\nstudent-safe projection]
  Present --> Validate[Rich content validator]
  API -. slices kế tiếp .-> DB[(MySQL 8.4)]
  DB --> Versions[Exam / Question / Stimulus versions]
  Assets[Object storage adapter\nchưa triển khai] -. assetId .-> UI
  Lab[Import Lab] -->|application/zip| Import[Import service]
  Import --> SafeZip[Path/size/ratio/checksum/MIME validation]
  Import --> Store[(Local import volume)]
  Import --> Jobs[(MySQL import_jobs)]
  Jobs --> Review[Reviewer preview + immutable technical decision]
  Review --> ReviewAudit[(import_reviews)]
  Review --> Audit[(audit_logs)]
```

Backend được giữ modular monolith để phù hợp repo nhỏ. `backend/src/domain` chứa logic thuần; route chỉ chuyển HTTP. Frontend không render raw HTML/SVG từ payload. Asset DEMO là SVG nội bộ tin cậy; asset import tương lai phải sanitize/convert và phục vụ từ storage.

`backend/src/imports` có repository/storage adapters. Runtime dùng MySQL + local persistent volume; tests dùng repository memory + thư mục tạm. ZIP được đọc trong bộ nhớ ở giới hạn request 25 MiB, giải nén logic tối đa 50 MiB và không ghi entry ra filesystem. Gói có path/symlink/encryption/tỷ lệ nén nguy hiểm bị từ chối trước staging.

`backend/src/auth` xác thực password scrypt, tạo opaque session/CSRF token và chỉ lưu hash token trong MySQL. Cookie session là `HttpOnly`, `SameSite=Strict`; role guard chạy phía server. Import ghi creator/audit trong transaction. Preview không lưu bản nội dung mới: service đọc lại `source.zip`, dựng projection reviewer và phục vụ asset theo `assetId` với `no-store`. Technical decision khóa ImportJob bằng `SELECT ... FOR UPDATE`, cấm creator tự review, ghi một immutable `import_reviews` row + audit và đổi trạng thái sang `TECHNICALLY_APPROVED` hoặc `REJECTED`. Không có transition sang `PUBLISHED` trong module này.

## Boundaries kế tiếp

`import`, `catalog`, `exam-player`, `scoring`, `assembly`, `assessment`, `identity/access`, `audit`. Identity hiện mới global role; tenant/school scope và policy engine là boundary tiếp theo. Không tách microservice trước khi có nhu cầu vận hành thực.
