# Giải thích phần Đạt: tiến trình đọc và bảng xếp hạng

## 1. Đạt làm phần nào?

Đạt phụ trách hai chức năng backend dùng Redis:

| Chức năng | Người dùng thấy gì? | Redis lưu gì? |
|---|---|---|
| Tiến trình đọc | Mở lại sách tại vị trí đã lưu; lấy danh sách sách có tiến trình | Một Hash cho mỗi cặp người dùng/sách |
| Bảng xếp hạng | Xem sách có nhiều lượt mở chương; hạn chế đếm lặp quá nhanh | Một Sorted Set và các khóa chống lặp có hạn dùng |

Nội dung sách, chương và tài khoản do phần MongoDB của Vũ quản lý. Giao diện thuộc phần Sơn. Đạt gọi service công khai của Vũ để kiểm tra sách/chương, không truy cập repository của domain khác và không chép nội dung sách sang Redis.

Hai trang đọc sách/BXH đã có thay đổi local trước lượt hoàn thiện này. Chúng được giữ để tích hợp vào dự án; phần bổ sung bắt buộc cho API mới là truyền `chapterNo` khi mở chương. Không nhận toàn bộ giao diện là phần Đạt tự viết.

## 2. Cấu trúc phần code

```text
backend/src/main/java/vn/edu/huit/digitallibrary/
├── reading/
│   ├── controller/ProgressController.java
│   ├── service/ProgressService.java
│   ├── repository/ProgressRepository.java
│   └── dto/
│       ├── ProgressRequest.java             # Vị trí client gửi lên
│       ├── ProgressResponse.java            # Vị trí của một sách
│       ├── ProgressEntry.java               # Một dòng trong danh sách sách đã lưu
│       └── ProgressIntegerDeserializer.java # Không chấp nhận số thực/chuỗi thay số nguyên
└── ranking/
    ├── controller/RankingController.java
    ├── service/RankingService.java
    ├── repository/RankingRepository.java
    └── dto/RankingEntry.java                # bookId và score
```

Mỗi lớp có nhiệm vụ riêng:

- **Controller:** nhận đường dẫn/tham số, yêu cầu đăng nhập nếu cần và trả JSON.
- **Service:** kiểm tra quyền, ID, sách/chương và quy tắc nghiệp vụ.
- **Repository:** thực hiện lệnh Redis. Không dùng repository của catalog/identity.
- **DTO:** mô tả dữ liệu nhận vào hoặc trả ra, không trả nguyên đối tượng tài khoản/sách.

Kiểm thử nằm trong `backend/src/test/java/.../reading/` và `ranking/`. Hai nơi tích hợp UI là `frontend/src/features/reading/ReadingPage.jsx` và `frontend/src/features/ranking/RankingPage.jsx`.

## 3. Lưu và khôi phục tiến trình

Ví dụ một người đang đọc chương 3, trang 30, dòng 0:

```text
Key: progress:{userId}:{bookId}
Type: Hash
chapter   = 3
page      = 30
line      = 0
updatedAt = thời gian UTC do server tạo
```

`PUT /api/progress/{userId}/{bookId}` nhận:

```json
{"chapter":3,"page":30,"line":0}
```

Luồng xử lý: token → quyền chính chủ/admin → sách/chương tồn tại → dữ liệu hợp lệ → ghi Hash. Chapter/page phải là số nguyên từ 1; line là số nguyên từ 0. Không tin userId trên URL nếu nó không thuộc người đã đăng nhập.

Trong repository, `redis.opsForHash().putAll(...)` ghi đủ bốn trường bằng một HSET. Lưu lần tiếp theo ghi đè cùng Hash, không tạo một bản tiến trình mới. Tiến trình chưa đặt TTL trong bản demo.

`GET /api/progress/{userId}/{bookId}` đọc Hash bằng HGETALL và trả vị trí. Chưa lưu trả 404; UI mới chọn vị trí bắt đầu. ID ObjectId viết hoa được chuẩn hóa thành chữ thường trước khi dùng làm key, tránh cùng sách nhưng sinh hai key khác nhau.

Trang trên web được phân theo nội dung, không phải số trang của sách giấy. Frontend hiện chia khoảng1.600 ký tự/trang và gửi line 0. Backend lưu đúng vị trí client gửi, chưa tự đặt giới hạn trang tối đa khi cách phân trang còn thuộc frontend.

## 4. Danh sách sách có tiến trình

`GET /api/progress/{userId}` cũng cần Bearer token và quyền chính chủ/admin. Kết quả ví dụ:

```json
[
  {"bookId":"b00c00000000000000000001","chapter":3,"page":30,"line":0,"updatedAt":"2026-10-26T12:00:00Z"}
]
```

Repository dùng SCAN theo mẫu `progress:{userId}:*`, không dùng KEYS để quét chặn toàn bộ Redis. Kết quả trùng từ SCAN được loại bỏ. Hash đã biến mất trong lúc quét được bỏ qua.

Service chỉ nhận key có ID sách chuẩn hóa, kiểm tra sách còn tồn tại bằng `BookService.exists`, rồi xếp vị trí mới cập nhật nhất trước; nếu cùng thời gian thì xếp theo bookId. Không có tiến trình trả 200 với `[]`. Đây là danh sách vị trí đã lưu: dự án chưa có cờ “đã đọc xong” để loại sách hoàn thành.

## 5. Tính lượt đọc và chống tăng lặp 60 giây

Client gọi `POST /api/books/{bookId}/read?chapterNo=3` khi mở chương. API cần Bearer token; userId lấy từ phiên đăng nhập, không lấy từ tham số do client tự khai.

Trước khi đếm, service kiểm tra chapterNo là số nguyên>=1, sách tồn tại và chương có thật. Sau đó dùng khóa:

```text
read-lock:{userId}:{bookId}:{chapterNo}
```

Người dùng đã chọn cửa sổ 60 giây. Cùng người/sách/chương trong cửa sổ đó chỉ tính một lượt. Khóa dùng ID ObjectId chuẩn hóa; alias cũ không được tự chuyển đổi. Người khác hoặc chương khác được tính riêng. Gửi lặp vẫn trả 200 với điểm hiện tại, nhưng bản thân request đó không tăng điểm và không kéo dài thời gian khóa.

Đoạn Lua chính trong `RankingRepository`:

```lua
local score = redis.call('ZSCORE', KEYS[1], ARGV[1]) or '0'
if redis.call('SET', KEYS[2], '1', 'NX', 'EX', 60) then
    score = redis.call('ZINCRBY', KEYS[1], 1, ARGV[1])
end
return score
```

KEYS1 là `ranking:books`, KEYS2 là khóa chống lặp, ARGV1 là bookId. NX nghĩa là chỉ đặt khi khóa chưa tồn tại; EX 60 đặt hạn 60 giây. Redis chạy cả script nguyên tử, nên nhiều request đồng thời không thể cùng vượt qua bước đặt khóa. ZINCRBY tăng trực tiếp trong Redis, không đọc điểm rồi cộng bằng Java.

Ví dụ cùng user/sách: mở chương 1 → điểm 1; gửi lại chương 1 ngay → vẫn 1; mở chương 3 → 2; user khác mở chương 1 → 3. Khi khóa của user đầu/chương 1 hết hạn, mở lại được tính tiếp. Điểm là lượt mở chương được chấp nhận, không phải số người đọc duy nhất hay bằng chứng đọc xong sách.

## 6. Hiển thị bảng xếp hạng

Redis chỉ lưu `ranking:books` dưới dạng ZSET: member là bookId, score là lượt đọc. `GET /api/ranking?top=10` công khai, top cho phép 1..100; ngoài biên hoặc không nguyên trả 400.

Repository dùng `reverseRangeWithScores` để lấy điểm giảm dần, tương ứng ZREVRANGE WITHSCORES. Hòa điểm theo thứ tự member giảm dần của Redis. Frontend lấy bookId rồi gọi `/api/books/batch` để ghép tên sách/tác giả từ Mongo, giữ thứ tự BXH và bỏ sách đã mất; không lưu metadata sách vào Redis.

Khi Vũ xóa sách/user, code sự kiện dùng chung đã dọn progress/ranking liên quan. Đây là phần đã có từ trước, được kiểm thử lại; Đạt không tự nhận phần thay đổi catalog/identity đó.

## 7. Kiểm chứng và cách chạy

- Full suite: 44 ca, 42 qua/0 lỗi/2 review skip theo cấu hình. Hai ca review ID được chạy riêng sau đó và đều qua.
- Redis thật: 40 request đồng thời cùng user/chương chỉ tăng 1; người/chương khác được tính; ID hoa/thường dùng cùng tài nguyên; khóa có TTL 60 và duplicate không gia hạn.
- Ca hết hạn rút riêng TTL khóa test xuống 50 ms để kiểm tra Redis hết hạn thật rồi cho tăng tiếp; không tuyên bố đã ngồi chờ đủ 60 giây trong test đó.
- Danh sách được kiểm tra với owner/admin, 401/403/404, rỗng, thứ tự, cách ly hai user và sách mất. Frontend build thành công; lint có 6 warning cũ về setState trong effect.

Chỉ dùng một nhóm Docker `digital-library`: Mongo 27017, Redis 6379 và Redis Insight 5540. Ứng dụng dùng Redis DB0. Test dùng một DB logic 1..15 đang rỗng trong cùng Redis; runner dừng nếu DB đó có dữ liệu, không FLUSH hoặc tạo container mới.

```powershell
# Từ gốc repo; cần JDK 17+ thực tế, đặt JAVA_HOME đúng máy.
docker compose up -d mongodb redis redisinsight
./scripts/dat/run-acceptance.ps1 -JavaHome $env:JAVA_HOME -RedisDatabase 7 `
  -TestSelector 'DatRedisIntegrationTest,ProgressApiTest,RankingApiTest,BookControllerTest,DigitalLibraryApiApplicationTests'
```

DB7 chỉ là ví dụ; kiểm tra đang rỗng trước khi dùng. Spring không tự đọc `.env` của Compose: khi thay cổng/database phải đặt MONGO_URI/REDIS_URL tương ứng. Không commit `.env`, token, dữ liệu Redis/Mongo, log hoặc build output.

Backend/optional đã được kiểm chứng không thay cho tổng duyệt ba thành viên. Đóng browser sau báo “Đã lưu” đã qua; đóng ngay lúc PUT còn đang gửi vẫn cần frontend kiểm chứng riêng. Không tự migration các key alias cũ hoặc tuyên bố toàn bộ Phase 2 nhóm đã nghiệm thu.
