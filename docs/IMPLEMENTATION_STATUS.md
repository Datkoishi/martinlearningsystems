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
- Production config fail-fast kiểm tra typed env, HTTPS origin, secure cookie và DB secret; Express trust proxy chỉ theo hop count cấu hình.
- Runtime có liveness/readiness tách biệt, readiness chuyển not-ready khi drain và graceful shutdown có deadline; Docker health dùng readiness.
- Frontend Nginx có CSP/security headers, `/healthz`, upload 26 MiB và static asset cache; browser không còn tải Google Fonts bên thứ ba.

## Partial / giới hạn

- Chưa có timer/deadline server-side, attempt limit/new-attempt policy, manual essay scoring UI hay score regrade workflow.
- Assembly chưa có authoring revision UI trên cùng blueprint identity, failed-run persistence, option shuffle, soft optimization/student history hoặc assignment policy.
- Math hiển thị semantic LaTeX text, chưa dùng KaTeX/MathJax.
- SVG DEMO là asset nội bộ tin cậy; package upload hiện từ chối SVG không an toàn nhưng chưa có pipeline convert/sanitize nâng cao.
- Chưa có browser visual QA trong sandbox.
- Session chưa có rotation/idle timeout, recovery/MFA hay distributed rate limit; role hiện global và chưa có tenant/school scope.
- Production vẫn cần TLS edge/secret manager thực tế; import feature flag mặc định tắt để rollout có chủ đích.
- Published media hiện được phục vụ từ entry trong source ZIP bất biến trên local volume; chưa có S3 promotion/CDN adapter.
- Migration SQL vẫn chỉ auto-run trên MySQL volume mới; chưa có migration ledger/runner cho DB production đang tồn tại hay backup-restore rehearsal tự động.

## Chưa làm

Migration runner + backup/restore rehearsal, tenant-scoped RBAC, account lifecycle/recovery/MFA, S3 object storage, blueprint authoring revisions, manual essay/regrade, assessment/reporting.
