# Data model

Migration nền tảng: `database/init/002_eduassess_foundation.sql`.

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
  IMPORT_JOB ||--o| IMPORT_REVIEW : records
```

Published versions phải bất biến ở application/service layer; thay đổi tạo version mới. `ExamItem` có check đúng một target. JSON dành cho rich content/answer config đã được validate; grade/subject/type/status là cột quan hệ để lọc. Attempt/snapshot sẽ được thêm trong Phase 2 trước khi có submit thật.

`import_reviews` chỉ có scope `TECHNICAL` trong slice hiện tại, unique theo `import_job_id`, lưu decision/reason/reviewer ID/report SHA-256/actor source. Academic approval cần identity + role riêng và chưa tồn tại.
