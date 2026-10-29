# 📚 Hệ thống Thư viện số & Đọc sách trực tuyến (Polyglot Persistence)

> Đồ án môn **NoSQL** – Đề tài 15 | Nhóm 3 thành viên: **Vũ – Đạt – Sơn**
> CSDL: **MongoDB** (nội dung sách) + **Redis** (tiến trình đọc, bảng xếp hạng)

## 1. Giới thiệu
Cổng đọc sách điện tử trực tuyến cho phép:
- Quản lý kho sách phong phú (sách → chương → mục) trên MongoDB.
- Lưu **tiến trình đọc dở** của từng độc giả, mở lại tức thì (Redis Hashes).
- Hiển thị **bảng xếp hạng sách thịnh hành** theo lượt đọc (Redis Sorted Set).

## 2. Kiến trúc Polyglot Persistence
| Loại dữ liệu | CSDL | Lý do |
|---|---|---|
| Sách, chương, mục, tài khoản độc giả (dữ liệu lâu dài, cấu trúc lồng nhau, văn bản lớn) | **MongoDB** | Document model lưu lồng nhau tự nhiên, schema linh hoạt, truy vấn/index trên văn bản |
| Tiến trình đọc dở (dữ liệu trạng thái, ghi/đọc liên tục) | **Redis Hashes** | In-memory, độ trễ < 1ms, ghi đè từng field |
| Bảng xếp hạng lượt đọc (dữ liệu tạm, cần sắp xếp realtime) | **Redis ZSET** | `ZINCRBY` + `ZREVRANGE` tự duy trì thứ tự, O(log N) |

Chi tiết: xem [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Học cách Redis được dùng trong project: [Học Redis qua Thư viện số](docs/HOC_REDIS_TRONG_PROJECT.md) — nền tảng, sơ đồ luồng thực tế và bài tập CLI.

## 3. Công nghệ
- Backend: Java 17+, Spring Boot, Spring Data MongoDB, Spring Data Redis, Maven
- Frontend: React + Vite
- Hạ tầng: Docker Compose; công cụ quan sát: MongoDB Compass, Redis Insight

Phase 1 đã tích hợp: API sách, chương, độc giả, đăng nhập (catalog, identity); API tiến trình đọc và bảng xếp hạng trên Redis (reading, ranking); giao diện kho sách, quản trị, tài khoản; script seed MongoDB + Redis (`scripts/seed/`). Phase 2 đã merge vào `main` ngày 28/10/2026: E-Reader lưu/khôi phục vị trí đọc, widget Top sách, chống lặp lượt đọc 60 giây và script đo hiệu năng; đã duyệt trên Chrome thật (I01/I02 đạt), xem [biên bản tích hợp](docs/PHASE2_INTEGRATION.md) và [bằng chứng trình duyệt](docs/vu/UI_EVIDENCE.md). E-Reader đánh số trang liên tục trên cả cuốn sách và lưu cả vị trí dòng, nên mốc "Trang 30" trong [yêu cầu đề tài](docs/YC_PJ.md) đã đạt. Xem [phần dùng chung và hợp đồng tích hợp](docs/SHARED.md).

Backend tự tạo tài khoản quản trị `admin` / `admin123` khi khởi động lần đầu (đổi qua `ADMIN_USERNAME`, `ADMIN_PASSWORD`).

Tính năng bổ sung ngoài phạm vi yêu cầu chính: tab **Đề xuất sách** cho độc giả gửi tên sách, tác giả và lời nhắn (tối đa 1 lượt/tài khoản). Admin xem danh sách, lọc và phản hồi tại **Quản lý đề xuất**; độc giả nhận phản hồi trong tab của mình. Nút VIP mang tính vui vẻ, hiện thông báo sắp ra mắt và chưa tăng hạn mức. Xem [hướng dẫn đề xuất sách](docs/BOOK_SUGGESTIONS.md).

## 4. Khởi chạy nhanh (cho cả 3 thành viên)
```bash
git clone git@github.com:ThaiDuyVu/digital-library.git && cd digital-library
cp .env.example .env
docker compose up -d
docker compose ps        # kiểm tra mongodb, redis healthy
# terminal khác
cd backend && ./mvnw spring-boot:run
# terminal khác, từ thư mục gốc
cd frontend && npm install && npm run dev
```
| Dịch vụ | Địa chỉ |
|---|---|
| MongoDB | `mongodb://admin:admin123@localhost:27017/?authSource=admin` (dùng Compass) |
| Redis | `localhost:6379` |
| Redis Insight | http://localhost:5540 (add DB: host `redis`, port `6379`) |
| Mongo Express | http://localhost:8081 |
| Spring Boot API | http://localhost:8080/api/health |
| React | http://localhost:5173 |

Dừng: `docker compose down` (giữ dữ liệu) | Xóa sạch: `docker compose down -v`

## 5. Cấu trúc thư mục
```
digital-library/
├── README.md
├── docker-compose.yml
├── .env.example
├── backend/                # Spring Boot: catalog, identity, reading, ranking, common
├── frontend/               # React: features theo domain, shared API client
├── docs/
│   ├── ARCHITECTURE.md     # Giải trình Polyglot + thiết kế schema (barem mục 1)
│   ├── PLAN.md             # Kế hoạch 2 phase + barem checklist
│   ├── DEMO_SCRIPT.md      # Kịch bản demo bảo vệ
│   ├── PHASE2_INTEGRATION.md # Biên bản merge phase 2 + kết quả kiểm chứng
│   ├── SHARED.md           # Ranh giới code, quy ước dữ liệu, hợp đồng API
│   └── vu/UI_EVIDENCE.md   # Bằng chứng duyệt I01/I02 trên Chrome thật (+ ảnh, log)
├── members/
│   ├── VU.md               # SV1 – Data Architect & CRUD Lead
│   ├── DAT.md              # SV2 – Advanced Query Specialist (Redis)
│   └── SON.md              # SV3 – Fullstack Integrator & DB Tester
└── scripts/seed/           # Script nạp dummy data (Sơn)
```

## 6. Phân công
| Thành viên | Vai trò | File nhiệm vụ |
|---|---|---|
| Vũ | SV1 – Data Architect & CRUD Lead | [members/VU.md](members/VU.md) |
| Đạt | SV2 – Advanced Query Specialist | [members/DAT.md](members/DAT.md) |
| Sơn | SV3 – Fullstack Integrator & DB Tester | [members/SON.md](members/SON.md) |

## 7. Quy ước làm việc với GitHub
- Nhánh: `main` (ổn định) ← `develop` ← `feature/<ten>-<chuc-nang>` (vd `feature/vu-book-crud`).
- Mỗi người làm trên nhánh riêng, tạo **Pull Request** vào `develop`, ít nhất 1 người review.
- Cuối mỗi phase: merge `develop` → `main`, gắn tag `phase-1`, `phase-2`.
- Commit message: `feat:`, `fix:`, `docs:`, `chore:` + mô tả ngắn.
- Không commit file `.env`.
- Quy ước thư mục và file dùng chung: xem [docs/SHARED.md](docs/SHARED.md). Vũ làm `catalog/` và `identity/`, Đạt làm `reading/` và `ranking/`, Sơn làm `frontend/` và `scripts/seed/`.

## 8. Lộ trình
2 phase, mỗi phase trình bày 1 tuần. Xem [`docs/PLAN.md`](docs/PLAN.md).
