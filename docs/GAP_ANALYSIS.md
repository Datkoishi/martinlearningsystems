# Gap analysis

`SOURCE_DOC_NOT_FOUND`: không tìm thấy đặc tả V1/V2 hoặc `Dac_ta_danh_gia_nang_luc_V2_0_cap_nhat.docx` trong repo; master prompt V3 là baseline.

| Module | Existing trước task | Missing | Adapt | Keep | Deprecate / risk |
|---|---|---|---|---|---|
| Frontend | Vite/React status page | product UI/player/renderer | thêm DEMO, Import Lab, published player và Assembly Lab | React/Vite, proxy | browser visual QA pending; font CDN is optional fallback risk |
| Backend | Express health only | domain/API/security/runtime lifecycle | modular import/session/catalog/attempt/scoring/assembly + fail-fast config/live-ready/drain | Express/Helmet/CORS/opaque sessions | global role only; tenant/manual scoring pending |
| Database | MySQL + service_status | toàn bộ assessment domain | additive normalized version tables + JSON rich content + checksum migration ledger/runner | MySQL 8.4/numbered SQL convention | DDL implicit commit; encrypted off-site backup/alert deployment pending |
| Content | none | package/import/review/publish/assets | versioned schema + atomic publication + dual-read object promotion | immutable archive provenance + content-addressed object | DEMO must never be mistaken for official; CDN pending |
| Tests | 3 health/unit tests | content/leakage/player/DB/E2E | 72 tests + MySQL/HTTP/S3/production Compose matrices cho FIXED/ASSEMBLED/operations | Node test runner | browser visual/a11y QA chưa có tooling |
| Docs | README only | domain/roadmap/status/runbook | add required baseline | existing run commands | docs must track code each slice |
| Git/CI | main, origin, CI | feature workflow evidence | feature branch | existing CI | branch push will not deploy main |
| Operations | basic Compose health | production safety/upgrade/restore/monitoring | Node 24, typed config, probes/drain, TLS/secret overlay, migration gate, scheduled recovery set, S3 promotion/rollback, protected metrics + alert rules | Docker images + GHCR CI | actual domain/cert/webhook delivery, encrypted off-site target, bucket identity/CDN và tenant scope pending |

Breaking risk thấp: route/bảng mới additive, ngoại trừ `exams.source_id` được nới nullable để biểu diễn ASSEMBLED nhiều nguồn và runtime baseline nâng lên Node 24 LTS. Migration, backup/restore, object cutover và production overlay đã fail-closed + smoke pass; rủi ro tiếp theo là target/off-site/bucket/webhook provisioning thật, blueprint revision/queue, manual scoring/regrade, CDN và tenant scope.
