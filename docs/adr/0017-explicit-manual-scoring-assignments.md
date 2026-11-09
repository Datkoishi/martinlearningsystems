# ADR-0017 — Explicit assignment cho manual scoring và immutable regrade

## Trạng thái

Accepted — 2026-11-09.

## Bối cảnh

Submit tự động đã chuyển essay có bài làm sang `PENDING_MANUAL_SCORING`, nhưng repo chưa có cách mở bài cho người chấm hoặc tạo score revision cuối. Role Teacher hiện chưa có tenant/school/class ownership; một queue cross-student toàn cục sẽ tạo rủi ro IDOR và mở dữ liệu trẻ em vượt phạm vi.

## Quyết định

- Thêm role hẹp `MANUAL_GRADER`; role này không tự cấp quyền tìm mọi Attempt.
- Chỉ `SUPER_ADMIN` tạo assignment bind `attempt_id`, current `source_score_revision`, loại `INITIAL|REGRADE` và một assignee cụ thể.
- Mọi list/get/complete query của grader đều kèm `assigned_to_user_id` từ session. Assignment của người khác trả 404.
- Preview xác minh hash student/scoring snapshots rồi chỉ ghép essay content, submitted response và rubric cần chấm. Không trả Student identity hoặc objective answer key.
- Một assignment phải chấm đủ toàn bộ essay phù hợp. Auto-scored question/result được sao chép nguyên trạng.
- Complete transaction tạo immutable USER score revision kế tiếp, update Attempt pointer/status, đóng assignment, ghi exact-idempotent operation và audit.
- Regrade tạo assignment từ current FINAL revision và tạo revision mới; không update hoặc xóa revision cũ.
- Student result tiếp tục qua reveal mapper: feedback chỉ xuất hiện ở PRACTICE FINAL; rubric, explanation và grader identity không xuất hiện.

## Hệ quả

Luồng chấm hoạt động an toàn trước khi có tenant/class scope và giữ audit/reproducibility đầy đủ. Đổi lại Super Admin phải biết exact Attempt UUID và Manual Grader UUID; roster/assignment UI theo lớp là việc của tenant-scoped phase sau. `manual_scoring_operations` và assignment rows làm tăng dữ liệu bất biến cần nằm trong backup/restore set MySQL.
