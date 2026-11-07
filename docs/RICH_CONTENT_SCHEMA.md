# Rich Content Schema 1.0.0

Source of truth runtime: `backend/src/domain/rich-content.js`. Root gồm `schemaVersion: "1.0.0"` và `nodes`.

Block đã hỗ trợ validation/render: `paragraph`, `blockquote`, `math_block`, `figure`, `table` (cell rich content, rowspan/colspan), `list`, `section_break`. Inline: `text` với marks, `math_inline`, `link` chỉ cho `http/https/mailto`.

`figure` bắt buộc `assetId` và `alt`; renderer resolve qua asset map, không nhận raw HTML. Table cell có `content` là block list. Schema mới phải tăng version, có migration/compatibility reader và test content trong stem, option, stimulus, explanation.

Chưa hỗ trợ ở runtime: audio/video, diagram data model riêng, code, page break và `stimulus_reference` node. Các loại này là backlog; không nhập âm thầm dưới dạng text phẳng.
