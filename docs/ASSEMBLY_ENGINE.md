# Assembly Engine

## Trạng thái hiện tại

`eduassess-assembly-v1` nhận Blueprint 1.0.0 + seed, lọc approved/licensed question pool, giải hard constraints bằng backtracking có giới hạn, rồi lưu immutable `assembly_runs` snapshot. Mỗi run gắn BlueprintVersion `NEEDS_REVIEW`; independent Reviewer phải duyệt đúng hash trước khi publish thành ExamVersion ASSEMBLED. Student catalog/attempt dùng published snapshot và không chạy lại engine.

## Eligibility của question pool

Một QuestionVersion chỉ vào pool khi đồng thời:

- `approval_status = PUBLISHED` và có mặt trực tiếp hoặc qua group trong một ExamVersion `PUBLISHED + FIXED + non-formal`;
- provenance trỏ license đang còn hiệu lực với `derivative_assembly = true`;
- khớp grade, subject, curriculum và accepted origin/license của blueprint;
- có đủ `curriculum_version`, `topic_key`, `skill_key`, `difficulty`, `estimated_seconds`;
- mọi asset được tham chiếu đã publish.

Metadata assembly trong Exam Package là opt-in nhưng all-or-none. Package cũ thiếu metadata vẫn publish FIXED bình thường nhưng không được assembly chọn.

## Blueprint 1.0.0

```json
{
  "schemaVersion": "1.0.0",
  "title": "[DEMO] Đề luyện tập Toán 5",
  "grade": 5,
  "subject": "Toán",
  "curriculumVersion": "vn-2018",
  "purpose": "PRACTICE",
  "durationMinutes": 30,
  "pointRange": {"min": 10, "max": 12},
  "sourceDiversity": {"minSources": 2, "maxQuestionsPerSource": 6},
  "acceptedOriginTypes": ["HUMAN_AUTHORED", "OFFICIAL_IMPORTED"],
  "acceptedLicenseIds": [],
  "sections": [{
    "id": "section-1",
    "title": "Phần I",
    "count": 10,
    "quotas": {
      "questionTypes": {"SINGLE_CHOICE": 8, "SHORT_NUMBER": 2},
      "topics": {"fractions": 5, "geometry": 5},
      "skills": {"calculation": 6, "reasoning": 4},
      "difficulties": {"EASY": 3, "MEDIUM": 5, "HARD": 2}
    }
  }]
}
```

Mỗi quota dimension là exact count và tổng phải bằng `section.count`. `FORMAL_ASSESSMENT` bị từ chối. `minSources` tối thiểu 2; tổng points, estimated time, maximum questions/source, family uniqueness và quota đều là hard constraints.

## Selection pipeline

1. Validate và canonicalize blueprint/seed.
2. Query pool bằng relational indexes; không dùng `ORDER BY RANDOM()`.
3. Chuẩn hóa selection unit: direct question là một unit; `ATOMIC_ALL` chỉ hợp lệ khi toàn bộ group eligible và luôn được chọn cùng nhau; `SPLIT_WITH_STIMULUS` tạo unit từng câu nhưng luôn mang stimulus.
4. Xếp candidate bằng SHA-256 rank của `(seed, sectionId, unitId)` để kết quả không phụ thuộc thứ tự DB.
5. Backtracking giải quota, source diversity, points, time, duplicate question/family và group dependency; tối đa 100.000 node tìm kiếm.
6. Nếu không giải được, trả lỗi có cấu trúc; không hạ quota hoặc đổi chủ đề.
7. Tạo student-safe snapshot và scoring snapshot riêng, selection manifest/source distribution, `selection_sha256`, `snapshot_sha256`, engine version và audit.
8. Retry cùng Editor/key/request trả đúng run cũ; key dùng cho blueprint/seed khác bị từ chối.

Engine chưa xáo options và chưa dùng soft optimization/student history. Các chức năng này chỉ được thêm khi có schema/policy và test chứng minh không phá meaning/dependency.

## Approval và publication

1. Tạo run đồng thời tạo `exam_blueprints` identity + immutable `exam_blueprint_versions` version 1 ở `NEEDS_REVIEW`. Run cũ trước reviewer-payload contract được migration đánh `REJECTED` và phải assemble lại.
2. Reviewer endpoint trả projection riêng có answer key/lời giải; explanation-only asset đi qua route reviewer-scoped, không qua public catalog.
3. Creator không được tự review. Một BlueprintVersion chỉ có một `APPROVE|REJECT`; record bind `selection_sha256` và source `snapshot_sha256`.
4. Chỉ `APPROVED` được publish. Transaction tạo `ExamVersion(mode=ASSEMBLED, PUBLISHED)`, publication record, student/scoring snapshots mới với ExamVersion ID, hash và audit; retry không tạo version/audit mới.
5. Catalog xác minh published snapshot hash. Student attempt lại đóng băng bản sao của đúng publication snapshot; refresh/retry không query pool và không reassemble.
6. `FORMAL_ASSESSMENT` tiếp tục fail-closed. Rejected blueprint không được sửa tại chỗ; tạo technical run/version mới.

Schema hiện hỗ trợ identity/version nhưng UI tạo version 1 cho từng technical run; authoring revision trên cùng blueprint identity là phần mở rộng sau, không thay đổi version đã duyệt/publish.

## Error contract chính

- `INCOMPATIBLE_BLUEPRINT` — schema/quota/rich instruction/limit không hợp lệ.
- `INVALID_ASSEMBLY_SEED` — seed không đạt contract.
- `FORMAL_ASSESSMENT_DISABLED` — formal vẫn fail-closed.
- `INSUFFICIENT_POOL` — không có tổ hợp thỏa mọi hard constraint; details có pool/required counts.
- `ASSEMBLY_SEARCH_LIMIT` — không tìm được trong giới hạn deterministic.
- `MISSING_ASSETS` — candidate graph tham chiếu asset thiếu/chưa publish.
- `IDEMPOTENCY_KEY_REUSED` — cùng key cho request khác.
- `ASSEMBLY_SNAPSHOT_INTEGRITY_FAILED` — stored snapshot/hash không khớp.
- `SELF_REVIEW_FORBIDDEN` — creator cố duyệt run của chính mình.
- `ASSEMBLY_NOT_REVIEWABLE` / `ASSEMBLY_NOT_APPROVED` — decision đã khóa hoặc publish chưa đủ gate.
- `ASSEMBLY_REVIEW_BINDING_MISMATCH` / `ASSEMBLY_PUBLICATION_BINDING_MISMATCH` — approval không còn khớp hashes.
- `PUBLISHED_ASSEMBLY_INTEGRITY_FAILED` — publication snapshot/hash không khớp khi catalog đọc.
