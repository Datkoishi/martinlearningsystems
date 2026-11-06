# Data dictionary (slice hiện tại)

| Entity | Trường chính | Ràng buộc / mục đích |
|---|---|---|
| content_sources | origin_type, generator_metadata | Không chứa secret của provider |
| usage_licenses | publish_fixed, extract_reuse, derivative_assembly | Ba quyền tách biệt |
| media_assets | storage_key, mime_type, sha256, size, alt_text, approval_status | Không lưu base64 trong JSON |
| exams / exam_versions | stable_key, version, mode, purpose, grade, subject, status | unique version; grade 1–12 |
| exam_sections / exam_items | position, instruction_json, version/group target | thứ tự FIXED ổn định; đúng một target |
| stimuli / stimulus_versions | content_json, schema_version, status | nội dung dùng chung có version |
| questions / question_versions | type, content_json, answer_key_json, points, status | answer key không thuộc student projection |
| question_options | option_key, position, content_json | rich content, unique trong version |
| question_groups / items | stimulus_version_id, selection_policy, position | atomic hoặc split-with-stimulus |
| source_provenance | question_version, source, license, relation_type | hỗ trợ nhiều nguồn |
| asset_references | asset, owner_type/id, json_path | kiểm tra asset trước publish |
| import_jobs | package_id/hash, status, report | idempotency theo package + hash |

Retention/xóa mềm đầy đủ chưa triển khai; entity đã được tham chiếu không được hard-delete ở feature tương lai.
