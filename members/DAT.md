# 👤 Đạt – SV2: Advanced Query Specialist (Redis)

**Phạm vi code:** `backend/src/main/java/vn/edu/huit/digitallibrary/reading/` và `ranking/`. Xem [phần dùng chung](../docs/SHARED.md).

## Phase 1
- [x] Hiện thực Redis bằng Spring Data Redis trên khung Spring Boot đã có — Mongo/Redis thật và regression ID đã qua, [bằng chứng](../docs/dat/ID_NORMALIZATION.md).
- [x] Cùng Vũ chốt quy ước key (`progress:{userId}:{bookId}`, `ranking:books`) — quy ước đã có trong [hợp đồng nhóm](../docs/SHARED.md); ID hợp lệ chuẩn hóa về ObjectId hex thường, [kiểm chứng](../docs/dat/ID_NORMALIZATION.md).
- [x] Script seed Redis: **≥ 50 Hash** tiến trình đọc + **1 ZSET 50 cuốn sách** kèm lượt đọc (phối hợp Sơn, dùng `bookId` thật từ Mongo) — `scripts/seed/seed_redis.py` đọc `book_ids.json` của Sơn: 60 Hash, ZSET 50 sách trên key thật; fixture riêng vẫn giữ cho benchmark, [audit](../docs/dat/ACCEPTANCE_RESULTS.md).
- [x] Thử các lệnh cơ bản trên Redis Insight, ghi lại lệnh mẫu — [ảnh Hash/ZSET/session và lệnh S03](../docs/dat/ACCEPTANCE_RESULTS.md).

## Phase 2 (trọng tâm – barem mục 3, 2.5đ)
### A. Lưu tiến trình đọc dở (Redis Hashes)
- [x] `PUT /api/progress/{userId}/{bookId}` → `HSET progress:{userId}:{bookId} chapter page line updatedAt` — auth/validation và ID hoa/thường cùng Hash đã qua; [P01–P06/F02](../docs/dat/ID_NORMALIZATION.md).
- [x] `GET /api/progress/{userId}/{bookId}` → `HGETALL`, trả về tiến trình đã lưu — PUT alias trang30 rồi GET chuẩn đúng trang30; [regression](../docs/dat/ID_NORMALIZATION.md). Dữ liệu alias cũ chưa migration.
- [x] (Tùy chọn) `GET /api/progress/{userId}` → danh sách sách đang đọc dở — người dùng đã chọn 26/10; auth/chính chủ/admin, mới nhất trước, bỏ sách mất; 18 test qua gồm Mongo/Redis thật; [kết quả](../docs/dat/GIAI_THICH_PHAN_DAT.md).

### B. Bảng xếp hạng sách đọc nhiều nhất (Redis ZSET)
- [x] `POST /api/books/{bookId}/read` → `ZINCRBY ranking:books 1 {bookId}` khi mở chương — API hoa/thường và 40 request đồng thời đã qua; 26/10 kiểm chứng web local: mở chương tăng điểm, lật trang không tăng; [kết quả Phase 2](../docs/dat/GIAI_THICH_PHAN_DAT.md).
- [x] `GET /api/ranking?top=10` → `ZREVRANGE ranking:books 0 N-1 WITHSCORES`, trả `bookId` và `score`; Sơn ghép thông tin sách — API/top/batch và web local ghép metadata, giữ thứ tự đã qua; hai trang frontend có thay đổi từ trước, đưa vào PR theo yêu cầu; [R03/R05](../docs/dat/GIAI_THICH_PHAN_DAT.md).
- [x] (Tùy chọn) Chống tăng điểm lặp quá nhanh: khóa `SET NX EX` theo user + chương — người dùng chọn60giây; POST cần login+chapterNo, khóa/tăng nguyên tử,40request đồng thời chỉ tăng1, user/chương khác tính riêng; [bằng chứng](../docs/dat/GIAI_THICH_PHAN_DAT.md).

### C. Kiểm thử hiệu năng (phối hợp Sơn)
- [x] Đo độ trễ lấy tiến trình: Redis vs Mongo (ví dụ 1000 lần) — 26/10 dùng manifest user/sách/chương và progress lấy từ seed Sơn, bản sao benchmark riêng; warm-up200, 1000 mẫu/backend, 0 lỗi, raw/summary khớp; [B01 và số liệu](../docs/dat/GIAI_THICH_PHAN_DAT.md).
- [x] Ghi kết quả cho Vũ đưa vào báo cáo — đã ghi số liệu, phương pháp và giới hạn tại [bản bàn giao 26/10](../docs/dat/GIAI_THICH_PHAN_DAT.md). Chỉ xác nhận việc ghi/bàn giao trong repo; chưa gửi ra ngoài hoặc có xác nhận Vũ nhận bản mới.

### D. Demo
- [x] Đọc liên tục một cuốn sách để ZSET tăng điểm, BXH nhảy vị trí — hai lượt demo kỹ thuật trên Edge: cùng sách score0→4→8, vượt cuốn đối chứng, web đúng thứ tự; [I02 và ảnh/JSON](../docs/dat/GIAI_THICH_PHAN_DAT.md). Chưa phải tổng duyệt ba thành viên.

## Definition of Done
- Đóng/mở lại sách → trả về đúng trang đã lưu.
- Redis Insight thấy điểm ZSET tăng theo từng lần đọc.

Cập nhật 26/10/2026: backend, manifest từ dữ liệu seed Sơn, phép đo và demo kỹ thuật reading/ranking trên web local đã có bằng chứng. Đóng hẳn Edge sau báo “Đã lưu” rồi mở lại đúng trang30 đã qua hai lượt. Chưa xác minh đóng khi request còn đang gửi; tổng duyệt nhóm/xác nhận Vũ nhận số liệu mới và migration alias legacy còn riêng. Frontend có thay đổi local từ trước, được giữ để tích hợp. [Checkpoint](../docs/dat/PROGRESS.md), [kết quả hiện tại](../docs/dat/GIAI_THICH_PHAN_DAT.md).
