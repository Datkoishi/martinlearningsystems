# ADR-0016 — Approved evidence framework before interpretation

- Status: Accepted
- Date: 2026-11-08

## Context

Attempt scoring đã tạo điểm/revision bất biến nhưng điểm không tự chứng minh năng lực. Việc đổi tỷ lệ điểm sang nhãn cố định sẽ bỏ qua số lượng bằng chứng, độ phủ độ khó/loại nhiệm vụ, purpose của đề và trách nhiệm duyệt học thuật. Teacher scope cũng chưa an toàn khi identity mới chỉ có global roles.

## Decision

Tạo assessment boundary riêng:

- `ASSESSMENT_SPECIALIST` author framework config 1.0.0 có stable identity, version và canonical SHA-256;
- allowed scoring versions/threshold/minimum/coverage/guidance nằm trong config, không hardcode giá trị threshold ở engine;
- Academic Reviewer độc lập ghi một decision bất biến bind hash; self-review bị cấm;
- chỉ dùng owned attempt có current score revision `FINAL` và grade/subject/source purpose khớp;
- chỉ gán bốn mức sau khi đủ attempts/items/difficulty/task-type coverage và scoring version/points hợp lệ;
- thiếu bất kỳ gate nào trả `INSUFFICIENT_EVIDENCE`, message `Chưa đủ bằng chứng`, level null;
- lưu evidence snapshot nội bộ và interpretation/hash bất biến, public chỉ trả interpretation owner-scoped;
- không mở Teacher aggregation trước tenant/class ownership và negative IDOR tests;
- formal assessment tiếp tục fail-closed.

## Consequences

Threshold và recommendation có audit/version/review, result có thể tái kiểm tra theo evidence tại thời điểm tạo, và scoring không bị trình bày sai thành phần trăm năng lực. Đổi lại, framework production phải được chuyên gia học thuật tạo/duyệt; DEMO config chỉ chứng minh kỹ thuật. Một lần MySQL integration phát hiện timestamp hash khác sau JSON round-trip, nên canonicalizer chuẩn hóa `Date` sang ISO trước hashing.
