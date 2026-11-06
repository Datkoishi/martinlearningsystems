# Permissions baseline

| Hành động | Student | Teacher | Editor | Reviewer | Admin |
|---|---:|---:|---:|---:|---:|
| Xem đề student-safe được giao | own | scoped class | preview draft | review scope | scoped |
| Xem answer key trước reveal | no | policy only | own draft | yes | audited only |
| Tạo/sửa draft | no | no | yes | comment | yes |
| Duyệt/publish | no | no | no self-approve | yes | policy only |
| Xem bài học sinh | own | assigned class | no | no | minimum scoped |

RBAC/tenant/auth chưa có trong code; vì vậy endpoint hiện tại chỉ phục vụ dữ liệu DEMO và tuyệt đối không trả answer key. API có dữ liệu thật phải có server-side guard, negative IDOR tests, audit và guardian/school scope.

Import API là công cụ editor nhưng chưa có guard role hoàn chỉnh; do đó production mặc định `ENABLE_IMPORT_API=false`. Feature flag không thay thế auth và không được dùng để mở endpoint công khai.
