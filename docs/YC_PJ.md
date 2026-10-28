ĐỀ TÀI 15: HỆ THỐNG THƯ VIỆN SỐ VÀ ĐỌC SÁCH TRỰC TUYẾN (POLYGLOT PERSISTENCE)
Hệ quản trị CSDL chính: Phối hợp MongoDB + Redis (Polyglot Persistence)
Số lượng thành viên: 03 sinh viên
Yêu cầu sản phẩm: Cổng đọc sách điện tử trực tuyến cho phép quản lý kho sách phong phú, lưu lại tiến trình đọc dở và hiển thị bảng xếp hạng sách thịnh hành.
1. BAREM ĐÁNH GIÁ CHI TIẾT (THANG ĐIỂM 10.0)
1. Báo cáo & Thiết kế CSDL (2.5đ):
1.0đ: Giải trình kiến trúc Polyglot Persistence: Vì sao dùng MongoDB lưu nội dung toàn văn và Redis lưu trạng thái tạm/BXH.
1.5đ: Thiết kế JSON Schema trên MongoDB (sách, chương, mục) và cấu trúc Hashes / ZSET trên Redis.
2. Chức năng CRUD Nền tảng (2.5đ): Quản lý danh mục sách, thêm chương mới trên MongoDB và quản lý tài khoản độc giả.
3. Chức năng nâng cao đặc trưng (2.5đ):
Lưu tiến trình đọc tức thì (Redis Hashes): Lưu vị trí trang/dòng đọc dở của người dùng vào Redis Hashes để mở lại tức thì với độ trễ cực thấp.
Bảng xếp hạng sách đọc nhiều nhất (Redis ZSET): Sử dụng ZINCRBY tăng điểm mỗi khi độc giả đọc chương và dùng ZREVRANGE lấy Top sách thịnh hành.
4. Kiểm thử hiệu năng & Demo trực quan (2.5đ):
1.0đ (Dummy Data): Bộ dữ liệu mẫu đạt chuẩn định mức bên dưới.
1.5đ (Demo sống): Thực hiện trơn tru các bước trong kịch bản demo bảo vệ.
2. QUY ĐỊNH ĐỊNH MỨC BỘ DỮ LIỆU MẪU (DUMMY DATA)
MongoDB sach: Tối thiểu 50–100 Đầu sách (mỗi sách chứa 5–10 chương nội dung toàn văn lồng nhau).
Redis: Tối thiểu 50 Key Hashes lưu tiến trình đọc và 1 Sorted Set chứa 50 cuốn sách kèm lượt đọc.
3. PHÂN CÔNG CÔNG VIỆC NHÓM 3 SINH VIÊN
SV1 (Data Architect & CRUD Lead): Thiết kế Schema toàn văn trên MongoDB và cấu trúc Hashes/ZSET trên Redis; viết toàn bộ API CRUD kho sách trên MongoDB.
SV2 (Advanced Query Specialist): Xây dựng phân hệ Redis: Lưu tiến trình đọc dở vào Hashes; cập nhật lượt đọc và tự động xếp hạng Top sách bằng Sorted Sets (ZSET).
SV3 (Fullstack Integrator & DB Tester): Nạp 50 đầu sách kèm nội dung các chương vào MongoDB; quản trị song song MongoDB Compass và Redis Insight; thiết kế giao diện đọc sách E-Reader và điều phối Demo.
4. KỊCH BẢN DEMO SỐNG BẢO VỆ
SV1 đọc sách đến Trang 30 trên Web rồi đóng trình duyệt.
SV3 mở lại sách $\rightarrow$ Hệ thống tự động cuộn đến đúng Trang 30 nhờ truy xuất tức thì từ Redis Hashes.
SV2 đọc liên tục một cuốn sách $\rightarrow$ SV3 mở Redis Insight chứng minh điểm ZSET tăng và BXH tự động nhảy vị trí.
