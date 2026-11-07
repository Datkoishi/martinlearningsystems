# ADR-0005: Academic gate và atomic package publication

- Status: Accepted
- Date: 2026-11-07

## Decision

ImportJob có hai decision scope bất biến: `TECHNICAL` rồi `ACADEMIC`. Mỗi decision bind package SHA-256 và canonical validation-report SHA-256; creator không được review. Chỉ `ACADEMICALLY_APPROVED` được vào publish.

Publish đọc lại ZIP, xác minh bytes, chạy validator lại và dựng publication plan với UUID nội bộ. Rich asset references và correct option references được remap trước khi insert. Repository khóa ImportJob và ghi source, license, media, stimulus/question/group/exam versions, provenance/reference, publication, audit và trạng thái `PUBLISHED` trong một MySQL transaction. `import_publications.import_job_id` là idempotency marker cho retry.

`FORMAL_ASSESSMENT` bị chặn độc lập với content approval. Media hiện dùng storage key trỏ entry trong source archive; source của publication không được cleanup cho tới khi promotion sang object storage hoàn tất.

## Consequences

Không có trạng thái half-published trong DB và client có thể retry sau timeout. Stable exam/question/stimulus identity tạo version kế tiếp thay vì update version cũ. Object storage copy không nằm trong transaction ở slice này; archive retention là ràng buộc vận hành và S3 promotion/catalog delivery là task tiếp theo.
