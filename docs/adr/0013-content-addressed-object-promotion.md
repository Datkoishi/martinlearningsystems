# ADR-0013 — Content-addressed object promotion với archive rollback

## Bối cảnh

Published asset hiện đọc entry trong source ZIP trên `import_data`. Cách này giữ publication nguyên tử nhưng khiến catalog phụ thuộc local volume và không phù hợp cho object delivery/CDN. Copy object trong transaction publish sẽ tạo distributed transaction giữa MySQL và storage; rewrite/xóa archive reference cũng làm mất recovery/provenance và khiến rollback khó kiểm chứng.

## Quyết định

- Giữ `media_assets.storage_key` làm archive reference bất biến. Thêm `storage_backend`, `object_storage_key`, promoted/rolled-back timestamps bằng migration additive; row cũ mặc định `ARCHIVE`.
- Object key là `<prefix>/sha256/<first-two>/<sha256>`. Promotion đọc archive và xác minh metadata, dùng conditional PUT để không overwrite, GET lại và xác minh size/SHA-256 trước khi transactionally đổi `storage_backend=OBJECT`.
- Catalog OBJECT ưu tiên object bytes đã verify. `OBJECT_STORAGE_ARCHIVE_FALLBACK=true` cho phép đọc archive khi object missing/corrupt/unavailable trong rollout; catalog vẫn áp integrity check cuối.
- Mỗi cutover/rollback ghi `media_asset_storage_events` bất biến và audit. Retry cùng state/key là no-op đã verify.
- Rollback chỉ đổi về ARCHIVE sau khi source archive khớp hash/size dưới lock metadata; object/key được giữ. Asset rollback bị loại khỏi batch, chỉ promote lại với flag rõ ràng.
- Bucket phải provision bên ngoài. Custom endpoint production bắt buộc HTTPS; credential lấy từ workload identity hoặc secret manager. CLI là operator boundary, không có public API đổi storage state.

## Hệ quả

DB không trỏ tới object chưa verify và runtime có đường phục hồi nhanh mà không copy ngược dữ liệu. Upload thành công nhưng DB transaction lỗi có thể để object chưa referenced; content-addressing khiến orphan này an toàn và retry reuse sau verification. Không có cleanup tự động để tránh xóa nhầm bytes đang được điều tra hoặc dùng bởi asset cùng hash.

Archive volume vẫn nằm trong recovery set và không được xóa chỉ vì asset đã promote. Fallback có thể che sự cố object nếu không có metrics/alert; production phải quan sát object failure/fallback rate và chỉ tắt fallback sau cửa sổ xác minh + rollback rehearsal. CDN, bucket replication/lifecycle, off-site recovery, least-privilege identity và alert wiring thuộc deployment, không được suy ra là hoàn tất từ adapter này.

Node runtime/container/CI được nâng lên Node 24 LTS cùng slice vì Node 20 đã EOL và dependency S3 đã cảnh báo sắp bỏ hỗ trợ.
