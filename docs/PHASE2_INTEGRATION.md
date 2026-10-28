# Hợp nhất phase 2 vào main — 28/10/2026

Ghi nhận việc merge hai Pull Request phase 2 và kết quả kiểm chứng trên Mongo/Redis thật. Tài liệu này là biên bản tích hợp, **không thay** hợp đồng trong [SHARED.md](SHARED.md) hay phân công trong `members/`.

## Đã merge

| PR | Người | Nội dung | Commit merge |
|---|---|---|---|
| #8 | Sơn | Giao diện phase 2 (`frontend/src/features/`), `scripts/seed/bench_latency.py` | `15a8ecf` |
| #9 | Đạt | Reading/ranking backend + hồ sơ `docs/dat/` | `3b04723` |

Nền: `0b1c8ce` (sau PR #7). Cả hai PR đưa vào `main` bằng fast-forward push, không dùng `--force`.

## Xung đột và cách xử lý

Hai PR cùng viết lại `frontend/src/features/reading/ReadingPage.jsx` và `.../ranking/RankingPage.jsx` (trước đó chỉ là stub 13 dòng).

- Lấy bản của **Sơn** vì `frontend/src/features/` thuộc Sơn theo `members/`, và bản này đã chứa toàn bộ logic của Đạt cộng thêm `useSaveOnExit`, `TopBooksWidget`, `MiniCover`, điều chỉnh cỡ chữ, cột xu hướng.
- Áp lại **một** thay đổi chỉ Đạt có: `POST /books/{id}/read?chapterNo=…`. Thiếu tham số này thì mọi lượt đọc trả 400 và ZSET không bao giờ tăng; vì lỗi đếm lượt bị `.catch(() => {})` bỏ qua nên giao diện vẫn trông bình thường còn bảng xếp hạng luôn rỗng.

## Sửa thêm khi hợp nhất

| Chỗ sửa | Lý do |
|---|---|
| `common/GlobalExceptionHandler` | Thiếu query param bắt buộc trả body mặc định của Spring (`timestamp/error/path`), sai hợp đồng `{code,message}`. `chapterNo` là query param bắt buộc đầu tiên của dự án nên lỗi này mới xuất hiện. Thêm handler cho `MissingServletRequestParameterException` và test `common/GlobalExceptionHandlerTest`. Đã ghi lý do vào SHARED.md theo quy ước file dùng chung. |
| `docs/DEMO_SCRIPT.md` | Kịch bản 1 ngụ ý người khác mở lại sách vẫn thấy trang 30, nhưng tiến trình lưu theo `userId` và chỉ chính chủ/admin đọc được → phải đăng nhập đúng tài khoản. Kịch bản 2 cần mở **chương khác nhau** vì đã có chống lặp 60 giây. |
| `docs/dat/HANDOFF.md` | Bảng hợp đồng ngày 22/10 còn ghi `POST /read` là công khai, không chapterNo, chưa dedupe. Thêm ghi chú ngày 28/10 trỏ về SHARED.md, giữ nguyên phần còn lại làm lịch sử. |

## Kiểm chứng

Hạ tầng: Compose `dl_mongodb` (host 27018 vì mongod cài sẵn trên máy giữ 27017), `dl_redis` 6379. Backend chạy ngoài Docker nên phải truyền `MONGO_URI`/`REDIS_URL` vào tiến trình.

Dữ liệu: mỗi lần chạy dùng **database Mongo mới** và **logical Redis DB rỗng khác 0** theo chính sách của `scripts/dat/run-acceptance.ps1`. Không chạm dữ liệu ứng dụng ở Redis DB0 (70 key) và database `digital_library`; không dùng FLUSH, không xóa volume.

| Hạng mục | Lệnh | Kết quả |
|---|---|---|
| Toàn bộ test backend | `./mvnw -o -B test` với `DAT_INTEGRATION_TESTS=true` | **47 pass, 0 fail, 3 skip** |
| 2 review test alias ID | `-Dtest=DatRedisIntegrationTest#…` + `DAT_REVIEW_TESTS=true`, mỗi test một Redis DB rỗng | **2 pass** |
| Build frontend | `npm ci && npm run build` | Đạt; `oxlint` chỉ còn cảnh báo `set-state-in-effect` có từ trước |
| API đầu-cuối | curl trên backend thật, database riêng | Đạt, chi tiết dưới |

`DatFixtureToolTest` skip 1 ca theo thiết kế; 2 ca skip còn lại là review test đã chạy riêng ở trên.

### Kết quả API đầu-cuối

- Tiến trình: GET trước khi lưu → `404 NOT_FOUND`; PUT `{chapter:1,page:5}` rồi PUT `{chapter:2,page:30}` → 200; GET trả đúng chương 2 trang 30; `GET /api/progress/{userId}` trả mảng một phần tử mới nhất trước.
- Chống lặp: POST `read?chapterNo=1` ba lần liên tiếp → score giữ **1.0**; `chapterNo=2` → **2.0**. Hai khóa `read-lock:…:1` và `…:2` cùng TTL 24s, chứng tỏ khóa **không được gia hạn** khi gọi lặp.
- Lỗi: thiếu `chapterNo` → 400 `{code,message}`; `chapterNo=abc` → 400; `chapterNo=0` → 400; `chapterNo=99` → 404; không token → 401; đọc tiến trình người khác → 403.
- Redis: `progress:{userId}:{bookId}` là Hash 4 field, `TTL=-1`; `ranking:books` là ZSET member=bookId; khớp [SHARED.md](SHARED.md).
- Đối chiếu tĩnh: mọi lời gọi API trong `frontend/src` đều có route backend tương ứng; tên tham số (`q`, `ids`, `top`, `chapterNo`) và field DTO (`content`, `chapters[].chapterNo`, `sections[].heading/text`, `id/title/author/categories`) đều khớp.

## Còn lại

- **I01/I02 chưa gỡ:** chưa có bằng chứng trên trình duyệt thật (đóng/mở lại tab khôi phục trang, thứ hạng nhảy trên web). Giao diện đã có và API đã đúng, nhưng build và curl không thay cho một lượt duyệt tay trên browser.
- **Dữ liệu/manifest của Sơn** chưa đối chiếu; fixture `dat-fixture:v1:*` vẫn là bộ độc lập.
- **Alias ID cũ** chưa migration, giữ nguyên theo `docs/dat/ID_NORMALIZATION.md`; cần duyệt phạm vi trước khi apply.
- `GET /api/progress/{userId}` đã có ở backend nhưng giao diện chưa dùng; không phải điều kiện bắt buộc.
- `scripts/seed/bench_out/bench-raw.csv` (8001 dòng) là artifact benchmark được commit trong PR #8, thuộc phần Sơn.
- `develop` vẫn ở `5b1bec0`, lệch xa `main`.
