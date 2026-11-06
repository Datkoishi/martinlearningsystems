# Runbook

## Development

Sao chép `.env.example` thành `.env`, thay password; không commit/log `.env`. Chạy `docker compose up --build`, hoặc chỉ MySQL rồi chạy backend/frontend như README. Local HTTP dùng `COOKIE_SECURE=false`; mọi môi trường HTTPS phải đặt `COOKIE_SECURE=true`.

Tạo user bằng password đọc từ stdin, không truyền password trong argument hoặc lưu vào shell history:

```bash
read -s EDUASSESS_NEW_PASSWORD
printf '%s' "$EDUASSESS_NEW_PASSWORD" | docker compose exec -T backend npm run auth:create-user -- \
  --email reviewer@example.com --display-name "Academic Reviewer" --roles ACADEMIC_REVIEWER
unset EDUASSESS_NEW_PASSWORD
```

Role bootstrap hợp lệ: `CONTENT_EDITOR`, `ACADEMIC_REVIEWER`, `SUPER_ADMIN`; ưu tiên tách tài khoản Editor/Reviewer để enforce four-eyes. Sau khi có account và HTTPS/cookie đúng, đặt `ENABLE_IMPORT_API=true` theo quy trình rollout. `IMPORT_STORAGE_PATH` phải trỏ thư mục chỉ backend đọc/ghi; Docker dùng named volume `import_data`. Backup đồng bộ `users`, `user_roles`, `auth_sessions`, `audit_logs`, `import_jobs`, `import_reviews` và volume này. Thiết lập job xóa session hết hạn theo retention policy trước production.

## Migration

Các file `database/init/*.sql` chỉ chạy tự động khi volume MySQL mới. Với DB đã có dữ liệu, backup và chạy riêng migration mới theo thứ tự bằng account có quyền; không dùng `docker compose down -v`. `002` additive, `003` seed DEMO idempotent, `004` thêm technical review và `005` thêm identity/session/audit cùng creator FK. Luôn thử restore/migration trên bản sao trước production; `ALTER TABLE` trong `005` chỉ chạy một lần trên DB cũ.

## Kiểm tra và sự cố

- API degraded: kiểm tra MySQL health/host/port và secret ở môi trường, không log password.
- UI báo API chưa sẵn sàng: backend cổng 3000 và Vite proxy phải hoạt động.
- Asset missing: kiểm tra asset map/storage key/hash/reference; không thay bằng URL tạm.
- Import `INVALID`: dùng `report.errors[].path`; sửa package gốc rồi tạo package ID/version phù hợp. Upload byte-identical trả job cũ.
- `IMPORT_API_DISABLED`: chỉ bật flag trong môi trường kiểm soát; đây không phải lỗi hệ thống.
- `AUTH_REQUIRED`/`SESSION_INVALID`: đăng nhập lại; session đã revoke/hết hạn không được khôi phục bằng cookie cũ.
- `CSRF_INVALID`: kiểm tra frontend gửi `x-csrf-token` từ cookie cùng session; không tắt guard để xử lý nhanh.
- `FORBIDDEN`: kiểm tra role server-side trong `user_roles`; không cấp `SUPER_ADMIN` thay cho việc sửa scope.
- `SELF_REVIEW_FORBIDDEN`: dùng một Reviewer khác; không đổi creator hoặc sửa audit để bypass four-eyes.
- Technical review là bất biến. Nếu reject, sửa nguồn và upload package mới; không update/delete `import_reviews`. `TECHNICALLY_APPROVED` vẫn không được publish khi chưa có academic approval.
- Rollback slice: revert application commit; migration additive được giữ nguyên cho đến khi đánh giá dependency, không drop bảng tùy tiện.

Production deploy chưa cấu hình ngoài CI publish image GHCR. Không coi image publish là database migration hoặc production rollout.
