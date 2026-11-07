# Tổng quan EduAssess

EduAssess là nền tảng đánh giá năng lực học sinh lớp 1–12, ưu tiên pilot lớp 5, 9 và 12. Người dùng mục tiêu gồm học sinh, phụ huynh, giáo viên, nhà trường, biên tập viên nội dung, reviewer học thuật và quản trị viên.

## Hai chế độ đề đã khóa

- `FIXED`: giữ nguyên version, section, thứ tự, dữ kiện chung, câu và scoring rule đã duyệt.
- `ASSEMBLED`: chọn câu đã duyệt từ nhiều nguồn theo blueprint/rights/seed, sau đó đóng băng snapshot. Cả hai dùng chung web player.

Nguồn (`origin_type`), chế độ (`exam_mode`) và mục đích (`purpose`) là ba khái niệm độc lập. Nội dung AI bên ngoài chỉ là đầu vào; luôn ở staging/review trước khi publish. Điểm số không đồng nghĩa với năng lực. Khi chưa đủ bằng chứng phải hiển thị `Chưa đủ bằng chứng`.

## Trạng thái hiện tại

Repo là modular monolith nhỏ: React frontend, Express backend, MySQL. Hệ thống hiện chứng minh dữ liệu rich content có version, section, stimulus/group, asset, math/table, API student-safe và renderer responsive. Import Lab đã có staging ZIP, validation, session/RBAC, technical + academic review và atomic publish sang versioned schema. Catalog đề FIXED, immutable attempt snapshot, autosave server-ACK, submit/scoring versioned và conservative reveal đã hoạt động. Tenant scope, manual essay/regrade, assembly và assessment interpretation chưa hoàn thành. Formal assessment luôn khóa.
