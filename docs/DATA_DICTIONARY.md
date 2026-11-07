# Data dictionary (slice hiện tại)

| Entity | Trường chính | Ràng buộc / mục đích |
|---|---|---|
| content_sources | origin_type, generator_metadata | Không chứa secret của provider |
| usage_licenses | publish_fixed, extract_reuse, derivative_assembly | Ba quyền tách biệt |
| media_assets | storage_key, mime_type, sha256, size, alt_text, approval_status | Không lưu base64 trong JSON |
| exams / exam_versions | stable_key, optional source, version, mode, purpose, grade, subject, status | source required by FIXED workflow; nullable for multi-source ASSEMBLED; unique version; grade 1–12 |
| exam_sections / exam_items | position, instruction_json, version/group target | thứ tự FIXED ổn định; đúng một target |
| stimuli / stimulus_versions | content_json, schema_version, status | nội dung dùng chung có version |
| questions / question_versions | type, content/answer, points/status, curriculum/topic/skill/difficulty/estimated/family | answer key không thuộc student projection; metadata complete mới eligible assembly |
| question_options | option_key, position, content_json | rich content, unique trong version |
| question_groups / items | stimulus_version_id, selection_policy, position | atomic hoặc split-with-stimulus |
| source_provenance | question_version, source, license, relation_type | hỗ trợ nhiều nguồn |
| asset_references | asset, owner_type/id, json_path | kiểm tra asset trước publish |
| users | email, display_name, password_hash, status | email unique; password scrypt hash, không lưu plaintext |
| user_roles | user_id, role, scope_type | role phía server; slice hiện tại chỉ global scope |
| auth_sessions | user_id, token/csrf hash, expires/revoked | opaque token chỉ lưu SHA-256; session revoke phía server |
| audit_logs | actor, event/resource, outcome, details | audit auth/import/review/attempt; không chứa raw token/password hay answer payload |
| import_jobs | package_id/hash, status, creator, report | idempotency theo package + hash; creator dùng chống self-review |
| import_reviews | import_job_id, reviewer_id, scope, decision, reason, report/package hash, actor source | tối đa một decision bất biến cho mỗi scope TECHNICAL/ACADEMIC |
| import_publications | import_job_id, exam_version_id, publisher, report/package hash | idempotency marker và provenance của atomic publish |
| exam_attempts | student, exam_version, status, create idempotency key, snapshots/hash, answer_revision, current_score_revision | snapshot bất biến; optimistic concurrency; scoring JSON không trả client |
| attempt_responses | attempt, question_version, answer_json, saved_revision | response map đã server ACK; FK tới attempt/question version |
| attempt_operations | student, attempt, operation_type, idempotency_key, request_sha256, response_json | exact replay cho AUTOSAVE/SUBMIT; key không được dùng lại với request khác |
| attempt_score_revisions | attempt, revision_number, scoring_state/version, result_json, actor | immutable score history; revision 1 do submit, regrade/manual scoring chưa có |
| assembly_runs | creator, idempotency/request hash, blueprint, seed/engine, selection/source JSON, student/scoring snapshots, hashes | immutable successful run; owner-only public projection; unique creator/key |
| exam_blueprints / versions | stable key, version, blueprint JSON, approval status, creator | immutable blueprint content; version 1/run hiện tại; status chỉ workflow mutation |
| assembly_reviews | run/version, reviewer, decision, reason, selection/snapshot hashes | một quyết định bất biến/run; creator không tự duyệt |
| assembly_publications | run/version/ExamVersion, publisher, source/published hashes, student/scoring snapshots | một publication/run; source cho catalog ASSEMBLED và attempt |

Retention/xóa mềm đầy đủ chưa triển khai; entity đã được tham chiếu không được hard-delete ở feature tương lai.
