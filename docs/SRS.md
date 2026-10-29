# Đặc tả yêu cầu phần mềm (SRS)
## Hệ thống Thư viện số và Đọc sách trực tuyến

> **Loại tài liệu:** đặc tả hiện trạng (*as-built*). Nhóm không lập SRS trước khi hiện thực; tài liệu này được viết sau, suy ra từ yêu cầu gốc trong [YC_PJ.md](YC_PJ.md) rồi đối chiếu với hệ thống đã xây dựng. Mọi yêu cầu ở đây đều truy ngược được về đề tài, không phải mô tả lại code (xem [mục 7 – Ma trận truy vết](#7-ma-trận-truy-vết)).

---

## 1. Giới thiệu

### 1.1. Mục đích

Tài liệu mô tả đầy đủ yêu cầu chức năng và phi chức năng của hệ thống Thư viện số, làm căn cứ để:

- Người chấm đối chiếu sản phẩm với barem đề tài.
- Thành viên nhóm xác định ranh giới trách nhiệm và điều kiện hoàn thành.
- Người tiếp nhận sau này hiểu hệ thống mà không cần đọc toàn bộ mã nguồn.

### 1.2. Phạm vi

Hệ thống là một **cổng đọc sách điện tử trực tuyến** gồm ba khối:

1. **Quản lý kho sách** — danh mục sách và chương, nội dung toàn văn, lưu trên MongoDB.
2. **Đọc sách và lưu tiến trình** — E-Reader trên trình duyệt, ghi nhớ vị trí trang/dòng trên Redis.
3. **Bảng xếp hạng sách thịnh hành** — đếm lượt đọc và xếp hạng bằng Redis Sorted Set.

Ngoài phạm vi: thanh toán, mượn/trả sách vật lý, DRM, ứng dụng di động, đọc ngoại tuyến, đồng bộ nhiều thiết bị theo thời gian thực.

### 1.3. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Polyglot Persistence** | Dùng nhiều hệ quản trị CSDL trong một hệ thống, mỗi hệ cho loại dữ liệu phù hợp |
| **Toàn văn lồng nhau** | Nội dung chương và mục nằm ngay trong document sách, không tách collection riêng |
| **Tiến trình đọc** | Vị trí đang đọc dở của một độc giả với một cuốn sách: chương, trang, dòng |
| **Trang** | Đơn vị hiển thị do E-Reader chia ra, đánh số **liên tục trên cả cuốn sách** |
| **Dòng** | Số dòng văn bản đã trôi qua mép trên vùng đọc |
| **Lượt đọc** | Một lần mở một chương trong E-Reader, sau khi qua cơ chế chống đếm trùng |
| **Hash / ZSET / Set** | Các kiểu dữ liệu Redis: bảng băm, tập hợp có điểm, tập hợp |

### 1.4. Tài liệu tham chiếu

| Tài liệu | Nội dung |
|---|---|
| [YC_PJ.md](YC_PJ.md) | **Yêu cầu gốc**: đề tài, barem 10 điểm, định mức dữ liệu, kịch bản demo |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Giải trình kiến trúc, schema MongoDB, quy ước key Redis, số đo hiệu năng |
| [SHARED.md](SHARED.md) | Hợp đồng API, quy ước dữ liệu, ranh giới code giữa ba thành viên |
| [RESUME_MECHANISM.md](RESUME_MECHANISM.md) | Cơ chế khôi phục vị trí đọc |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | Kịch bản demo bảo vệ |

---

## 2. Mô tả tổng thể

### 2.1. Bối cảnh

Hệ thống chạy độc lập, không tích hợp với hệ thống bên ngoài. Kiến trúc ba lớp:

```
Trình duyệt (React)
      │  HTTP/JSON, Bearer token
      ▼
Backend Spring Boot  ──────┬──────────────┐
                           ▼              ▼
                      MongoDB          Redis
                  (nội dung sách)  (tiến trình, BXH, phiên)
```

### 2.2. Nhóm người dùng

| Tác nhân | Mô tả | Quyền |
|---|---|---|
| **Khách** | Chưa đăng nhập | Xem danh sách, tìm kiếm, xem chi tiết và nội dung chương |
| **Độc giả** (`USER`) | Đã đăng ký và đăng nhập | Quyền của Khách, thêm: đọc trên E-Reader, lưu và khôi phục vị trí, đóng góp lượt đọc, quản lý hồ sơ của chính mình |
| **Quản trị** (`ADMIN`) | Tài khoản quản trị | Quyền của Độc giả, thêm: thêm/sửa/xóa sách và chương, xem và xóa tài khoản bất kỳ |

### 2.3. Ràng buộc

| Mã | Ràng buộc | Nguồn |
|---|---|---|
| RB-01 | Bắt buộc dùng **MongoDB kết hợp Redis**, mỗi hệ đảm nhiệm đúng loại dữ liệu phù hợp | Đề tài |
| RB-02 | Nội dung chương và mục phải **lồng trong document sách**, không tách collection | Đề tài, định mức dữ liệu |
| RB-03 | Tiến trình đọc phải lưu bằng **Redis Hashes**; bảng xếp hạng phải dùng **Redis ZSET** với `ZINCRBY` và `ZREVRANGE` | Barem mục 3 |
| RB-04 | Dữ liệu mẫu: **50–100 đầu sách**, mỗi sách **5–10 chương** toàn văn; **≥ 50 Hash** tiến trình; **1 ZSET 50 sách** | Định mức dữ liệu |
| RB-05 | Hệ thống phải chạy được trên máy cục bộ bằng Docker Compose để demo trực tiếp | Barem mục 4 |
| RB-06 | Phải hiển thị được dữ liệu song song trên MongoDB Compass và Redis Insight | Phân công SV3 |

### 2.4. Giả định

- Demo chạy trên một máy, không có người dùng đồng thời quy mô lớn.
- Nội dung sách là dữ liệu mẫu sinh tự động, không phải tác phẩm có bản quyền.
- Người dùng dùng trình duyệt hiện đại có hỗ trợ `fetch` với tùy chọn `keepalive`.

---

## 3. Yêu cầu chức năng

Ký hiệu trạng thái: **Đạt** = đã hiện thực và kiểm chứng; **Một phần** = còn thiếu một nhánh.

### 3.1. Phân hệ Kho sách (CAT)

| Mã | Yêu cầu | Tác nhân | Hiện thực | Trạng thái |
|---|---|---|---|---|
| FR-CAT-01 | Xem danh sách sách có phân trang; mỗi trang 1–100 mục; mặc định sách mới trước | Khách | `GET /api/books` | Đạt |
| FR-CAT-02 | Tìm sách theo tiêu đề hoặc tác giả, **không phân biệt dấu tiếng Việt**; kết quả xếp theo độ khớp | Khách | `GET /api/books?q=` | Đạt |
| FR-CAT-03 | Lọc sách theo thể loại | Khách | `GET /api/books?category=` | Đạt |
| FR-CAT-04 | Lấy danh sách thể loại có trong kho, đã sắp xếp | Khách | `GET /api/books/categories` | Đạt |
| FR-CAT-05 | Xem chi tiết một cuốn: thông tin mô tả và **mục lục** (tên chương, tiêu đề các mục), không kèm toàn văn | Khách | `GET /api/books/{bookId}` | Đạt |
| FR-CAT-06 | Đọc **toàn văn một chương** gồm nội dung chính và các mục con | Khách | `GET /api/books/{bookId}/chapters/{chapterNo}` | Đạt |
| FR-CAT-07 | Lấy **toàn văn cả cuốn** trong một lần gọi, phục vụ E-Reader đánh số trang liên tục | Khách | `GET /api/books/{bookId}/content` | Đạt |
| FR-CAT-08 | Lấy thông tin nhiều sách theo danh sách id, giữ đúng thứ tự, bỏ qua id không tồn tại, tối đa 100 id | Khách | `GET /api/books/batch?ids=` | Đạt |
| FR-CAT-09 | Thêm sách mới, kèm danh sách chương nếu có | Quản trị | `POST /api/books` | Đạt |
| FR-CAT-10 | Sửa thông tin sách (không đụng tới chương) | Quản trị | `PUT /api/books/{bookId}` | Đạt |
| FR-CAT-11 | Xóa sách; hệ thống phải **tự dọn** tiến trình đọc và điểm xếp hạng liên quan trên Redis | Quản trị | `DELETE /api/books/{bookId}` | Đạt |
| FR-CAT-12 | Thêm chương mới; bỏ trống số chương thì tự gán số kế tiếp; trùng số chương bị từ chối | Quản trị | `POST /api/books/{bookId}/chapters` | Đạt |
| FR-CAT-13 | Sửa nội dung chương; không cho đổi số chương | Quản trị | `PUT /api/books/{bookId}/chapters/{chapterNo}` | Đạt |
| FR-CAT-14 | Xóa một chương | Quản trị | `DELETE /api/books/{bookId}/chapters/{chapterNo}` | Đạt |

### 3.2. Phân hệ Tài khoản và Xác thực (IDN)

| Mã | Yêu cầu | Tác nhân | Hiện thực | Trạng thái |
|---|---|---|---|---|
| FR-IDN-01 | Đăng ký tài khoản độc giả; tên đăng nhập và email không được trùng; email phải đúng định dạng | Khách | `POST /api/users` | Đạt |
| FR-IDN-02 | Đăng nhập, nhận lại **token phiên** kèm thời điểm hết hạn và thông tin người dùng | Khách | `POST /api/auth/login` | Đạt |
| FR-IDN-03 | Đăng xuất, thu hồi phiên hiện tại | Độc giả | `POST /api/auth/logout` | Đạt |
| FR-IDN-04 | Xem thông tin người đang đăng nhập, để giao diện khôi phục trạng thái sau khi tải lại trang | Độc giả | `GET /api/auth/me` | Đạt |
| FR-IDN-05 | Xem và sửa hồ sơ (email, họ tên, mật khẩu); chỉ chính chủ hoặc quản trị được phép | Độc giả | `GET/PUT /api/users/{userId}` | Đạt |
| FR-IDN-06 | Đổi mật khẩu phải **thu hồi toàn bộ phiên** đang mở của tài khoản đó | Độc giả | `PUT /api/users/{userId}` | Đạt |
| FR-IDN-07 | Xóa tài khoản; hệ thống phải tự dọn tiến trình đọc và phiên của tài khoản đó | Độc giả, Quản trị | `DELETE /api/users/{userId}` | Đạt |
| FR-IDN-08 | Phân quyền ba mức: công khai, cần đăng nhập, chỉ quản trị; truy cập sai quyền trả lỗi rõ ràng | Hệ thống | `@Authenticated`, `@AdminOnly` | Đạt |
| FR-IDN-09 | Tài khoản quản trị được tạo tự động khi khởi động nếu hệ thống chưa có quản trị nào | Hệ thống | `AdminAccountInitializer` | Đạt |

### 3.3. Phân hệ Đọc sách (RDG)

| Mã | Yêu cầu | Tác nhân | Hiện thực | Trạng thái |
|---|---|---|---|---|
| FR-RDG-01 | Chia nội dung sách thành trang để đọc; **đánh số trang liên tục trên cả cuốn**, mỗi chương bắt đầu ở trang mới | Độc giả | `paginateBook` | Đạt |
| FR-RDG-02 | Lật trang tới/lui và chuyển chương bằng mục lục | Độc giả | `ReadingPage` | Đạt |
| FR-RDG-03 | **Nhảy thẳng tới một trang bất kỳ** bằng cách nhập số trang | Độc giả | ô "Nhảy tới trang" | Đạt |
| FR-RDG-04 | Lưu **vị trí trang và dòng** vào Redis Hash mỗi khi người đọc đổi vị trí; lưu cả số chương suy ra từ trang | Độc giả | `PUT /api/progress/{userId}/{bookId}` | Đạt |
| FR-RDG-05 | Khi mở lại sách, **tự động khôi phục đúng trang và cuộn tới đúng dòng** đã lưu, kèm thông báo cho người đọc | Độc giả | `GET /api/progress/{userId}/{bookId}` | Đạt |
| FR-RDG-06 | Lưu vị trí khi người đọc **đóng tab hoặc chuyển tab**, kể cả lúc trang đang đóng | Độc giả | `useSaveOnExit` | Đạt |
| FR-RDG-07 | Lật trang nhanh liên tục **không được làm vị trí cũ ghi đè vị trí mới** trên Redis | Hệ thống | hàng đợi một request | Đạt |
| FR-RDG-08 | Vị trí đã lưu vượt quá số trang hiện có (sách bị sửa ngắn lại) phải tự kéo về trang cuối và ghi lại | Hệ thống | hiệu ứng tự chữa | Đạt |
| FR-RDG-09 | Chỉ chính chủ hoặc quản trị được đọc và ghi tiến trình của một tài khoản | Hệ thống | `requireAccess` | Đạt |
| FR-RDG-10 | Liệt kê **mọi sách đang đọc dở** của một độc giả, mới nhất trước, bỏ qua sách đã xóa | Độc giả | `GET /api/progress/{userId}` | **Một phần** — API xong, chưa có màn hình sử dụng |

### 3.4. Phân hệ Bảng xếp hạng (RNK)

| Mã | Yêu cầu | Tác nhân | Hiện thực | Trạng thái |
|---|---|---|---|---|
| FR-RNK-01 | Mỗi lần độc giả **mở một chương** thì tăng 1 điểm cho cuốn sách đó bằng `ZINCRBY` | Độc giả | `POST /api/books/{bookId}/read` | Đạt |
| FR-RNK-02 | Lật trang trong cùng một chương **không** tính thêm lượt đọc | Hệ thống | số chương suy từ số trang | Đạt |
| FR-RNK-03 | Chống đếm trùng: cùng người, cùng sách, cùng chương chỉ tính **tối đa 1 lượt trong 60 giây**; thao tác kiểm tra và cộng điểm phải **nguyên tử** | Hệ thống | khóa `SET NX EX` trong Lua | Đạt |
| FR-RNK-04 | Chỉ tính lượt đọc khi sách và chương **thực sự tồn tại** trong MongoDB; yêu cầu phải đăng nhập | Hệ thống | `RankingService` | Đạt |
| FR-RNK-05 | Lấy **Top N sách** theo điểm bằng `ZREVRANGE`, N trong khoảng 1–100 | Khách | `GET /api/ranking?top=` | Đạt |
| FR-RNK-06 | Hiển thị bảng xếp hạng kèm tên sách, tác giả, thể loại, số lượt đọc; tự cập nhật định kỳ | Khách | `RankingPage` | Đạt |
| FR-RNK-07 | Hiển thị **xu hướng tăng/giảm hạng** so với một mốc; mốc phải sống sót khi người dùng rời tab rồi quay lại; cho phép đặt lại mốc | Khách | cột "Xu hướng" | Đạt |
| FR-RNK-08 | Sách bị xóa phải được gỡ khỏi ZSET, không chiếm chỗ trong Top N | Hệ thống | `BookDeletedEvent` | Đạt |

### 3.5. Phân hệ Dữ liệu mẫu và Vận hành (OPS)

| Mã | Yêu cầu | Hiện thực | Trạng thái |
|---|---|---|---|
| FR-OPS-01 | Script nạp **50–100 đầu sách**, mỗi sách **5–10 chương** toàn văn, mỗi chương 2–4 mục | `seed_books.py` | Đạt |
| FR-OPS-02 | Script nạp **≥ 50 Hash** tiến trình và **ZSET 50 sách**, dùng `bookId` thật từ MongoDB | `seed_redis.py` | Đạt |
| FR-OPS-03 | Script chạy lại nhiều lần **không nhân đôi dữ liệu** (ID ổn định, ghi bằng upsert) | `seed_books.py` | Đạt |
| FR-OPS-04 | Script tự kiểm tra dữ liệu theo JSON Schema trước khi ghi; có chế độ chạy thử không ghi | `--dry-run` | Đạt |
| FR-OPS-05 | Toàn bộ hạ tầng khởi động bằng một lệnh Docker Compose, kèm công cụ quan sát | `docker-compose.yml` | Đạt |
| FR-OPS-06 | Có endpoint kiểm tra tình trạng hệ thống | `GET /api/health` | Đạt |

---

## 4. Yêu cầu phi chức năng

### 4.1. Hiệu năng

| Mã | Yêu cầu | Kết quả đo |
|---|---|---|
| NFR-P01 | Đọc tiến trình từ Redis phải nhanh hơn đọc cùng dữ liệu từ MongoDB | Trung vị 0,802 ms so với 1,059 ms (**1,32×**) |
| NFR-P02 | Ghi tiến trình (mỗi lần lật trang) phải đạt độ trễ dưới mức người dùng cảm nhận được | Trung vị 0,831 ms, p95 1,210 ms |
| NFR-P03 | Lấy Top 10 không được sắp xếp lại toàn bộ dữ liệu khi đọc | `ZREVRANGE` trên cấu trúc đã sắp sẵn; trung vị 0,790 ms |
| NFR-P04 | Phép đo phải có phương pháp rõ ràng: số mẫu, warm-up, điều kiện, và nêu giới hạn | 1000 mẫu/thao tác, warm-up 200, gọi xen kẽ; giới hạn đã nêu trong [ARCHITECTURE §5](ARCHITECTURE.md) |

### 4.2. An toàn thông tin

| Mã | Yêu cầu |
|---|---|
| NFR-S01 | Mật khẩu lưu dưới dạng băm **bcrypt**, không bao giờ lưu dạng rõ |
| NFR-S02 | Redis chỉ lưu **băm SHA-256 của token phiên**, không lưu token gốc; người mở được Redis Insight vẫn không mạo danh được |
| NFR-S03 | Phiên đăng nhập có **thời hạn tự động hết** (mặc định 7 ngày) |
| NFR-S04 | Tiến trình đọc của một người chỉ người đó hoặc quản trị truy cập được |
| NFR-S05 | Thao tác thay đổi kho sách chỉ dành cho quản trị |
| NFR-S06 | Không commit mật khẩu thật, token hay tệp `.env` vào kho mã nguồn |

### 4.3. Toàn vẹn dữ liệu

| Mã | Yêu cầu |
|---|---|
| NFR-D01 | MongoDB áp **JSON Schema validator** cho collection sách và tài khoản; dữ liệu sai kiểu bị từ chối ngay ở tầng CSDL |
| NFR-D02 | Số chương và số mục là **số nguyên 32 bit**, bắt đầu từ 1; thời điểm tạo là kiểu date |
| NFR-D03 | Cả bốn trường của một tiến trình đọc được ghi trong **một thao tác duy nhất**, không có trạng thái nửa vời |
| NFR-D04 | MongoDB và Redis không có khóa ngoại, nên xóa sách hoặc tài khoản phải **phát sự kiện dọn dẹp** phía Redis |
| NFR-D05 | Lỗi khi dọn Redis **không được làm hỏng** thao tác xóa đã hoàn tất trên MongoDB; chỉ ghi nhật ký |

### 4.4. Khả dụng và trải nghiệm

| Mã | Yêu cầu |
|---|---|
| NFR-U01 | Lỗi khi đếm lượt đọc **không được chặn** việc đọc sách |
| NFR-U02 | Giao diện phải cho người đọc biết vị trí đã được lưu hay chưa |
| NFR-U03 | Thông báo lỗi trả về theo một dạng thống nhất `{code, message}` cho mọi API |
| NFR-U04 | Bảng xếp hạng tự cập nhật định kỳ và **tạm dừng khi cửa sổ bị ẩn**, tránh gọi API vô ích |

### 4.5. Khả năng kiểm chứng

| Mã | Yêu cầu |
|---|---|
| NFR-T01 | Backend có bộ kiểm thử tự động chạy được bằng một lệnh |
| NFR-T02 | Các kiểm thử cần hạ tầng thật phải **tách riêng** bằng biến môi trường, không chặn lần chạy thông thường |
| NFR-T03 | Kiểm thử và benchmark dùng database và namespace riêng, **không đụng dữ liệu demo** |
| NFR-T04 | Chức năng phụ thuộc trình duyệt phải có bằng chứng chạy trên trình duyệt thật, không chỉ test giả lập |

---

## 5. Mô hình dữ liệu

### 5.1. MongoDB

Một collection `books`, mỗi document chứa trọn vẹn một cuốn sách:

```
books
 ├── _id, title, author, categories[], description, coverUrl, createdAt, updatedAt
 └── chapters[]
      ├── chapterNo, title, content
      └── sections[]
           └── sectionNo, heading, text
```

Collection `users` lưu tài khoản (`username`, `email`, `passwordHash`, `fullName`, `role`).

Lý do lồng chương và mục vào sách: luôn đọc cả cuốn hoặc cả chương, không bao giờ truy vấn chương tách rời; một lần đọc đĩa lấy được toàn bộ. Chi tiết schema, validator và index: [ARCHITECTURE §2](ARCHITECTURE.md).

### 5.2. Redis

| Key | Kiểu | Nội dung |
|---|---|---|
| `progress:{userId}:{bookId}` | Hash | `chapter`, `page`, `line`, `updatedAt` |
| `ranking:books` | ZSET | Điểm lượt đọc của từng `bookId` |
| `read-lock:{userId}:{bookId}:{chapterNo}` | String, TTL 60 giây | Khóa chống đếm trùng lượt đọc |
| `session:{sha256(token)}` | String, có TTL | `userId` của phiên |
| `user-sessions:{userId}` | Set | Các băm token của một tài khoản, để thu hồi hàng loạt |

Chi tiết lệnh và cách đồng bộ với MongoDB: [ARCHITECTURE §3](ARCHITECTURE.md).

---

## 6. Kịch bản sử dụng chính

### UC-01. Đọc tiếp đúng chỗ đang đọc dở

| | |
|---|---|
| **Tác nhân** | Độc giả |
| **Tiền điều kiện** | Đã đăng nhập; sách có nội dung |
| **Luồng chính** | 1. Chọn sách trong E-Reader → 2. Hệ thống tải toàn văn và tiến trình đã lưu → 3. Mở đúng trang đã lưu và cuộn tới đúng dòng → 4. Người đọc lật trang → 5. Hệ thống ghi vị trí mới vào Redis và báo đã lưu |
| **Luồng phụ** | 2a. Chưa có tiến trình → mở trang 1. 3a. Trang đã lưu vượt số trang hiện có → mở trang cuối, ghi lại vị trí và báo cho người đọc |
| **Hậu điều kiện** | Hash tiến trình phản ánh đúng vị trí cuối cùng |
| **Yêu cầu liên quan** | FR-RDG-01, 04, 05, 07, 08 |

### UC-02. Sách leo hạng nhờ lượt đọc

| | |
|---|---|
| **Tác nhân** | Độc giả |
| **Tiền điều kiện** | Đã đăng nhập |
| **Luồng chính** | 1. Mở một chương → 2. Hệ thống kiểm tra sách và chương tồn tại → 3. Đặt khóa 60 giây; đặt được thì tăng 1 điểm cho sách → 4. Bảng xếp hạng cập nhật, sách đổi vị trí và hiện mũi tên xu hướng |
| **Luồng phụ** | 3a. Khóa còn hiệu lực → trả về điểm hiện tại, không cộng |
| **Hậu điều kiện** | ZSET phản ánh tổng lượt đọc |
| **Yêu cầu liên quan** | FR-RNK-01, 02, 03, 05, 06, 07 |

### UC-03. Quản trị bổ sung đầu sách

| | |
|---|---|
| **Tác nhân** | Quản trị |
| **Luồng chính** | 1. Đăng nhập bằng tài khoản quản trị → 2. Nhập thông tin sách và các chương → 3. MongoDB kiểm tra theo JSON Schema → 4. Sách xuất hiện trong kho, đọc được ngay trên E-Reader |
| **Luồng phụ** | 3a. Dữ liệu sai kiểu hoặc thiếu trường bắt buộc → từ chối kèm thông báo |
| **Yêu cầu liên quan** | FR-CAT-09, 12; NFR-D01, D02 |

---

## 7. Ma trận truy vết

Từ yêu cầu gốc trong đề tài xuống yêu cầu chi tiết, mã nguồn và bằng chứng.

| Yêu cầu gốc (YC_PJ.md) | Điểm | Yêu cầu chi tiết | Hiện thực | Bằng chứng |
|---|---|---|---|---|
| Giải trình Polyglot Persistence | 1.0 | RB-01, mục 5 | — | [ARCHITECTURE §1](ARCHITECTURE.md) |
| JSON Schema MongoDB (sách, chương, mục) | 0.75 | RB-02, NFR-D01, D02 | `books.schema.json` | [ARCHITECTURE §2](ARCHITECTURE.md) |
| Cấu trúc Hashes / ZSET trên Redis | 0.75 | RB-03, mục 5.2 | `ProgressRepository`, `RankingRepository` | [ARCHITECTURE §3](ARCHITECTURE.md) |
| Quản lý danh mục sách | ~1.0 | FR-CAT-01 → 11 | `catalog/` | Bộ kiểm thử backend |
| Thêm chương mới trên MongoDB | ~0.75 | FR-CAT-12, 13, 14 | `ChapterController` | Bộ kiểm thử backend |
| Quản lý tài khoản độc giả | ~0.75 | FR-IDN-01 → 09 | `identity/` | Bộ kiểm thử backend |
| Lưu tiến trình đọc tức thì (Redis Hashes), vị trí **trang/dòng** | ~1.25 | FR-RDG-01 → 10 | `reading/`, `ReadingPage` | [RESUME_MECHANISM.md](RESUME_MECHANISM.md), [vu/UI_EVIDENCE.md](vu/UI_EVIDENCE.md) |
| Bảng xếp hạng bằng `ZINCRBY` và `ZREVRANGE` | ~1.25 | FR-RNK-01 → 08 | `ranking/` | [vu/UI_EVIDENCE.md](vu/UI_EVIDENCE.md) |
| Dummy data đạt định mức | 1.0 | RB-04, FR-OPS-01 → 04 | `scripts/seed/` | [ARCHITECTURE §4](ARCHITECTURE.md) |
| Demo sống theo kịch bản | 1.5 | UC-01, UC-02 | Toàn hệ thống | [DEMO_SCRIPT.md](DEMO_SCRIPT.md) |
| **Demo**: đọc đến Trang 30, mở lại tự cuộn đúng Trang 30 | — | FR-RDG-01, 03, 05 | Đánh số trang cả cuốn | [vu/UI_EVIDENCE.md](vu/UI_EVIDENCE.md) |
| **Demo**: đọc liên tục, chứng minh ZSET tăng điểm và nhảy hạng | — | FR-RNK-01, 06, 07 | Widget và trang Thịnh hành | [vu/UI_EVIDENCE.md](vu/UI_EVIDENCE.md) |
| Quản trị song song Compass và Redis Insight | — | RB-06 | `docker-compose.yml` | **Chưa có bằng chứng** |

---

## 8. Hạn chế đã biết

Những điểm hệ thống **chưa đáp ứng** hoặc đáp ứng có giới hạn. Ghi lại đầy đủ để người đọc không hiểu nhầm phạm vi.

| Mã | Hạn chế | Ảnh hưởng | Hướng khắc phục |
|---|---|---|---|
| HC-01 | Điểm xếp hạng **chỉ tăng, không giảm theo thời gian**. Bảng mang tên "Thịnh hành" nhưng thực chất là tổng lượt đọc mọi thời đại | Sách được đọc nhiều trong quá khứ giữ vị trí cao vô thời hạn | Tính điểm theo cửa sổ trượt 24 giờ: một ZSET cho mỗi giờ, gộp bằng `ZUNIONSTORE` |
| HC-02 | Khóa 60 giây chỉ **giới hạn tốc độ**, không chặn tích lũy. Người cố tình canh giờ vẫn tăng điểm liên tục; nhiều tài khoản thì không có giới hạn chung | Bảng xếp hạng có thể bị thao túng | Đếm độc giả duy nhất theo ngày (Set hoặc HyperLogLog) thay vì chỉ đếm lượt |
| HC-03 | Thời hạn khóa 60 giây **viết cố định trong mã nguồn** | Muốn đổi phải sửa code và biên dịch lại | Đưa ra tệp cấu hình `application.yml` |
| HC-04 | FR-RDG-10 (danh sách sách đang đọc dở) **có API nhưng chưa có màn hình** | Người dùng không thấy được các sách đang đọc dở | Thêm khu "Đang đọc dở" ở giao diện |
| HC-05 | Trang chi tiết sách hiển thị **toàn văn chương** nhưng không lưu vị trí và không tính lượt đọc | Dễ gây hiểu nhầm là đang đọc sách thật | Rút gọn thành xem trước và thêm nút chuyển sang E-Reader |
| HC-06 | Nội dung sách mẫu sinh bằng cách ghép câu mẫu nên **lặp từ ngữ**, không thành mạch truyện | Đọc kỹ thấy không tự nhiên | Viết lại nội dung một số sách demo |
| HC-07 | Trong kho còn một cuốn **chỉ có 4 chương**, dưới mức 5–10 chương mà định mức đòi | Vi phạm RB-04 | Bổ sung chương hoặc gỡ cuốn đó |
| HC-08 | Phép đo hiệu năng chạy với **một kết nối duy nhất**, chưa đo khả năng chịu tải đồng thời | Không kết luận được về hiệu năng khi nhiều người dùng | Đo lại với nhiều kết nối song song |
| HC-09 | Chưa có bằng chứng **Compass và Redis Insight chạy song song** (RB-06) | Thiếu một mục trong phân công | Chụp màn hình hai công cụ trong buổi tập dượt |

---

## 9. Hướng phát triển

Ngoài phạm vi đồ án, ghi lại để tham khảo:

- Bảng xếp hạng theo cửa sổ thời gian và theo thể loại.
- Đếm số độc giả duy nhất của mỗi cuốn bằng HyperLogLog.
- Lịch sử đọc gần đây bằng Redis List (`LPUSH` kèm `LTRIM`).
- Gợi ý sách theo thể loại người dùng hay đọc.
- Đánh dấu trang và ghi chú cá nhân.
- Đồng bộ vị trí đọc theo thời gian thực giữa nhiều thiết bị.
