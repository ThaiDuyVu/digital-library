# Cơ chế mở lại đúng trang đang đọc

Tài liệu giải thích phần được chấm trong [YC_PJ.md](YC_PJ.md): *"SV1 đọc sách đến Trang 30 … SV3 mở lại → tự động cuộn đến đúng Trang 30"*.

Ý tưởng gồm hai nửa: **ghi** vị trí vào Redis mỗi khi người đọc di chuyển, và **đọc** lại vị trí đó khi mở sách lần sau. Không có gì lưu trong trình duyệt, nên mở ở máy khác hay trình duyệt khác vẫn ra đúng trang.

## 1. Vị trí được lưu ở đâu

Một Hash trong Redis cho mỗi cặp người đọc – cuốn sách:

```
HGETALL progress:{userId}:{bookId}
  chapter    5                       ← số chương, suy ra từ trang
  page       30                      ← số trang, đánh liên tục trên CẢ CUỐN
  line       14                      ← số dòng đã trôi qua mép trên
  updatedAt  2026-10-28T09:12:33Z
```

Hai điểm quyết định:

- **`page` đánh số trên cả cuốn sách, không phải trong từng chương.** Một chương chỉ dài khoảng 7 trang, nên nếu đánh số theo chương thì không bao giờ có "Trang 30". Tính liên tục cả cuốn thì mỗi sách khoảng 28–68 trang, mốc Trang 30 nằm ở giữa sách. Mỗi chương vẫn bắt đầu ở một trang mới.
- **Khóa Redis không chứa số trang.** Mỗi người đọc chỉ có một vị trí cho mỗi cuốn, lần ghi sau đè lên lần trước. Đó cũng là lý do dùng Redis: giá trị bị ghi đè liên tục, chỉ bản mới nhất có ý nghĩa.

## 2. Sơ đồ luồng

### Lần 1 — đang đọc, ghi vị trí

```
Người đọc bấm "Trang sau" / gõ số vào ô nhảy trang
        │
        ▼
go(nextPage)                                 ReadingPage.jsx:267
  ├─ setPos({ page, line: 0 })                 ← đổi trạng thái giao diện
  └─ save(nextPage, 0, chapterNo)            ReadingPage.jsx:198
        │   (xếp hàng: mỗi lúc chỉ một PUT, chỉ giữ vị trí mới nhất)
        ▼
PUT /api/progress/{userId}/{bookId}   body { chapter, page, line }
        │
        ▼
AuthInterceptor.preHandle                    AuthInterceptor.java:29
  └─ GET session:{sha256(token)} → userId      ← biết người gọi là ai
        │
        ▼
ProgressController.save                      ProgressController.java:29
        ▼
ProgressService.save                         ProgressService.java:36
  ├─ chuẩn hóa userId/bookId
  ├─ requireAccess       → chỉ chủ tiến trình hoặc admin
  └─ books.getChapter    → chương phải có thật trong MongoDB
        ▼
ProgressRepository.save                      ProgressRepository.java:24
  └─ HSET progress:{userId}:{bookId}  chapter page line updatedAt
        │
        ▼
Giao diện hiện "Đã lưu trang 30, dòng 15 vào Redis."
```

Khi người đọc **cuộn** trong trang, hiệu ứng ở [ReadingPage.jsx:253](../frontend/src/features/reading/ReadingPage.jsx#L253) quy đổi khoảng đã cuộn ra số dòng rồi cập nhật `pos.line`.

Khi người đọc **đóng tab**, [useSaveOnExit.js](../frontend/src/features/reading/useSaveOnExit.js) bắt sự kiện `pagehide` / `visibilitychange` và gửi nốt vị trí cuối bằng `fetch({ keepalive: true })`, để trình duyệt vẫn hoàn tất request khi trang đang đóng.

### Lần 2 — mở lại, khôi phục vị trí

```
Chọn sách trong ô "Chọn sách để đọc…"
        │
        ▼
useEffect [bookId, userId]                   ReadingPage.jsx:140
  └─ gọi SONG SONG hai API:
        ├─ GET /api/books/{bookId}/content   → toàn văn cả cuốn
        └─ GET /api/progress/{userId}/{bookId}
                 │
                 ▼
           ProgressService.get               ProgressService.java:47
                 ▼
           ProgressRepository.find           ProgressRepository.java:33
             └─ HGETALL progress:{userId}:{bookId}
                 │  (chưa đọc bao giờ → 404 → bắt lại, coi như trang 1)
                 ▼
        ┌────────┴─────────┐
        ▼                  ▼
paginateBook(chapters)   saved = { chapter, page: 30, line: 14 }
ReadingPage.jsx:76
  → mảng trang cả cuốn
        │
        ▼
start = min(max(saved.page, 1), totalPages)   ← kẹp vào khoảng trang có thật
setPos({ page: start, line })
pendingLine.current = line                    ← hẹn cuộn sau khi render
resumeNote = "Tiếp tục từ trang 30, dòng 15."
        │
        ▼
React render trang 30
        │
        ▼
useEffect [currentPage]                      ReadingPage.jsx:238
  └─ requestAnimationFrame(...)                ← đợi trình duyệt dựng xong layout
       └─ window.scrollTo(đầu vùng đọc + line × chiều cao dòng − 160px)
        │
        ▼
Màn hình dừng đúng dòng đang đọc dở
```

`chapterNo` **không** lấy từ Redis mà suy ra từ số trang ([ReadingPage.jsx:122](../frontend/src/features/reading/ReadingPage.jsx#L122)). Trang là nguồn sự thật duy nhất, nên không có cảnh trang và chương lệch nhau.

## 3. Hàm xử lý và file

| Việc | Hàm | File |
|---|---|---|
| Chia trang liên tục cả cuốn | `paginateBook` | [ReadingPage.jsx:76](../frontend/src/features/reading/ReadingPage.jsx#L76) |
| Chia một chương thành trang | `paginateChapter` | [ReadingPage.jsx:34](../frontend/src/features/reading/ReadingPage.jsx#L34) |
| **Tải sách + đọc vị trí đã lưu** | `useEffect [bookId, userId]` | [ReadingPage.jsx:140](../frontend/src/features/reading/ReadingPage.jsx#L140) |
| **Cuộn tới đúng dòng sau khi render** | `useEffect [currentPage]` | [ReadingPage.jsx:238](../frontend/src/features/reading/ReadingPage.jsx#L238) |
| Theo dõi dòng khi cuộn | `useEffect [currentPage]` | [ReadingPage.jsx:253](../frontend/src/features/reading/ReadingPage.jsx#L253) |
| Gửi vị trí lên Redis, có xếp hàng | `save` | [ReadingPage.jsx:198](../frontend/src/features/reading/ReadingPage.jsx#L198) |
| Chuyển trang | `go` | [ReadingPage.jsx:267](../frontend/src/features/reading/ReadingPage.jsx#L267) |
| Lưu khi đóng tab | `flush` | [useSaveOnExit.js:34](../frontend/src/features/reading/useSaveOnExit.js#L34) |
| API ghi / đọc vị trí | `save`, `get` | [ProgressController.java:29](../backend/src/main/java/vn/edu/huit/digitallibrary/reading/controller/ProgressController.java#L29) |
| Kiểm tra quyền và chương có thật | `save`, `get` | [ProgressService.java:36](../backend/src/main/java/vn/edu/huit/digitallibrary/reading/service/ProgressService.java#L36) |
| **Lệnh Redis `HSET` / `HGETALL`** | `save`, `find` | [ProgressRepository.java:24](../backend/src/main/java/vn/edu/huit/digitallibrary/reading/repository/ProgressRepository.java#L24) |
| Xác định người gọi từ token | `preHandle` | [AuthInterceptor.java:29](../backend/src/main/java/vn/edu/huit/digitallibrary/identity/auth/AuthInterceptor.java#L29) |
| Toàn văn cả cuốn cho E-Reader | `content` | [BookService.java](../backend/src/main/java/vn/edu/huit/digitallibrary/catalog/service/BookService.java) |

## 4. Bốn tình huống đã xử lý

**Lật trang nhanh làm mất vị trí.** Mỗi lần lật sinh một `PUT`; các request không về đích theo thứ tự gửi, nên vị trí cũ có thể ghi đè vị trí mới trong Redis. Đã gặp thật: giao diện báo đã lưu trang 30 nhưng Redis giữ trang 2. Cách chữa là trong [`save`](../frontend/src/features/reading/ReadingPage.jsx#L198) chỉ cho **một** `PUT` chạy mỗi lúc; vị trí đến trong lúc đang gửi thì xếp hàng và chỉ giữ cái mới nhất.

**Ghi cả 4 trường trong một lệnh.** [`ProgressRepository.save`](../backend/src/main/java/vn/edu/huit/digitallibrary/reading/repository/ProgressRepository.java#L24) dùng một `HSET` cho `chapter`, `page`, `line`, `updatedAt`. Không có khoảnh khắc nào trang đã đổi mà chương còn cũ.

**Sách bị sửa ngắn lại.** Vị trí đã lưu có thể vượt số trang hiện có. Lúc tải, số trang được kẹp về trang cuối; hiệu ứng ở [ReadingPage.jsx:221](../frontend/src/features/reading/ReadingPage.jsx#L221) ghi ngay vị trí đã kẹp lên Redis để lần sau không lặp lại, và giao diện báo cho người đọc biết.

**Đóng tab giữa chừng.** `fetch({ keepalive: true })` được dùng thay `navigator.sendBeacon`, vì `sendBeacon` chỉ gửi `POST` và không gắn được header `Authorization`.

## 5. Tự kiểm chứng

```bash
# 1. Đăng nhập, mở một sách, gõ 30 vào ô nhảy trang, chờ dòng "Đã lưu"
# 2. Xem Redis:
docker exec dl_redis redis-cli -n 0 --scan --pattern 'progress:*'
docker exec dl_redis redis-cli -n 0 HGETALL progress:{userId}:{bookId}
#    → page = 30
# 3. Đóng hẳn trình duyệt, mở lại, đăng nhập cùng tài khoản, chọn lại sách
#    → hiện "Tiếp tục từ trang 30" và dừng đúng dòng cũ
```

Bằng chứng chạy trên Chrome thật, kèm ảnh chụp và log: [vu/UI_EVIDENCE.md](vu/UI_EVIDENCE.md).
