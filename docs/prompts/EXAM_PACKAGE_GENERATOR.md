# Prompt contract cho nguồn tạo Exam Package

Yêu cầu công cụ bên ngoài xuất ZIP theo `docs/EXAM_PACKAGE_SPEC.md`; không gửi secret. Mọi câu/option/stimulus/explanation dùng Rich Content 1.0.0, asset dùng đường dẫn package và SHA-256, answer key nằm riêng trong `answers.json`. Gắn rõ `origin_type`, grade/subject/purpose, quyền `publish_fixed`/`extract_reuse`/`derivative_assembly` và nhãn `DEMO` nếu không phải nội dung được duyệt. Không tuyên bố nội dung đúng học thuật; package luôn đi qua staging/reviewer.
