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

## Partial / giới hạn

- UI chỉ giữ câu trả lời trong React memory và nói rõ là DEMO; không phải autosave server.
- Math hiển thị semantic LaTeX text, chưa dùng KaTeX/MathJax.
- SVG DEMO là asset nội bộ tin cậy; package upload hiện từ chối SVG không an toàn nhưng chưa có pipeline convert/sanitize nâng cao.
- Chưa có browser visual QA trong sandbox.
- Session chưa có rotation/idle timeout, recovery/MFA hay distributed rate limit; role hiện global và chưa có tenant/school scope.
- Production vẫn phải chạy HTTPS với `COOKIE_SECURE=true`; import feature flag mặc định tắt để rollout có chủ đích.
- Published media hiện được tham chiếu tới entry trong source ZIP bất biến trên local volume; chưa có S3 promotion/catalog delivery adapter.

## Chưa làm

Tenant-scoped RBAC, account lifecycle/recovery/MFA, S3 object storage, published catalog delivery, attempts, scoring, ASSEMBLED, assessment/reporting.
