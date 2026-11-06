# Gap analysis

`SOURCE_DOC_NOT_FOUND`: không tìm thấy đặc tả V1/V2 hoặc `Dac_ta_danh_gia_nang_luc_V2_0_cap_nhat.docx` trong repo; master prompt V3 là baseline.

| Module | Existing trước task | Missing | Adapt | Keep | Deprecate / risk |
|---|---|---|---|---|---|
| Frontend | Vite/React status page | product UI/player/renderer | thêm renderer + FIXED DEMO | React/Vite, proxy | status-only screen replaced; font CDN is optional fallback risk |
| Backend | Express health only | domain/API/security | modular domain logic + safe projection | Express/Helmet/CORS | no auth means only public DEMO allowed |
| Database | MySQL + service_status | toàn bộ assessment domain | additive normalized version tables + JSON rich content | MySQL 8.4/init convention | init SQL không tự chạy trên volume cũ |
| Content | none | package/import/review/assets | fixture + schema first | — | DEMO must never be mistaken for official |
| Tests | 3 health/unit tests | content/leakage/player/DB/E2E | add validator/order/safe payload tests | Node test runner | network-listen tests blocked in sandbox |
| Docs | README only | domain/roadmap/status/runbook | add required baseline | existing run commands | docs must track code each slice |
| Git/CI | main, origin, CI | feature workflow evidence | feature branch | existing CI | branch push will not deploy main |

Breaking risk thấp: route mới và bảng mới là additive; màn hình bootstrap cũ được thay bằng product DEMO. Rủi ro chính tiếp theo là auth/leakage và migration trên volume MySQL hiện hữu.
