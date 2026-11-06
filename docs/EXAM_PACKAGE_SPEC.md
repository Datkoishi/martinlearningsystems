# Exam Package V1

ZIP gồm `manifest.json`, `exam.json`, `questions.json`, `answers.json`, `assets/`, tùy chọn `preview.pdf`. Manifest khai schema/package ID, source/rights, file size + SHA-256 và counts. Path phải tương đối, không traversal; checksum/MIME/reference phải khớp.

## Manifest tối thiểu

```json
{
  "schemaVersion": "1.0.0",
  "packageId": "pkg-math-5-demo-001",
  "source": {"name": "Nguồn DEMO", "originType": "HUMAN_AUTHORED"},
  "rights": {"publishFixed": true, "extractReuse": true, "derivativeAssembly": true},
  "counts": {"questions": 1},
  "files": [
    {"path": "exam.json", "sha256": "<64 hex>", "sizeBytes": 123, "mimeType": "application/json"},
    {"path": "assets/shape.svg", "assetId": "asset-shape", "altText": "Hình vuông", "sha256": "<64 hex>", "sizeBytes": 456, "mimeType": "image/svg+xml"}
  ]
}
```

`exam.json` chứa `id/title/grade/subject/durationMinutes/mode/purpose/sections`; mỗi section có `itemRefs` loại `GROUP` hoặc `QUESTION`. `questions.json` chứa `stimuli`, `groups`, `questions`; rich content tham chiếu `assetId` đã khai báo. `answers.json` chứa đúng một record cho mỗi câu và answer key phù hợp option/type.

## Pipeline và giới hạn hiện tại

Upload nguyên gói → kiểm tra cấu trúc ZIP → tính package SHA-256 → validate manifest/checksum/MIME/rich content/reference/answer/license → lưu `source.zip` + report → `READY_FOR_REVIEW` hoặc `INVALID`. `(packageId, packageSha256)` là idempotency key.

- Request tối đa 25 MiB; tối đa 200 ZIP entries, 10 MiB/entry, 50 MiB sau giải nén, compression ratio tối đa 100.
- Cấm path tuyệt đối/traversal/backslash, duplicate path, symlink, encryption và file không khai báo.
- SVG có script, event handler, `foreignObject`, entity hoặc external/data/javascript URL bị từ chối.
- Hỗ trợ MIME: JSON, PNG, JPEG, WebP, SVG an toàn, MP3 và PDF preview.
- Gói vi phạm bảo mật ZIP bị từ chối trước khi lưu; lỗi schema/nghiệp vụ được staging ở trạng thái `INVALID` để tải report.

Package qua validation có reviewer preview dựng trực tiếp từ ZIP, gồm asset, answer key và explanation. Reviewer có thể ghi một quyết định kỹ thuật bất biến; reject yêu cầu package mới để sửa. Chưa triển khai normalize/editor, academic approval, object storage S3 và publish transaction.
