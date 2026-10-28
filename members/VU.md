# 👤 Vũ – SV1: Data Architect & CRUD Lead

**Phạm vi code:** `backend/src/main/java/vn/edu/huit/digitallibrary/catalog/`, `identity/`, `docs/ARCHITECTURE.md`. Xem [phần dùng chung](../docs/SHARED.md).

## Phase 1
### A. Thiết kế & báo cáo (2.5đ – barem mục 1)
- [x] Giải trình kiến trúc Polyglot Persistence (1.0đ) trong `docs/ARCHITECTURE.md`
- [x] Thiết kế JSON Schema MongoDB: `books` (chương, mục lồng nhau), `users` (+ validator, index)
- [x] Thiết kế cấu trúc Redis Hashes / ZSET (phối hợp Đạt chốt quy ước key) – Đạt xác nhận lại khi hiện thực
- [x] Vẽ sơ đồ kiến trúc & document model

### B. API CRUD trên MongoDB (2.5đ – barem mục 2)
- [x] Hiện thực domain `catalog` và `identity` trên khung Spring Boot đã có; kết nối MongoDB qua Spring Data
- [x] CRUD **sách**: tạo / danh sách (phân trang, lọc thể loại) / chi tiết / sửa / xóa
- [x] **Thêm chương mới** vào sách (`$push`), sửa/xóa chương
- [x] Quản lý **tài khoản độc giả**: đăng ký, đăng nhập, xem/sửa/xóa
- [x] Tạo index (text index tiêu đề/tác giả, index thể loại)
- [x] Viết ví dụ request/response và cập nhật hợp đồng API trong `docs/SHARED.md`

## Phase 2
- [x] Hỗ trợ Đạt/Sơn: API lấy nội dung chương (`bookId` + `chapterNo`), lấy thông tin sách cho BXH
- [x] Chốt cơ chế xác thực và quyền quản trị trước khi Sơn nối giao diện tài khoản
- [x] Bổ sung báo cáo: kết quả đo hiệu năng, bảng so sánh Mongo vs Redis — bốn thao tác, 1000 mẫu/CSDL từ `scripts/seed/bench_latency.py`; bảng và cách đọc số liệu ở [ARCHITECTURE.md mục 5](../docs/ARCHITECTURE.md).
- [ ] Hoàn thiện báo cáo cuối, rà soát barem — mục 6 ARCHITECTURE đã cập nhật theo kết quả merge Phase 2 (54 test, 0 lỗi) và các lỗi đã sửa; bản báo cáo nộp cuối cùng chưa tổng hợp.
- [ ] Tham gia demo: đọc đến trang 30 rồi đóng trình duyệt — chờ tổng duyệt trên trình duyệt thật (I01), xem [biên bản tích hợp](../docs/PHASE2_INTEGRATION.md).

## Definition of Done
- Mọi endpoint CRUD test được qua Postman/curl; dữ liệu hiển thị đúng trong Compass.
- Báo cáo đủ 2 phần: giải trình + thiết kế (2.5đ).
