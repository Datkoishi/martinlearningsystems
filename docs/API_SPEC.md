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

## `GET /api/imports/:id/preview`

Chỉ cho package đã qua validation. Dựng reviewer payload từ ZIP nguồn, gồm source/rights, cấu trúc đề, answer key và explanation. `Cache-Control: no-store`; trả `409 IMPORT_NOT_PREVIEWABLE` cho package invalid.

## `GET /api/imports/:id/assets/:assetId`

Phục vụ đúng asset đã khai báo/validate trong package cho reviewer renderer; không nhận file path từ client và không cache.

## `GET|POST /api/imports/:id/reviews`

GET trả immutable review history. POST nhận `{decision: "APPROVE|REJECT", reason}` và development header `x-reviewer-id`. Chỉ nhận job `READY_FOR_REVIEW`, trả `409` nếu đã có quyết định. APPROVE tạo `TECHNICALLY_APPROVED`, REJECT tạo `REJECTED`; không publish. Header development không phải auth và production import vẫn mặc định tắt.

Academic approval/publish, attempt/scoring/assembly APIs chưa triển khai; không được coi route dự kiến là API đang hoạt động.
