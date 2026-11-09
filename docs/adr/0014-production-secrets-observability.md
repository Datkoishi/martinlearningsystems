# ADR-0014 — Production secrets, TLS edge và bounded observability

## Bối cảnh

Base Compose phục vụ development nên publish MySQL/backend, dùng HTTP frontend và nhận credential qua environment. Backup health chỉ nằm ở container state; object archive fallback có thể che outage nếu không có telemetry. Đưa metrics vào public API hoặc gắn user/content ID làm label sẽ tăng bề mặt tấn công, cardinality và rủi ro dữ liệu trẻ em. Repo chưa có domain/certificate/webhook hay secret manager của host thật.

## Quyết định

- Giữ base Compose cho local; production bắt buộc merge `docker-compose.production.yml` bằng Compose 2.24.4+ để `!reset` port/plaintext secret và `!override` edge ports.
- Production chỉ publish Nginx 80/443. Nginx redirect HTTP 308, terminate TLS 1.2/1.3, bật HTTP/2, HSTS và các header hiện hữu. MySQL/API/metrics/Prometheus/Alertmanager không publish host port.
- DB, metrics token, TLS key/certificate và alert webhook được mount bằng Docker secrets. Backend hỗ trợ `_FILE` fail-closed cho DB/object/metrics secret; direct value và file loại trừ nhau, file phải tuyệt đối, đọc được, một dòng và không rỗng (trừ PEM do Nginx đọc trực tiếp).
- Tách network: `app_network` internal cho service-to-service, `edge_network` cho frontend port publishing, `egress_network` cho backend object store và Alertmanager webhook. Không dùng internal-only network cho published edge vì Docker không tạo runtime port mapping trong topology đã smoke.
- Backend metrics chạy HTTP listener riêng port 9464, Bearer token so constant-time. Route label lấy Express route template hoặc `unmatched`, không lấy request path/UUID. Outcome object chỉ `archive|object|fallback|failure`; error code bị giới hạn format.
- Backup health và metric dùng cùng điều kiện freshness/verify/failure ordering. Script ghi Prometheus textfile bằng temporary file + atomic rename; node_exporter chỉ bật textfile collector.
- Prometheus đọc Bearer token bằng `credentials_file`; Alertmanager đọc webhook bằng `url_file`. Rule cover target down, 5xx, object fallback/failure, backup availability/health/age và restore rehearsal age. Monitoring UI không publish.

## Hệ quả

Production topology và secret injection có thể kiểm tra lặp lại, plaintext credential không còn trong merged service config và object/backup degradation có alert signal. Metrics process-local bị reset khi backend restart; Prometheus lưu time series dài hạn. Readiness metrics phản ánh lần probe gần nhất, không thay `/api/ready` cho traffic routing.

Full-stack fixture smoke chứng minh merge, TLS, migration, health, protected scrape, backup READY, Prometheus target/rules và Alertmanager readiness. Nó không chứng minh certificate/domain thật, webhook receiver nhận notification, off-site backup durability, bucket IAM/CDN hay tenant isolation. Các mục này là go-live evidence bắt buộc, không được đánh dấu hoàn thành chỉ vì repo bundle pass.
