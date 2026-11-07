# Gap analysis

`SOURCE_DOC_NOT_FOUND`: không tìm thấy đặc tả V1/V2 hoặc `Dac_ta_danh_gia_nang_luc_V2_0_cap_nhat.docx` trong repo; master prompt V3 là baseline.

| Module | Existing trước task | Missing | Adapt | Keep | Deprecate / risk |
|---|---|---|---|---|---|
| Frontend | Vite/React status page | product UI/player/renderer | thêm DEMO, Import Lab, published player và Assembly Lab | React/Vite, proxy | browser visual QA pending; font CDN is optional fallback risk |
| Backend | Express health only | domain/API/security | modular import/session/catalog/attempt/scoring/assembly | Express/Helmet/CORS/opaque sessions | global role only; assembly publish/tenant/manual scoring pending |
| Database | MySQL + service_status | toàn bộ assessment domain | additive normalized version tables + JSON rich content | MySQL 8.4/init convention | init SQL không tự chạy trên volume cũ |
| Content | none | package/import/review/publish/assets | versioned schema + atomic publication | archive-backed media | DEMO must never be mistaken for official |
| Tests | 3 health/unit tests | content/leakage/player/DB/E2E | 52 tests + MySQL/HTTP matrices cho FIXED/ASSEMBLED publish/attempt | Node test runner | browser visual/a11y QA chưa có tooling |
| Docs | README only | domain/roadmap/status/runbook | add required baseline | existing run commands | docs must track code each slice |
| Git/CI | main, origin, CI | feature workflow evidence | feature branch | existing CI | branch push will not deploy main |

Breaking risk thấp: route/bảng mới additive, ngoại trừ `exams.source_id` được nới nullable để biểu diễn ASSEMBLED nhiều nguồn. Rủi ro chính tiếp theo là blueprint revision/queue, manual scoring/regrade, asset delivery/S3, tenant scope và migration trên volume MySQL hiện hữu.
