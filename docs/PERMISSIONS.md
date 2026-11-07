# Permissions baseline

| Hành động | Student | Teacher | Editor | Reviewer | Admin |
|---|---:|---:|---:|---:|---:|
| Xem catalog FIXED/ASSEMBLED đã publish | yes | future | yes | yes | yes |
| Tạo/đọc/autosave/submit attempt | own only | no | no | no | audited support only |
| Xem kết quả/đáp án sau reveal | own, theo purpose/state | policy only | no | no | audited support only |
| Tạo/đọc assembly technical preview | no | no | own only | no | own only hiện tại |
| Xem answer payload/reviewer asset của assembly | no | no | no | yes | yes |
| Duyệt/publish assembly snapshot | no | no | no self-approve | yes | yes, vẫn cấm self-review |
| Xem đề student-safe được giao | own | scoped class | preview draft | review scope | scoped |
| Xem answer key trước reveal | no | policy only | own draft | yes | audited only |
| Tạo/sửa draft | no | no | yes | comment | yes |
| Duyệt/publish | no | no | no self-approve | yes | policy only |
| Xem bài học sinh | own | assigned class | no | no | minimum scoped |

Identity/session và global role guard đã có cho workflow import. Backend, không phải UI, enforce `CONTENT_EDITOR`, `ACADEMIC_REVIEWER` và `SUPER_ADMIN`; mọi thao tác ghi dùng CSRF và được bind với user session. Tenant/school scope, guardian/teacher scope và assignment vẫn chưa có.

Catalog metadata/projection student-safe là public. Tạo attempt, autosave và submit yêu cầu `STUDENT` + CSRF; Editor/Reviewer nhận 403. GET attempt/result là read-only nhưng vẫn yêu cầu Student session. Mọi query luôn có cả `id` và authenticated `student_user_id`; tài nguyên của Student khác trả 404. Student không có API lấy scoring snapshot. Correct answer chỉ xuất hiện trong result PRACTICE đã FINAL; explanation/rubric không được trả.

`CONTENT_EDITOR` được upload và đọc validation metadata nhưng không được gọi reviewer preview/assets/reviews/publish. `ACADEMIC_REVIEWER` được xem answer payload, ghi technical decision, academic approval và kích hoạt publish sau đủ gate; reviewer/publisher ID luôn lấy từ session. ImportJob lưu creator và mọi review transaction từ chối tự review. `SUPER_ADMIN` có cả hai quyền nhưng vẫn chịu self-review rule.

Assembly create yêu cầu Editor/Admin + CSRF + idempotency; owner GET trả student-safe preview, không scoring snapshot. Reviewer/Admin có route riêng trả answer/lời giải và chỉ asset thuộc selected run. Creator không được tự review; decision bất biến bind hashes. Chỉ APPROVED mới publish; Student chỉ thấy ExamVersion ASSEMBLED đã publish qua catalog và không truy cập technical run/reviewer route.

Academic approval không đồng nghĩa formal assessment approval. Package `FORMAL_ASSESSMENT` luôn bị chặn ở publish cho đến khi có role/policy/validation record chuyên biệt. Published version không được sửa tại chỗ; thay đổi phải tạo package/version mới.

Production vẫn mặc định `ENABLE_IMPORT_API=false` để rollout có chủ đích; feature flag không thay thế auth. Trước public deployment phải bổ sung tenant scope, account recovery/MFA theo rủi ro, session cleanup/rotation, distributed rate limit và negative IDOR tests khi có tài nguyên tenant.
