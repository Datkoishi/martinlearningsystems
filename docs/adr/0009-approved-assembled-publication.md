# ADR 0009 — Approved ASSEMBLED publication dùng frozen snapshots

## Status

Accepted — 2026-11-07.

## Context

Technical assembly run có thể tái hiện nhưng không được tự trở thành đề Student-visible. Reviewer phải duyệt đúng blueprint/selection/scoring đã đóng băng; catalog/attempt không được reassemble vì pool hoặc source version có thể thay đổi sau đó. ASSEMBLED dùng nhiều nguồn nên cột `exams.source_id` đơn nguồn không mô tả đầy đủ provenance.

## Decision

- Mỗi successful run tạo `ExamBlueprint` identity và immutable BlueprintVersion 1 `NEEDS_REVIEW`. Run có trước frozen reviewer-payload contract được backfill `REJECTED` và phải assemble lại.
- Một `assembly_reviews` record/run bind reviewer, decision, reason, BlueprintVersion, selection hash và source snapshot hash. Creator bị cấm self-review; decision không update/ghi đè.
- Chỉ APPROVED non-formal run được publish. Một transaction tạo source-less Exam identity, ExamVersion `ASSEMBLED + PUBLISHED`, published student/scoring snapshots + hash, publication record, BlueprintVersion `PUBLISHED` và audit.
- `exams.source_id` nullable cho ASSEMBLED; provenance/rights vẫn lấy từ từng selected QuestionVersion và selection manifest, không gán giả một nguồn chính.
- Catalog dispatch theo ExamVersion mode. ASSEMBLED đọc published snapshot và xác minh hash; attempt sao chép snapshot đó. Reload/retry không query pool hoặc gọi engine.
- Reviewer explanation asset đi qua route role-scoped và phải thuộc selected scoring snapshot. Public asset authorization chỉ chấp nhận asset có trong student-visible FIXED graph hoặc ASSEMBLED publication snapshot.

## Consequences

Publication snapshot lặp dữ liệu từ technical run và attempt lại sao chép publication, đổi lại lịch sử độc lập với content/pool hiện tại và dễ kiểm chứng hash. ASSEMBLED ExamVersion không có ExamSection/ExamItem rows; frozen publication snapshot là source of truth cho delivery. Schema hỗ trợ nhiều BlueprintVersion nhưng UI hiện tạo identity/version 1 theo run; revision authoring và governance queue là task kế tiếp. Failed assembly runs vẫn chưa persist. Formal assessment vẫn khóa.
