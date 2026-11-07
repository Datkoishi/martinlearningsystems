# Data model

Migration nền tảng: `database/init/002_eduassess_foundation.sql`; attempt snapshot: `database/init/007_attempt_snapshots.sql`.

```mermaid
erDiagram
  CONTENT_SOURCE ||--o{ USAGE_LICENSE : grants
  CONTENT_SOURCE ||--o{ EXAM : owns
  EXAM ||--o{ EXAM_VERSION : versions
  EXAM_VERSION ||--o{ EXAM_SECTION : contains
  EXAM_SECTION ||--o{ EXAM_ITEM : orders
  QUESTION ||--o{ QUESTION_VERSION : versions
  QUESTION_VERSION ||--o{ QUESTION_OPTION : contains
  STIMULUS ||--o{ STIMULUS_VERSION : versions
  STIMULUS_VERSION o|--o{ QUESTION_GROUP : supports
  QUESTION_GROUP ||--o{ QUESTION_GROUP_ITEM : contains
  QUESTION_VERSION ||--o{ QUESTION_GROUP_ITEM : selected
  MEDIA_ASSET ||--o{ ASSET_REFERENCE : referenced
  QUESTION_VERSION ||--o{ SOURCE_PROVENANCE : traces
  CONTENT_SOURCE ||--o{ SOURCE_PROVENANCE : contributes
  USER ||--o{ USER_ROLE : receives
  USER ||--o{ AUTH_SESSION : owns
  USER ||--o{ AUDIT_LOG : acts
  USER ||--o{ IMPORT_JOB : creates
  IMPORT_JOB ||--o{ IMPORT_REVIEW : records
  IMPORT_JOB ||--o| IMPORT_PUBLICATION : publishes
  USER ||--o{ IMPORT_REVIEW : performs
  USER ||--o{ IMPORT_PUBLICATION : performs
  EXAM_VERSION ||--o| IMPORT_PUBLICATION : produced
  USER ||--o{ EXAM_ATTEMPT : owns
  EXAM_VERSION ||--o{ EXAM_ATTEMPT : snapshots
```

Published versions phải bất biến ở application/service layer; thay đổi tạo version mới. `ExamItem` có check đúng một target. JSON dành cho rich content/answer config đã được validate; grade/subject/type/status là cột quan hệ để lọc.

`users` giữ identity trạng thái; password chỉ lưu scrypt hash. `user_roles` hiện chỉ có global scope. `auth_sessions` lưu hash của opaque session/CSRF token, expiry và revoke timestamp; `audit_logs` lưu event/outcome/resource mà không lưu raw credential/token.

`import_jobs.created_by_user_id` xác định creator. `import_reviews` có hai scope `TECHNICAL | ACADEMIC`, unique theo `(import_job_id, review_scope)`, lưu decision/reason/reviewer ID/report SHA-256/package SHA-256/actor source; transaction cấm creator tự review.

`import_publications` unique theo ImportJob và ExamVersion, lưu publisher cùng hai hash đã duyệt. Publication transaction tạo content source/license/media, các identity + version rows, section/item/group/provenance/asset reference, rồi mới đổi job sang `PUBLISHED`. Stable exam/question/stimulus key nhận version number kế tiếp; published rows không update. Formal assessment vẫn bị khóa ở service policy.

`exam_attempts` giữ owner Student, ExamVersion, state, idempotency key và hai JSON snapshot riêng. Unique `(student_user_id, idempotency_key)` chống duplicate retry. `student_snapshot_json` không có answer/explanation; `scoring_snapshot_json` có version/type/points/answer key và không được map ra public response. `snapshot_sha256` bao phủ canonical JSON của cả hai; tạo attempt và `ATTEMPT_STARTED` audit cùng transaction. Slice hiện tại mới có `IN_PROGRESS`; các status còn lại dành cho submit/scoring kế tiếp.
