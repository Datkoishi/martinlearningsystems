# ADR-0010 — Production runtime fail-fast, probes và graceful drain

## Bối cảnh

Backend trước đây có thể chạy `NODE_ENV=production` nhưng `COOKIE_SECURE=false`, HTTP client origin hoặc password mẫu do Compose default. Health duy nhất gộp process/DB, nên orchestrator không phân biệt process chết với dependency chưa sẵn sàng. Shutdown không có deadline. Nginx mặc định giới hạn request 1 MiB, mâu thuẫn ZIP API 25 MiB, và UI tải font từ bên thứ ba.

## Quyết định

- Parse/validate typed env trước khi server listen; production bắt buộc HTTPS origin, secure cookie và DB password không mặc định.
- Chỉ tin proxy theo hop count cấu hình; production operator phải khóa network topology tương ứng.
- Tách `/api/live` (process-only) và `/api/ready` (DB + accepting traffic); giữ `/api/health` để tương thích.
- Khi SIGTERM/SIGINT, hạ readiness, đóng Socket.IO/HTTP/MySQL pool một lần và force-exit khi vượt deadline.
- Nginx đặt CSP/security headers, `/healthz`, upload 26 MiB và cache static assets; bỏ Google Fonts runtime.
- Compose mặc định development cho local; production phải cung cấp env rõ ràng.

## Hệ quả

Misconfiguration production dừng ngay thay vì chạy ở trạng thái yếu. Orchestrator có thể drain traffic an toàn và không restart process chỉ vì MySQL tạm lỗi. Upload qua proxy khớp giới hạn API. UI không gửi metadata người dùng sang font provider.

Slice này không cung cấp TLS termination, secret manager, distributed rate limit, migration runner, backup/restore, metrics, S3/CDN hoặc tenant scope; các mục đó vẫn là production blockers độc lập.
