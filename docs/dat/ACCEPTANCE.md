# Tiêu chí nghiệm thu phần Đạt

> Kết quả mới nhất 26/10/2026: [GIAI_THICH_PHAN_DAT.md](GIAI_THICH_PHAN_DAT.md). Giữ nguyên tiêu chí I01/I03; không dùng hai lượt tự động để khẳng định tổng duyệt nhóm hoặc bảo đảm request đang gửi lúc đóng browser. Các nhận định hiện trạng 22/10 bên dưới là lịch sử.

Đây là tiêu chí kiểm chứng; kết quả chạy ngày 22/10/2026 ở [RESULTS.md](RESULTS.md) và PROGRESS.md. Kết quả hiện tại: [ACCEPTANCE_RESULTS.md](ACCEPTANCE_RESULTS.md), 14 Đạt/0 Chưa đạt/4 Bị chặn sau sửa F01/F02 và regression Mongo/Redis thật; xem [chuẩn hóa ID và migration còn chờ](ID_NORMALIZATION.md). R05 và I01–I03 vẫn Bị chặn; dữ liệu alias cũ chưa migration, manifest Sơn/UI/tổng duyệt chưa hoàn thành. Nguồn chính: `members/DAT.md`, `docs/SHARED.md`, `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/DEMO_SCRIPT.md`. Các chính sách chưa chốt xem DECISIONS; không tự chọn kỳ vọng rồi đánh dấu đạt.

Điều kiện test: backend đúng commit, MongoDB/Redis đúng môi trường demo, user A/B và admin thật, token lấy qua login, ít nhất hai sách có chương hợp lệ. Ghi ID thật và trạng thái trước/sau; không lưu token/mật khẩu vào bằng chứng. Tách dữ liệu seed/benchmark khỏi dữ liệu thủ công đang dùng.

| ID | Thao tác và tiêu chí | Bằng chứng cần lưu | Nguồn |
|---|---|---|---|
| P01 | A PUT vị trí chapter=3,page=30,line=0 vào sách có chương 3, rồi GET: đúng vị trí và updatedAt UTC; Hash đúng tên và đủ 4 field | HTTP status/body đã chốt, HGETALL, TTL=-1 | DAT A; SHARED 2–4 |
| P02 | PUT vị trí mới rồi GET: ghi đè đúng cùng cặp user/sách, không tạo bản sao; cặp khác không đổi | Hai lần HTTP + Hash trước/sau | DAT DoD; Hash schema |
| P03 | Thiếu/sai token: 401; A truy cập tiến trình B: 403; chính chủ/admin truy cập được theo canAccess; request bị từ chối không ghi Redis | HTTP + so sánh key trước/sau; test auth không chỉ mock service | SHARED 3 |
| P04 | chapter/page <1, line <0, trường thiếu/null, kiểu sai, JSON hỏng bị từ chối; không ghi dữ liệu sai | 400 `{code,message}` + Redis không đổi | SHARED 2,4; ràng buộc DTO cần hiện thực |
| P05 | Ghi với bookId sai định dạng/không tồn tại: 404 NOT_FOUND, không tạo key; kiểm tra sách qua service công khai | HTTP + key không xuất hiện | SHARED 3–4 |
| P06 | GET tiến trình chưa có: kết quả đúng D01 đã chốt; kiểm tra các trường hợp chương không tồn tại, userId không hợp lệ theo D05 | HTTP + key; ghi rõ quyết định áp dụng | Khoảng trống hợp đồng, không tự suy diễn |
| R01 | POST read sách thật: từ score s sang s+1 mỗi sự kiện mở chương theo D03; Redis dùng ZINCRBY | HTTP theo D02 + ZSCORE trước/sau | DAT B; SHARED 2,4 |
| R02 | Gửi k request hợp lệ đồng thời cho một sách: tổng điểm tăng k theo chính sách đã chốt, không mất cập nhật | Số request/thành công/lỗi, score trước/sau | Kiểm chứng tính tăng nguyên tử của ZINCRBY |
| R03 | GET ranking mặc định top=10: mảng bookId/score theo score giảm dần, tối đa 10; top=N hợp lệ trả tối đa N; ít sách/rỗng không phát sinh dữ liệu giả | HTTP và ZREVRANGE WITHSCORES đối chiếu | DAT B; SHARED 4 |
| R04 | top=0, âm, quá giới hạn, không nguyên, trường hợp hòa điểm: đúng D04 đã chốt; không coi thứ tự hòa điểm là thứ tự nghiệp vụ riêng khi chưa có yêu cầu | HTTP + policy, ZSET mẫu có hòa điểm | Khoảng trống hợp đồng |
| R05 | POST bookId không tồn tại/sai: 404, ZSET không đổi. Kiểm tra quyền POST/GET theo D03. Sách đã xóa được UI ghép qua batch bỏ qua; cleanup nếu có phải đúng D06 | HTTP + ZSET; batch response | SHARED 3–4; ARCHITECTURE 3.3 |
| S01 | Có ≥50 Hash progress hợp lệ và 1 ZSET ranking:books đúng 50 member; mọi bookId thuộc Mongo thật; user/chapter đối chiếu dữ liệu seed | Manifest ID, SCAN và TYPE/HLEN/HGETALL, ZCARD/ZSCORE, đối chiếu Mongo | DAT Phase 1; SON seed |
| S02 | Seed có lệnh chạy và chính sách chạy lại; không cộng dồn điểm ngoài ý muốn hoặc xóa session/dữ liệu không thuộc bộ seed | Hai lần chạy, số lượng/điểm trước/sau, phạm vi key bị đổi | Kế hoạch phối hợp seed, bảo vệ dữ liệu dùng chung |
| S03 | Tái hiện lệnh Hash/ZSET trong Redis Insight; phân biệt session của Vũ với progress/ranking của Đạt | Lệnh và ảnh có key/giá trị, không có token thật | DAT Phase 1; ARCHITECTURE 3 |
| B01 | Redis vs Mongo đọc cùng dữ liệu progress tương đương; ghi máy/phiên bản/cấu hình, dataset, warmup, số lần, concurrency, cách tính; raw samples và summary median/p95/mean, lỗi | Script/lệnh tái lập, CSV/JSON raw, bảng số liệu thật | DAT C; PLAN Phase 2; số lần 1000 chỉ là ví dụ |
| I01 | Vũ đọc trang 30, đóng/mở trình duyệt cùng tài khoản, Sơn khôi phục đúng trang; xác minh request lưu không mất khi đóng tab | Video/ảnh + request + Hash; backend test riêng không đủ | DAT DoD; SON C; DEMO 1 |
| I02 | Đạt mở nhiều chương, score tăng và thứ hạng thay đổi trên Insight và web của Sơn | Score/thứ tự trước/sau + UI | DAT D; DEMO 2 |
| I03 | Tổng duyệt ≥2 lần, tài khoản/sách cố định, đủ bằng chứng; báo cáo Vũ nhận số liệu đo | Hai log demo, hướng dẫn chạy và bảng đo | SON E; PLAN; VU Phase 2 |

Mỗi kết quả ghi: ID, commit, thời gian, môi trường, dữ liệu, lệnh, expected/actual, đường dẫn bằng chứng và trạng thái. **Đạt** khi đúng kỳ vọng có nguồn; **Chưa đạt** khi chạy và sai; **Bị chặn** khi thiếu điều kiện hoặc quyết định; **Chưa thực hiện** khi chưa chạy. Không lấy build, số lượng test hoặc checkbox thay nghiệm thu chức năng.

Không có SLA độ trễ bắt buộc trong nguồn; câu “<1ms” ở phần giải trình không phải ngưỡng nghiệm thu ứng dụng. Không yêu cầu danh sách sách đang đọc hoặc chống spam nếu chưa được chọn.

## Regression ID bắt buộc sau review F01/F02

- P02: PUT bằng bookId hoa rồi GET chuẩn phải trả vị trí mới nhất của cùng cặp, chỉ có key chuẩn. P03 bổ sung chính chủ/admin dùng userId hoa, người khác vẫn403; ID không hợp lệ vẫn theo thứ tự401/403/404 cũ.
- R01: hai request cùng sách hoa/thường → một member chuẩn, score tăng2; response POST/GET bookId chuẩn và batch ghép metadata được. Không dùng batch gọi trực tiếp với alias chưa chuẩn để kết luận phần Đạt đã sai sau sửa.
- Đọc/kiểm kê dữ liệu cũ không đồng nghĩa được migration. Không tự cộng score, chọn Hash mới nhất hoặc xóa alias; đề xuất quy tắc trong ID_NORMALIZATION trước mọi thay đổi dữ liệu cũ.
- Đồng bộ checkbox members/DAT.md cùng PROGRESS; nhiệm vụ có phần phối hợp chưa đủ điều kiện giữ [ ], kể cả API/fixture riêng đã đạt. Không đổi phân công gốc.
