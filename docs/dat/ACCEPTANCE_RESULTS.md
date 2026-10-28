# Nghiệm thu phần Đạt — 22/10/2026

> **Cập nhật 26/10/2026:** [GIAI_THICH_PHAN_DAT.md](GIAI_THICH_PHAN_DAT.md) là kết quả hiện tại: 16 Đạt, 0 Chưa đạt, 2 Bị chặn theo tiêu chí gốc. Backend/cleanup thật, manifest từ seed Sơn, phép đo mới và hai lượt browser đã qua. I01 còn thiếu ca đóng khi PUT đang gửi; I03 còn tổng duyệt nhóm/xác nhận Vũ. Các bảng/số liệu 22/10 bên dưới giữ làm lịch sử, không còn mô tả UI hiện tại.

Kết quả hiện tại sau sửa F01/F02 và kiểm chứng Mongo/Redis thật: **14 Đạt, 0 Chưa đạt, 4 Bị chặn**. P02/R01 đã qua regression ID hoa/thường, xem [ID_NORMALIZATION.md](ID_NORMALIZATION.md). Bằng chứng đỏ review được giữ nguyên. R05 và I01–I03 còn chờ UI/nhóm; S01/S02/B01 chỉ đạt fixture riêng. Migration alias legacy chưa được duyệt hoặc chạy, không gọi toàn bộ hoàn thành.

Nền Git `4a0dd9b31fdc17601e2891f5acf28f69b4d98954`, nhánh `codex/dat-work-dossier`, mã bổ sung chưa commit. Production ProgressService/RankingService đã sửa chuẩn hóa ObjectId; bằng chứng regression có fingerprint toàn bộ Java production. Các phần fixture/benchmark/UI không đổi.

## Từng mục và bằng chứng

| ID | Trạng thái | Expected / actual và bằng chứng |
|---|---|---|
| P01 | Đạt | PUT chapter3/page30/line0 và GET 200 đúng vị trí/updatedAt UTC; HGETALL bốn field, TTL=-1. API evidence + snapshot `P01`. |
| P02 | Đạt | F02 đã sửa: PUT sách hoa page30 rồi GET chuẩn/hoa đều30; userId hoa của chủ/admin dùng cùng Hash, alias key không sinh. Regression thật và dữ liệu legacy chưa migration xem ID_NORMALIZATION.md. |
| P03 | Đạt | Không token/sai token 401, người khác GET/PUT 403, admin GET200/PUT userB200; token lấy từ login thật, hash không đổi khi bị từ chối. Snapshot `P03`. |
| P04 | Đạt | Thiếu/null/chỉ số dưới min/sai chuỗi/số thập phân/JSON hỏng → 400 BAD_REQUEST; Hash không đổi. Request/response lỗi và snapshot `P04`. |
| P05 | Đạt | bookId sai định dạng và ObjectId không tồn tại →404; không có key mới. Assertion Redis hasKey=false; code dùng BookService.exists trước ghi. |
| P06 | Đạt | GET chưa lưu 404 theo D01; chương99 không tồn tại 404 và không đổi Hash; admin target user sai/mất404, không tạo key theo D05. |
| R01 | Đạt | F01 đã sửa: POST bookId hoa/thường cùng member chuẩn score2, response ID chuẩn, batch ghép metadata được. GET legacy DTO chuẩn hóa nhưng không gộp dữ liệu cũ; xem ID_NORMALIZATION.md. |
| R02 | Đạt | 40 request đồng thời, 8 worker; 40 HTTP status200, 0 lỗi; score1→41, không mất increment. Snapshot `R02`. |
| R03 | Đạt | Ranking rỗng trả[]; khi có hai sách top1/top100 đúng. Khi có12 sách thật, mặc định đúng10 và cùng thứ tự Redis reverseRange0..9; top100 trả12. Snapshot `R03`. |
| R04 | Đạt | top0/-1/101/abc/1.5 đều400; cùng score41 xếp theo member giảm dần của Redis đúng D04. Snapshot `R04`. |
| R05 | Bị chặn | API đã đạt: sai/mất sách404 không tăng score; xóa duy nhất sách fixture mới rồi POST404, toàn ZSET không đổi; batch trả sách còn tồn tại và bỏ sách mất. Chưa xác minh UI Sơn thực sự ghép/bỏ qua sách mất. Không tự cleanup theo D06. |
| S01 | Đạt | Audit chỉ đọc xác minh50 sách Mongo có chapter hợp lệ, user có thật; SCAN đúng50 Hash, mỗi Hash TYPE/hash HLEN4 TTL-1, ZCARD50 và toàn bộ score khớp manifest. Namespace fixture `dat-fixture:v1:*`, không phải dữ liệu nhóm. |
| S02 | Đạt | Bằng chứng seed trước vẫn phù hợp: chạy2 lần, cố ý đổi page/score fixture rồi reset về cùng snapshot; sentinel ngoài registry giữ nguyên. Audit hiện tại xác nhận trạng thái sau seed. Không chạy lại seed không đổi, không FLUSH. |
| S03 | Đạt | Redis Insight Workbench chạy HGETALL/TTL/ZCARD/ZREVRANGE thật, có PNG; TYPE progress/hash, ranking/zset và session auth/string (DB13), không đọc token/giá trị session. Người dùng đã xác nhận Terms. |
| B01 | Đạt | Hai backend cùng50 vị trí/bốn string field, warm-up200/backend,1000 mẫu/backend, concurrency1; raw2000 mẫu,0 lỗi. Tính lại mean/median/p95 độc lập từ CSV khớp summary. Chỉ kết luận cho fixture local. |
| I01 | Bị chặn | ReadingPage vẫn placeholder; không có lưu/khôi phục khi đóng/mở trình duyệt hoặc request khi đóng tab. Cần Sơn tích hợp và bằng chứng browser. |
| I02 | Bị chặn | API tăng ZSET và Insight xem dữ liệu đã đạt riêng; RankingPage vẫn placeholder, chưa chứng minh web thay thứ hạng khi mở nhiều chương. |
| I03 | Bị chặn | Chưa có hai lần tổng duyệt với tài khoản/sách nhóm cố định; chưa xác nhận Vũ đã nhận số liệu. Không tự gửi tin ngoài khi chưa được giao. |

API evidence chính: [run qua script tái lập](evidence/acceptance/20261022203530_82c03582/api-redis-evidence.json), [môi trường/code SHA256](evidence/acceptance/20261022203530_82c03582/environment.json). File có `completed=true`,106 request/response và10 snapshot, loại auth/register và không lưu Authorization/token/password. Đây là MockMvc full Spring context + Mongo/Redis/login thật; smoke HTTP TCP trước đó được giữ ở [http-smoke.json](evidence/http-smoke.json). Không gọi MockMvc là demo trình duyệt.

Run bổ sung đầu tiên tại20:31 dùng Mongo `digital_library_dat_acceptance_20261022`, Redis DB13 đã kiểm tra rỗng trước chạy; [evidence](evidence/acceptance/api-redis-evidence.json). Script tái lập lúc20:35 tạo Mongo `digital_library_dat_acceptance_20261022203530_82c03582`, Redis container `dl_dat_acceptance_20261022203530_82c03582`, localhost50078/DB0; cả hai run qua assertion, không xóa dữ liệu cũ. Sách đã xóa là sách mới do chính test tạo, không phải sách có sẵn.

Fixture: [manifest](evidence/fixture/manifest.json), [audit read-only50 dòng](evidence/acceptance/benchmark/fixture-audit.json), [seed reset/sentinel](evidence/fixture/seed-verification.json). Mongo `digital_library_dat_fixture_v1`, Redis localhost6379/DB0 namespace`dat-fixture:v1:`. Manifest Sơn chưa có; không tự sửa frontend/scripts/seed.

Redis Insight: [Hash](evidence/acceptance/redis-insight-hash.png), [ZSET/ZCARD50](evidence/acceptance/redis-insight-ranking.png), [session String](evidence/acceptance/redis-insight-session-type.png), cùng các file `redis-insight-*-state.txt`. Workbench không hỗ trợ SELECT; đã chuyển DB bằng bộ chọn UI rồi chạy TYPE thành công. Đây là hạn chế công cụ, không phải lỗi reading/ranking. Session key là hash SHA256 của token, không phải token đăng nhập.

## Số liệu mới lúc20:36 +07

| Backend | Mẫu | Mean ms | Median ms | p95 ms | Lỗi |
|---|---:|---:|---:|---:|---:|
| Mongo |1000|1.0326982|0.9004|1.8855|0|
| Redis |1000|0.6219189|0.5332|1.1874|0|

[CSV từng mẫu](evidence/acceptance/benchmark/benchmark-raw.csv), [summary](evidence/acceptance/benchmark/benchmark-summary.json), [tính lại độc lập](evidence/acceptance/benchmark/raw-summary-check.json). Hai backend warm-up200; đảo thứ tự từng cặp, cùng round-robin dataset, connection lâu dài; HGETALL và Mongo findOne theo index_id projection4 field, materialize đầy đủ. nanoTime, ms=ns/1e6, percentile nearest rank ceil(p*N). Không bao gồm HTTP/auth/catalog, không đo cold cache hoặc SLA. Windows11, JDK21.0.8, i5-12500H/16 logical processors, RAM16869543936byte; Mongo7.0.43, Redis7.4.11/AOF1. Các container/ứng dụng khác vẫn hoạt động, tải máy không cô lập. `run-environment.json` là metadata lần gọi tool cuối (`verify`); cùng máy với phép đo, summary có timestamp/config riêng. Giữ nguyên kết quả lần20:22 trong thư mục fixture.

## Chạy lại

Từ gốc repo, PowerShell:

```powershell
$jdk = 'C:/Program Files/Android/openjdk/jdk-21.0.8'
./scripts/dat/run-acceptance.ps1 -JavaHome $jdk
# Mỗi lần tạo Redis/container/port và Mongo DB mới, giữ lại dữ liệu và evidence.
# Không phải chọn DB rỗng hoặc flush DB có sẵn.

$out = Join-Path $PWD ('docs/dat/evidence/replay-' + (Get-Date -Format yyyyMMddHHmmss))
New-Item -ItemType Directory -Path $out | Out-Null
Copy-Item docs/dat/evidence/fixture/manifest.json "$out/manifest.json"
./scripts/dat/run-fixture.ps1 -JavaHome $jdk -Action verify -Output $out
./scripts/dat/run-fixture.ps1 -JavaHome $jdk -Action benchmark -Warmup 200 -Runs 1000 -Output $out
```

Mongo/Redis fixture phải đang chạy. Nếu cần dựng fixture ở máy mới, dùng `run-fixture.ps1 -Action seed` theo [hướng dẫn](../../scripts/dat/README.md); chỉ reset dữ liệu script sở hữu. Chạy tuần tự. Container acceptance và dữ liệu được giữ để xem bằng chứng; không tự xóa container/volume khi dừng. Không có thay đổi nghiệp vụ cần sửa sau các assertion lần này; đã sửa khoảng trống test/evidence và cách chạy lại an toàn. Chưa commit/push/PR hoặc dùng reset usage.
