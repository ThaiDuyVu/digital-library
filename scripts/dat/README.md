# Fixture và phép đo độc lập của Đạt

## Chạy với một nhóm Docker

Dùng Compose `digital-library` với MongoDB, Redis và Redis Insight. `run-acceptance.ps1` tái sử dụng `dl_redis`; ứng dụng dùng DB0, test chọn DB logic 1..15 **đang rỗng**. Script từ chối DB có dữ liệu, không FLUSH hoặc tạo container. Ví dụ `./scripts/dat/run-acceptance.ps1 -JavaHome $jdk -RedisDatabase 7`; kiểm tra DB7 rỗng trước khi dùng. Output mặc định ở `output/acceptance/`, ngoài source Git.

Phần fixture/benchmark bên dưới chạy riêng để không sửa key ứng dụng. Các đoạn mô tả container riêng trong lịch sử không còn là cách chạy acceptance hiện tại.

Yêu cầu: JDK 17+, Maven wrapper, Mongo/Redis đang chạy. Tool dùng dependency backend có sẵn, không cài tool toàn máy. Chạy từ gốc repo, tuần tự, không chạy nhiều seed cùng namespace đồng thời.

```powershell
$jdk = 'C:/Program Files/Android/openjdk/jdk-21.0.8'
./scripts/dat/run-fixture.ps1 -JavaHome $jdk -Action seed
./scripts/dat/run-fixture.ps1 -JavaHome $jdk -Action benchmark -Warmup 200 -Runs 1000
```

Mặc định ghi Mongo database `digital_library_dat_fixture_v1`, Redis DB0 namespace `dat-fixture:v1:`. Khác hoàn toàn key production `progress:*`/`ranking:books`; fixture không tự xuất hiện trên UI/API production. Mongo URI/Redis URL có thể truyền bằng `-MongoUri`, `-RedisUrl`; không ghi secret vào tài liệu/log. PowerShell khôi phục biến môi trường process khi kết thúc.

Seed tạo 50 sách × 5 chương, một user fixture không dùng đăng nhập, 50 Hash và ZSET 50 sách. ID ổn định và có thật trong Mongo. Owner marker bắt buộc cho database/namespace đã tồn tại; tool từ chối database không thuộc sở hữu. Chạy lại chỉ thay document có `fixtureOwner` tương ứng và các key tiến trình/ranking trong registry `dat-fixture:v1:owned-keys`; không xóa namespace hàng loạt, không đụng session. Mỗi lần seed tự kiểm tra reset dữ liệu fixture bị đổi và giữ sentinel ngoài registry. Không sửa tay ownership marker/registry. Dữ liệu và evidence được giữ lại sau chạy.

Nhận manifest của Sơn thay fixture:

```json
{
  "version": 1,
  "sourceDatabase": "database_thuc_cua_Son",
  "entries": [
    {"bookId":"ObjectId24hex", "userId":"ObjectId24hex", "chapter":1, "page":30, "line":0, "score":10}
  ]
}
```

Manifest cần ít nhất 50 cặp user/book khác nhau và đúng 50 bookId; số chương phải có thật trong `books.chapters[]`, user có thật trong `users`. Dùng cùng Mongo server hoặc truyền URI của nguồn. Tool chỉ đọc `sourceDatabase` của Sơn; baseline phép đo vẫn ghi vào database fixture riêng. Không chuyển API production sang database fixture. Dùng namespace/database/output riêng khi muốn giữ bộ kết quả trước:

```powershell
./scripts/dat/run-fixture.ps1 -JavaHome $jdk -Action seed `
  -Manifest C:/path/son-manifest.json `
  -Database digital_library_dat_fixture_son -Namespace dat-fixture:son: `
  -Output C:/path/dat-son-evidence
./scripts/dat/run-fixture.ps1 -JavaHome $jdk -Action benchmark `
  -Database digital_library_dat_fixture_son -Namespace dat-fixture:son: `
  -Output C:/path/dat-son-evidence
```

Đường nhận manifest đã thử với manifest fixture thực; chưa được xác nhận trên dữ liệu Sơn. Kiểm tra quyền truy cập và manifest trước khi phối hợp chạy trên môi trường nhóm.

Benchmark kiểm tra hai payload bằng nhau trước đo, đọc đầy đủ `chapter,page,line,updatedAt` dạng chuỗi bằng HGETALL và Mongo findOne theo `_id` có index, projection cùng bốn field. Không ghi trong vòng đo. Mặc định warm-up 200/backend, 1000 mẫu/backend, concurrency=1, luân phiên thứ tự từng cặp, đo elapsed bằng nanoTime. CSV chứa từng mẫu; JSON ghi mean/median/p95 (nearest rank). Thời gian không gồm HTTP/auth/catalog; không chứng minh UI hay SLA. Các phiên bản Redis, CPU, RAM và command server của lần chạy hiện tại nằm cạnh summary.

Quan sát CLI hoặc nhập các lệnh tương tự trong Redis Insight:

```powershell
docker exec dl_redis redis-cli --scan --pattern 'dat-fixture:v1:progress:*'
docker exec dl_redis redis-cli HGETALL dat-fixture:v1:progress:da7100000000000000000001:da7000000000000000000001
docker exec dl_redis redis-cli TTL dat-fixture:v1:progress:da7100000000000000000001:da7000000000000000000001
docker exec dl_redis redis-cli ZCARD dat-fixture:v1:ranking:books
docker exec dl_redis redis-cli ZREVRANGE dat-fixture:v1:ranking:books 0 9 WITHSCORES
```

Test API với database thật: `DAT_INTEGRATION_TESTS=true`, `MONGO_URI` trỏ database test, `REDIS_URL` trỏ Redis DB test riêng. `mvnw.cmd -B test`. Integration yêu cầu ranking key chưa có và từ chối nếu đã tồn tại; dùng DB test mới hoặc chỉ dọn đúng fixture đã xác định, không reset toàn DB. Lần đã kiểm chứng dùng Redis DB14 rồi DB15; giữ nguyên bằng chứng, không chạy lại vào đó. Khi không bật biến, tool và integration tự skip; API slice không cần database.

## Cách chạy nghiệm thu đã kiểm chứng

`./scripts/dat/run-acceptance.ps1 -JavaHome $jdk` tự tạo Redis container/cổng local và Mongo database mới cho mỗi run; không flush hay xóa dữ liệu cũ. Evidence, môi trường, code SHA256 lưu trong thư mục run mới. Không chạy đồng thời các lệnh Maven trên cùng checkout. Container/data được giữ để điều tra; mỗi lần chạy lại sẽ thêm một bộ riêng. Script hiện đã chạy thành công trên dữ liệu thật; xem docs/dat/ACCEPTANCE_RESULTS.md.

`run-fixture.ps1 -Action verify` kiểm tra read-only toàn bộ manifest/Hash/score/TTL và baseline, ghi `fixture-audit.json`; không seed lại. `-Output` phải chứa manifest.json của đúng namespace/database. Benchmark ghi raw/summary và lấy tự động Redis version/AOF/database; `run-environment.json` ghi action/tool SHA/CPU/RAM của lần gọi cuối. Khi lưu nhiều phép đo, dùng output directory mới và copy manifest sang đó theo ACCEPTANCE_RESULTS, không ghi đè evidence cũ.
