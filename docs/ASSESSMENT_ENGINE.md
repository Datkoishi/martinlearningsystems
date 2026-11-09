# Assessment Engine

## Boundary

Assessment và scoring là hai boundary độc lập. `eduassess-scoring-v1` chỉ tạo immutable `FINAL` score revision từ answer key đã đóng băng. `eduassess-assessment-v1` đọc các revision đó như bằng chứng, kiểm tra coverage theo framework đã duyệt rồi mới diễn giải. Tỷ lệ điểm bằng chứng không được trình bày như “phần trăm năng lực”.

Formal assessment vẫn bị khóa. Framework chỉ được lấy evidence từ `PRACTICE`, `MOCK_EXAM` hoặc `DIAGNOSTIC`, và mỗi framework chỉ gắn một `sourceExamPurpose` để không trộn mục đích đo.

## Framework 1.0.0

Assessment Specialist tạo config JSON có version/hash và stable identity. Config bắt buộc có:

- grade, subject, `frameworkPurpose` và `sourceExamPurpose`;
- allowlist scoring version được chấp nhận cho evidence;
- minimum completed attempts và tổng evidence items;
- một hoặc nhiều indicator, mỗi indicator có skill mapping không trùng nhau;
- minimum items, difficulty coverage và question/task-type coverage cho từng indicator;
- đúng bốn mức theo thứ tự `NEEDS_REINFORCEMENT`, `DEVELOPING`, `ACHIEVED`, `EXCEEDED`;
- threshold `minimumRatio` tăng nghiêm ngặt, bắt đầu từ 0;
- rule-based guidance cho thiếu evidence và từng mức;
- số evidence bổ sung tối thiểu trước lần đánh giá lại.

Giá trị threshold là nội dung học thuật trong versioned config, không hardcode trong engine. Code chỉ cố định khóa/thứ tự bốn mức và kiểm tra cấu hình có hợp lệ hay không.

## Approval

Framework mới luôn ở `NEEDS_REVIEW`. Academic Reviewer độc lập xem toàn bộ config/hash rồi ghi đúng một quyết định bất biến `APPROVE | REJECT`; creator không được tự duyệt. Review bind `config_sha256`. Chỉ framework `APPROVED` mới xuất hiện cho Student và được dùng tạo result.

Framework mẫu trên UI mang nhãn `[DEMO]` và không phải kết luận học thuật chính thức. Trước pilot/production, chuyên gia học thuật phải tạo và duyệt framework thật; trạng thái nội dung hiện là `ACADEMIC_APPROVAL_PENDING`.

## Evidence và interpretation

Repository chỉ đọc attempt của Student đang đăng nhập, trạng thái `SCORED`, current score revision `FINAL`, cùng grade/subject/purpose của framework. Metadata task lấy từ immutable QuestionVersion; public assessment result không chứa submitted answer, correct answer, scoring snapshot hay raw evidence snapshot.

Engine map evidence theo skill và optional topic. Trước khi chọn mức, nó kiểm tra đồng thời:

1. minimum completed attempts;
2. minimum mapped evidence items toàn framework;
3. minimum items từng indicator;
4. đủ difficulty coverage;
5. đủ question/task-type coverage.
6. score revision `FINAL`, scoring version nằm trong allowlist và awarded/max points hữu hạn, hợp lệ.

Chỉ khi toàn bộ gate của indicator đạt, tỷ lệ `awardedPoints / possiblePoints` mới được so với threshold đã duyệt. Nếu bất kỳ indicator nào thiếu coverage, result chung là `INSUFFICIENT_EVIDENCE`, không gán mức và thông điệp chính xác là **“Chưa đủ bằng chứng”**. Result kèm lý do thiếu, guidance và yêu cầu reassessment.

Evidence snapshot và interpretation được lưu bất biến cùng SHA-256 canonical; timestamp được chuẩn hóa ISO để hash ổn định qua JSON/MySQL round-trip. Idempotency unique theo Student; read luôn owner-scoped.

## Scope hiện tại

Student có thể chọn framework đã duyệt, tạo đánh giá lại từ evidence hiện có và chỉ đọc result của mình. Teacher cross-student/reporting chưa mở vì identity hiện chỉ có global role, chưa có tenant/school/class assignment scope. Không được thêm Teacher API đọc nhiều Student trước khi có ownership model và negative IDOR tests.
