USE mls_db;

INSERT INTO content_sources (id, name, origin_type, generator_metadata)
VALUES ('src-demo-eduassess-0000000000001', 'Nguồn dữ liệu DEMO nội bộ', 'HUMAN_AUTHORED', JSON_OBJECT('demo', true))
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO usage_licenses (id, source_id, label, publish_fixed, extract_reuse, derivative_assembly)
VALUES ('lic-demo-eduassess-0000000000001', 'src-demo-eduassess-0000000000001', 'Chỉ dùng dữ liệu DEMO', true, true, true)
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO media_assets (id, storage_key, mime_type, sha256, size_bytes, width, height, alt_text, approval_status, metadata_json)
VALUES (
  'asset-demo-garden-000000000001',
  'assets/demo-garden.svg',
  'image/svg+xml',
  'f0e1f0080518f369df8c5d0350f3635f9060b30bd51c64098156f8004704c672',
  1280,
  720,
  360,
  'Sơ đồ khu vườn hình chữ nhật ABCD, chiều dài 12 mét và chiều rộng 8 mét',
  'DRAFT',
  JSON_OBJECT('demo', true, 'trustedLocalAsset', true)
)
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO exams (id, source_id, stable_key)
VALUES ('exam-demo-math-5-0000000000001', 'src-demo-eduassess-0000000000001', 'demo-math-grade-5')
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO exam_versions (id, exam_id, version_number, title, description, exam_mode, purpose, approval_status, grade, subject, duration_minutes)
VALUES (
  'exam-version-demo-math-5-000001',
  'exam-demo-math-5-0000000000001',
  1,
  '[DEMO] Khám phá Toán lớp 5',
  'Dữ liệu minh họa kỹ thuật, không phải đề thi chính thức.',
  'FIXED',
  'PRACTICE',
  'DRAFT',
  5,
  'Toán',
  25
)
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO exam_sections (id, exam_version_id, position, title, instruction_json)
VALUES (
  'section-demo-geometry-000000001',
  'exam-version-demo-math-5-000001',
  1,
  'Phần I — Hình học',
  JSON_OBJECT('schemaVersion', '1.0.0', 'nodes', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', 'Quan sát hình và chọn đáp án đúng.')))))
)
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO stimuli (id, stable_key)
VALUES ('stimulus-demo-garden-0000000001', 'demo-school-garden')
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO stimulus_versions (id, stimulus_id, version_number, title, content_json, approval_status)
VALUES (
  'stimulus-version-garden-0000001',
  'stimulus-demo-garden-0000000001',
  1,
  'Khu vườn của trường',
  JSON_OBJECT(
    'schemaVersion', '1.0.0',
    'nodes', JSON_ARRAY(
      JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', 'Trường em có một khu vườn hình chữ nhật như sơ đồ.'))),
      JSON_OBJECT('type', 'figure', 'assetId', 'asset-demo-garden-000000000001', 'alt', 'Sơ đồ khu vườn hình chữ nhật ABCD', 'caption', 'Hình 1 — dữ liệu DEMO'),
      JSON_OBJECT('type', 'table', 'rows', JSON_ARRAY(
        JSON_ARRAY(JSON_OBJECT('header', true, 'content', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', 'Đại lượng'))))), JSON_OBJECT('header', true, 'content', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', 'Giá trị')))))),
        JSON_ARRAY(JSON_OBJECT('content', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', 'Chiều dài'))))), JSON_OBJECT('content', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', '12 m'))))))
      ))
    )
  ),
  'DRAFT'
)
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO question_groups (id, stable_key, stimulus_version_id, selection_policy)
VALUES ('group-demo-garden-0000000000001', 'demo-garden-atomic', 'stimulus-version-garden-0000001', 'ATOMIC_ALL')
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO questions (id, stable_key)
VALUES ('question-demo-perimeter-00000001', 'demo-garden-perimeter')
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO question_versions (id, question_id, version_number, question_type, content_json, answer_key_json, explanation_json, points, grade, subject, approval_status)
VALUES (
  'question-version-perimeter-000001',
  'question-demo-perimeter-00000001',
  1,
  'SINGLE_CHOICE',
  JSON_OBJECT('schemaVersion', '1.0.0', 'nodes', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', 'Tính chu vi theo công thức '), JSON_OBJECT('type', 'math_inline', 'latex', 'P = 2 \\times (a + b)'))))),
  JSON_OBJECT('correctOptionIds', JSON_ARRAY('option-demo-perimeter-b-000001')),
  JSON_OBJECT('schemaVersion', '1.0.0', 'nodes', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', 'Kết quả là 40 m.'))))),
  1,
  5,
  'Toán',
  'DRAFT'
)
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO question_options (id, question_version_id, option_key, position, content_json)
VALUES
  ('option-demo-perimeter-a-000001', 'question-version-perimeter-000001', 'A', 1, JSON_OBJECT('schemaVersion', '1.0.0', 'nodes', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', '20 m')))))),
  ('option-demo-perimeter-b-000001', 'question-version-perimeter-000001', 'B', 2, JSON_OBJECT('schemaVersion', '1.0.0', 'nodes', JSON_ARRAY(JSON_OBJECT('type', 'paragraph', 'children', JSON_ARRAY(JSON_OBJECT('type', 'text', 'text', '40 m'))))))
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO question_group_items (group_id, question_version_id, position)
VALUES ('group-demo-garden-0000000000001', 'question-version-perimeter-000001', 1)
ON DUPLICATE KEY UPDATE position = VALUES(position);

INSERT INTO exam_items (id, exam_section_id, position, question_group_id)
VALUES ('exam-item-demo-garden-0000000001', 'section-demo-geometry-000000001', 1, 'group-demo-garden-0000000000001')
ON DUPLICATE KEY UPDATE id = VALUES(id);

INSERT INTO source_provenance (question_version_id, source_id, license_id, relation_type)
VALUES ('question-version-perimeter-000001', 'src-demo-eduassess-0000000000001', 'lic-demo-eduassess-0000000000001', 'PRIMARY')
ON DUPLICATE KEY UPDATE relation_type = VALUES(relation_type);

INSERT INTO asset_references (asset_id, owner_type, owner_id, json_path)
VALUES ('asset-demo-garden-000000000001', 'STIMULUS_VERSION', 'stimulus-version-garden-0000001', '$.nodes[1]')
ON DUPLICATE KEY UPDATE id = id;
