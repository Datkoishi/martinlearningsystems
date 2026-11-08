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

Production image/CI dùng Node 24 LTS; không deploy bằng Node 20 EOL. Compose local mặc định `NODE_ENV=development`. Public production phải inject secret từ môi trường/secret manager và đặt đồng thời:

```text
NODE_ENV=production
CLIENT_ORIGIN=https://<origin-chính-xác>
COOKIE_SECURE=true
MYSQL_PASSWORD_FILE=/run/secrets/mysql_password
TRUST_PROXY=<số-proxy-hop-tin-cậy>
SHUTDOWN_GRACE_MS=10000
```

Backend fail-fast trước khi listen nếu enum/boolean/integer sai, origin production không HTTPS, cookie không Secure hoặc DB password trống/giá trị mẫu. Không đặt `TRUST_PROXY=1` nếu backend còn được truy cập trực tiếp từ Internet; production phải giới hạn network để chỉ reverse proxy tin cậy gọi backend.

- Liveness: `GET /api/live`, không chạm DB.
- Readiness: `GET /api/ready`, chỉ 200 khi chưa draining và DB kết nối.
- Frontend/Nginx: `GET /healthz`; upload limit 26 MiB cho API ZIP tối đa 25 MiB.
- SIGTERM/SIGINT: readiness chuyển 503, đóng Socket.IO/HTTP/metrics listener/pool; orchestrator phải có termination grace lớn hơn `SHUTDOWN_GRACE_MS` (Compose hiện 15 giây cho grace 10 giây).

Nginx áp CSP và security headers cho UI, đồng thời dùng system font để không gửi IP/user-agent của trẻ em sang font CDN. Overlay production terminate TLS 1.2/1.3 ngay tại Nginx; nếu dùng load balancer phía trước, vẫn giữ hop count/network allowlist đúng topology và không mở backend trực tiếp.

## Production Compose: TLS, secrets và monitoring

Yêu cầu Docker Compose 2.24.4+ vì overlay dùng `!reset`/`!override` để xóa port và plaintext secret từ file base. Tạo env file ngoài repo từ `ops/production/production.env.example`; không dùng `.env` development cho deploy. Tất cả đường dẫn secret phải là file host tuyệt đối, quyền đọc tối thiểu cho Docker daemon:

- `MYSQL_PASSWORD_SECRET_FILE`, `MYSQL_ROOT_PASSWORD_SECRET_FILE`: secret một dòng;
- `TLS_CERTIFICATE_SECRET_FILE`, `TLS_PRIVATE_KEY_SECRET_FILE`: certificate chain/private key PEM;
- `METRICS_BEARER_TOKEN_SECRET_FILE`: token ngẫu nhiên một dòng, ít nhất 32 ký tự;
- `ALERT_WEBHOOK_URL_SECRET_FILE`: HTTPS webhook URL một dòng của notification receiver.

Validate merge và certificate trước deploy:

```bash
docker compose --env-file /secure/eduassess/production.env \
  -f docker-compose.yml -f docker-compose.production.yml \
  --profile backup config --quiet

docker run --rm --add-host backend:127.0.0.1 --entrypoint=nginx \
  -v "$PWD/ops/production/nginx.production.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v /secure/eduassess/tls-certificate.pem:/run/secrets/tls_certificate:ro \
  -v /secure/eduassess/tls-private-key.pem:/run/secrets/tls_private_key:ro \
  nginx:1.27-alpine -t
```

Deploy và kiểm tra edge:

```bash
docker compose --env-file /secure/eduassess/production.env \
  -f docker-compose.yml -f docker-compose.production.yml \
  --profile backup up -d --build

curl -I http://<production-host>/
curl --fail https://<production-host>/healthz
curl --fail https://<production-host>/api/ready
```

HTTP phải trả 308 sang HTTPS; HTTPS phải dùng certificate hợp lệ, trả HSTS/CSP và readiness 200. MySQL/backend/metrics/Prometheus/Alertmanager không được có host port. `migrate` phải exit 0; `mysql`, `backend`, `frontend`, `backup` phải healthy. Dừng rollout nếu bất kỳ điều kiện nào sai.

Backend metrics chỉ listen trong network tại `backend:9464`. `/metrics` không có token phải trả 401; Prometheus dùng `authorization.credentials_file`. Node exporter chỉ bật textfile collector và đọc `backup_data:/backups/metrics` read-only. Các signal chính:

- `eduassess_http_requests_total` và duration histogram, route là template không chứa UUID;
- `eduassess_backend_ready`, `eduassess_errors_total`;
- `eduassess_published_asset_reads_total{outcome="archive|object|fallback|failure"}`;
- `eduassess_backup_healthy`, age, success/verify/failure/restore timestamps.

Prometheus nạp 8 alert rules cho target down, HTTP 5xx, object fallback/failure, backup down/unhealthy/stale và restore rehearsal stale. Alertmanager ready không chứng minh webhook nhận được notification: trước go-live phải kích hoạt alert fixture có kiểm soát, xác nhận receiver nhận/resolved message rồi ghi bằng chứng change record. Không publish Prometheus/Alertmanager UI ra Internet; truy cập tạm phải qua SSH tunnel/VPN có audit.

Rotation:

1. Ghi secret/certificate mới bằng atomic replace ở secret manager/host.
2. Với DB password, rotate MySQL credential và file trong cùng maintenance procedure; kiểm tra migrator/readiness trên staging trước.
3. Với metrics token, cập nhật file rồi recreate đồng thời `backend` và `prometheus`; khoảng scrape lỗi ngắn phải được dự kiến.
4. Với TLS hoặc webhook, recreate `frontend` hoặc `alertmanager`, sau đó kiểm certificate/`/-/ready` và test delivery.
5. Không log/cat secret vào ticket; chỉ ghi version/fingerprint, thời gian và actor.

Rollback overlay/application không được dùng `down -v`. Giữ migration backward-compatible, giữ archive fallback và recovery volumes; deploy image/config trước đó rồi xác minh `/api/ready`, metrics và alert. Certificate hết hạn/sai key là stop-ship, không rollback sang HTTP.

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

`001`–`010` giữ lịch sử schema domain; `011_migration_ledger.sql` tạo ledger và bootstrap checksum cho hệ thống từng chạy qua entrypoint cũ. Migration 010 backfill run cũ thành BlueprintVersion 1 `REJECTED` vì thiếu frozen reviewer payload và nới `exams.source_id` nullable cho ASSEMBLED nhiều nguồn. Migration 012 thêm state/key/timestamps cho media và immutable storage event ledger; mọi row cũ mặc định `ARCHIVE` nên migration additive không đổi đường đọc khi object storage còn tắt.

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

## Backup scheduler, retention và restore alert

Compose profile `backup` chạy `ops/backup/backup-loop.sh`; mặc định tạo backup ngay khi start rồi lặp mỗi 86.400 giây. Mỗi set hoàn chỉnh gồm `database.sql`, `imports.tar.gz`, `ledger.tsv`, `invariants.tsv`, `manifest.env`, `SHA256SUMS` và marker `READY`. Dump DB chạy trước archive volume: source ZIP/report được ghi trước ImportJob và bất biến sau đó, nên mọi reference trong DB snapshot đã có trên volume; file mới hơn snapshot có thể chỉ là dữ liệu dư an toàn khi restore.

```bash
docker compose --profile backup up -d backup
docker compose --profile backup ps backup
docker compose --profile backup logs --no-log-prefix backup
```

Biến vận hành: `BACKUP_INTERVAL_SECONDS`, `BACKUP_MAX_AGE_SECONDS`, `BACKUP_RETENTION_DAYS`, `BACKUP_STALE_LOCK_SECONDS`, `BACKUP_HEALTH_START_PERIOD`. `BACKUP_MAX_AGE_SECONDS` phải ít nhất bằng interval; health fail nếu chưa có backup/verify, backup quá tuổi hoặc lần failure mới hơn lần success. Cấu hình alert của hạ tầng dựa vào health này. Nếu đặt `BACKUP_RUN_ON_START=false`, start-period phải dài hơn thời gian chờ tới lần đầu; mặc định `true` an toàn hơn.

Job dùng lock directory có stale timeout; concurrent run fail-closed. Retention chỉ xóa directory `backup-*` có `READY`, không xóa set mới nhất đang tạo. Kiểm tra thủ công set mới nhất:

```bash
docker compose --profile backup run --rm --no-deps \
  --entrypoint /ops/backup/verify-backup.sh backup
```

`backup_data` mặc định là named volume cùng host, chỉ phù hợp development/smoke. Production phải thay bằng encrypted/off-site volume hoặc agent đồng bộ bất biến, khóa quyền đọc và cảnh báo khi replication thất bại. Không copy password vào artifact; script dùng `MYSQL_PWD` nội bộ và manifest không chứa credential.

Restore rehearsal phải chạy trên MySQL cô lập bằng account chỉ có quyền trên database rehearsal. Guard yêu cầu tên bắt đầu `eduassess_restore_` và xác nhận drop khớp chính xác; script verify checksum, restore, so ledger/schema invariants, xóa database rehearsal rồi mới ghi success marker. Nếu lỗi giữa chừng, exit trap vẫn thử cleanup và job không được ghi success:

```bash
export RESTORE_MYSQL_HOST=<restore-host-cô-lập>
export RESTORE_MYSQL_PORT=3306
export RESTORE_MYSQL_USER=<restore-check-user>
read -s RESTORE_MYSQL_PASSWORD
export RESTORE_MYSQL_PASSWORD
export RESTORE_CHECK_DATABASE=eduassess_restore_weekly
export RESTORE_CHECK_CONFIRM_DROP="$RESTORE_CHECK_DATABASE"

docker compose --profile backup run --rm --no-deps \
  -e RESTORE_MYSQL_HOST -e RESTORE_MYSQL_PORT -e RESTORE_MYSQL_USER \
  -e RESTORE_MYSQL_PASSWORD -e RESTORE_CHECK_DATABASE -e RESTORE_CHECK_CONFIRM_DROP \
  --entrypoint /ops/backup/restore-check.sh backup

unset RESTORE_MYSQL_PASSWORD RESTORE_MYSQL_HOST RESTORE_MYSQL_PORT RESTORE_MYSQL_USER
unset RESTORE_CHECK_DATABASE RESTORE_CHECK_CONFIRM_DROP
```

Lập lịch restore rehearsal ít nhất theo RPO/RTO đã duyệt và alert nếu `last_restore_success_epoch` quá hạn. Health mặc định chỉ phản ánh backup + checksum verification hằng ngày; alert restore rehearsal phải do orchestrator/monitor đọc marker hoặc exit status của job định kỳ.

## Object storage promotion và rollback

Bucket phải tồn tại trước; ứng dụng không tự tạo bucket. Dùng workload identity/instance role khi có thể; nếu dùng static credential thì luôn cấu hình cả `OBJECT_STORAGE_ACCESS_KEY_ID` và `OBJECT_STORAGE_SECRET_ACCESS_KEY` qua secret manager, không commit/log. Quyền tối thiểu cho prefix cấu hình là đọc/ghi object; operator/deployment giữ quyền bucket policy riêng. Endpoint AWS mặc định để trống; custom S3-compatible production bắt buộc HTTPS.

```text
OBJECT_STORAGE_ENABLED=true
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=<bucket>
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_KEY_PREFIX=eduassess/media
OBJECT_STORAGE_FORCE_PATH_STYLE=false
OBJECT_STORAGE_ARCHIVE_FALLBACK=true
MEDIA_PROMOTION_ACTOR=<deployment-or-operator-id>
```

Rollout theo thứ tự, không bỏ qua backup/restore gate:

1. Tạo recovery set `READY`, xác minh off-site copy và rehearsal restore gần nhất.
2. Deploy migration 012 + code trong khi `OBJECT_STORAGE_ENABLED=false`; kiểm tra backend/readiness và asset archive cũ.
3. Inject endpoint/bucket/identity, bật object storage nhưng giữ `OBJECT_STORAGE_ARCHIVE_FALLBACK=true`; restart/drain bình thường.
4. Kiểm tra và dry-run. Dry-run đọc + verify archive nhưng không PUT/cutover:

```bash
docker compose exec -T backend npm run media:status
docker compose exec -T backend npm run media:promote -- --limit 100 --dry-run
```

5. Promote batch nhỏ, kiểm tra status/log, sample asset qua public và protected routes, rồi tăng batch có kiểm soát:

```bash
docker compose exec -T backend npm run media:promote -- --limit 100
docker compose exec -T backend npm run media:status
```

CLI chỉ chọn `PUBLISHED + ARCHIVE + chưa rollback`. Source archive phải khớp metadata; object key là content-address SHA-256; conditional PUT không overwrite key có bytes khác; GET sau PUT phải khớp hash/size trước transaction cutover. Retry cùng asset là no-op đã verify. `media_asset_storage_events` và `audit_logs` phải tăng đúng một lần cho mỗi transition.

Rollback một asset khi object delivery có sự cố:

```bash
docker compose exec -T backend npm run media:rollback -- --asset-id <uuid>
docker compose exec -T backend npm run media:status
```

Rollback chỉ commit sau khi đọc lại archive và khớp hash/size; object không bị xóa. Asset đã rollback bị loại khỏi batch để tránh vòng lặp. Chỉ sau điều tra và xác nhận mới promote lại rõ ràng bằng `npm run media:promote -- --asset-id <uuid> --allow-rolled-back`.

Giữ `OBJECT_STORAGE_ARCHIVE_FALLBACK=true` qua cửa sổ quan sát/recovery đã duyệt. Chỉ tắt fallback khi mọi asset active đã sample/monitor, bucket durability/replication/alert/backup được xác nhận và rollback rehearsal pass. Việc tắt fallback không cho phép xóa `import_data`: source ZIP còn là recovery/provenance artifact và backup set hiện bao gồm nó. CDN không nằm trong slice này; không public bucket tùy tiện, không đổi app sang URL object trực tiếp.

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
- Source ZIP của job đã publish là provenance/recovery source; không cleanup kể cả sau object promotion nếu chưa có retention policy, backup và rollback design thay thế được duyệt.
- `OBJECT_STORAGE_DISABLED`: bật config/bucket/identity trước promote; không đổi DB state thủ công.
- `ARCHIVE_ASSET_INTEGRITY_FAILED`: dừng batch/rollback, cô lập source và khôi phục từ recovery set đã verify; không sửa hash để ép pass.
- `OBJECT_KEY_COLLISION`, `OBJECT_UPLOAD_VERIFICATION_FAILED` hoặc `OBJECT_ASSET_INTEGRITY_FAILED`: dừng promotion, giữ archive fallback, kiểm tra bucket/prefix/replication; không overwrite/delete object trước khi giữ bằng chứng.
- `MEDIA_ASSET_ROLLED_BACK`: đúng guard chống tự promote lại; chỉ dùng `--allow-rolled-back` sau incident review.
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
- Backup unhealthy: kiểm tra `backup` logs/status, MySQL, quyền đọc `import_data`, dung lượng/destination và lần failure mới nhất. Không xóa lock nếu chưa xác nhận không còn job; stale lock chỉ được script dọn sau timeout cấu hình.
- Backup checksum/restore mismatch: cô lập set, giữ artifact/log, alert operator và dùng set `READY` trước đó đã verify; không sửa `SHA256SUMS`, ledger hoặc invariant để ép pass.
- `MISSING_ASSETS` hoặc `ASSEMBLY_SNAPSHOT_INTEGRITY_FAILED`: cô lập pool/run và kiểm tra published graph/hash; không sửa snapshot/hash để bypass.
- Retry assembly sau timeout phải giữ nguyên creator/key/blueprint/seed. Assembly run hiện chỉ là technical preview, không insert thủ công vào catalog hoặc tạo attempt.
- Assembly review: xác minh creator khác reviewer, hashes trong review khớp run và chỉ một decision. Không update review/status thủ công để mở publish.
- Assembly publish timeout: retry cùng run; invariant là một ExamVersion, một publication và một `ASSEMBLY_PUBLISHED` audit. Catalog integrity lỗi phải cô lập publication, không reassemble để thay snapshot.
- Reviewer explanation asset phải đi qua `/api/assemblies/:id/assets/:assetId`; không đổi sang public catalog URL. Public ASSEMBLED asset phải thực sự có trong `student_snapshot_json.assets`.
- Rollback slice: revert application commit; migration additive được giữ nguyên cho đến khi đánh giá dependency, không drop bảng tùy tiện.

CI publish image GHCR nhưng không tự deploy. Repo đã có production overlay cho migration, TLS/file secrets, backup, metrics và alert rules; full-stack fixture smoke không thay target rollout. Hạ tầng đích vẫn phải cung cấp domain/certificate/secret files, encrypted off-site destination, webhook delivery drill, lịch restore rehearsal, bucket identity/CDN và tenant boundary trước go-live.
