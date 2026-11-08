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

## Production runtime gate

Compose local mặc định `NODE_ENV=development`. Public production phải inject secret từ môi trường/secret manager và đặt đồng thời:

```text
NODE_ENV=production
CLIENT_ORIGIN=https://<origin-chính-xác>
COOKIE_SECURE=true
MYSQL_PASSWORD=<secret-không-mặc-định>
TRUST_PROXY=<số-proxy-hop-tin-cậy>
SHUTDOWN_GRACE_MS=10000
```

Backend fail-fast trước khi listen nếu enum/boolean/integer sai, origin production không HTTPS, cookie không Secure hoặc DB password trống/giá trị mẫu. Không đặt `TRUST_PROXY=1` nếu backend còn được truy cập trực tiếp từ Internet; production phải giới hạn network để chỉ reverse proxy tin cậy gọi backend.

- Liveness: `GET /api/live`, không chạm DB.
- Readiness: `GET /api/ready`, chỉ 200 khi chưa draining và DB kết nối.
- Frontend/Nginx: `GET /healthz`; upload limit 26 MiB cho API ZIP tối đa 25 MiB.
- SIGTERM/SIGINT: readiness chuyển 503, đóng Socket.IO/HTTP/pool; orchestrator phải có termination grace lớn hơn `SHUTDOWN_GRACE_MS` (Compose hiện 15 giây cho grace 10 giây).

Nginx áp CSP và security headers cho UI, đồng thời dùng system font để không gửi IP/user-agent của trẻ em sang font CDN. TLS vẫn phải terminate tại edge/load balancer bên ngoài cấu hình repo hiện tại.

## Migration

Compose không mount SQL vào MySQL entrypoint. Service một lần `migrate` lấy advisory lock theo database, kiểm tra sequence/checksum trong `schema_migrations`, áp dụng migration còn thiếu rồi mới cho backend khởi động. Kiểm tra độc lập:

```bash
docker compose up -d mysql
docker compose run --rm migrate npm run db:migrate:status
```

Database mới dùng `docker compose up --build`; migration `003_demo_fixed_exam.sql` được ghi `SKIPPED` theo mặc định. Chỉ trên database demo mới hoàn toàn, trước lần migrate đầu tiên, dùng:

```bash
docker compose up -d mysql
docker compose run --rm migrate npm run db:migrate -- --include-demo
docker compose up -d
```

Với volume đã tồn tại từ trước khi có ledger, lần khởi động đầu tiên sẽ fail-closed bằng `MIGRATION_EXISTING_SCHEMA_UNTRACKED`. Không xóa volume. Backup và restore thử trên bản sao trước, kiểm tra ứng dụng/schema, rồi adopt đúng một lần:

```bash
docker compose up -d mysql
docker compose run --rm migrate npm run db:migrate:status
docker compose run --rm migrate npm run db:migrate -- --adopt-existing
docker compose up -d
```

Adoption chỉ ghi nhận prefix migration có sentinel schema đầy đủ; schema áp dụng một phần hoặc có dấu vết migration sau sẽ bị từ chối. Migration `003` đã hiện diện trong schema cũ được ghi `ADOPTED`; nếu không có dữ liệu demo thì được ghi `SKIPPED`. Không dùng `--adopt-existing` để bỏ qua lỗi trên database mới hoặc schema chưa hiểu rõ.

Mỗi migration mới phải có tên `NNN_name.sql`, sequence liên tục và chỉ additive/backward-compatible trong rollout tương ứng. Tuyệt đối không sửa, đổi tên hoặc xóa file đã có trong ledger: checksum/sequence drift làm runner dừng. Retry sau lần chạy thành công là no-op. MySQL DDL có implicit commit, nên migration lỗi giữa chừng có thể để lại schema một phần; dừng rollout, giữ log, restore bản sao hoặc repair có review rồi mới retry, không tự sửa ledger.

`001`–`010` giữ lịch sử schema hiện tại; `011_migration_ledger.sql` tạo ledger và bootstrap checksum cho hệ thống từng chạy qua entrypoint cũ. Migration 010 backfill run cũ thành BlueprintVersion 1 `REJECTED` vì thiếu frozen reviewer payload và nới `exams.source_id` nullable cho ASSEMBLED nhiều nguồn.

## Backup và restore rehearsal

Trước migration/deploy có thay đổi dữ liệu, tạo dump bằng account backup tối thiểu quyền, truyền password qua secret environment thay vì argument. Ví dụ trên host có MySQL client:

```bash
read -s EDUASSESS_DB_PASSWORD
export MYSQL_PWD="$EDUASSESS_DB_PASSWORD"
mysqldump --host=<db-host> --port=3306 --user=<backup-user> \
  --single-transaction --routines --triggers --hex-blob --set-gtid-purged=OFF \
  <database> > eduassess-before-migration.sql
sha256sum eduassess-before-migration.sql
unset MYSQL_PWD EDUASSESS_DB_PASSWORD
```

Lưu dump đã mã hóa ngoài máy ứng dụng, hạn chế quyền đọc và ghi checksum vào change record. Snapshot/backup volume `import_data` trong cùng recovery point vì source ZIP published còn là nguồn asset; dump DB đơn lẻ chưa đủ khôi phục hệ thống.

Restore dump vào database cô lập, không ghi đè production. Sau restore: chạy `db:migrate:status` trỏ vào database bản sao; so số table/row quan trọng, toàn bộ ledger version/checksum, publication/attempt/audit counts và sample hash; sau đó chạy migration trên bản sao rồi smoke API/readiness. Chỉ rollout khi restore đọc được và các invariant khớp. Ghi RPO/RTO, vị trí artifact, checksum, thời gian restore và người xác nhận; xóa an toàn bản sao sau thời hạn kiểm thử.

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
- `MIGRATION_LOCK_TIMEOUT`: một migrator khác đang giữ advisory lock; kiểm tra deployment/job đang chạy, không tăng timeout để chạy song song.
- `MIGRATION_CHECKSUM_DRIFT`/`MIGRATION_SEQUENCE_DRIFT`/`MIGRATION_FILE_MISSING`: source deploy không khớp lịch sử; dừng rollout và phục hồi đúng artifact, không sửa ledger.
- `MIGRATION_PARTIALLY_APPLIED`/`MIGRATION_SCHEMA_INCONSISTENT`: cô lập database, đối chiếu backup và migration; MySQL DDL có thể đã commit từng phần. Không tiếp tục backend cho đến khi restore/repair được review.
- `MISSING_ASSETS` hoặc `ASSEMBLY_SNAPSHOT_INTEGRITY_FAILED`: cô lập pool/run và kiểm tra published graph/hash; không sửa snapshot/hash để bypass.
- Retry assembly sau timeout phải giữ nguyên creator/key/blueprint/seed. Assembly run hiện chỉ là technical preview, không insert thủ công vào catalog hoặc tạo attempt.
- Assembly review: xác minh creator khác reviewer, hashes trong review khớp run và chỉ một decision. Không update review/status thủ công để mở publish.
- Assembly publish timeout: retry cùng run; invariant là một ExamVersion, một publication và một `ASSEMBLY_PUBLISHED` audit. Catalog integrity lỗi phải cô lập publication, không reassemble để thay snapshot.
- Reviewer explanation asset phải đi qua `/api/assemblies/:id/assets/:assetId`; không đổi sang public catalog URL. Public ASSEMBLED asset phải thực sự có trong `student_snapshot_json.assets`.
- Rollback slice: revert application commit; migration additive được giữ nguyên cho đến khi đánh giá dependency, không drop bảng tùy tiện.

Production deploy chưa cấu hình ngoài CI publish image GHCR. Image backend chứa runner + SQL và Compose có migration gate, nhưng CI publish image không tự rollout database. Rehearsal thủ công đã pass; backup theo lịch, retention, alert restore-failure, TLS/secret deployment và metrics vẫn phải được cấu hình ở hạ tầng đích.
