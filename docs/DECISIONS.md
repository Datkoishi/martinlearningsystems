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

## D-008 Academic approval tách biệt và DB publish nguyên tử

Technical và academic decision dùng hai immutable scope trên cùng ImportJob; cả hai bind package/report hash và creator không được tự duyệt. Publish revalidate archive rồi normalize sang UUID/version nội bộ trong một MySQL transaction, có `import_publications` làm idempotency/provenance marker. Media tạm thời dùng archive-backed storage key để tránh file copy ngoài transaction; source ZIP published phải được giữ. Formal assessment không được mở bởi gate này.

## D-009 Attempt đóng băng hai projection riêng

Khi Student bắt đầu, server lưu riêng projection hiển thị và projection chấm điểm thay vì tham chiếu live content hoặc trả answer payload xuống client. Hash canonical bao phủ cả hai; idempotency unique theo Student; owner scoping nằm trong repository query. Cách này giữ đúng đề/đáp án tại thời điểm bắt đầu và cho phép autosave/submit/scoring tiếp theo mà không phụ thuộc content version đang live. Formal assessment vẫn khóa; reveal được quyết định riêng ở D-010.

## D-010 Revision + operation log cho attempt, reveal theo purpose/state

Autosave dùng một global monotonic answer revision cho mỗi attempt và exact operation replay theo request hash, thay vì last-write-wins âm thầm. Client chỉ báo “đã lưu” sau server ACK; conflict phải reload/merge local dirty answers. Submit chấm đúng response map đã commit, tạo immutable score revision và retry không tạo side effect mới.

Scoring rule có version độc lập với assessment interpretation. PRACTICE chỉ mở correct answer sau trạng thái FINAL; MOCK_EXAM/DIAGNOSTIC và manual-pending chỉ có summary. Explanation và essay rubric chưa mở. Essay đã trả lời không AI-score mà chuyển manual pending. Formal assessment vẫn khóa. Chi tiết ở ADR-0007.

## D-011 Assembly dùng hard constraints + immutable technical run trước publish

Question pool không phải mọi QuestionVersion published: candidate phải có metadata assembly đầy đủ, thuộc published FIXED non-formal graph và có provenance/license derivative còn hiệu lực. Direct/atomic/split group được chuẩn hóa thành selection unit; exact quota, source diversity, points/time, duplicate family là hard constraints. Candidate order dùng SHA-256 của seed thay vì random DB; backtracking fail có cấu trúc thay vì phá blueprint.

Successful run lưu student/scoring snapshot riêng, selection/source manifest, engine version và hashes. API chỉ trả student-safe projection cho creator Editor/Admin. Run kỹ thuật chưa được coi là ExamVersion published hoặc giao cho Student; blueprint approval/publish là gate riêng. Formal assessment vẫn khóa. Chi tiết ở ADR-0008.
