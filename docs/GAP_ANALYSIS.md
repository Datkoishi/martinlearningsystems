# Gap analysis

`SOURCE_DOC_NOT_FOUND`: không tìm thấy đặc tả V1/V2 hoặc `Dac_ta_danh_gia_nang_luc_V2_0_cap_nhat.docx` trong repo; master prompt V3 là baseline.

| Module | Existing trước task | Missing | Adapt | Keep | Deprecate / risk |
|---|---|---|---|---|---|
| Frontend | Vite/React status page | product UI/player/renderer | thêm DEMO, Import Lab, published player và Assembly Lab | React/Vite, proxy | browser visual QA pending; font CDN is optional fallback risk |
| Backend | Express health only | domain/API/security/runtime lifecycle | modular import/session/catalog/attempt/scoring/assembly + fail-fast config/live-ready/drain | Express/Helmet/CORS/opaque sessions | global role only; tenant/manual scoring pending |
| Database | MySQL + service_status | toàn bộ assessment domain | additive normalized version tables + JSON rich content + checksum migration ledger/runner | MySQL 8.4/numbered SQL convention | DDL implicit commit; encrypted off-site backup/alert deployment pending |
| Content | none | package/import/review/publish/assets | versioned schema + atomic publication | archive-backed media | DEMO must never be mistaken for official |
| Tests | 3 health/unit tests | content/leakage/player/DB/E2E | 52 tests + MySQL/HTTP matrices cho FIXED/ASSEMBLED publish/attempt | Node test runner | browser visual/a11y QA chưa có tooling |
| Docs | README only | domain/roadmap/status/runbook | add required baseline | existing run commands | docs must track code each slice |
| Git/CI | main, origin, CI | feature workflow evidence | feature branch | existing CI | branch push will not deploy main |
| Operations | basic Compose health | production safety/upgrade/restore/monitoring | typed config, probes/drain, Nginx hardening, migration gate, scheduled DB+import backup, retention/health/restore-check | Docker images + GHCR CI | encrypted off-site target, alert wiring, TLS/secret deployment, metrics chưa có |

Breaking risk thấp: route/bảng mới additive, ngoại trừ `exams.source_id` được nới nullable để biểu diễn ASSEMBLED nhiều nguồn. Migration và backup/restore automation đã fail-closed + smoke pass; rủi ro tiếp theo là off-site/alert deployment thật, blueprint revision/queue, manual scoring/regrade, asset delivery/S3 và tenant scope.
