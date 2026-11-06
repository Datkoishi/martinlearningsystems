# Permissions baseline

| Hành động | Student | Teacher | Editor | Reviewer | Admin |
|---|---:|---:|---:|---:|---:|
| Xem đề student-safe được giao | own | scoped class | preview draft | review scope | scoped |
| Xem answer key trước reveal | no | policy only | own draft | yes | audited only |
| Tạo/sửa draft | no | no | yes | comment | yes |
| Duyệt/publish | no | no | no self-approve | yes | policy only |
| Xem bài học sinh | own | assigned class | no | no | minimum scoped |

Identity/session và global role guard đã có cho workflow import. Backend, không phải UI, enforce `CONTENT_EDITOR`, `ACADEMIC_REVIEWER` và `SUPER_ADMIN`; mọi thao tác ghi dùng CSRF và được bind với user session. Tenant/school scope, guardian/teacher scope và assignment vẫn chưa có.

`CONTENT_EDITOR` được upload và đọc validation metadata nhưng không được gọi reviewer preview/assets/reviews. `ACADEMIC_REVIEWER` được xem answer payload và ghi technical decision; reviewer ID luôn lấy từ session. ImportJob lưu creator và transaction từ chối tự review. `SUPER_ADMIN` có cả hai quyền nhưng vẫn chịu self-review rule.

Production vẫn mặc định `ENABLE_IMPORT_API=false` để rollout có chủ đích; feature flag không thay thế auth. Trước public deployment phải bổ sung tenant scope, account recovery/MFA theo rủi ro, session cleanup/rotation, distributed rate limit và negative IDOR tests khi có tài nguyên tenant.
