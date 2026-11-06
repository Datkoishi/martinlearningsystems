# API hiện tại

## `GET /api`

Trả identity của service.

## `GET /api/health`

`200` khi MySQL kết nối; `503` khi lỗi. Production không trả chi tiết lỗi DB.

## `GET /api/exams/demo-fixed`

Trả một `ExamVersion` FIXED DEMO gồm assets, stimuli, sections, groups, questions và rich options. Projection student-safe xóa `answerKey` và `explanation` ở mọi câu. Endpoint chưa cần auth vì chỉ có fixture DEMO.

## `POST /api/imports`

Nhận raw ZIP với `Content-Type: application/zip` hoặc `application/octet-stream`, tối đa 25 MiB. Trả `201` cho job mới, `200` cho package trùng, `400` cho ZIP không an toàn/sai định dạng, `413` quá lớn, `415` thiếu body/type. Kết quả chứa status `READY_FOR_REVIEW | INVALID` và report lỗi/cảnh báo. Mặc định tắt khi `NODE_ENV=production`; bật rõ bằng `ENABLE_IMPORT_API=true` chỉ trong môi trường kiểm soát.

## `GET /api/imports/:id`

Trả metadata/report của import job; `400` nếu ID sai và `404` nếu không tồn tại. Không trả bytes nguồn hoặc nội dung answer trực tiếp.

Publish/import review, attempt/scoring/assembly APIs chưa triển khai; không được coi route dự kiến là API đang hoạt động.
