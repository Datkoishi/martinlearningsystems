# Decisions

## 2026-11-07 — D-001 Giữ stack hiện có

Giữ React/Express/MySQL và modular monolith; repo quá nhỏ để đổi framework/ORM hoặc tách microservice.

## D-002 Slice đầu là rich FIXED DEMO

Đây là lát cắt nhỏ nhất chứng minh section/order, stimulus/group, image, math, table và answer separation. Không giả lập auth/scoring khi foundation chưa có.

## D-003 JSON + relational columns

Rich presentation ở JSON có version/validation; dữ liệu cần lọc (grade/subject/type/status/license) là cột/index. Answer key tách khỏi student projection.

## D-004 Source documentation

`SOURCE_DOC_NOT_FOUND`; sử dụng master prompt V3 do người dùng cung cấp. Nội dung DEMO không có giá trị học thuật/chính thức.

## D-005 Import fail-closed trước auth

Import API dùng feature flag và mặc định tắt ở production. ZIP nguy hiểm bị từ chối trước khi lưu; package hợp lệ về cấu trúc hoặc lỗi nghiệp vụ mới được giữ để review. Publish không nằm trong slice. Runtime lưu nguồn trên local persistent volume qua adapter; interface cho phép thay S3-compatible storage sau này.

## D-006 Technical review không phải academic approval

Decision bind SHA-256 của validation report, unique theo ImportJob và không thể sửa/ghi đè. Reviewer identity lấy từ authenticated session; creator bị cấm tự review. APPROVE chỉ đổi sang `TECHNICALLY_APPROVED`; không tạo nội dung live và không cho phép gọi `PUBLISHED`. Academic approval là gate riêng.

## D-007 Opaque server session cho backoffice đầu tiên

Dùng session token ngẫu nhiên trong cookie `HttpOnly`, CSRF token bind với session và global role guard phía server. DB chỉ lưu token hash; password dùng scrypt. Lựa chọn này cho phép revoke tức thời và không đưa claims/role có tuổi thọ dài xuống client. Tenant scope, MFA/recovery và distributed rate limiting được để thành hardening riêng trước public production.
