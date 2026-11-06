# Exam Package V1 (contract dự kiến)

ZIP gồm `manifest.json`, `exam.json`, `questions.json`, `answers.json`, `assets/`, tùy chọn `preview.pdf`. Manifest khai schema/package ID, source/rights, file size + SHA-256 và counts. Path phải tương đối, không traversal; checksum/MIME/reference phải khớp.

Pipeline dự kiến: upload nguyên gói → safe extract → schema/reference/license validation → normalize có warning → web preview → reviewer approval → publish transaction. `(packageId, packageSha256)` là idempotency key. Import API/parser chưa triển khai trong slice này; bảng `import_jobs` chỉ là foundation.
