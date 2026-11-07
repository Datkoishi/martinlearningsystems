# Hướng dẫn coding agent

## Bản đồ repo và lệnh thật

- `frontend/`: React 19 + Vite; `npm run dev:frontend`, `npm run build --prefix frontend`.
- `backend/`: Express 5 + MySQL; `npm run dev:backend`, `npm test --prefix backend`.
- `database/init/`: migration/seed SQL chỉ tự chạy khi MySQL volume được tạo mới.
- Cài đặt: `npm run install:all`. Kiểm tra chung: `npm test`.

## Trước khi code

Đọc `docs/PROJECT_OVERVIEW.md`, `docs/PROJECT_SKILL.md`, `docs/PROGRESS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/FEATURE_MATRIX.md` và tài liệu domain liên quan. Chạy `git status --short --branch`; bảo toàn thay đổi của người dùng.

## Sau mỗi task

Cập nhật feature matrix, implementation status, test report, progress và tài liệu kiến trúc/domain bị ảnh hưởng. Chỉ ghi lệnh/test/commit/push đã thực sự chạy. Commit theo conventional commits và push không force khi được phép.

## Không được làm

Không xóa/reset dữ liệu, lộ secret/đáp án, sửa version đã publish, giả test pass, ghi đè thay đổi người dùng, dùng dữ liệu trẻ em thật trong fixture, hoặc để AI lách review/approval. Source of truth là code/schema đang chạy và requirement đã xác nhận; mâu thuẫn phải ghi `docs/DECISIONS.md` hoặc ADR.
