# 👤 Sơn – SV3: Fullstack Integrator & DB Tester

**Phạm vi code:** `frontend/src/features/`, `scripts/seed/`; phối hợp chỉnh `frontend/src/shared/` khi cần. Xem [phần dùng chung](../docs/SHARED.md).

## Phase 1
### A. Dummy data MongoDB (1.0đ – barem mục 4)
- [x] Script seed: **50–100 đầu sách**, mỗi sách **5–10 chương** nội dung toàn văn lồng nhau (faker hoặc sách miễn phí Project Gutenberg)
- [x] Script chạy lặp được, có lệnh chạy được ghi trong README khi hoàn thành
- [ ] Kiểm tra dữ liệu bằng **MongoDB Compass** (số lượng, cấu trúc lồng nhau)
- [x] Phối hợp Đạt nạp dữ liệu Redis (≥ 50 Hash, ZSET 50 sách)

### B. Giao diện cơ bản
- [x] Trang danh sách sách, tìm kiếm/lọc, chi tiết sách
- [x] Trang quản trị: thêm/sửa/xóa sách, thêm chương (gọi API của Vũ)
- [x] Đăng ký / đăng nhập độc giả
- [x] Dùng khung React/Vite trong `frontend/`, thay các trang placeholder bằng giao diện thật

## Phase 2 (barem mục 3 & 4)
### C. Giao diện E-Reader
- [ ] Màn hình đọc có phân trang, nút chuyển chương/trang
- [ ] Khi mở sách: gọi API tiến trình → **tự cuộn đến đúng trang đã lưu**
- [ ] Tự động lưu tiến trình khi chuyển trang; khi đóng tab dùng cơ chế gửi phù hợp để tránh mất request
- [ ] Mỗi lần mở chương → gọi API tăng lượt đọc
- [ ] Widget **Top sách thịnh hành** (cập nhật định kỳ)

> Trạng thái 28/10/2026: code của cả 5 mục trên đã merge vào `main` qua PR #8 (`ReadingPage`, `useSaveOnExit`, `TopBooksWidget`, tự cập nhật 10 giây). API tương ứng đã kiểm chứng đầu-cuối trên Mongo/Redis thật, [biên bản](../docs/PHASE2_INTEGRATION.md). Vẫn để `[ ]` vì các mục này là hành vi trên trình duyệt (tự mở đúng trang, gửi request khi đóng tab) mà chưa có bằng chứng duyệt tay — build và curl không thay cho một lượt chạy thật.

### D. Kiểm thử & quan sát
- [ ] Thành thạo **MongoDB Compass** + **Redis Insight** chạy song song
- [ ] Đo hiệu năng cùng Đạt, tổng hợp bảng số liệu

### E. Điều phối Demo (1.5đ)
- [ ] Chuẩn bị môi trường, tài khoản, sách cố định cho demo (`docs/DEMO_SCRIPT.md`)
- [ ] Chạy thử toàn bộ kịch bản ≥ 2 lần trước ngày bảo vệ
- [ ] Chuẩn bị video demo dự phòng
- [ ] Điều phối: Vũ đọc đến trang 30, Sơn mở lại, Đạt đọc liên tục, Sơn mở Insight

## Definition of Done
- Docker Compose, backend Spring Boot, frontend React và script seed đã hoàn thành phải chạy được theo `docs/SHARED.md`.
- Kịch bản demo chạy trơn tru, không cần can thiệp thủ công.
