# Đề xuất bổ sung sách

Tính năng ngoài lề, bổ sung độc lập với yêu cầu chính của đồ án.

## Sử dụng

- Độc giả đăng nhập → **Đề xuất sách** → nhập tên sách, tác giả và mô tả mong muốn → **Gửi đề xuất**.
- Mỗi tài khoản có **1 lượt gửi tổng cộng**, không tự hồi lượt theo ngày hay sau khi admin phản hồi. Không sửa/xóa đề xuất đã gửi.
- Nội dung đề xuất tối đa 1.000 ký tự, không chấp nhận nội dung trống hoặc chỉ có khoảng trắng.
- Admin đăng nhập → **Quản lý đề xuất** → lọc Tất cả / Chờ phản hồi / Đã phản hồi → **Phản hồi**. Có thể sửa phản hồi đã gửi; phản hồi tối đa 2.000 ký tự.
- Độc giả xem lời hồi âm ngay trong **Đề xuất sách**. Trang tự kiểm tra mỗi 30 giây khi đang hiển thị, khi quay lại cửa sổ, hoặc qua nút **Làm mới**.
- **Nạp VIP để tăng số lượng đề xuất** là nút giới thiệu vui vẻ: bấm mở thông báo “sắp ra mắt”. Chưa có thanh toán, gói VIP hoặc tăng hạn mức.

## API và dữ liệu

Tất cả API dùng phiên Bearer hiện có. Máy chủ lấy chủ tài khoản từ phiên đăng nhập, không nhận `userId` từ form.

| API | Quyền | Kết quả |
|---|---|---|
| `GET /api/suggestions/mine` | Đăng nhập | `{ limit: 1, suggestion: null hoặc đề xuất của tài khoản }` |
| `POST /api/suggestions` | Đăng nhập | Body `{ description }`; 201 khi tạo, 409 nếu đã gửi |
| `GET /api/admin/suggestions?page=0&size=10&status=all` | Admin | Phân trang theo `PageResponse`, mới nhất trước; `status`: `all`, `pending`, `replied` |
| `PUT /api/admin/suggestions/{id}/reply` | Admin | Body `{ reply }`; lưu/cập nhật phản hồi; 404 nếu không có đề xuất |

MongoDB lưu collection `book_suggestions`; `_id` chính là ObjectId của tài khoản. Khóa `_id` duy nhất và thao tác `insert` bảo đảm chỉ có một đề xuất/tài khoản, kể cả nhiều request đồng thời; không dùng kiểm tra số lượng rồi ghi. Phản hồi cập nhật trực tiếp các trường `reply`, `repliedAt`, `repliedBy`, giữ nguyên nội dung và thời điểm đề xuất ban đầu. Khởi động backend tự tạo JSON Schema validator và index sắp xếp, không cần migration thủ công.

## Kiểm chứng

- `cd frontend && npm run lint && npm run build`: đạt; lint còn các cảnh báo có sẵn trong các trang catalog/reading.
- `cd backend && ./mvnw test -Dtest=SuggestionServiceTest,SuggestionControllerTest`: 18 bài kiểm tra mới đạt, gồm đăng nhập, quyền admin, chống giả mạo chủ tài khoản, validate nội dung, giới hạn một lượt và cập nhật phản hồi.
- Toàn bộ `./mvnw test` với MongoDB kiểm thử riêng: 68 bài đạt, 6 bài tích hợp opt-in được bỏ qua theo cấu hình.
- Kiểm tra HTTP với MongoDB thật trong database riêng: 8 request gửi đồng thời → đúng 1 phản hồi 201 và 7 phản hồi 409; người dùng khác không xem được đề xuất; admin trả lời, người gửi đọc được phản hồi; gửi lại sau phản hồi vẫn bị chặn.
- Đã kiểm tra trên Chrome: đăng nhập độc giả → gửi đề xuất → đăng nhập admin → lọc và phản hồi → độc giả đăng nhập lại và nhận đúng phản hồi. Kiểm tra chiều rộng 390px: không có phần nội dung tràn ngang. Ảnh kiểm chứng cục bộ trong `output/suggestions/`.

Để dùng tính năng sau khi cập nhật mã, khởi động lại backend. Frontend Vite sẽ tự cập nhật hoặc có thể tải lại trang.
