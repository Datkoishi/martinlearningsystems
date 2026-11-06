# Kiến trúc

## Hiện tại

```mermaid
flowchart LR
  UI[React/Vite\nRichContent renderer] -->|GET /api/exams/demo-fixed| API[Express API]
  API --> Present[Exam presentation\nstudent-safe projection]
  Present --> Validate[Rich content validator]
  API -. slices kế tiếp .-> DB[(MySQL 8.4)]
  DB --> Versions[Exam / Question / Stimulus versions]
  Assets[Object storage adapter\nchưa triển khai] -. assetId .-> UI
```

Backend được giữ modular monolith để phù hợp repo nhỏ. `backend/src/domain` chứa logic thuần; route chỉ chuyển HTTP. Frontend không render raw HTML/SVG từ payload. Asset DEMO là SVG nội bộ tin cậy; asset import tương lai phải sanitize/convert và phục vụ từ storage.

## Boundaries kế tiếp

`import`, `catalog`, `exam-player`, `scoring`, `assembly`, `assessment`, `identity/access`, `audit`. Không tách microservice trước khi có nhu cầu vận hành thực.
