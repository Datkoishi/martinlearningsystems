# Implementation status

## Hoạt động

- Bootstrap Docker/React/Express/MySQL, health endpoint, CI build/test.
- Rich-content validator 1.0.0 và renderer React không dùng raw HTML.
- FIXED DEMO có hai section, stimulus, group atomic, hình, math, table, single/multiple/number input.
- API student-safe loại answer key/explanation; unit tests bảo vệ leakage/order/content.
- Additive MySQL foundation + idempotent DEMO seed (chưa execute trong môi trường này).

## Partial / giới hạn

- UI chỉ giữ câu trả lời trong React memory và nói rõ là DEMO; không phải autosave server.
- Math hiển thị semantic LaTeX text, chưa dùng KaTeX/MathJax.
- SVG DEMO là asset nội bộ tin cậy; upload sanitizer/storage chưa có.
- Chưa có browser visual QA trong sandbox.

## Chưa làm

Auth/RBAC/tenant/audit, import staging, object storage, reviewer flow, immutable publish enforcement, attempts, scoring, ASSEMBLED, assessment/reporting.
