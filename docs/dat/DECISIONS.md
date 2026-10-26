# Quyết định và điểm cần chốt

## Quyết định 26/10/2026

Người dùng chọn triển khai cả hai mục tùy chọn và thời gian chống lặp **60 giây**. GET `/api/progress/{userId}` cần Bearer/chính chủ/admin; trả các vị trí đã lưu mới nhất trước, bỏ sách đã mất. POST `/api/books/{bookId}/read?chapterNo=N` cần Bearer, chương hợp lệ; cùng user/sách/chương trong 60 giây chỉ tăng một lần, request lặp trả 200 với điểm hiện tại. Quyết định này thay D03 cũ đếm từng request; các đoạn lịch sử dưới đây giữ nguyên để đối chiếu.

Shared API và ReadingPage phải truyền `chapterNo`; thay đổi này đã ghi tại `docs/SHARED.md`. Dữ liệu/key cũ không reset hoặc migration. Kiểm thử dùng một Redis Compose và DB logic rỗng, không tạo container. PR nhắm `main` theo yêu cầu người dùng vì `develop` chậm 19 commit. Xem [giải thích và kết quả](GIAI_THICH_PHAN_DAT.md).

## Đã có nguồn xác nhận

| Nội dung | Căn cứ |
|---|---|
| Đạt làm reading/ranking; seed và đo phối hợp Sơn | members/DAT.md; docs/SHARED.md mục 1 |
| Key/field/chỉ số bắt đầu/UTC/không TTL demo | docs/SHARED.md mục 2; ARCHITECTURE mục 3 |
| Progress cần login, chính chủ hoặc admin; kiểm tra sách trước ghi | SHARED mục 3; CurrentUser.canAccess và BookService.exists có thật trong code |
| API ranking trả bookId/score; Sơn ghép metadata, không lưu document sách vào Redis | SHARED mục 1,4 |
| Không đồng bộ ngược progress/ranking về Mongo trong demo, Redis bật AOF | ARCHITECTURE 3.3; docker-compose.yml |
| Danh sách progress theo user và chống lặp là tùy chọn | members/DAT.md |
| Hiện tại chỉ chuẩn bị hồ sơ; không reset usage | Yêu cầu người dùng 22/10/2026 |

## Khoảng trống khi lập hồ sơ — quyết định hiện tại ở cuối file

| ID | Điểm còn thiếu | Ảnh hưởng / hướng đề xuất để nhóm xem |
|---|---|---|
| D01 | GET chưa có progress trả 404, 204 hay vị trí mặc định? Response GET/PUT có những field nào, status nào? | Sơn cần xử lý mở sách lần đầu; đề xuất 404 rõ ràng, UI tự chọn trang đầu, nhưng chưa áp dụng |
| D02 | POST read trả score hay không body, status nào? | Chốt ví dụ thật cùng response progress trước khi Sơn tích hợp |
| D03 | POST read có cần login? GET ranking công khai? “Một lần mở chương” tính thế nào khi reload/retry? | Endpoint hiện không nhận chapter; nếu chọn chống lặp theo chương cần đổi hợp đồng. Chưa thêm TTL/dedupe hay khóa tùy chọn |
| D04 | top có min/max nào, ngoài biên trả 400 hay clamp? Hòa điểm có cần thứ tự riêng? | Mặc định 10 đã có nguồn; max=100 của catalog không tự áp sang ranking. Đề xuất biên hữu hạn do nhóm chốt |
| D05 | Có xác minh chương tồn tại khi lưu? Giới hạn page/line theo cách phân trang frontend? Xử lý userId sai/không tồn tại khi admin truy cập? | Nguồn chỉ chốt min và quyền. Không tự tạo số trang tối đa hoặc quy tắc user mới |
| D06 | Ai cleanup progress/ranking khi xóa sách/user? | ARCHITECTURE nói “nên ZREM”; chưa coi là scope bắt buộc của Đạt. Batch hiện bỏ qua sách mất, UI phải xử lý |
| D07 | Seed chạy lại reset score fixture hay bảo toàn lượt đọc? User/book/chapter manifest do ai cấp? | Sơn sở hữu scripts/seed; chốt phạm vi key trước viết/chạy, không đụng session của Vũ |
| D08 | Mongo baseline cho phép đo đặt ở đâu, số lần/warmup/concurrency? | Không có collection progress Mongo trong nghiệp vụ; chỉ fixture benchmark riêng phối hợp Sơn. Không thêm lưu kép vào API |
| D09 | develop đang thiếu nền main: cập nhật nhánh chung hay nền triển khai khác? | Cần giải quyết trước PR; chưa merge/push nhánh chung |

Các hướng đề xuất ở trên chưa phải quyết định nghiệp vụ. Khi chốt, ghi người xác nhận, ngày, lựa chọn, nguồn và cập nhật SHARED/ACCEPTANCE tương ứng. Các lựa chọn kỹ thuật nội bộ (tên lớp, tách service, dùng StringRedisTemplate có sẵn) có thể tự xử lý khi được giao triển khai.

## Lệch tài liệu / khả năng kiểm chứng

- backend/README còn “chỉ có health”, trong khi main có catalog/identity/controller/service; ưu tiên code hiện tại và SHARED, chưa sửa README thuộc tài liệu chung ở bước này.
- Các checkbox Vũ đã đánh dấu không được xem là kết quả kiểm thử tại máy này. Chưa chạy backend hoặc xác minh DB.
- pom khai báo Spring Boot 4.1.1 và java.version=17; chỉ ghi nhận cấu hình, chưa xác nhận dependency resolve/JDK thực tế. Không hạ/nâng framework khi chưa có lỗi được chẩn đoán.

## Triển khai được giao ngày 22/10/2026

Người dùng đã giao triển khai và xác nhận toàn bộ đề xuất D01–D05 trong chat:
- D01: GET chưa có → 404 NOT_FOUND; GET/PUT thành công → 200 `{chapter,page,line,updatedAt}`.
- D02: POST read → 200 `{bookId,score}`.
- D03: POST read và GET ranking công khai; mỗi request hợp lệ tăng 1, kể cả reload/retry; không dedupe trong phạm vi này.
- D04: top mặc định 10, cho phép 1–100; ngoài biên/không nguyên → 400; hòa điểm theo Redis (member giảm dần khi cùng score).
- D05: PUT xác minh chương qua BookService; chỉ kiểm tra min page/line, không đặt max trang tự suy đoán. Admin truy cập user khác phải xác minh tồn tại qua UserService; lỗi 404 theo service. Chính chủ được auth xác minh.
- D09: tiếp tục local trên nền main hiện tại; không đổi nhánh chung. Trước PR vào develop phải kiểm tra lại diff/nền; chưa tạo PR khi nền còn kéo theo phần Vũ.

D06–D08 chưa chốt: không tự cleanup dữ liệu mồ côi; chưa seed/benchmark khi chưa có manifest và chính sách phối hợp Sơn.

## Phạm vi bổ sung đã được người dùng giao

Ngày 22/10/2026, người dùng chọn phương án tạo fixture/benchmark riêng:
- D07: Mongo database và Redis namespace riêng; manifest ID/chương đối chiếu dữ liệu thực; chạy lại chỉ reset fixture script sở hữu, giữ dữ liệu hiện có.
- D08: cùng 50 vị trí tiến trình, warm-up 200/backend, đo 1000/backend, concurrency=1, đảo thứ tự từng cặp; lưu raw nanosecond + mean/median/p95 và môi trường. Đây là lựa chọn kỹ thuật phép đo có thể tái lập, không phải SLA.
- Cho phép script độc lập ở scripts/dat và công cụ test tương ứng. Khi có manifest Sơn, chỉ đọc nguồn Mongo của Sơn; ghi bản sao baseline vào database fixture và Hash/ZSET vào namespace fixture.
- UI và xác nhận dữ liệu Sơn vẫn ngoài phạm vi đã kiểm chứng; chưa gọi các mốc này hoàn thành tích hợp nhóm.

## Sửa ID và đồng bộ phân công

User đã giao chuẩn hóa ObjectId hợp lệ nhất quán cho đọc/ghi và trả bookId, giữ lỗi ID sai. Đây là sửa tính đồng nhất định danh, không thay D01–D08. Migration alias cũ chỉ là đề xuất trong ID_NORMALIZATION.md, chưa được duyệt/chạy. Theo yêu cầu bổ sung của user, AGENTS có quy tắc đồng bộ members/DAT.md sau kiểm chứng; giữ nguyên nhiệm vụ/owner gốc, chỉ thêm checkbox đúng bằng chứng và ghi chú giới hạn.
