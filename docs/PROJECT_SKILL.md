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

Assembly dùng metadata relational curriculum/topic/skill/difficulty/estimated/family. Chỉ QuestionVersion published trong graph FIXED non-formal, có provenance/license derivative hợp lệ mới vào pool. Quota là hard constraints; atomic group không được tách, split group phải mang stimulus; duplicate question/family bị chặn. Candidate order dùng seeded hash, run lưu engine/selection/snapshot hash. Mỗi run gắn immutable BlueprintVersion; creator không được tự duyệt, review bind hashes và chỉ APPROVED mới publish thành ExamVersion ASSEMBLED. Catalog/attempt chỉ đọc published snapshot, không chạy lại engine.

## Exam Package và rich content

Nguồn AI ngoài hệ thống phải vào ZIP staging gồm manifest, exam, questions, answers và assets. Không publish trực tiếp. Runtime nằm ở `backend/src/imports`: đọc ZIP lazy, áp giới hạn, lưu bản nguồn, validate rồi ghi `ImportJob`. Rich content dùng `{schemaVersion,nodes}`; chi tiết ở `RICH_CONTENT_SCHEMA.md`. Asset thiếu, answer key thiếu hoặc reference sai phải chặn publish.

Reviewer preview luôn được dựng lại từ ZIP nguồn đã lưu và dùng cùng renderer với student UI. Reviewer payload có answer key/lời giải nên chỉ được cấp qua authenticated `ACADEMIC_REVIEWER`/`SUPER_ADMIN`; Editor chỉ đọc metadata/report. Reviewer ID lấy từ session và creator không được tự review. `TECHNICALLY_APPROVED` chỉ mở academic gate; `ACADEMICALLY_APPROVED` mới cho phép publish.

Publish phải đọc và hash lại source ZIP, chạy validator lại, so canonical report hash và tạo mọi version/provenance/reference/publication trong một DB transaction. Retry job đã publish phải trả record cũ. Rich `assetId` và correct option references từ package phải đổi sang UUID nội bộ trước insert. Không cleanup source archive đã publish khi media còn dùng archive-backed storage key. `FORMAL_ASSESSMENT` luôn fail-closed nếu chưa có policy/approver riêng.

## Identity và quyền

Session là opaque token lưu trong cookie `HttpOnly`; DB chỉ lưu hash. Request ghi yêu cầu CSRF token bind với session. Password dùng scrypt và user chỉ được bootstrap qua password stdin. Không nhận user/reviewer ID hoặc role từ header/body client. Role hiện global; feature mới có tenant/class ownership phải thêm scope + negative IDOR tests trước khi mở dữ liệu thật.

## Production runtime

`backend/src/config.js` là gate typed/fail-fast: production bắt buộc HTTPS origin, secure cookie và DB password không mặc định; proxy hop phải khai đúng topology. `/api/live` chỉ phản ánh process, `/api/ready` phản ánh DB + trạng thái drain. Khi shutdown, readiness phải hạ trước khi đóng realtime/HTTP/pool và luôn có deadline. Frontend Nginx giữ CSP/security headers, `/healthz` và request limit tương thích API; không thêm CDN/third-party runtime nếu chưa đánh giá privacy.

Migration production đi qua `backend/scripts/migrate.js`: file `NNN_name.sql` liên tục, checksum bất biến, advisory lock và `schema_migrations` ledger. Mặc định skip seed DEMO. Schema hiện hữu chỉ được `--adopt-existing` sau backup/restore rehearsal và kiểm tra sentinel; không sửa file migration đã ghi ledger, không dùng `docker compose down -v` để xử lý lỗi. MySQL DDL có implicit commit, nên failure một phần phải dừng, restore bản sao hoặc repair có review trước khi retry.

Backup production đi qua `ops/backup`: DB dump và `import_data` archive là một set, checksum trước `READY`, concurrent run bị lock và retention chỉ xóa complete set hết hạn. Container health là signal cho backup success/age, không thay alert delivery. Restore check chỉ được chạy trên host/database cô lập có prefix guard + exact drop confirmation. Named volume local không phải off-site backup; deployment phải mã hóa, replicate, giới hạn quyền và diễn tập restore theo RPO/RTO.

## Catalog và attempt

Catalog chỉ đọc ExamVersion `PUBLISHED + non-formal`: FIXED dựng từ relational graph, ASSEMBLED đọc publication snapshot. Student projection phải loại answer key, explanation, scoring fields và asset chỉ dùng trong lời giải. Public asset phải có reference student-visible từ published FIXED graph hoặc ASSEMBLED snapshot và bytes phải khớp metadata hash/size.

Attempt đóng băng `student_snapshot_json` và `scoring_snapshot_json` riêng, hash canonical cả hai. API chỉ map student snapshot; query đọc luôn scope theo authenticated Student. Create yêu cầu CSRF + Idempotency-Key unique theo Student, retry trả record cũ trước khi đọc lại catalog.

Autosave phải dùng `baseRevision`, exact-operation replay và server ACK; stale client GET/merge rồi gửi key mới. Submit chỉ chấm response đã commit, tạo immutable score revision trong cùng transaction và không tạo thêm score/audit khi retry. Scoring rule phải có version. Public result luôn đi qua reveal mapper: PRACTICE final mới có correct answer; mock/diagnostic/pending không có; explanation/rubric không mở. Essay đã trả lời chờ manual scoring, không dùng AI làm kết luận.

## Cách mở rộng

- Loại câu: thêm enum DB, validator/scorer, student renderer, reviewer renderer và test answer leakage.
- Rich block: cập nhật schema + server validator + renderer an toàn + mobile/a11y test + migration strategy.
- Assembly filter: thêm cột có index, blueprint schema, hard/soft constraint, error code và deterministic test.
- Rubric: version riêng, reviewer approval, audit và manual scoring; không dùng AI làm kết luận chính thức.

## Quy trình

1. Đọc `AGENTS.md` và bộ tài liệu resume; kiểm tra Git status.
2. Chọn một vertical slice nhỏ; ghi decision khi có giả định.
3. Kiểm tra quyền, tenant scope, dữ liệu trẻ em, version bất biến và audit trước khi code.
4. Code + happy/edge/negative test; chạy test/build/image/runtime smoke thật khi thay đổi production lifecycle.
5. Cập nhật docs/status/progress, review diff và secret, commit/push an toàn.

Done chỉ khi code thật, validation/permission phù hợp, test chạy, docs khớp và trạng thái Git được báo đúng. Lệnh chuẩn: `npm test --prefix backend`, `npm run build --prefix frontend`, `npm test`. Agent mới tiếp tục từ `PROGRESS.md` và `IMPLEMENTATION_STATUS.md`, không dựng lại app.
