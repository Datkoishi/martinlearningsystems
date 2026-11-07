# ADR 0008 — Deterministic assembly runs từ approved/licensed pool

## Status

Accepted — 2026-11-07.

## Context

ASSEMBLED phải tái hiện được, giữ group/stimulus, tôn trọng quyền sử dụng và không âm thầm thay quota khi pool thiếu. `ORDER BY RANDOM()` không giải thích được và reload không được sinh một đề khác. Đồng thời technical generation không được tự trở thành nội dung Student-visible khi chưa có blueprint governance.

## Decision

- Bổ sung metadata relational/indexed curriculum/topic/skill/difficulty/estimated/family trên QuestionVersion. Metadata Exam Package là all-or-none; row thiếu vẫn dùng FIXED nhưng không eligible assembly.
- Pool chỉ gồm QuestionVersion PUBLISHED thuộc published FIXED non-formal graph và provenance license `derivative_assembly` còn hiệu lực.
- Chuẩn hóa direct, `ATOMIC_ALL`, `SPLIT_WITH_STIMULUS` thành selection units. Chặn duplicate question/family.
- Blueprint 1.0.0 dùng exact quotas theo type/topic/skill/difficulty, source diversity, points/time và accepted origin/license. Formal bị từ chối.
- Candidate rank là SHA-256 `(seed, sectionId, unitId)`; deterministic backtracking giải hard constraints với search limit. Không có silent relaxation.
- Successful run lưu canonical blueprint, seed, engine version, selection/source manifest, student/scoring snapshots và integrity hashes trong transaction với audit/idempotency.
- Public API/UI chỉ trả student-safe snapshot cho creator Editor/Admin. Không publish run vào catalog hoặc tạo Student attempt ở slice này.

## Consequences

Pool cũ thiếu metadata có thể dẫn tới `INSUFFICIENT_POOL` nhưng FIXED không bị ảnh hưởng. Exact multi-dimensional quota dễ giải thích nhưng có thể làm search lớn; engine fail ở 100.000 node và cần blueprint rõ hơn thay vì tự tăng giới hạn. Failed runs chưa persist. Blueprint version/approval, ASSEMBLED publication, option shuffle, soft optimization và Student delivery là các task riêng.
