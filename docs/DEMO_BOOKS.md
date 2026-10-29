# 5 sách demo – Sơn

Mục tiêu: thay nội dung ghép câu mẫu của 5 sách bằng văn bản do AI tạo sinh, có mạch truyện/mạch kiến thức liền lạc, để buổi demo trông như thư viện thật. Chỉ thay **nội dung**, không đổi `_id`, để Redis (tiến trình đọc, `ranking:books`) và kịch bản demo không bị ảnh hưởng.

Số liệu đo ngày 29/10/2026 trên dữ liệu đang chạy.

## Danh sách

| # | `_id` | Tên sách (giữ hoặc đặt lại) | Thể loại | Chương | Trang hiện tại | Hạng / điểm | Dùng để demo |
|---|---|---|---|---|---|---|---|
| 1 | `b00c00000000000000000016` | Bí mật của tờ giấy bị xé dở | Trinh thám | 8 | 49 | 40 / 13 | **Trang 30**: SV1 đọc đến Trang 30, SV3 mở lại tự về đúng Trang 30 |
| 2 | `b00c00000000000000000032` | Câu chuyện về chiếc hộp gỗ cũ | Văn học, Trinh thám | 8 | 48 | 4 / 109 | **BXH nhảy hạng**: đọc 3 chương khác nhau → vượt hạng 3 (111), 5 chương → vượt hạng 2 (113) |
| 3 | `b00c00000000000000000011` | Nhập môn hệ thống phân tán | Công nghệ, Trinh thám | 8 | 51 | 5 / 71 | Sách kiến thức, gần chủ đề môn NoSQL; demo tìm kiếm, xem chi tiết, mục lục |
| 4 | `b00c0000000000000000000b` | Giáo sư Đài và tín hiệu lạ từ vũ trụ | Khoa học viễn tưởng | 7 | 46 | 45 / 11 | Lọc theo thể loại, đọc chuyển chương |
| 5 | `b00c00000000000000000022` | Chú gấu Mật và chiếc cầu vồng nhỏ | Thiếu nhi, Khoa học viễn tưởng | 7 | 36 | 34 / 15 | Tìm không dấu (`gau mat`), sách ngắn cho người xem dễ theo |

Điểm BXH thay đổi mỗi khi nhóm đọc thử. Trước buổi demo, kiểm tra lại hạng của sách #2 và hai sách đứng trên nó.

## Bắt buộc

1. **Giữ nguyên `_id` và số chương** như bảng trên. `chapterNo` liên tục từ 1, kiểu số nguyên (int32).
2. **Độ dài**: mỗi chương có `content` 6.000–9.000 ký tự; riêng sách #1 tối thiểu 7.000 ký tự/chương. Sau khi viết lại, sách #1 phải còn **≥ 40 trang** để Trang 30 nằm giữa sách, không sát cuối.
3. **Định dạng đoạn**: các đoạn cách nhau bằng một dòng trống (`\n\n`), mỗi đoạn không quá 1.600 ký tự. E-Reader chia trang theo đoạn, mỗi trang khoảng 1.600 ký tự; đoạn dài hơn sẽ bị cắt giữa chừng.
4. **Mục lồng nhau**: mỗi chương có 2–4 `sections`, mỗi mục gồm `sectionNo` (int, từ 1), `heading`, `text`. Đây là phần "toàn văn lồng nhau" của barem.
5. **Đúng schema** [`books.schema.json`](../backend/src/main/resources/mongo/books.schema.json): `title`, `author`, `categories`, `chapters`, `createdAt` bắt buộc; `createdAt`/`updatedAt` là kiểu date.
6. **Nội dung**: tiếng Việt, tự sáng tác. Không chép hoặc diễn lại tác phẩm có bản quyền, không dùng tên người thật. Nhân vật, địa danh nhất quán xuyên suốt các chương. Sách #3 phải đúng kiến thức (CAP, sao chép, phân mảnh, đồng thuận…); nhờ Vũ hoặc Đạt soát trước khi nạp.
7. Báo cáo cần ghi rõ nội dung 5 sách này do AI tạo sinh và đã được nhóm biên tập.

## Cách nạp

- Lưu nội dung vào `scripts/seed/demo_books.json` (mảng 5 object theo đúng cấu trúc sách), kèm script `scripts/seed/seed_demo_books.py`.
- Script chỉ cập nhật đúng 5 `_id` trên (`update_one` với `$set` các trường `title`, `author`, `categories`, `description`, `chapters`, `updatedAt`). Giữ nguyên `createdAt`, `coverUrl`. Không xóa sách, không đụng sách khác.
- Có `--dry-run`: kiểm tra schema (dùng lại hàm `validate_all` của `seed_books.py`) và in số trang mỗi sách bằng `paginate_book` của `seed_redis.py`.
- Thứ tự chạy: `seed_books.py` → `seed_demo_books.py` → `seed_redis.py`. **Chạy lại `seed_books.py` sẽ ghi đè 5 sách về nội dung cũ**, nên luôn chạy `seed_demo_books.py` ngay sau nó.
- Trên máy Vũ, MongoDB Docker ở cổng 27018: đặt `MONGO_URI='mongodb://admin:admin123@localhost:27018/digital_library?authSource=admin'` trước khi chạy.
- Ghi dữ liệu thật chỉ sau khi nhóm đồng ý. Thử trước trên một database riêng (ví dụ `digital_library_demo`).

## Gợi ý câu lệnh cho AI (mỗi lần một chương)

```
Viết chương {n}/{tổng} của cuốn "{tên sách}" ({thể loại}), tiếng Việt, văn phong {phù hợp thể loại}.
Dàn ý cả cuốn: {dàn ý}. Tóm tắt các chương trước: {tóm tắt}.
Yêu cầu: 7.000–8.500 ký tự, 8–12 đoạn, mỗi đoạn dưới 1.500 ký tự, đoạn cách nhau một dòng trống.
Sau phần chính, thêm 2–4 mục ngắn có tiêu đề (ví dụ: "Ghi chép của thám tử", "Manh mối"), mỗi mục 2–4 câu.
Tự sáng tác hoàn toàn, không dùng tên người thật.
```

Nên viết dàn ý cả cuốn trước, rồi sinh từng chương kèm tóm tắt các chương trước, để mạch truyện liền lạc.

## Nghiệm thu

- [ ] `seed_demo_books.py --dry-run`: schema OK, sách #1 ≥ 40 trang, mỗi chương 6.000–9.000 ký tự
- [ ] Mở 5 sách trên E-Reader: không lỗi, chữ hiển thị đúng, chuyển chương/trang bình thường
- [ ] Sách #1: nhảy tới Trang 30, đóng tab, đăng nhập lại → mở đúng Trang 30
- [ ] Sách #2: đọc 3 chương khác nhau → tab Thịnh hành thấy sách lên hạng
- [ ] Tìm `gau mat` ra sách #5; lọc Khoa học viễn tưởng có sách #4
- [ ] Đếm lại: vẫn 50–100 sách, mỗi sách 5–10 chương
