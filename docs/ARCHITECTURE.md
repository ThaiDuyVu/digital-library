# Kiến trúc & thiết kế CSDL

> Phụ trách: Vũ (SV1 – Data Architect). Phần Redis cho tiến trình đọc và bảng xếp hạng chốt cùng Đạt; Đạt đã hiện thực đúng quy ước key ở mục 3 (`reading/`, `ranking/`).
> Nguồn sự thật của schema MongoDB nằm ở `backend/src/main/resources/mongo/*.schema.json`; backend áp validator và tạo index mỗi lần khởi động, nên tài liệu này và database luôn khớp nhau.

## 1. Giải trình Polyglot Persistence (1.0đ)

### 1.1. Bài toán có ba loại dữ liệu khác nhau
| Dữ liệu | Đặc điểm truy cập | Yêu cầu chính |
|---|---|---|
| Sách → chương → mục, tài khoản độc giả | Ghi ít, đọc nhiều; văn bản lớn; cấu trúc lồng nhau; cần tìm kiếm | Bền vững, schema linh hoạt, truy vấn và index |
| Tiến trình đọc dở (`chapter, page, line`) | Ghi liên tục mỗi lần lật trang, đọc khi mở sách | Độ trễ thấp, ghi đè từng field, chịu tải ghi cao |
| Lượt đọc và bảng xếp hạng | Tăng điểm mỗi lần mở chương, đọc Top N liên tục | Luôn có thứ tự, cập nhật thời gian thực |

Không có một CSDL nào tối ưu cho cả ba, nên hệ thống dùng **MongoDB cho dữ liệu nội dung** và **Redis cho dữ liệu trạng thái/tạm**.

### 1.2. Vì sao MongoDB lưu nội dung sách
- **Document model khớp cấu trúc sách.** Một cuốn sách là một cây `book → chapters[] → sections[]`. MongoDB lưu nguyên cây trong một document, đọc chi tiết sách hay một chương chỉ cần một truy vấn, không JOIN như mô hình quan hệ (bảng `books`, `chapters`, `sections`).
- **Schema linh hoạt nhưng vẫn kiểm soát được.** Sách khác nhau có số chương, số mục, metadata khác nhau. `$jsonSchema` validator vẫn đảm bảo các trường bắt buộc và kiểu dữ liệu (xem mục 2).
- **Truy vấn phong phú trên văn bản.** Text index trên `title`, `author` để tìm kiếm; multikey index trên `categories` để lọc; projection để không trả toàn văn khi chỉ cần danh sách.
- **Cập nhật một phần của mảng lồng nhau.** `$push` thêm chương, toán tử vị trí `chapters.$` sửa chương, `$pull` xóa chương, không phải ghi lại cả document.
- **Bền vững.** Dữ liệu nội dung là tài sản lâu dài, cần journaling và backup; MongoDB ghi xuống đĩa theo mặc định.

### 1.3. Vì sao Redis lưu tiến trình đọc và bảng xếp hạng
- **Tiến trình đọc – Redis Hash.** Mỗi lần lật trang là một lần ghi. `HSET progress:{userId}:{bookId} page 30` chỉ ghi đè field cần đổi, chạy trong bộ nhớ với độ trễ dưới 1 ms. `HGETALL` trả toàn bộ tiến trình trong một lệnh khi mở lại sách. Nếu dùng MongoDB, mỗi lần lật trang là một update có ghi journal, tạo tải ghi lớn lên CSDL đang phục vụ nội dung.
- **Bảng xếp hạng – Redis Sorted Set.** `ZINCRBY ranking:books 1 {bookId}` tăng điểm và Redis tự giữ thứ tự (O(log N)); `ZREVRANGE ranking:books 0 9 WITHSCORES` lấy Top 10 ngay. Trong MongoDB phải `$inc` một bộ đếm rồi `sort` (cần index trên bộ đếm, index bị cập nhật liên tục) hoặc chạy aggregation mỗi lần xem BXH.
- **Phiên đăng nhập – Redis String có TTL.** Phiên là dữ liệu tạm có hạn dùng; `SET ... EX` tự hết hạn, không cần job dọn dẹp như khi lưu trong MongoDB.

### 1.4. So sánh với dùng một CSDL duy nhất
| Tiêu chí | Chỉ MongoDB | Chỉ Redis | MongoDB + Redis (chọn) |
|---|---|---|---|
| Lưu cây sách/chương/mục | Tốt (document lồng nhau) | Kém: phải tự chia key, không có truy vấn/index phụ, toàn bộ văn bản chiếm RAM | Tốt |
| Tìm kiếm, lọc thể loại | Text index, multikey index | Phải tự dựng index bằng Set | Tốt |
| Ghi tiến trình mỗi lần lật trang | Được nhưng tốn I/O đĩa, tăng tải | Rất tốt (bộ nhớ, ghi đè field) | Rất tốt |
| BXH thời gian thực | `$inc` + `sort`/aggregation, chậm dần khi nhiều lượt đọc | `ZINCRBY`/`ZREVRANGE` sẵn có | Rất tốt |
| Chi phí vận hành | 1 hệ thống | 1 hệ thống, nhưng RAM lớn | 2 hệ thống, mỗi hệ thống làm đúng việc của nó |

### 1.5. Luồng dữ liệu giữa hai hệ thống

```mermaid
flowchart LR
    R[React E-Reader] -->|REST /api| API[Spring Boot API]
    subgraph Backend
      API --> CAT[catalog]
      API --> IDN[identity]
      API --> RDG[reading]
      API --> RNK[ranking]
    end
    CAT -->|books| M[(MongoDB)]
    IDN -->|users| M
    IDN -->|session:*, user-sessions:*| X[(Redis)]
    RDG -->|progress:userId:bookId| X
    RNK -->|ranking:books| X
    RNK -.->|bookId → thông tin sách| CAT
```

1. **Duyệt và mở sách:** React gọi `GET /api/books`, `GET /api/books/{bookId}` → catalog đọc MongoDB (đã bỏ toàn văn bằng projection).
2. **Mở chương:** React gọi `GET /api/books/{bookId}/chapters/{chapterNo}` (MongoDB, `$elemMatch` chỉ lấy một chương) và `POST /api/books/{bookId}/read` → `ZINCRBY` trên Redis.
3. **Lật trang / đóng sách:** `PUT /api/progress/{userId}/{bookId}` (cần Bearer token, chính chủ hoặc admin) → kiểm tra sách và chương tồn tại qua `BookService` → `HSET` trên Redis.
4. **Mở lại sách:** `GET /api/progress/{userId}/{bookId}` → `HGETALL` trên Redis, giao diện cuộn đến đúng trang. Chưa có tiến trình → `404`, giao diện mở từ đầu.
5. **Xem BXH:** `GET /api/ranking?top=10` → `ZREVRANGE` lấy danh sách `bookId`, sau đó `GET /api/books/batch?ids=...` ghép tiêu đề, tác giả từ MongoDB.

**Liên kết giữa hai hệ thống chỉ qua ID:** Redis chỉ chứa `bookId`, `userId` (chuỗi ObjectId của MongoDB), không sao chép tiêu đề hay nội dung sách. Nhờ vậy sửa thông tin sách trong MongoDB không cần đồng bộ sang Redis.

### 1.6. Đánh đổi và cách xử lý
| Rủi ro | Ảnh hưởng | Cách xử lý trong đồ án |
|---|---|---|
| Redis mất dữ liệu khi tắt đột ngột | Mất tiến trình đọc hoặc lượt đọc gần nhất | Docker Compose bật AOF (`--appendonly yes`), mất tối đa khoảng 1 giây ghi. Tiến trình và lượt đọc là dữ liệu có thể chấp nhận mất một phần. |
| Không có transaction giữa MongoDB và Redis | Xóa sách/độc giả trong MongoDB, `bookId`/`userId` vẫn còn trong Redis | Sau khi xóa, catalog/identity phát sự kiện `BookDeletedEvent`/`UserDeletedEvent`; ranking `ZREM` sách, reading xóa `progress:*` liên quan. Nếu Redis lỗi đúng lúc đó, `GET /api/books/batch` vẫn bỏ qua id không tồn tại nên BXH không hiển thị sách đã xóa. |
| Nhất quán cuối (eventual) | BXH có thể lệch vài lượt so với thực tế khi request lỗi | Chấp nhận được với BXH "thịnh hành"; không dùng cho dữ liệu cần chính xác tuyệt đối. |
| Vận hành 2 hệ thống | Thêm cấu hình, giám sát | Docker Compose dựng sẵn cả hai, kèm Compass/Mongo Express và Redis Insight. |
| Dữ liệu Redis bị giới hạn bởi RAM | Không lưu được toàn văn | Chỉ lưu dữ liệu nhỏ (vài field mỗi Hash, một ZSET), nội dung lớn ở MongoDB. |

## 2. Thiết kế MongoDB (1.5đ – phần 1)

Database: `digital_library`. Hai collection: `books`, `users`.

### 2.1. Document model

```mermaid
erDiagram
    BOOK ||--o{ CHAPTER : "embed chapters[]"
    CHAPTER ||--o{ SECTION : "embed sections[]"
    BOOK {
      ObjectId _id
      string title
      string author
      string[] categories
      string description
      string coverUrl
      date createdAt
      date updatedAt
    }
    CHAPTER {
      int chapterNo "bắt đầu từ 1, duy nhất trong sách"
      string title
      string content "toàn văn"
    }
    SECTION {
      int sectionNo
      string heading
      string text
    }
    USER {
      ObjectId _id
      string username "unique, chữ thường"
      string email "unique, chữ thường"
      string passwordHash "BCrypt"
      string fullName
      string role "USER | ADMIN"
      date createdAt
      date updatedAt
    }
```

Ví dụ document `books`:
```json
{
  "_id": { "$oid": "6ad9aafea64520f313150512" },
  "title": "Dế Mèn phiêu lưu ký",
  "author": "Tô Hoài",
  "categories": ["Thiếu nhi", "Văn học"],
  "description": "Truyện đồng thoại",
  "createdAt": { "$date": "2026-10-22T06:19:42.151Z" },
  "updatedAt": { "$date": "2026-10-22T06:19:42.423Z" },
  "chapters": [
    {
      "chapterNo": 1,
      "title": "Tôi sống độc lập từ thuở bé",
      "content": "Bởi tôi ăn uống điều độ...",
      "sections": [ { "sectionNo": 1, "heading": "Mở đầu", "text": "..." } ]
    }
  ]
}
```

### 2.2. Vì sao embed chương và mục trong sách
- **Luôn đọc cùng nhau:** chương không tồn tại độc lập ngoài sách; mở sách cần mục lục, mở chương cần biết thuộc sách nào.
- **Số lượng có giới hạn:** mỗi sách 5–10 chương (validator cho phép tối đa 200). Một chương văn bản thường 20–100 KB, nên một sách 10 chương khoảng 1 MB, xa giới hạn **16 MB/document** của MongoDB.
- **Cập nhật nguyên tử:** thêm/sửa/xóa chương là một thao tác trên một document, MongoDB đảm bảo nguyên tử ở mức document mà không cần transaction.
- **Truy xuất một phần:** dù embed, API không trả toàn bộ văn bản. Danh sách loại `chapters.content` và `chapters.sections`; chi tiết chỉ giữ mục lục; đọc chương dùng projection `$elemMatch` lấy đúng một chương.
- **Khi nào phải tách:** nếu một sách có hàng trăm chương dài vượt 16 MB, tách `chapters` thành collection riêng tham chiếu `bookId`. Quy mô đồ án không cần.

`users` là collection riêng vì độc giả tồn tại độc lập với sách và quan hệ với sách (đang đọc, lượt đọc) nằm ở Redis.

### 2.3. JSON Schema validator
Áp bằng `collMod` với `validationLevel: "strict"`, `validationAction: "error"`. Document sai schema bị MongoDB từ chối (`Document failed validation`), kể cả khi ghi trực tiếp bằng Compass hoặc script seed.

`books` ([books.schema.json](../backend/src/main/resources/mongo/books.schema.json)):
```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["title", "author", "categories", "chapters", "createdAt"],
    "properties": {
      "title": { "bsonType": "string", "minLength": 1, "maxLength": 300 },
      "author": { "bsonType": "string", "minLength": 1, "maxLength": 200 },
      "categories": { "bsonType": "array", "maxItems": 20, "uniqueItems": true,
                      "items": { "bsonType": "string", "minLength": 1, "maxLength": 100 } },
      "description": { "bsonType": "string", "maxLength": 5000 },
      "coverUrl": { "bsonType": "string", "maxLength": 2000 },
      "createdAt": { "bsonType": "date" },
      "updatedAt": { "bsonType": "date" },
      "chapters": {
        "bsonType": "array", "maxItems": 200,
        "items": {
          "bsonType": "object",
          "required": ["chapterNo", "title"],
          "properties": {
            "chapterNo": { "bsonType": ["int", "long"], "minimum": 1 },
            "title": { "bsonType": "string", "minLength": 1, "maxLength": 300 },
            "content": { "bsonType": "string" },
            "sections": {
              "bsonType": "array",
              "items": {
                "bsonType": "object",
                "required": ["sectionNo", "heading", "text"],
                "properties": {
                  "sectionNo": { "bsonType": ["int", "long"], "minimum": 1 },
                  "heading": { "bsonType": "string", "maxLength": 300 },
                  "text": { "bsonType": "string" }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

`users` ([users.schema.json](../backend/src/main/resources/mongo/users.schema.json)):
```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["username", "email", "passwordHash", "role", "createdAt"],
    "properties": {
      "username": { "bsonType": "string", "pattern": "^[a-z0-9_.]{3,32}$" },
      "email": { "bsonType": "string", "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "maxLength": 254 },
      "passwordHash": { "bsonType": "string", "minLength": 20 },
      "fullName": { "bsonType": "string", "maxLength": 100 },
      "role": { "enum": ["USER", "ADMIN"] },
      "createdAt": { "bsonType": "date" },
      "updatedAt": { "bsonType": "date" }
    }
  }
}
```

**Lưu ý cho script seed:** `chapterNo`, `sectionNo` phải là số nguyên (`int` trong Python, `NumberInt(1)` trong mongosh vì mongosh mặc định ghi số thực `double`); `createdAt` phải là kiểu `date`; `categories` và `chapters` bắt buộc có (được phép là mảng rỗng). Spring Data thêm trường `_class` vào document, validator cho phép trường này.

### 2.4. Index
| Collection | Tên index | Định nghĩa | Phục vụ |
|---|---|---|---|
| books | `tx_books_title_author` | text `{title: 10, author: 5}`, `default_language: "none"` | `GET /api/books?q=` tìm theo tiêu đề/tác giả, xếp theo `textScore`. `none` tắt stemming tiếng Anh; text index v3 không phân biệt dấu nên "de men" khớp "Dế Mèn". |
| books | `ix_books_categories` | `{categories: 1}` (multikey) | `GET /api/books?category=`, `GET /api/books/categories` |
| books | `ix_books_createdAt` | `{createdAt: -1}` | Danh sách mặc định, sách mới trước |
| users | `ux_users_username` | `{username: 1}` unique | Đăng nhập, chống trùng tên |
| users | `ux_users_email` | `{email: 1}` unique | Chống trùng email |

### 2.5. Thao tác MongoDB chính của API
| Nghiệp vụ | Lệnh MongoDB |
|---|---|
| Danh sách có phân trang, lọc | `find({categories: c}).sort({createdAt: -1}).skip(p*s).limit(s)` + projection loại `chapters.content`, `chapters.sections`, `chapters.title` |
| Tìm kiếm | `find({$text: {$search: q}}).sort({score: {$meta: "textScore"}})` |
| Đọc một chương | `findOne({_id}, {title: 1, chapters: {$elemMatch: {chapterNo: n}}})` |
| Thêm chương | `updateOne({_id, "chapters.chapterNo": {$ne: n}}, {$push: {chapters: {$each: [c], $sort: {chapterNo: 1}}}})` – điều kiện `$ne` chống trùng số chương, `$sort` giữ mảng theo thứ tự |
| Sửa chương | `updateOne({_id, "chapters.chapterNo": n}, {$set: {"chapters.$": c}})` |
| Xóa chương | `updateOne({_id, "chapters.chapterNo": n}, {$pull: {chapters: {chapterNo: n}}})` |
| Sửa thông tin sách | `findOneAndUpdate({_id}, {$set: {...}}, {returnNewDocument: true})` – không ghi lại mảng chương |

## 3. Thiết kế Redis (1.5đ – phần 2)

### 3.1. Quy ước key
- Dạng `domain:định-danh`, phân cách bằng `:` để Redis Insight nhóm key theo thư mục.
- Định danh là chuỗi ObjectId của MongoDB (`userId`, `bookId`), không lưu thông tin trùng lặp với MongoDB.

| Key | Kiểu | Ví dụ giá trị | Phụ trách | TTL | Mục đích |
|---|---|---|---|---|---|
| `progress:{userId}:{bookId}` | Hash | `chapter=3, page=30, line=0, updatedAt=2026-10-22T06:00:00Z` | Đạt | Không đặt trong bản demo | Tiến trình đọc dở |
| `ranking:books` | ZSET | member=`bookId`, score=số lần mở chương | Đạt | Không | BXH sách thịnh hành |
| `session:{sha256(token)}` | String | `userId` | Vũ | `app.auth.session-ttl`, mặc định 7 ngày | Phiên đăng nhập |
| `user-sessions:{userId}` | Set | các `sha256(token)` | Vũ | Bằng TTL phiên, gia hạn khi đăng nhập | Thu hồi mọi phiên khi đổi mật khẩu/xóa tài khoản |

`chapter` và `page` bắt đầu từ 1, `line` từ 0, `updatedAt` theo ISO 8601 UTC (giống `docs/SHARED.md`).

Hiện thực bằng `StringRedisTemplate` (Spring Data Redis): `ProgressRepository` ghi cả bốn field bằng một lệnh `HSET`; `RankingRepository` dùng `ZINCRBY` (nguyên tử, không đọc rồi cộng trong Java) và `ZREVRANGE ... WITHSCORES`. ID hợp lệ được chuẩn hóa về ObjectId hex chữ thường trước khi ghép key, nên `bookId` viết hoa/thường không tạo hai member khác nhau.

### 3.2. Lệnh chính
```redis
# Tiến trình đọc
HSET progress:6ad9aae8a64520f313150511:6ad9aafea64520f313150512 chapter 3 page 30 line 0 updatedAt 2026-10-22T06:00:00Z
HGETALL progress:6ad9aae8a64520f313150511:6ad9aafea64520f313150512

# Bảng xếp hạng
ZINCRBY ranking:books 1 6ad9aafea64520f313150512
ZREVRANGE ranking:books 0 9 WITHSCORES
ZREVRANK ranking:books 6ad9aafea64520f313150512

# Phiên đăng nhập
SET session:<sha256> 6ad9aae8a64520f313150511 EX 604800
SADD user-sessions:6ad9aae8a64520f313150511 <sha256>
```

### 3.3. Đồng bộ với MongoDB
- Bản demo **không đồng bộ ngược** tiến trình/lượt đọc về MongoDB; Redis bật AOF để giữ dữ liệu khi khởi động lại.
- Hướng mở rộng nếu cần lưu lâu dài: job định kỳ đọc `ranking:books` và `SCAN progress:*` rồi `bulkWrite` vào collection `reading_history` (write-behind).
- Xóa dây chuyền qua sự kiện Spring, mỗi domain chỉ dọn key của mình:
  - Xóa sách → `ZREM ranking:books {bookId}` và xóa `progress:*:{bookId}` (dùng `SCAN`, không dùng `KEYS`).
  - Xóa độc giả → xóa `progress:{userId}:*` và mọi phiên đăng nhập.
- MongoDB là nguồn sự thật: xóa trong MongoDB thành công trước, lỗi Redis khi dọn chỉ ghi log và được `GET /api/books/batch` che bằng cách bỏ qua id không tồn tại.

### 3.4. Phiên đăng nhập
- `POST /api/auth/login` kiểm tra BCrypt trong MongoDB rồi sinh token ngẫu nhiên 256 bit, lưu **băm SHA-256** của token vào Redis. Người xem Redis Insight không lấy được token dùng được.
- Mỗi request có `@Authenticated`/`@AdminOnly` tra Redis lấy `userId`, rồi đọc user trong MongoDB để có `role` hiện tại. Tài khoản bị xóa hoặc đổi quyền có hiệu lực ngay.
- Đổi mật khẩu hoặc xóa tài khoản thu hồi mọi phiên qua `user-sessions:{userId}`; đăng xuất xóa phiên hiện tại.

## 4. Dữ liệu mẫu (dummy data)

Script nằm ở `scripts/seed/`, chạy theo thứ tự MongoDB rồi Redis để Redis chỉ chứa ID có thật (xem [README](../scripts/seed/README.md)).

| Bước | Script | Kết quả | Yêu cầu barem |
|---|---|---|---|
| 1 | `seed_books.py` (Sơn) | 60 sách × 5–10 chương (469 chương, ~3,2 triệu ký tự), mỗi chương 2–4 mục; 10 thể loại | 50–100 sách × 5–10 chương |
| 2 | `seed_redis.py` (Đạt, Sơn) | 10 độc giả mẫu trong `users`; 60 Hash `progress:{userId}:{bookId}`; ZSET `ranking:books` 50 sách | ≥ 50 Hash, 1 ZSET 50 sách |

- **ID ổn định:** sách seed có `_id = b00c` + số thứ tự (vd `b00c00000000000000000001`), độc giả seed có `_id = 5eed` + số thứ tự. Chạy lại không sinh ID mới nên Redis không có `bookId`/`userId` mồ côi.
- **Chạy lặp được:** MongoDB ghi bằng `ReplaceOne(upsert)` theo `_id`; Redis ghi `HSET` (ghi đè) và `ZADD` (đặt điểm, không cộng dồn). Script không đụng sách admin tạo qua API, phiên đăng nhập hay key khác.
- **Đúng schema:** script sách tự kiểm tra theo `books.schema.json` trước khi ghi (`chapterNo`/`sectionNo` int32, `createdAt` kiểu date); độc giả seed có `passwordHash` BCrypt nên đăng nhập được (`reader01`…`reader10` / `reader123`).
- **Tiến trình hợp lệ:** `chapter` không vượt số chương thật của sách (đọc lại từ MongoDB khi seed).

Kiểm tra trực quan:
```js
// MongoDB Compass / mongosh
db.books.countDocuments()                                             // 60 sách seed (+ sách tạo qua API)
db.books.aggregate([{$project: {n: {$size: "$chapters"}}}, {$group: {_id: null, min: {$min: "$n"}, max: {$max: "$n"}}}])
```
```redis
# Redis Insight Workbench / redis-cli
SCAN 0 MATCH progress:5eed* COUNT 1000
HGETALL progress:5eed00000000000000000001:b00c00000000000000000001
ZCARD ranking:books
ZREVRANGE ranking:books 0 9 WITHSCORES
```

## 5. Kết quả đo hiệu năng

**Sơ bộ (Đạt, 22/10/2026):** đọc một tiến trình đọc (4 field) bằng Redis `HGETALL` so với MongoDB `findOne` theo `_id` có projection cùng 4 field; 50 bản ghi, warm-up 200 lần, 1000 mẫu mỗi bên, xen kẽ từng cặp, kết nối giữ sẵn. Redis 7.4 (AOF bật), MongoDB 7.0, cùng máy Windows 11.

| CSDL | Trung bình (ms) | Trung vị (ms) | p95 (ms) | Lỗi |
|---|---|---|---|---|
| MongoDB `findOne` | 1,033 | 0,900 | 1,886 | 0 |
| Redis `HGETALL` | 0,622 | 0,533 | 1,187 | 0 |

Redis nhanh hơn khoảng 1,7 lần ở trung vị. Phép đo chỉ tính thời gian truy vấn CSDL (không gồm HTTP, xác thực) và chạy trên bộ dữ liệu fixture riêng. Dữ liệu gốc: [benchmark-raw.csv](dat/evidence/acceptance/benchmark/benchmark-raw.csv), [summary](dat/evidence/acceptance/benchmark/benchmark-summary.json).

**Phase 2 (Sơn, 26/10/2026):** đo đủ bốn thao tác bằng `scripts/seed/bench_latency.py` trên dữ liệu seed thật. Mỗi thao tác 1000 mẫu/CSDL, warm-up 200, 50 vị trí, `concurrency=1`, hai CSDL gọi xen kẽ từng cặp để chịu cùng nhiễu. Redis 7.4.11 (AOF bật), MongoDB 7.0.45, Windows 10. Script dùng database/namespace riêng và tạo index `score` cho collection ranking để MongoDB được `sort` có index.

| Thao tác | Redis | MongoDB | Trung vị Redis (ms) | Trung vị Mongo (ms) | p95 Redis (ms) | p95 Mongo (ms) | Mongo/Redis |
|---|---|---|---|---|---|---|---|
| Đọc tiến trình | `HGETALL` | `find_one` theo `_id` | 0,802 | 1,059 | 1,273 | 1,870 | 1,32x |
| Ghi tiến trình (lật trang) | `HSET` | `update_one` upsert | 0,831 | 1,114 | 1,210 | 1,671 | 1,34x |
| Tăng lượt đọc | `ZINCRBY` | `update_one` `$inc` | 0,837 | 1,148 | 1,258 | 1,842 | 1,37x |
| Lấy Top 10 | `ZREVRANGE 0 9` | `find().sort(score:-1).limit(10)` | 0,790 | 1,031 | 1,033 | 1,341 | 1,30x |

Dữ liệu gốc: [bench-raw.csv](../scripts/seed/bench_out/bench-raw.csv), [bench-summary.json](../scripts/seed/bench_out/bench-summary.json).

**Đọc kết quả cho đúng.** Redis nhanh hơn ở cả bốn thao tác, nhưng tỷ lệ 1,30–1,37x **thấp hơn** con số 1,7x của phép đo sơ bộ. Không nên trình bày một trong hai số như kết luận duy nhất; chênh lệch đến từ:

- Hai lần đo trên hai máy và hai bộ dữ liệu khác nhau, không phải cùng một điều kiện.
- Ở thang dưới 1 ms, phần lớn thời gian mỗi lệnh là chi phí cố định dùng chung: round-trip loopback TCP và overhead driver Python. Chi phí này cộng vào cả hai bên nên **nén tỷ lệ** lại gần 1; nó không phản ánh chênh lệch thực của hai engine.
- `concurrency=1` nên phép đo **không** đo được lợi thế lớn nhất của Redis là chịu tải ghi đồng thời; muốn kết luận về tải thì phải đo nhiều kết nối song song.
- `ranking_top10` trên MongoDB chỉ sắp xếp 50 bản ghi có index. Ở quy mô thật (hàng chục nghìn sách) khoảng cách sẽ giãn ra, vì `ZREVRANGE` lấy Top N từ skip list đã sắp sẵn còn MongoDB phải quét index rồi sắp xếp.

Vì vậy lý do kiến trúc chọn Redis (mục 1.3) **không** dựa trên 1,3x độ trễ một lệnh, mà dựa trên: mỗi lần lật trang là một lần ghi (write amplification) nên không nên dồn tải ghi đó lên CSDL đang phục vụ nội dung; và bảng xếp hạng là cấu trúc luôn-đã-sắp-xếp cập nhật tăng dần thay vì sắp xếp lại khi đọc.

Giới hạn chung của cả hai phép đo: chỉ tính thời gian truy vấn CSDL, **không** gồm HTTP, xác thực hay catalog; chạy trên localhost; không cô lập cold cache; không có SLA và không phải kiểm thử tải.

## 6. Hiện trạng theo barem

| Hạng mục barem | Điểm | Hiện thực | Kiểm chứng |
|---|---|---|---|
| Giải trình Polyglot Persistence | 1,0 | Mục 1 tài liệu này | – |
| Schema MongoDB + cấu trúc Redis | 1,5 | Mục 2, 3; `backend/src/main/resources/mongo/*.schema.json` áp validator và index khi khởi động | Ghi document sai schema bị MongoDB từ chối |
| CRUD sách / chương / độc giả | 2,5 | `catalog/`, `identity/` (Vũ); hợp đồng API tại [SHARED.md](SHARED.md) mục 4 | Test `BookControllerTest`; smoke test curl: tạo/sửa/xóa sách, thêm/xóa chương, đăng ký/đăng nhập/xóa độc giả, phân quyền 401/403 |
| Dummy data (phần MongoDB + chuẩn bị Redis) | 1,0 (một phần) | Mục 4 | 60 sách/469 chương, 60 Hash, ZSET 50 sách; chạy lại không đổi |
| Đo hiệu năng Mongo vs Redis | – (barem mục 3) | Mục 5: bốn thao tác, 1000 mẫu/CSDL | `scripts/seed/bench_latency.py`; raw + summary trong `scripts/seed/bench_out/` |
| Redis: kết nối, module khung | – (chuẩn bị Phase 2) | `reading/`, `ranking/` (Đạt): `GET/PUT /api/progress/...`, `POST /api/books/{id}/read`, `GET /api/ranking` | Test `ProgressApiTest`, `RankingApiTest` |
| Giao diện quản lý sách, danh sách/đọc cơ bản | – | `frontend/src/features/catalog/`, `identity/` (Sơn) | Duyệt, tìm, lọc, đọc chương; admin thêm/sửa/xóa sách và chương; đăng ký/đăng nhập |

Kết quả kiểm thử backend sau khi merge Phase 2 (28/10/2026): **54 test, 0 lỗi, 3 bỏ qua** khi chạy với Mongo/Redis thật và `DAT_INTEGRATION_TESTS=true`; 2 test review alias ID chạy riêng từng method trên Redis DB rỗng, cùng đạt. Chi tiết và giới hạn: [biên bản tích hợp Phase 2](PHASE2_INTEGRATION.md).

Lỗi phát hiện khi rà soát tích hợp và đã sửa:
- Email hợp lệ theo `@Email` nhưng thiếu dấu chấm (`a@localhost`) bị validator MongoDB từ chối, API trả 500. API nay kiểm tra cùng mẫu với `users.schema.json` và mọi lỗi vi phạm schema trả `400 BAD_REQUEST`.
- Xóa sách/độc giả để lại `bookId`/`userId` mồ côi trong Redis, Top 10 chỉ còn 9 sách sau khi ghép. Nay dọn bằng sự kiện (mục 3.3).

Lỗi phát hiện khi rà soát Phase 2 (28/10/2026) và đã sửa:
- `POST /api/books/{id}/read` thiếu `chapterNo` trả body mặc định của Spring thay vì `{code,message}`. Đây là query param bắt buộc đầu tiên của dự án nên `GlobalExceptionHandler` chưa có nhánh xử lý.
- `CurrentUser.canAccess` so chuỗi thô nên chính chủ gọi `/api/users/{userId}` bằng ObjectId hex **hoa** bị 403, trái với invariant chuẩn hóa ID mà reading/ranking đã áp dụng. Nay chuẩn hóa trước khi so quyền.
- Nghiêm trọng hơn: `UserService` thu hồi phiên theo `userId` thô trên URL, mà khóa Redis là `user-sessions:{id chuẩn}`. Đổi mật khẩu qua ID hex hoa **không thu hồi phiên nào** dù [SHARED.md](SHARED.md) công bố "đổi mật khẩu thu hồi mọi phiên"; token cũ vẫn dùng được. Nay thu hồi theo id chuẩn của document. Hồi quy: `CurrentUserTest`, `UserServiceTest`.

Phase 2 còn lại: bằng chứng duyệt tay trên trình duyệt cho E-Reader và bảng xếp hạng (I01/I02), tổng duyệt nhóm, migration alias ID cũ.
