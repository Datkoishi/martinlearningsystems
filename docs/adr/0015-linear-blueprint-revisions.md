# ADR-0015: Linear immutable Blueprint revisions và safe governance queue

- Status: Accepted
- Date: 2026-11-08
- Feature: ASM-001c

## Context

ASM-001b đã có `exam_blueprints`, immutable `exam_blueprint_versions`, review và publication nhưng mỗi technical run luôn tạo identity/version 1. Editor phải trao UUID thủ công cho Reviewer và không thể sửa một Blueprint bị reject hoặc tiếp tục từ bản đã publish mà vẫn giữ lịch sử identity.

Không được update version đã review/publish, để creator tự review, hoặc đưa answer/scoring snapshot vào list endpoint. Hai revision đồng thời cũng không được nhận cùng version number hay tạo nhánh governance âm thầm.

## Decision

- New assembly giữ hành vi cũ: tạo Blueprint identity + version 1.
- Revision dùng owned source run, full Blueprint 1.0.0 và seed mới; engine chạy lại và tạo run/snapshots/hashes mới trên cùng identity.
- Source phải là latest version và latest status phải là `REJECTED` hoặc `PUBLISHED`. `NEEDS_REVIEW`/`APPROVED` trả conflict để giữ một chuỗi governance tuyến tính.
- Repository khóa `exam_blueprints` rồi latest `exam_blueprint_versions` trong transaction, cấp `version_number + 1`; unique `(blueprint_id, version_number)` tiếp tục bảo vệ ở DB.
- Request idempotency bao phủ Blueprint identity, source version, canonical Blueprint và seed. Exact retry trả run đã tạo; key đổi request bị từ chối.
- Editor/Reviewer queue hỗ trợ allowlisted status/purpose, title substring và bounded pagination. Editor scope theo creator; Reviewer loại creator hiện tại. Queue không chứa snapshot/answer/explanation.
- UI giữ lookup UUID làm fallback, đồng thời thêm queue và revision form. Editor form hiện dựng một section; API/domain vẫn giữ Blueprint nhiều section.
- Không thêm migration: schema 010 đã có identity, version sequence/index và immutable run binding cần thiết.

## Consequences

- Lịch sử rejected/published được giữ nguyên và revision có lineage rõ qua shared Blueprint ID + version number.
- Không có draft mutable hoặc branching/merge; muốn thử hai phương án phải tạo Blueprint identity mới.
- Revision có thể fail trước persistence nếu pool không đủ; failed-run history vẫn là feature riêng.
- Queue metadata an toàn để browse, còn reviewer preview vẫn là endpoint role-protected/no-store.

## Verification

Unit/API tests bao phủ terminal/latest guards, idempotency, owner/reviewer scope, filter validation và no-answer queue. Opt-in MySQL 8.4 integration test xác minh transaction version 1→2, stale/blocked conflicts và query/pagination trên schema thật.
