# Bằng chứng duyệt trên trình duyệt thật cho I01 và I02

Ngày chạy: 28/10/2026. Người chạy: Vũ. Nhánh: `main` tại `fb101b9` (sau khi đã merge PR #8 của Sơn và PR #9 của Đạt).

Trước lượt này, hai tiêu chí I01/I02 bị treo vì chưa ai duyệt tay trên trình duyệt đối với **mã đã merge**. Đạt có hai lượt trên Edge, nhưng đó là bản `ReadingPage`/`RankingPage` trước khi hợp nhất; bản hiện tại là giao diện của Sơn cộng thay đổi `?chapterNo=` lúc gỡ xung đột, nên bằng chứng cũ không còn mô tả đúng mã đang chạy.

## 1. Cách chạy

Chrome thật (`/Applications/Google Chrome.app`, chế độ `--headless=new`) được điều khiển qua Chrome DevTools Protocol bằng `WebSocket` có sẵn của Node 22. **Không cài thêm thư viện nào** và không đổi `package.json`, đúng ràng buộc "không cài công cụ toàn máy để bỏ qua lỗi".

Thao tác là sự kiện thật của trình duyệt: `Input.dispatchMouseEvent` để bấm nút, `Input.insertText` để gõ vào ô nhập, nên React nhận đúng `onChange`/`onClick` như người dùng bấm tay. Ảnh chụp bằng `Page.captureScreenshot`; nhật ký HTTP lấy từ domain `Network`.

Kịch bản: [`evidence/run-i01.mjs`](evidence/run-i01.mjs), [`evidence/run-i02.mjs`](evidence/run-i02.mjs), thư viện [`evidence/cdp.mjs`](evidence/cdp.mjs). Nhật ký đầy đủ: [`evidence/i01-log.json`](evidence/i01-log.json), [`evidence/i02-log.json`](evidence/i02-log.json).

### Cách ly dữ liệu

Không chạm dữ liệu đang có. Backend chạy trên MongoDB `digital_library_uiev` (bản sao collection `books` bằng `$merge`, nguồn chỉ đọc) và Redis **DB3** đang rỗng. Không dùng `FLUSHDB`/`FLUSHALL`, không `docker compose down -v`. Sau khi chạy, dữ liệu thật vẫn đúng như trước: Redis DB0 70 khóa, `ranking:books` 50 thành viên, Mongo `digital_library` 61 sách / 12 tài khoản.

## 2. I01 — lưu và khôi phục vị trí đọc

Tài khoản `vu_i01` được **đăng ký và đăng nhập qua giao diện**, không chèn token bằng tay.

| Bước | Kết quả | Ảnh |
|---|---|---|
| Mở sách lần đầu | `Chương 1 … Trang 1 / 6`, không có thanh "Tiếp tục" | [04](evidence/04-mo-sach-lan-dau.png) |
| Lật hết chương 2 (8 trang) | UI báo `Đã lưu vị trí đọc vào Redis.` | [05](evidence/05-truoc-khi-dong-tab.png) |
| Hash Redis lúc đó | `chapter 2  page 8  line 0  updatedAt 2026-10-28T06:10:56Z` | |
| Đóng tab (`Target.closeTarget`) | — | |
| Mở tab mới, cùng tài khoản | `Tiếp tục từ chương 2, trang 8.` và `Chương 2 … Trang 8 / 8` | [06](evidence/06-sau-khi-mo-lai.png) |

Request quan sát được từ trình duyệt: `GET /api/progress/{userId}/{bookId}` → 404 ở lần đọc đầu (chưa có tiến trình), rồi 7 lần `PUT /api/progress/...` → 200 ứng với 7 lần lật trang, và `POST /api/books/{bookId}/read?chapterNo=1|2` → 200.

**Kết luận I01 luồng chính: Đạt.**

### Ca biên Đạt để ngỏ: đóng tab đúng lúc PUT đang gửi

`docs/dat/GIAI_THICH_PHAN_DAT.md` ghi "đóng ngay lúc PUT còn đang gửi vẫn cần frontend kiểm chứng riêng". Lượt này đã kiểm: lật về trang 7 rồi đóng tab **ngay**, lúc đóng giao diện còn đang hiển thị `Đang lưu vị trí đọc…`. Sau khi tab đã đóng, Redis vẫn nhận `page 7`.

Cơ chế hoạt động là `fetch(..., { keepalive: true })` trong `useSaveOnExit`, gắn vào `pagehide` và `visibilitychange`. Trình duyệt hoàn tất request ở tiến trình nền sau khi trang đã đóng. Dự án cố ý không dùng `navigator.sendBeacon` vì nó chỉ gửi POST và không gắn được header `Authorization`.

**Kết luận ca biên: Đạt.**

## 3. I02 — mở nhiều chương, thứ hạng đổi trên web

Nạp ba sách đối chứng vào ZSET sandbox (9, 7, 5 điểm); sách mục tiêu bắt đầu ở 2 điểm, hạng 4.

Giữ tab A ở trang "Thịnh hành" để cột **Xu hướng** so sánh được trước/sau, tab B mở lần lượt chương 3→10 của sách mục tiêu. Chín `POST /api/books/{bookId}/read?chapterNo=…` đều trả 200.

| | Hạng 1 | Hạng 2 | Hạng 3 | Hạng 4 |
|---|---|---|---|---|
| Trước ([08](evidence/08-bxh-truoc.png)) | Dế Mèn phiêu lưu ký — 9 | Câu chuyện về tấm bản đồ sao thất lạc — 7 | Dấu chân quanh căn biệt thự bỏ hoang — 5 | **Hành trình đi tìm tương lai của loài người — 2** |
| Sau ([10](evidence/10-bxh-sau.png)) | **Hành trình đi tìm tương lai của loài người — 10 ▲ 3 hạng** | Dế Mèn phiêu lưu ký — 9 ▼ 1 hạng | Câu chuyện… — 7 ▼ 1 hạng | Dấu chân… — 5 ▼ 1 hạng |

Chống tăng lặp 60 giây cũng được kiểm ngay trên giao diện: mở lại chương 9 rồi chương 10 (vừa mở xong) không làm điểm đổi, giữ nguyên 10.

**Kết luận I02: Đạt.**

## 4. Lỗi phát hiện trong lượt duyệt: trang đã lưu vượt số trang có thật

Đây là phát hiện mới, **chưa sửa**, vì nằm trong phần của Sơn (`frontend/src/features/reading/`, `scripts/seed/`).

Giao diện chia trang ở phía client, 1.600 ký tự một trang (`PAGE_CHARS` trong `ReadingPage.jsx`). Chương dài nhất trong toàn bộ kho là 10.699 ký tự, tức **tối đa 7 trang**. Nhưng dữ liệu seed đang có số trang tới 40: **47 trên 60 bản ghi tiến trình trong Redis DB0 (78%) trỏ tới một trang không thể tồn tại.**

Hậu quả quan sát được trên trình duyệt ([07](evidence/07-kich-ban-trang-30.png)): đặt Hash về `page 30` rồi mở sách, thanh thông báo nói `Tiếp tục từ chương 2, trang 30.` trong khi vùng đọc hiển thị `Trang 8 / 8`. Giao diện tự kẹp số trang khi hiển thị (`Math.min(pos.page, totalPages)`) nhưng **không sửa lại `pos` cũng không ghi lại Redis**, nên `useSaveOnExit` coi "2:30" là đã lưu và sai số này tồn tại vĩnh viễn.

Ảnh hưởng trực tiếp tới kịch bản demo: `docs/DEMO_SCRIPT.md` và tiêu chí I01 đều viết "đọc đến trang 30", mà người đọc không bao giờ tới được trang 30 với dữ liệu và cách phân trang hiện tại. Nếu demo mở một tài khoản seed, màn hình sẽ tự mâu thuẫn trước mặt hội đồng.

Hai hướng xử lý, cần Sơn quyết vì thuộc phần của Sơn:

1. **Sửa seed** để số trang nằm trong khoảng hợp lệ của chương tương ứng — gốc rễ của vấn đề.
2. **Cho `ReadingPage` tự chữa**: khi `pos.page > totalPages`, kéo về trang cuối, đổi lời thông báo cho đúng và `PUT` lại tiến trình để Redis thôi giữ số sai.

Nên làm cả hai: (1) dọn dữ liệu đang có, (2) giúp giao diện không nói sai khi gặp chương bị sửa ngắn lại về sau.
