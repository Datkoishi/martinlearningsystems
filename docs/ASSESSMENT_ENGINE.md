# Assessment Engine

Chưa triển khai phần đánh giá năng lực. Scoring và assessment là hai boundary riêng: `eduassess-scoring-v1` hiện chỉ tính điểm attempt theo answer key/rule đã đóng băng, lưu immutable score revision và đưa essay đã trả lời sang `PENDING_MANUAL_SCORING`. Điểm số này không được diễn giải thành mức năng lực.

Assessment cần framework/rubric/evidence/interpretation rule có version và approval. Nếu coverage/min evidence/task type chưa đủ, kết quả là `Chưa đủ bằng chứng`. Không hardcode ngưỡng phần trăm thành mức năng lực. Formal assessment mặc định disabled cho đến khi có validation và approver/audit.
