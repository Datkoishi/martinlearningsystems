# Project Skill — EduAssess

Đây là hướng dẫn nội bộ, không phải plugin Codex.

## Domain và ownership

- `Exam` giữ danh tính; `ExamVersion` là bản bất biến sau publish. `ExamItem` trỏ `QuestionVersion` hoặc `QuestionGroup`.
- `Question`/`Stimulus` giữ danh tính; version chứa rich content và trạng thái duyệt.
- `QuestionGroup` áp dụng `ATOMIC_ALL` hoặc `SPLIT_WITH_STIMULUS`.
- `MediaAsset` lưu metadata/hash/storage key; JSON chỉ tham chiếu asset ID.
- `ContentSource` + `UsageLicense` + `SourceProvenance` quyết định quyền FIXED/reuse/assembly.
- Answer key/explanation là dữ liệu server-side nhạy cảm; student payload không được chứa chúng trước reveal policy.

## FIXED và ASSEMBLED

FIXED giữ đúng cấu trúc version đã phát hành. ASSEMBLED lọc pool approved/licensed, giải constraints bằng seed, rồi tạo snapshot bất biến. Không gọi lại assembly khi reload. Cả hai đi qua cùng player và scoring service.

## Exam Package và rich content

Nguồn AI ngoài hệ thống phải vào ZIP staging gồm manifest, exam, questions, answers và assets. Không publish trực tiếp. Runtime nằm ở `backend/src/imports`: đọc ZIP lazy, áp giới hạn, lưu bản nguồn, validate rồi ghi `ImportJob`. Rich content dùng `{schemaVersion,nodes}`; chi tiết ở `RICH_CONTENT_SCHEMA.md`. Asset thiếu, answer key thiếu hoặc reference sai phải chặn publish.

Reviewer preview luôn được dựng lại từ ZIP nguồn đã lưu và dùng cùng renderer với student UI. Reviewer payload có answer key/lời giải nên chỉ được cấp qua reviewer guard; production hiện fail-closed. `TECHNICALLY_APPROVED` chỉ xác nhận package kỹ thuật, không thay thế `ACADEMIC_APPROVAL_PENDING` và không publish.

## Cách mở rộng

- Loại câu: thêm enum DB, validator/scorer, student renderer, reviewer renderer và test answer leakage.
- Rich block: cập nhật schema + server validator + renderer an toàn + mobile/a11y test + migration strategy.
- Assembly filter: thêm cột có index, blueprint schema, hard/soft constraint, error code và deterministic test.
- Rubric: version riêng, reviewer approval, audit và manual scoring; không dùng AI làm kết luận chính thức.

## Quy trình

1. Đọc `AGENTS.md` và bộ tài liệu resume; kiểm tra Git status.
2. Chọn một vertical slice nhỏ; ghi decision khi có giả định.
3. Kiểm tra quyền, tenant scope, dữ liệu trẻ em, version bất biến và audit trước khi code.
4. Code + happy/edge/negative test; chạy test/build thật.
5. Cập nhật docs/status/progress, review diff và secret, commit/push an toàn.

Done chỉ khi code thật, validation/permission phù hợp, test chạy, docs khớp và trạng thái Git được báo đúng. Lệnh chuẩn: `npm test --prefix backend`, `npm run build --prefix frontend`, `npm test`. Agent mới tiếp tục từ `PROGRESS.md` và `IMPLEMENTATION_STATUS.md`, không dựng lại app.
