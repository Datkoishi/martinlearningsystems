# ADR 0007 — Idempotent attempt persistence, scoring revisions và reveal fail-closed

## Status

Accepted — 2026-11-07.

## Context

Student player cần chịu được debounce, retry sau timeout, refresh và hai tab mà không mất câu trả lời hoặc chấm hai lần. Scoring snapshot chứa answer key nhạy cảm; result không thể trả raw score payload cho mọi purpose/state. Essay chưa có manual scoring workflow và không được dùng AI để chốt điểm.

## Decision

- Mỗi attempt có monotonic `answer_revision`; PATCH mang `baseRevision` và patch response theo question version.
- AUTOSAVE/SUBMIT lưu `(student, operation type, idempotency key, request SHA-256, exact response)`. Cùng key/request replay response; key khác payload bị từ chối.
- Autosave patch, revision, operation ACK và audit commit trong một transaction. Stale revision trả current revision để client GET/merge/retry.
- Submit khóa attempt, chỉ chấm response đã commit và tạo immutable `attempt_score_revisions` revision 1. Retry hoặc submit attempt đã đóng không tạo score/audit mới.
- Scorer `eduassess-scoring-v1` xử lý rule deterministic; answered essay tạo `PENDING_MANUAL_SCORING`.
- Public result là projection theo purpose/state: PRACTICE final mới có correct answer; mock/diagnostic/pending chỉ có summary. Không trả explanation/rubric hoặc raw scoring snapshot.
- Read attempt/result dùng một transaction snapshot để metadata, response map và score không bị xé giữa commit.

## Consequences

Client phải giữ request autosave đang bay để retry nguyên key/payload, và phải merge local dirty answer khi conflict. DB tăng thêm response, operation và immutable score rows nên cần retention/monitoring. Global revision đơn giản và an toàn nhưng hai tab sửa hai câu khác nhau vẫn có thể conflict; client merge giải quyết thay vì last-write-wins. Manual essay scoring/regrade và new-attempt policy là các slice riêng.
