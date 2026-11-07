# Runbook

## Development

Sao chép `.env.example` thành `.env`, thay password; không commit/log `.env`. Chạy `docker compose up --build`, hoặc chỉ MySQL rồi chạy backend/frontend như README. Local HTTP dùng `COOKIE_SECURE=false`; mọi môi trường HTTPS phải đặt `COOKIE_SECURE=true`.

Tạo user bằng password đọc từ stdin, không truyền password trong argument hoặc lưu vào shell history:

```bash
read -s EDUASSESS_NEW_PASSWORD
printf '%s' "$EDUASSESS_NEW_PASSWORD" | docker compose exec -T backend npm run auth:create-user -- \
  --email reviewer@example.com --display-name "Academic Reviewer" --roles ACADEMIC_REVIEWER
unset EDUASSESS_NEW_PASSWORD
```

Role bootstrap hợp lệ: `STUDENT`, `CONTENT_EDITOR`, `ACADEMIC_REVIEWER`, `SUPER_ADMIN`; ưu tiên tách tài khoản Editor/Reviewer để enforce four-eyes. Sau khi có account và HTTPS/cookie đúng, đặt `ENABLE_IMPORT_API=true` theo quy trình rollout. `IMPORT_STORAGE_PATH` phải trỏ thư mục chỉ backend đọc/ghi; Docker dùng named volume `import_data`. Backup đồng bộ `users`, `user_roles`, `auth_sessions`, `audit_logs`, `import_jobs`, `import_reviews`, `import_publications`, `exam_attempts`, `attempt_responses`, `attempt_operations`, `attempt_score_revisions`, `exam_blueprints`, `exam_blueprint_versions`, `assembly_runs`, `assembly_reviews`, `assembly_publications` và volume này. Thiết lập retention cho session/attempt/operation/assembly trước production.

## Migration

Các file `database/init/*.sql` chỉ chạy tự động khi volume MySQL mới. Với DB đã có dữ liệu, backup và chạy riêng migration mới theo thứ tự bằng account có quyền; không dùng `docker compose down -v`. `002` additive, `003` seed DEMO idempotent, `004` technical review, `005` identity/session/audit, `006` academic publication, `007` attempt snapshots, `008` responses/scoring, `009` assembly metadata/runs và `010` blueprint review + ASSEMBLED publication. Migration 010 backfill run cũ thành BlueprintVersion 1 REJECTED vì thiếu frozen reviewer payload; tạo run mới để review/publish. Migration cũng nới `exams.source_id` nullable; kiểm tra ứng dụng không giả định source_id luôn có cho ASSEMBLED. Luôn thử restore/migration trên bản sao trước production; `ALTER TABLE` chỉ chạy một lần trên DB cũ.

## Kiểm tra và sự cố

- API degraded: kiểm tra MySQL health/host/port và secret ở môi trường, không log password.
- UI báo API chưa sẵn sàng: backend cổng 3000 và Vite proxy phải hoạt động.
- Asset missing: kiểm tra asset map/storage key/hash/reference; không thay bằng URL tạm.
- Import `INVALID`: dùng `report.errors[].path`; sửa package gốc rồi tạo package ID/version phù hợp. Upload byte-identical trả job cũ.
- `IMPORT_API_DISABLED`: chỉ bật flag trong môi trường kiểm soát; đây không phải lỗi hệ thống.
- `AUTH_REQUIRED`/`SESSION_INVALID`: đăng nhập lại; session đã revoke/hết hạn không được khôi phục bằng cookie cũ.
- `CSRF_INVALID`: kiểm tra frontend gửi `x-csrf-token` từ cookie cùng session; không tắt guard để xử lý nhanh.
- `FORBIDDEN`: kiểm tra role server-side trong `user_roles`; không cấp `SUPER_ADMIN` thay cho việc sửa scope.
- `SELF_REVIEW_FORBIDDEN`: dùng một Reviewer khác; không đổi creator hoặc sửa audit để bypass four-eyes.
- Technical/academic review là bất biến. Nếu reject, sửa nguồn và upload package mới; không update/delete `import_reviews`.
- `PACKAGE_HASH_CHANGED`, `VALIDATION_REPORT_CHANGED` hoặc `PACKAGE_REVALIDATION_FAILED`: cô lập job và kiểm tra archive/storage; không sửa hash/report/approval để bypass. Upload package/version mới sau khi xác minh.
- `FORMAL_ASSESSMENT_DISABLED`: đúng theo policy mặc định; không đổi purpose trực tiếp trong DB.
- Publish retry sau timeout là an toàn: cùng ImportJob trả `import_publications` cũ. Không chạy SQL thủ công để đổi job sang `PUBLISHED`.
- Source ZIP của job đã publish đang giữ asset bytes cho archive-backed storage key; không cleanup cho đến khi S3/object promotion và reference rewrite đã commit.
- Catalog không thấy đề: kiểm tra `ExamVersion`, mọi question/stimulus/asset reference đều `PUBLISHED`, mode `FIXED` và purpose không phải formal; không nới query để bỏ gate.
- `IDEMPOTENCY_KEY_REUSED`: client đã dùng cùng key cho đề khác; tạo key mới cho hành động mới, không sửa row cũ.
- `ATTEMPT_SNAPSHOT_INTEGRITY_FAILED`: cô lập attempt và kiểm tra DB/storage/audit; không cập nhật hash để bypass.
- Attempt retry sau timeout phải giữ cùng `Idempotency-Key`. Chủ sở hữu khác luôn nhận 404; không dùng query unscoped để hỗ trợ thủ công.
- `ATTEMPT_REVISION_CONFLICT`: GET attempt mới nhất, giữ local edits chưa ACK, merge theo question ID rồi PATCH với revision/key mới; không sửa revision trực tiếp trong DB.
- `ATTEMPT_NOT_EDITABLE`: attempt đã submit/void; client phải chuyển read-only và GET result, không reopen bằng SQL.
- Submit timeout: retry đúng payload với cùng key. Một score revision và một `ATTEMPT_SUBMITTED` audit là invariant; khác biệt phải được cô lập trước khi retry thủ công.
- `PENDING_MANUAL_SCORING` là trạng thái hợp lệ khi có essay đã trả lời. Không hiển thị earned total cuối, đáp án hoặc rubric; manual scoring/regrade chưa có trong slice hiện tại.
- Reveal sai purpose/state là incident dữ liệu nhạy cảm: tắt client path liên quan, giữ audit/operation rows và kiểm tra public result mapper; không trả raw `result_json` trực tiếp.
- `INCOMPATIBLE_BLUEPRINT`: sửa schema/quota; tổng từng quota dimension phải đúng section count. Không chỉnh DB để bypass validator.
- `INSUFFICIENT_POOL`: kiểm tra metadata, published FIXED membership, license validity/`derivative_assembly`, source diversity và quota. Không giảm quota âm thầm; thay blueprint có chủ đích hoặc nhập/duyệt thêm nguồn.
- `ASSEMBLY_SEARCH_LIMIT`: blueprint/pool gây search quá rộng; chia section/quota rõ hơn hoặc tối ưu engine có test, không tăng giới hạn tùy tiện trong production.
- `MISSING_ASSETS` hoặc `ASSEMBLY_SNAPSHOT_INTEGRITY_FAILED`: cô lập pool/run và kiểm tra published graph/hash; không sửa snapshot/hash để bypass.
- Retry assembly sau timeout phải giữ nguyên creator/key/blueprint/seed. Assembly run hiện chỉ là technical preview, không insert thủ công vào catalog hoặc tạo attempt.
- Assembly review: xác minh creator khác reviewer, hashes trong review khớp run và chỉ một decision. Không update review/status thủ công để mở publish.
- Assembly publish timeout: retry cùng run; invariant là một ExamVersion, một publication và một `ASSEMBLY_PUBLISHED` audit. Catalog integrity lỗi phải cô lập publication, không reassemble để thay snapshot.
- Reviewer explanation asset phải đi qua `/api/assemblies/:id/assets/:assetId`; không đổi sang public catalog URL. Public ASSEMBLED asset phải thực sự có trong `student_snapshot_json.assets`.
- Rollback slice: revert application commit; migration additive được giữ nguyên cho đến khi đánh giá dependency, không drop bảng tùy tiện.

Production deploy chưa cấu hình ngoài CI publish image GHCR. Không coi image publish là database migration hoặc production rollout.
