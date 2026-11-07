# Tổng quan EduAssess

EduAssess là nền tảng đánh giá năng lực học sinh lớp 1–12, ưu tiên pilot lớp 5, 9 và 12. Người dùng mục tiêu gồm học sinh, phụ huynh, giáo viên, nhà trường, biên tập viên nội dung, reviewer học thuật và quản trị viên.

## Hai chế độ đề đã khóa

- `FIXED`: giữ nguyên version, section, thứ tự, dữ kiện chung, câu và scoring rule đã duyệt.
- `ASSEMBLED`: chọn câu đã duyệt từ nhiều nguồn theo blueprint/rights/seed, sau đó đóng băng snapshot. Cả hai dùng chung web player.

Nguồn (`origin_type`), chế độ (`exam_mode`) và mục đích (`purpose`) là ba khái niệm độc lập. Nội dung AI bên ngoài chỉ là đầu vào; luôn ở staging/review trước khi publish. Điểm số không đồng nghĩa với năng lực. Khi chưa đủ bằng chứng phải hiển thị `Chưa đủ bằng chứng`.

## Trạng thái hiện tại

Repo là modular monolith nhỏ: React frontend, Express backend, MySQL. Hệ thống hiện chứng minh dữ liệu rich content có version, import/review/publish, catalog FIXED, immutable attempt, autosave/submit/scoring và conservative reveal. Assembly foundation đã lọc pool published/licensed, giải quota deterministic theo seed và lưu immutable technical preview; chưa có blueprint approval/publish hay Student attempt từ ASSEMBLED. Tenant scope, manual essay/regrade và assessment interpretation chưa hoàn thành. Formal assessment luôn khóa.
