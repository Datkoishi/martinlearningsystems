# API hiện tại

## `GET /api`

Trả identity của service.

## `GET /api/health`

`200` khi MySQL kết nối; `503` khi lỗi. Production không trả chi tiết lỗi DB.

## `GET /api/exams/demo-fixed`

Trả một `ExamVersion` FIXED DEMO gồm assets, stimuli, sections, groups, questions và rich options. Projection student-safe xóa `answerKey` và `explanation` ở mọi câu. Endpoint chưa cần auth vì chỉ có fixture DEMO.

## Identity/session

- `POST /api/auth/login`: nhận `{email, password}`, trả public user và đặt cookie session `HttpOnly` cùng cookie CSRF. Credential sai luôn trả thông báo chung; login bị giới hạn theo IP trong process.
- `GET /api/auth/me`: yêu cầu session hợp lệ, trả user/roles/expiry, `Cache-Control: no-store`.
- `POST /api/auth/logout`: yêu cầu session và `x-csrf-token`, revoke session phía server rồi xóa cookie.

Session token và CSRF token chỉ được lưu dạng SHA-256 trong DB. Request ghi có session cookie phải gửi header `x-csrf-token` khớp cookie CSRF và session. Cookie dùng `SameSite=Strict`; production HTTPS phải đặt `COOKIE_SECURE=true`.

## `POST /api/imports`

Yêu cầu `CONTENT_EDITOR` hoặc `SUPER_ADMIN` và CSRF. Nhận raw ZIP với `Content-Type: application/zip` hoặc `application/octet-stream`, tối đa 25 MiB. Trả `201` cho job mới, `200` cho package trùng, `400` cho ZIP không an toàn/sai định dạng, `413` quá lớn, `415` thiếu body/type. Kết quả chứa status `READY_FOR_REVIEW | INVALID` và report lỗi/cảnh báo. Mặc định tắt khi `NODE_ENV=production`; bật rõ bằng `ENABLE_IMPORT_API=true` sau khi hoàn tất cấu hình vận hành.

## `GET /api/imports/:id`

Yêu cầu `CONTENT_EDITOR`, `ACADEMIC_REVIEWER` hoặc `SUPER_ADMIN`. Trả metadata/report của import job; `400` nếu ID sai và `404` nếu không tồn tại. Không trả bytes nguồn hoặc nội dung answer trực tiếp.

## `GET /api/imports/:id/preview`

Yêu cầu `ACADEMIC_REVIEWER` hoặc `SUPER_ADMIN`. Chỉ cho package đã qua validation. Dựng reviewer payload từ ZIP nguồn, gồm source/rights, cấu trúc đề, answer key và explanation. `Cache-Control: no-store`; trả `409 IMPORT_NOT_PREVIEWABLE` cho package invalid.

## `GET /api/imports/:id/assets/:assetId`

Yêu cầu `ACADEMIC_REVIEWER` hoặc `SUPER_ADMIN`. Phục vụ đúng asset đã khai báo/validate trong package cho reviewer renderer; không nhận file path từ client và không cache.

## `GET|POST /api/imports/:id/reviews`

Yêu cầu `ACADEMIC_REVIEWER` hoặc `SUPER_ADMIN`; POST còn yêu cầu CSRF. GET trả immutable review history. POST nhận `{decision: "APPROVE|REJECT", reason}`; reviewer ID lấy từ session, không nhận từ client. Chỉ nhận job `READY_FOR_REVIEW`, trả `409` nếu đã có quyết định hoặc `SELF_REVIEW_FORBIDDEN` nếu reviewer là người nhập. APPROVE tạo `TECHNICALLY_APPROVED`, REJECT tạo `REJECTED`; không publish.

Academic approval/publish, attempt/scoring/assembly APIs chưa triển khai; không được coi route dự kiến là API đang hoạt động.
