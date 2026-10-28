# Kịch bản demo sống

**Chuẩn bị trước:** `docker compose up -d`, nạp dummy data, mở sẵn Compass, Redis Insight, web E-Reader.

Backend chạy ngoài Docker nên **không tự đọc `.env`**: nếu Compose đổi cổng/credentials thì đặt `MONGO_URI`, `REDIS_URL` trong tiến trình backend trước khi chạy. Hợp đồng API hiện hành ở [SHARED.md](SHARED.md).

## Kịch bản 1 – Lưu tiến trình đọc (Redis Hashes)
1. **Vũ** đăng nhập, đọc 1 cuốn sách đến **Trang 30**, rồi **đóng trình duyệt**.
2. Mở lại trình duyệt, **đăng nhập đúng tài khoản của Vũ** rồi chọn lại sách đó → hệ thống **tự mở Trang 30** kèm dòng "Tiếp tục từ trang 30, dòng …" (đọc từ Redis Hash).

> **Trang được đánh số liên tục trên cả cuốn sách**, không phải trong từng chương: trung bình mỗi sách 45 trang, nên Trang 30 luôn tới được. Có ô "nhảy tới trang" cạnh ô chọn chương nếu không muốn lật tay 30 lần. Bằng chứng duyệt mốc này trên Chrome thật: [docs/vu/UI_EVIDENCE.md](vu/UI_EVIDENCE.md).
3. (Tùy chọn) Sơn mở Redis Insight cho thấy key `progress:{userId}:{bookId}`.

> Tiến trình lưu theo từng tài khoản (`progress:{userId}:{bookId}`) và API chỉ cho chính chủ hoặc admin đọc. Nếu bước 2 đăng nhập bằng tài khoản khác thì nhận 404 và sách mở lại từ trang 1 — đó là đúng thiết kế, không phải lỗi. Sơn thao tác máy thì dùng phiên của Vũ.

## Kịch bản 2 – Bảng xếp hạng (Redis ZSET)
1. **Sơn** mở Redis Insight, mở key `ranking:books`, ghi nhận điểm hiện tại.
2. **Đạt** đọc liên tục một cuốn sách, **mở lần lượt các chương khác nhau** (chương 1 → 2 → 3…).
3. Sơn refresh Insight → điểm tăng, BXH **nhảy vị trí**; tab Sách thịnh hành tự cập nhật mỗi 10 giây (hoặc bấm "Tải lại").

> Mỗi lượt chỉ tính **một điểm cho mỗi tài khoản / sách / chương trong 60 giây** (khóa `read-lock:{userId}:{bookId}:{chapterNo}`). Mở lại đúng chương vừa đọc sẽ **không** tăng điểm: muốn điểm tăng thì sang chương khác, đổi tài khoản, hoặc chờ quá 60 giây. Đây là chống lặp đã chốt ngày 26/10/2026, không phải lỗi.

## Phân vai
| Vai | Người |
|---|---|
| Điều phối + thao tác công cụ | Sơn |
| Đọc đến Trang 30 | Vũ |
| Đọc liên tục cho ZSET | Đạt |

## Dự phòng
- Chuẩn bị sẵn tài khoản + sách cố định cho demo.
- Quay video demo dự phòng.
- Kiểm tra lại bằng `docker compose ps` trước giờ bảo vệ.
