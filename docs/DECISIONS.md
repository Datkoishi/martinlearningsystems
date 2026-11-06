# Decisions

## 2026-11-07 — D-001 Giữ stack hiện có

Giữ React/Express/MySQL và modular monolith; repo quá nhỏ để đổi framework/ORM hoặc tách microservice.

## D-002 Slice đầu là rich FIXED DEMO

Đây là lát cắt nhỏ nhất chứng minh section/order, stimulus/group, image, math, table và answer separation. Không giả lập auth/scoring khi foundation chưa có.

## D-003 JSON + relational columns

Rich presentation ở JSON có version/validation; dữ liệu cần lọc (grade/subject/type/status/license) là cột/index. Answer key tách khỏi student projection.

## D-004 Source documentation

`SOURCE_DOC_NOT_FOUND`; sử dụng master prompt V3 do người dùng cung cấp. Nội dung DEMO không có giá trị học thuật/chính thức.
