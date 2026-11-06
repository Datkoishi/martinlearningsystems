# Runbook

## Development

Sao chép `.env.example` thành `.env`, thay password; không commit/log `.env`. Chạy `docker compose up --build`, hoặc chỉ MySQL rồi chạy backend/frontend như README.

Để thử Import Lab ở môi trường cô lập, đặt `ENABLE_IMPORT_API=true`. Không bật công khai khi chưa có auth/RBAC. `IMPORT_STORAGE_PATH` phải trỏ thư mục chỉ backend đọc/ghi; Docker dùng named volume `import_data`. Backup đồng bộ bảng `import_jobs` và volume này.

## Migration

Các file `database/init/*.sql` chỉ chạy tự động khi volume MySQL mới. Với DB đã có dữ liệu, backup và chạy riêng migration mới theo thứ tự bằng account có quyền; không dùng `docker compose down -v`. `002` additive, `003` seed DEMO idempotent. Luôn thử restore/migration trên bản sao trước production.

## Kiểm tra và sự cố

- API degraded: kiểm tra MySQL health/host/port và secret ở môi trường, không log password.
- UI báo API chưa sẵn sàng: backend cổng 3000 và Vite proxy phải hoạt động.
- Asset missing: kiểm tra asset map/storage key/hash/reference; không thay bằng URL tạm.
- Import `INVALID`: dùng `report.errors[].path`; sửa package gốc rồi tạo package ID/version phù hợp. Upload byte-identical trả job cũ.
- `IMPORT_API_DISABLED`: chỉ bật flag trong môi trường kiểm soát; đây không phải lỗi hệ thống.
- Rollback slice: revert application commit; migration additive được giữ nguyên cho đến khi đánh giá dependency, không drop bảng tùy tiện.

Production deploy chưa cấu hình ngoài CI publish image GHCR. Không coi image publish là database migration hoặc production rollout.
