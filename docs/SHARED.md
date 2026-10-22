# Phần dùng chung và hợp đồng tích hợp

Tài liệu này là điểm thống nhất giữa backend Spring Boot, frontend React và script seed. **Đã triển khai:** `GET /api/health`, catalog (sách, chương) và identity (độc giả, đăng nhập). Các endpoint còn lại là hợp đồng dự kiến để từng thành viên hiện thực; khi đổi tên trường hoặc đường dẫn, sửa tài liệu này trong cùng Pull Request.

## 1. Ranh giới sở hữu

| Khu vực | Phụ trách chính | Nội dung |
|---|---|---|
| `backend/src/main/java/vn/edu/huit/digitallibrary/catalog/` | Vũ | Sách, chương, tìm kiếm, CRUD MongoDB |
| `backend/src/main/java/vn/edu/huit/digitallibrary/identity/` | Vũ | Độc giả, đăng ký, đăng nhập, MongoDB |
| `backend/src/main/java/vn/edu/huit/digitallibrary/reading/` | Đạt | Tiến trình đọc trong Redis Hash |
| `backend/src/main/java/vn/edu/huit/digitallibrary/ranking/` | Đạt | Lượt đọc và bảng xếp hạng Redis ZSET |
| `frontend/src/features/` | Sơn | Giao diện catalog, identity, reading, ranking |
| `scripts/seed/` | Sơn, phối hợp Đạt | Seed MongoDB rồi Redis bằng bookId thật |
| `backend/.../common/`, `frontend/src/shared/`, cấu hình gốc | Cả nhóm | Dùng chung; mô tả thay đổi trong PR và báo hai người còn lại |

Trong mỗi domain backend có thể tạo `controller/`, `service/`, `repository/`, `model/`, `dto/` khi cần. Domain chỉ gọi domain khác qua service công khai hoặc DTO; không truy cập trực tiếp repository của domain khác. Đặc biệt, ranking chỉ lưu `bookId` trong Redis, không sao chép document sách.

## 2. Quy ước dữ liệu

- ID sách và độc giả là chuỗi MongoDB ObjectId trong JSON. Dùng nhất quán `bookId`, `userId`.
- Sách MongoDB: `id, title, author, categories[], description, coverUrl, chapters[], createdAt, updatedAt`. Mỗi chương có `chapterNo, title, content, sections[]`; mỗi mục có `sectionNo, heading, text`; số chương, số mục bắt đầu từ 1. Schema và validator: [ARCHITECTURE.md](ARCHITECTURE.md) mục 2. Script seed phải ghi `chapterNo`/`sectionNo` kiểu số nguyên và `createdAt` kiểu date, nếu không MongoDB từ chối document.
- Tiến trình Redis: key `progress:{userId}:{bookId}`, Hash gồm `chapter, page, line, updatedAt`. `chapter` và `page` bắt đầu từ 1, `line` bắt đầu từ 0. `updatedAt` theo ISO 8601 UTC. Chưa đặt TTL trong bản demo.
- Xếp hạng Redis: key `ranking:books`, ZSET với member là `bookId`, score là lượt mở chương. Chỉ tăng một lần cho mỗi lần mở chương theo quy tắc nhóm chốt khi triển khai.
- Không đưa `passwordHash` ra response. `username` và `email` được lưu chữ thường.
- Phiên đăng nhập Redis: `session:{sha256(token)}` (String, giá trị `userId`, TTL 7 ngày) và `user-sessions:{userId}` (Set). Vũ phụ trách.

## 3. Xác thực và phân quyền (đã chốt)

- `POST /api/auth/login` trả `token`. Mọi request cần đăng nhập gửi header `Authorization: Bearer <token>`.
- Vai trò: `USER` (đăng ký qua `POST /api/users`) và `ADMIN`. Khi khởi động, backend tạo admin từ `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_EMAIL` nếu chưa có admin; mặc định `admin` / `admin123`.
- Thiếu hoặc sai token → `401 UNAUTHORIZED`; đúng token nhưng không đủ quyền → `403 FORBIDDEN`.
- Backend gắn quyền bằng annotation trong package `identity.auth`:
  - `@Authenticated`: cần đăng nhập. `@AdminOnly`: cần role `ADMIN`. Không gắn: công khai.
  - Thêm tham số `CurrentUser currentUser` vào method controller có annotation để nhận người dùng đã xác thực. Dùng `currentUser.canAccess(userId)` (chính chủ hoặc admin) thay vì tin `userId` trên URL.
  - Ví dụ cho Đạt:
    ```java
    @Authenticated
    @PutMapping("/api/progress/{userId}/{bookId}")
    public ProgressResponse save(@PathVariable String userId, @PathVariable String bookId,
            @RequestBody ProgressRequest body, CurrentUser currentUser) {
        if (!currentUser.canAccess(userId)) throw ApiException.forbidden("Không có quyền");
        ...
    }
    ```
- Kiểm tra `bookId` tồn tại trước khi ghi Redis: inject `BookService` và gọi `bookService.exists(bookId)`.

## 4. API

Tất cả endpoint nghiệp vụ dùng tiền tố `/api` và JSON. Lỗi chuẩn: `{ "code": "NOT_FOUND", "message": "..." }` do `common.GlobalExceptionHandler` sinh; ném `common.ApiException` trong service để trả lỗi này. Mã lỗi: `400 BAD_REQUEST` (dữ liệu sai), `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND` (kể cả id không phải ObjectId hợp lệ), `409 CONFLICT` (trùng).

| Nhóm | Endpoint | Người làm | Ghi chú |
|---|---|---|---|
| Chung | `GET /api/health` | Khung chung | Đã có, trả `{"status":"ok"}` |
| Sách | `GET /api/books?page=0&size=20&category=...&q=...` | Vũ ✅ | Công khai. `size` 1–100. `q` tìm theo tiêu đề/tác giả (không phân biệt dấu), có `q` thì xếp theo độ khớp, không có thì sách mới trước |
| Sách | `GET /api/books/batch?ids=id1,id2` | Vũ ✅ | Công khai. Tối đa 100 id, trả đúng thứ tự, bỏ qua id không tồn tại. Dùng ghép BXH |
| Sách | `GET /api/books/categories` | Vũ ✅ | Công khai. Danh sách thể loại đã sắp xếp |
| Sách | `GET /api/books/{bookId}` | Vũ ✅ | Công khai. Chi tiết + mục lục (không có toàn văn) |
| Sách | `POST /api/books`, `PUT /api/books/{bookId}`, `DELETE /api/books/{bookId}` | Vũ ✅ | `@AdminOnly`. POST nhận kèm `chapters[]`; PUT chỉ sửa thông tin sách, không sửa chương |
| Chương | `GET /api/books/{bookId}/chapters/{chapterNo}` | Vũ ✅ | Công khai. Toàn văn một chương cho E-Reader |
| Chương | `POST /api/books/{bookId}/chapters`, `PUT /api/books/{bookId}/chapters/{chapterNo}`, `DELETE /api/books/{bookId}/chapters/{chapterNo}` | Vũ ✅ | `@AdminOnly`. POST bỏ trống `chapterNo` thì gán số kế tiếp; trùng số → 409. PUT không đổi được `chapterNo` |
| Độc giả | `POST /api/users` | Vũ ✅ | Công khai, đăng ký role `USER` |
| Xác thực | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Vũ ✅ | logout và me cần token |
| Độc giả | `GET/PUT/DELETE /api/users/{userId}` | Vũ ✅ | `@Authenticated`, chính chủ hoặc admin. PUT nhận `email`, `fullName`, `password` (trường nào null thì giữ nguyên); đổi mật khẩu thu hồi mọi phiên |
| Tiến trình | `GET /api/progress/{userId}/{bookId}`, `PUT /api/progress/{userId}/{bookId}` | Đạt | Body PUT: `{"chapter":1,"page":1,"line":0}` |
| Lượt đọc | `POST /api/books/{bookId}/read` | Đạt | Tăng score khi mở chương |
| Xếp hạng | `GET /api/ranking?top=10` | Đạt | Trả `[{ "bookId": "...", "score": 42 }]`; Sơn ghép sách từ API catalog |

Vũ và Đạt nên đưa ví dụ response thật vào đây khi endpoint hoàn thành. Nếu endpoint trả DTO khác dự kiến, cập nhật bảng trước khi Sơn nối giao diện.

### Ví dụ request/response (catalog, identity)

Đăng ký và đăng nhập:
```bash
curl -X POST localhost:8080/api/users -H 'Content-Type: application/json' \
  -d '{"username":"vu.reader","email":"vu@example.com","password":"secret123","fullName":"Thái Duy Vũ"}'
# 201 {"id":"6ad9aae8a64520f313150511","username":"vu.reader","email":"vu@example.com","fullName":"Thái Duy Vũ","role":"USER","createdAt":"2026-10-22T06:19:20.752Z"}

curl -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"vu.reader","password":"secret123"}'
# 200 {"token":"2CmPGbEC...","tokenType":"Bearer","expiresAt":"2026-10-29T06:19:21.367Z","user":{"id":"6ad9aae8a64520f313150511",...}}
```

Tạo sách (admin):
```bash
curl -X POST localhost:8080/api/books -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{
  "title":"Dế Mèn phiêu lưu ký","author":"Tô Hoài","categories":["Thiếu nhi","Văn học"],
  "description":"Truyện đồng thoại",
  "chapters":[{"title":"Tôi sống độc lập từ thuở bé","content":"Bởi tôi ăn uống điều độ...",
               "sections":[{"heading":"Mở đầu","text":"..."}]}]}'
```
Response `201` của POST, PUT và `GET /api/books/{bookId}` (`BookDetail`):
```json
{"id":"6ad9aafea64520f313150512","title":"Dế Mèn phiêu lưu ký","author":"Tô Hoài",
 "categories":["Thiếu nhi","Văn học"],"description":"Truyện đồng thoại","coverUrl":null,
 "chapters":[{"chapterNo":1,"title":"Tôi sống độc lập từ thuở bé","sectionHeadings":["Mở đầu"]}],
 "createdAt":"2026-10-22T06:19:42.151Z","updatedAt":"2026-10-22T06:19:42.151Z"}
```

`GET /api/books?page=0&size=20` (`PageResponse<BookSummary>`); `GET /api/books/batch` trả mảng `BookSummary`:
```json
{"content":[{"id":"6ad9aafea64520f313150512","title":"Dế Mèn phiêu lưu ký","author":"Tô Hoài",
             "categories":["Thiếu nhi","Văn học"],"description":"Truyện đồng thoại","coverUrl":null,
             "chapterCount":4,"createdAt":"2026-10-22T06:19:42.151Z"}],
 "page":0,"size":20,"totalElements":1,"totalPages":1}
```

`GET /api/books/{bookId}/chapters/3` (`ChapterContent`):
```json
{"bookId":"6ad9aafea64520f313150512","bookTitle":"Dế Mèn phiêu lưu ký","chapterNo":3,
 "title":"Chương ba","content":"Nội dung...",
 "sections":[{"sectionNo":1,"heading":"A","text":"aa"}]}
```

Thêm, sửa chương (admin) trả `ChapterSummary` `{"chapterNo":3,"title":"Chương ba","sectionHeadings":[]}`; body là `{"chapterNo":3,"title":"...","content":"...","sections":[...]}` với `chapterNo` tùy chọn. Xóa sách, xóa chương, xóa độc giả, đăng xuất trả `204` không có body.

## 5. Chạy và tích hợp

1. Ở thư mục gốc, chạy `cp .env.example .env && docker compose up -d`.
2. Chạy backend: `cd backend && ./mvnw spring-boot:run` (cần Java 17+).
3. Chạy frontend: `cd frontend && npm install && npm run dev` (Node theo yêu cầu Vite).
4. Truy cập `http://localhost:5173`; Vite proxy `/api` đến `http://localhost:8080`. Kiểm tra `curl http://localhost:8080/api/health`.

Spring Boot dùng `MONGO_URI`, `REDIS_URL`, `SERVER_PORT`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `AUTH_SESSION_TTL` nếu được export vào môi trường; mặc định khớp Docker Compose cho máy local. `.env` chỉ được Docker Compose tự đọc, Spring Boot không tự nạp file này. Khi đổi cổng backend, cập nhật proxy trong `frontend/vite.config.js`.

Nếu máy đã cài sẵn MongoDB chạy ở cổng 27017 (Homebrew, Windows service), backend sẽ kết nối nhầm vào đó và báo `AuthenticationFailed`. Cách xử lý: đặt `MONGO_PORT=27018` trong `.env`, chạy lại `docker compose up -d mongodb`, rồi chạy backend với `MONGO_URI='mongodb://admin:admin123@localhost:27018/digital_library?authSource=admin' ./mvnw spring-boot:run`.

## 6. Thứ tự tích hợp

1. ✅ Vũ chốt schema sách và DTO API, cung cấp CRUD cơ bản.
2. Sơn seed MongoDB bằng ID ổn định hoặc ghi nhận các `bookId` vừa tạo; Đạt seed Redis từ đúng các ID này.
3. Đạt hoàn thành progress và ranking; Sơn nối E-Reader và Top sách.
4. ✅ Vũ chốt auth (mục 3); Đạt gắn `@Authenticated` cho API tiến trình đọc, Sơn gửi header `Authorization` từ frontend.

Mỗi PR chỉ sửa domain mình phụ trách. Khi phải sửa file dùng chung, ghi rõ lý do, ảnh hưởng tới domain còn lại và cập nhật ví dụ request/response tại đây.
