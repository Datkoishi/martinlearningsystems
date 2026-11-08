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

Successful run lưu student/scoring snapshot riêng, selection/source manifest, engine version và hashes. API chỉ trả student-safe projection cho creator Editor/Admin. Run kỹ thuật không tự được coi là ExamVersion published hoặc giao cho Student; phải qua gate riêng đã triển khai ở D-012. Formal assessment vẫn khóa. Chi tiết ở ADR-0008.

## D-012 ASSEMBLED publication bind approval với frozen snapshots

Mỗi technical run có BlueprintVersion immutable. Reviewer độc lập duyệt đúng selection/source snapshot hashes; creator không được tự duyệt và decision không sửa. APPROVED mới được transactionally publish thành ExamVersion ASSEMBLED với student/scoring snapshots + hash riêng. Catalog/attempt đọc snapshot đã publish thay vì dựng lại selection; retry/reload không gọi engine.

ASSEMBLED nhiều nguồn nên `exams.source_id` nullable; provenance vẫn ở selected QuestionVersions/manifest, không gán giả một source. Reviewer asset chỉ mở khi thuộc selected scoring snapshot; public asset chỉ khi student-visible trong FIXED graph hoặc ASSEMBLED publication. Chi tiết ở ADR-0009.

## D-013 Runtime production fail-fast và probe tách biệt

Local Compose mặc định development để HTTP/cookie local còn dùng được; production không được kế thừa mặc định đó. Backend parse typed env trước khi listen và từ chối production nếu origin không HTTPS, cookie không Secure hoặc DB secret trống/mặc định. Liveness không phụ thuộc DB; readiness phụ thuộc DB và trạng thái draining. SIGTERM/SIGINT hạ readiness trước, đóng realtime/HTTP/pool trong deadline hữu hạn.

Nginx là static/reverse-proxy boundary: CSP/security headers, health riêng và upload 26 MiB phải khớp API 25 MiB. Font bên thứ ba bị loại để giảm outbound tracking surface. Đây không thay migration ledger, TLS edge, tenant scope, storage hay monitoring. Chi tiết ở ADR-0010.

## D-014 Migration ledger là release gate, adoption luôn fail-closed

Compose không mount SQL vào MySQL entrypoint; one-shot migrator phải hoàn tất trước backend. File migration có sequence liên tục và SHA-256 bất biến, runner giữ advisory lock theo database, mặc định skip seed DEMO và ghi operation vào `schema_migrations`. Database có schema nhưng không ledger chỉ được adopt sau backup/xác minh rõ bằng flag; sentinel thiếu, schema một phần hoặc later evidence đều bị chặn.

MySQL DDL có implicit commit nên ledger không giả định toàn bộ file rollback nguyên tử. Khi execution lỗi, operator phải dừng rollout và restore/repair có review thay vì sửa ledger. Backup/restore rehearsal trên database cô lập là release evidence; lịch/off-site retention/alerts vẫn là hạ tầng riêng. Chi tiết ở ADR-0011.

## D-015 Backup DB và source archive là một recovery set

Backup job dump MySQL single-transaction trước rồi archive `import_data` read-only, vì source/report được ghi trước ImportJob và không đổi sau publish. Mỗi set chỉ usable khi đủ manifest, ledger/schema invariants, SHA-256 và `READY`; lock chặn concurrent run, retention chỉ xóa complete set hết hạn. Health fail nếu failure mới hơn success hoặc backup quá tuổi để orchestrator alert.

Restore checker chỉ chạy trên database cô lập có prefix `eduassess_restore_` và exact drop confirmation, so ledger/invariants rồi cleanup. Compose profile là opt-in; named volume chỉ baseline local. Encryption, off-site replication, alert delivery và lịch restore theo RPO/RTO là deployment responsibility. Object storage promotion được tách thành OPS-001d để không gộp hai failure domain. Chi tiết ở ADR-0012.

## D-016 Object promotion giữ archive reference và cutover sau verification

`media_assets.storage_key` không bị rewrite: nó tiếp tục trỏ source ZIP bất biến để provenance/rollback/recovery còn độc lập với object store. Object key là content-address SHA-256; service verify archive, conditional PUT và GET/hash/size trước khi transactionally đổi read preference. Runtime OBJECT luôn kiểm bytes và có archive fallback theo flag. Event/audit ghi mỗi transition; rollback verify archive, không xóa object và chặn batch tự promote lại.

Upload nằm ngoài DB transaction nên lỗi DB sau PUT có thể để object content-addressed chưa referenced; đây là orphan an toàn, retry sẽ verify/reuse chứ không duplicate/overwrite. Không cleanup archive/object tự động trong slice này. Node production đồng thời nâng lên 24 LTS vì Node 20 đã EOL và AWS SDK báo vòng đời hỗ trợ. Bucket identity, CDN, replication, metrics và alert là deployment boundary tiếp theo. Chi tiết ở ADR-0013.

## D-017 Production edge/secrets và monitoring là overlay fail-closed

Base Compose tiếp tục phục vụ local development; production phải merge overlay có version requirement rõ, reset MySQL/backend host ports và plaintext DB secret, chỉ publish Nginx 80/443. Nginx terminate TLS 1.2/1.3 + HSTS; secret được mount bằng file. Network internal giữ DB/API/monitoring kín, edge network riêng mới cho phép Docker publish TLS frontend; backend/Alertmanager có egress riêng cho object store/webhook.

Metrics chạy listener riêng, Bearer token đọc từ file và không được proxy/public. HTTP labels chỉ là method/route template/status; object read và backup health có outcome hữu hạn. Backup ghi textfile atomically cho node_exporter; Prometheus dùng credential file và Alertmanager dùng webhook URL file. Readiness của stack/Alertmanager không thay bằng chứng notification delivery hoặc off-site durability trên target thật. Chi tiết ở ADR-0014.

## D-018 Blueprint revision là chuỗi tuyến tính, queue chỉ là safe projection

Blueprint content không sửa tại chỗ. Revision nhận full Blueprint + seed mới, chạy lại deterministic engine và nối version trên cùng identity chỉ khi latest version đã `REJECTED` hoặc `PUBLISHED`. `NEEDS_REVIEW`/`APPROVED` khóa revision để không sinh nhánh governance song song; source không còn latest bị từ chối. Transaction khóa identity/latest version, còn unique version number là guard cuối cùng. Exact idempotency retry vẫn trả run cũ.

Editor queue scope theo creator; Reviewer queue loại chính creator để phản ánh self-review gate. Queue chỉ trả metadata/review/publication summary và hashes, không trả student/scoring snapshot hay answer/explanation. Reviewer payload nhạy cảm chỉ tải sau khi chọn một run cụ thể. Schema 010 đã đủ nên không thêm migration chỉ để kích hoạt workflow này. Chi tiết ở ADR-0015.

## D-019 Assessment là interpretation có evidence gate, không phải đổi điểm sang nhãn

Scoring revision `FINAL` chỉ là nguồn evidence. Mỗi framework giữ purpose, allowed scoring versions, minimum attempts/items, skill/topic mapping, difficulty/task-type coverage, bốn threshold và guidance trong config versioned/hash; engine không hardcode giá trị threshold. Specialist tạo, Academic Reviewer khác người tạo bind một decision bất biến với config hash. Chỉ framework approved mới chạy.

Nếu bất kỳ global/indicator coverage gate nào thiếu, engine không gán level và trả đúng `Chưa đủ bằng chứng`. Evidence snapshot nội bộ + interpretation được hash bất biến; public Student projection loại raw evidence và answer payload, query owner-scoped. Teacher cross-student khóa tới khi có tenant/class ownership. Framework UI là DEMO, nên technical verification không được ghi thành academic approval cho nội dung thật. Chi tiết ở ADR-0016.
