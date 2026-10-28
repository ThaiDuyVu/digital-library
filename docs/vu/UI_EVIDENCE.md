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

## 4. Mốc "Trang 30" của đề tài (lượt sửa 28/10/2026)

[Yêu cầu đề tài](../YC_PJ.md) ghi rõ: *"SV1 đọc sách đến Trang 30 trên Web rồi đóng trình duyệt. SV3 mở lại sách → Hệ thống tự động cuộn đến đúng Trang 30"*. Mốc này là điều kiện chấm 1,5đ "Demo sống", không phải chi tiết tùy chọn.

### Vì sao trước đó không đạt

E-Reader đánh số trang **trong từng chương**, 1.600 ký tự một trang. Chương dài nhất trong cả kho là 10.699 ký tự, tức trần 7 trang — Trang 30 nằm ngoài tầm với của mọi chương. Dữ liệu seed lại ghi số trang tới 40, hoàn toàn ngẫu nhiên và không bám nội dung thật (kiểm 40 bản ghi: chỉ 3 khớp mô hình "cả cuốn", 7 khớp mô hình "từng chương"). Hệ quả: 47/60 bản ghi tiến trình trong Redis DB0 trỏ tới trang không tồn tại; giao diện báo *"Tiếp tục từ chương 2, trang 30"* trong khi hiển thị *"Trang 8 / 8"* ([ảnh 07](evidence/07-kich-ban-trang-30.png)) và không bao giờ tự sửa.

### Đã sửa thế nào

1. **`GET /api/books/{bookId}/content`** (mới, catalog): trả toàn văn cả cuốn trong một lần gọi. `GET /api/books/{bookId}` cố ý cắt toàn văn nên client không thể tự tính tổng số trang.
2. **Đánh số trang liên tục trên cả cuốn**: mỗi chương vẫn bắt đầu ở trang mới, nhưng số trang chạy suốt sách. Trung bình 45 trang/sách, nhiều nhất 68 — Trang 30 luôn tới được. Thêm ô "nhảy tới trang" để không phải lật tay 30 lần.
3. **Tự chữa vị trí quá hạn**: nếu trang đã lưu vượt số trang hiện có, giao diện kéo về trang cuối, nói đúng sự thật và `PUT` lại để Redis thôi giữ số sai.
4. **Seed sinh vị trí từ chính thuật toán chia trang**: `scripts/seed/seed_redis.py` nay port `splitLong`/`paginateChapter` của `ReadingPage.jsx` sang Python, nên `(chapter, page, line)` luôn trỏ vị trí có thật.

### Kết quả duyệt

| Bước | Kết quả | Ảnh |
|---|---|---|
| Mở sách | `Chương 1 … Trang 1 / 68` | [11](evidence/11-mo-sach-phan-trang-ca-cuon.png) |
| Đọc tới trang 30 | `Chương 5 … Trang 30 / 68` | [12](evidence/12-trang-30-truoc-khi-dong.png) |
| Đóng tab rồi mở lại | `Tiếp tục từ trang 30.` + `Chương 5 … Trang 30 / 68` | [13](evidence/13-mo-lai-dung-trang-30.png) |

### Hai lỗi lộ ra trong lúc duyệt, đã sửa luôn

**Ghi đè vị trí do `PUT` chạy song song.** Lật trang nhanh sinh nhiều `PUT /api/progress` cùng lúc và chúng không về đích theo thứ tự gửi, nên vị trí cũ ghi đè vị trí mới: giao diện báo "Đã lưu trang 30" trong khi Redis vẫn giữ `page 2`. Nay mỗi lúc chỉ cho một `PUT` chạy, vị trí tới trong lúc đang gửi thì xếp hàng và chỉ giữ cái mới nhất. Sau khi sửa: lật nhanh 5 trang rồi nhảy tới 30 → Redis đúng `page 30` ([log](evidence/i04-log.json)).

**Khôi phục dòng 0 vẫn cuộn xuống 497px**, đẩy tiêu đề sách ra khỏi màn hình. Nay dòng đầu trang thì giữ nguyên đầu trang.

## 5. Yêu cầu "lưu vị trí trang/dòng"

Barem mục 3 đòi *"Lưu vị trí trang/dòng đọc dở"*. Trước đây giao diện gửi cứng `line: 0` ở cả hai chỗ, nên phần "dòng" chỉ có trong schema chứ không có thật.

Thoạt đầu tôi tính "dòng" theo chỉ số đoạn văn, nhưng phép đo cho thấy cách đó vô dụng: ở khung 1013px, trang chỉ cao 1510px nên đoạn đầu luôn còn trong màn hình và chỉ số luôn bằng 0. Nay "dòng" là **số dòng văn bản đã trôi qua mép trên vùng đọc**, quy đổi theo `line-height` đang hiển thị — đúng nghĩa "dòng" và luôn đo được.

Duyệt trên khung 1280×600 (laptop nhỏ, trang cao 1510px, mỗi dòng 32px):

```
cuộn xuống cuối trang  -> Redis: page 30  chapter 5  line 14
mở lại                 -> "Tiếp tục từ trang 30, dòng 15."
                          cần 448px từ đầu vùng văn bản, thực tế 444px — lệch 4px (< 1 dòng)
```

Ảnh [16](evidence/16-dong-khac-0.png) và [17](evidence/17-khoi-phuc-dung-dong.png). Trên màn hình lớn mà cả trang lọt trong khung thì `line` bằng 0 — đó là đúng, không có dòng nào trôi qua.

## 6. Chạy lại I02 trên E-Reader mới

Đổi cách chia trang có thể làm hỏng việc đếm lượt đọc, nên I02 được chạy lại: mở lần lượt chương 2→10, 10 request `POST /read` đều 200, sách leo từ hạng 4 lên hạng 1 (`▲ 3 hạng`), ba sách còn lại lùi một hạng. Ảnh [18](evidence/18-bxh-truoc.png), [19](evidence/19-bxh-sau.png).

## 7. Kiểm thử backend sau lượt sửa

**56 test, 0 lỗi.** Hai test review alias ID phải chạy riêng từng method trên một Redis DB rỗng (bản thân test báo *"Use a fresh dedicated Redis instance"*), đã chạy tách và cùng đạt. Mỗi lượt dùng một database Mongo mới và Redis DB rỗng; không `FLUSHDB`, không xóa volume.

## 8. Phụ lục: lỗi đã nêu ở lượt duyệt đầu

> Giữ lại làm lịch sử. Lỗi này **đã sửa** ở mục 4; phần bên dưới là nguyên văn lúc mới phát hiện.

Giao diện chia trang ở phía client, 1.600 ký tự một trang (`PAGE_CHARS` trong `ReadingPage.jsx`). Chương dài nhất trong toàn bộ kho là 10.699 ký tự, tức **tối đa 7 trang**. Nhưng dữ liệu seed đang có số trang tới 40: **47 trên 60 bản ghi tiến trình trong Redis DB0 (78%) trỏ tới một trang không thể tồn tại.**

Hậu quả quan sát được trên trình duyệt ([07](evidence/07-kich-ban-trang-30.png)): đặt Hash về `page 30` rồi mở sách, thanh thông báo nói `Tiếp tục từ chương 2, trang 30.` trong khi vùng đọc hiển thị `Trang 8 / 8`. Giao diện tự kẹp số trang khi hiển thị (`Math.min(pos.page, totalPages)`) nhưng **không sửa lại `pos` cũng không ghi lại Redis**, nên `useSaveOnExit` coi "2:30" là đã lưu và sai số này tồn tại vĩnh viễn.

Ảnh hưởng trực tiếp tới kịch bản demo: `docs/DEMO_SCRIPT.md` và tiêu chí I01 đều viết "đọc đến trang 30", mà người đọc không bao giờ tới được trang 30 với dữ liệu và cách phân trang hiện tại. Nếu demo mở một tài khoản seed, màn hình sẽ tự mâu thuẫn trước mặt hội đồng.

Cả hai hướng xử lý nêu lúc đó đều đã thực hiện ở mục 4: sửa seed để vị trí bám nội dung thật, và cho `ReadingPage` tự kéo vị trí quá hạn về trang hợp lệ rồi ghi lại. Riêng dữ liệu đang có trong Redis DB0 thì **chưa nạp lại** — cần chạy `python seed_redis.py --reset`, là thao tác ghi đè dữ liệu nên chờ người dùng duyệt.
