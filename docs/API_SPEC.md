# API hiện tại

## `GET /api`

Trả identity của service.

## `GET /api/health`

`200` khi MySQL kết nối; `503` khi lỗi. Production không trả chi tiết lỗi DB.

## `GET /api/exams/demo-fixed`

Trả một `ExamVersion` FIXED DEMO gồm assets, stimuli, sections, groups, questions và rich options. Projection student-safe xóa `answerKey` và `explanation` ở mọi câu. Endpoint chưa cần auth vì chỉ có fixture DEMO.

## Published catalog

- `GET /api/catalog/exams`: public, liệt kê metadata của `PUBLISHED + FIXED + non-formal`; cache 60 giây.
- `GET /api/catalog/exams/:id`: public, trả student-safe projection giữ nguyên section/group/question order. Không chứa `answerKey`, `explanation`, scoring snapshot hoặc asset chỉ được dùng trong lời giải.
- `GET /api/catalog/assets/:id`: public chỉ khi asset đã `PUBLISHED` và có reference trong phần student-visible của ít nhất một đề FIXED non-formal đã publish. Backend đọc entry từ source ZIP bất biến, kiểm tra size/SHA-256 và trả cache immutable; explanation-only asset nhận `404`.

Catalog fail-closed với ExamVersion/group/question/stimulus/asset thiếu hoặc chưa publish. `FORMAL_ASSESSMENT` không xuất hiện trong catalog.

## Attempts

### `POST /api/attempts`

Yêu cầu session có role `STUDENT`, CSRF header và `Idempotency-Key` 8–100 ký tự. Body:

```json
{ "examVersionId": "uuid" }
```

Chỉ nhận đề `PUBLISHED + FIXED + non-formal`. Lần đầu trả `201`; retry cùng `(student, Idempotency-Key, examVersionId)` trả `200`, `duplicate: true` và đúng attempt/snapshot cũ. Dùng cùng key cho đề khác trả `409 IDEMPOTENCY_KEY_REUSED`.

Response chỉ gồm `id`, `examVersionId`, `status`, `snapshot` student-safe, `snapshotSha256`, timestamps và `duplicate`. Scoring snapshot không bao giờ được trả. Server ghi riêng student/scoring JSON, hash canonical của cả hai và audit `ATTEMPT_STARTED` trong transaction.

### `GET /api/attempts/:id`

Yêu cầu role `STUDENT`; chỉ chủ sở hữu đọc được. Attempt không thuộc user cũng trả `404 ATTEMPT_NOT_FOUND` để tránh IDOR enumeration. Backend kiểm tra hash toàn vẹn trước khi trả và dùng `Cache-Control: no-store`.

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

## `POST /api/imports/:id/academic-reviews`

Yêu cầu `ACADEMIC_REVIEWER`/`SUPER_ADMIN` và CSRF. Nhận cùng decision/reason contract nhưng chỉ từ `TECHNICALLY_APPROVED`. Decision scope `ACADEMIC` là record bất biến thứ hai; APPROVE → `ACADEMICALLY_APPROVED`, REJECT → `ACADEMICALLY_REJECTED`. Creator không được tự duyệt.

## `POST /api/imports/:id/publish`

Yêu cầu `ACADEMIC_REVIEWER`/`SUPER_ADMIN` và CSRF. Chỉ publish job `ACADEMICALLY_APPROVED`; source hash, validation report và approval phải khớp. Trả `201` cho publication mới, `200` và `duplicate: true` khi retry job đã publish. Transaction ghi toàn bộ versioned content hoặc rollback; purpose `FORMAL_ASSESSMENT` trả `409 FORMAL_ASSESSMENT_DISABLED`.

Autosave answer, submit, scoring, reveal và assembly APIs chưa triển khai; không được coi route dự kiến là API đang hoạt động.
