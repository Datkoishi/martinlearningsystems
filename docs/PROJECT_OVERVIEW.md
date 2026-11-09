# Tổng quan EduAssess

EduAssess là nền tảng đánh giá năng lực học sinh lớp 1–12, ưu tiên pilot lớp 5, 9 và 12. Người dùng mục tiêu gồm học sinh, phụ huynh, giáo viên, nhà trường, biên tập viên nội dung, reviewer học thuật và quản trị viên.

## Hai chế độ đề đã khóa

- `FIXED`: giữ nguyên version, section, thứ tự, dữ kiện chung, câu và scoring rule đã duyệt.
- `ASSEMBLED`: chọn câu đã duyệt từ nhiều nguồn theo blueprint/rights/seed, sau đó đóng băng snapshot. Cả hai dùng chung web player.

Nguồn (`origin_type`), chế độ (`exam_mode`) và mục đích (`purpose`) là ba khái niệm độc lập. Nội dung AI bên ngoài chỉ là đầu vào; luôn ở staging/review trước khi publish. Điểm số không đồng nghĩa với năng lực. Khi chưa đủ bằng chứng phải hiển thị `Chưa đủ bằng chứng`.

## Trạng thái hiện tại

Repo là modular monolith nhỏ: React frontend, Express backend, MySQL. Hệ thống hiện chứng minh dữ liệu rich content có version, import/review/publish, catalog chung FIXED/ASSEMBLED, immutable attempt, autosave/submit/scoring, manual essay/regrade theo assignment và conservative reveal. Assembly đã lọc pool published/licensed, giải quota deterministic, lưu technical run, quản lý immutable revision trên cùng Blueprint identity qua Editor/Reviewer queue + independent approval, rồi publish snapshot bất biến cho Student mà không reassemble. Assessment đã tách khỏi scoring: framework/threshold/coverage/guidance có version và independent approval, engine chỉ dùng score revision FINAL, thiếu coverage trả `Chưa đủ bằng chứng`, result chỉ mở owner interpretation. Runtime production dùng Node 24 LTS, fail-fast config, probes/drain, TLS edge, file-mounted secrets, migration ledger/runner, opt-in backup recovery set, S3-compatible media promotion và protected Prometheus/Alertmanager monitoring cho HTTP/object/backup. Full production Compose fixture smoke đã pass; deploy certificate/domain/webhook thật, encrypted off-site destination, bucket identity/CDN, tenant/class scope, Teacher reporting và framework học thuật production vẫn chưa hoàn thành. Formal assessment luôn khóa.
