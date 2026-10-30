# 📚 Thư viện số & Đọc sách trực tuyến

> Đồ án môn **NoSQL** – Đề tài 15: *Hệ thống thư viện số và đọc sách trực tuyến (Polyglot Persistence)*
> Nhóm 3 thành viên: **Vũ – Đạt – Sơn** · CSDL: **MongoDB + Redis**

## 1. Giới thiệu đề tài

Cổng đọc sách điện tử trực tuyến, gồm ba nhóm chức năng chính theo [yêu cầu đề tài](docs/YC_PJ.md):

- **Quản lý kho sách** (sách → chương → mục) và tài khoản độc giả trên **MongoDB**.
- **Lưu tiến trình đọc dở** (trang, dòng) vào **Redis Hash**. Đóng trình duyệt, mở lại ở máy khác vẫn về đúng chỗ đang đọc.
- **Bảng xếp hạng sách thịnh hành** theo lượt đọc bằng **Redis Sorted Set** (`ZINCRBY` / `ZREVRANGE`).

Bài toán có ba loại dữ liệu với cách truy cập rất khác nhau, nên nhóm dùng **Polyglot Persistence**: mỗi CSDL làm đúng việc nó giỏi nhất.

| Dữ liệu | Đặc điểm | CSDL | Lý do |
|---|---|---|---|
| Sách, chương, mục, độc giả | Văn bản lớn, lồng nhau, ghi ít đọc nhiều | **MongoDB** | Document model lưu nguyên cây sách, có `$jsonSchema`, text index |
| Tiến trình đọc | Ghi mỗi lần lật trang | **Redis Hash** | Trong bộ nhớ, ghi đè từng field, độ trễ dưới 1 ms |
| Lượt đọc, bảng xếp hạng | Tăng điểm liên tục, đọc Top N | **Redis ZSET** | Luôn được sắp sẵn, tăng điểm nguyên tử |

Ngoài phạm vi bắt buộc, hệ thống có thêm: tab **Đề xuất sách**, **chế độ đọc nghỉ tay** (tự cuộn), chọn chương bằng **cây mốc**, mục **sách liên quan**.

## 2. Kiến trúc tổng quan

```mermaid
flowchart LR
    R[React E-Reader] -->|REST /api| API[Spring Boot API]
    subgraph Backend
      API --> CAT[catalog]
      API --> IDN[identity]
      API --> RDG[reading]
      API --> RNK[ranking]
    end
    CAT -->|books| M[(MongoDB)]
    IDN -->|users| M
    IDN -->|session:*| X[(Redis)]
    RDG -->|progress:userId:bookId| X
    RNK -->|ranking:books| X
    RNK -.->|bookId → thông tin sách| CAT
```

- **Backend** chia 4 domain độc lập: `catalog` (sách, chương), `identity` (độc giả, đăng nhập), `reading` (tiến trình đọc), `ranking` (lượt đọc, xếp hạng). Domain này gọi domain khác qua service, không truy cập repository của nhau.
- **Hai CSDL chỉ liên kết qua ID.** Redis giữ `bookId`, `userId` (ObjectId của MongoDB), không chép tiêu đề hay nội dung sách. Sửa sách trong MongoDB không cần đồng bộ sang Redis.
- **Xóa dây chuyền bằng sự kiện:** xóa sách hoặc độc giả trong MongoDB thì phát event để dọn key Redis tương ứng.

Cấu trúc dữ liệu chính:

| Nơi lưu | Cấu trúc | Ví dụ |
|---|---|---|
| MongoDB `books` | Document, nhúng `chapters[]` → `sections[]` | `{ title, author, categories, chapters: [{ chapterNo, title, content, sections }] }` |
| MongoDB `users` | Document, mật khẩu băm BCrypt | `{ username, email, passwordHash, role }` |
| Redis `progress:{userId}:{bookId}` | Hash | `chapter 5  page 30  line 14  updatedAt …` |
| Redis `ranking:books` | Sorted Set | member = `bookId`, score = lượt đọc |
| Redis `session:{sha256(token)}` | String, TTL 7 ngày | giá trị = `userId` |

Chi tiết thiết kế, JSON Schema, index và kết quả đo hiệu năng: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Công nghệ

| Tầng | Công nghệ |
|---|---|
| Backend | Java 17+, Spring Boot 4, Spring Data MongoDB, Spring Data Redis, Maven |
| Frontend | React 19, Vite |
| CSDL | MongoDB 7, Redis 7 (bật AOF) |
| Hạ tầng | Docker Compose; quan sát bằng MongoDB Compass, Mongo Express, Redis Insight |
| Dữ liệu mẫu | Python 3.10+ (`scripts/seed/`) |

## 3. Cài đặt

### Yêu cầu

- Docker Desktop
- JDK 17 trở lên (Maven đi kèm qua `mvnw`, không cần cài riêng)
- Node.js 20.19+ hoặc 22+
- Python 3.10+ (chỉ để nạp dữ liệu mẫu)

### Các bước

```bash
# 1. Lấy mã nguồn và khởi động MongoDB + Redis
git clone git@github.com:ThaiDuyVu/digital-library.git && cd digital-library
cp .env.example .env
docker compose up -d
docker compose ps                    # chờ mongodb, redis báo healthy

# 2. Chạy backend (terminal riêng)
cd backend && ./mvnw spring-boot:run          # Windows: .\mvnw.cmd spring-boot:run

# 3. Nạp dữ liệu mẫu (terminal riêng, chạy SAU khi backend đã khởi động một lần để tạo index)
cd scripts/seed
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed_books.py && python seed_redis.py

# 4. Chạy frontend (terminal riêng)
cd frontend && npm install && npm run dev
```

Mở **http://localhost:5173**.

> **Backend chạy ngoài Docker nên không tự đọc `.env`.** Nếu đổi cổng hoặc mật khẩu trong `.env` (ví dụ máy đã có MongoDB chiếm cổng 27017 nên đổi `MONGO_PORT=27018`), phải đặt biến `MONGO_URI` và `REDIS_URL` tương ứng trong terminal chạy backend và script seed.

Dữ liệu mẫu sau khi nạp: **60 sách × 5–10 chương** (469 chương), 10 độc giả, **60 Hash** tiến trình đọc, **ZSET 50 sách**. Chạy lại bao nhiêu lần cũng không nhân đôi. Chi tiết: [scripts/seed/README.md](scripts/seed/README.md).

### Địa chỉ dịch vụ

| Dịch vụ | Địa chỉ |
|---|---|
| Web (React) | http://localhost:5173 |
| API | http://localhost:8080/api/health |
| Redis Insight | http://localhost:5540 (thêm database: host `redis`, port `6379`) |
| Mongo Express | http://localhost:8081 |
| MongoDB (Compass) | `mongodb://admin:admin123@localhost:27017/?authSource=admin` |
| Redis | `localhost:6379` |

### Tài khoản có sẵn

| Vai trò | Tài khoản | Mật khẩu |
|---|---|---|
| Quản trị | `admin` | `admin123` (tạo khi backend khởi động lần đầu, đổi qua `ADMIN_USERNAME` / `ADMIN_PASSWORD`) |
| Độc giả mẫu | `reader01` … `reader10` | `reader123` |

Dừng hệ thống: `docker compose down` (giữ dữ liệu). **Không** dùng `docker compose down -v` nếu muốn giữ dữ liệu, lệnh này xóa cả volume.

## 4. Hướng dẫn sử dụng

### Độc giả

1. **Đăng ký / đăng nhập** ở tab *Tài khoản*, hoặc dùng `reader01` / `reader123`.
2. **Kho sách:** tìm theo tên hoặc tác giả (gõ không dấu vẫn tìm được), lọc theo thể loại, bấm *Xem chi tiết* để xem mục lục và sách liên quan, bấm *Đọc sách* để mở.
3. **Đọc sách:**
   - Lật trang bằng nút *Trang trước / Trang sau*, hoặc gõ số vào ô nhảy trang.
   - Chọn chương trên **cây mốc** ngang. Chọn chương đã đọc hoặc nhảy cóc qua nhiều chương thì hệ thống hỏi xác nhận.
   - Chỉnh cỡ chữ bằng *A- / A+*.
   - Vị trí được **tự lưu** mỗi lần lật trang và khi đóng tab. Lần sau mở lại, kể cả trên máy khác, hệ thống báo *"Tiếp tục từ trang …, dòng …"* và cuộn tới đúng chỗ.
4. **Đọc nghỉ tay:** bấm nút *Đọc nghỉ tay* ở góc phải phần nội dung. Trang sách tự cuộn theo tốc độ đọc. **Space** tạm dừng / chạy tiếp, **Esc** thoát. Hết chương thì có nút sang chương sau.
5. **Thịnh hành:** xem Top sách đọc nhiều nhất, tự cập nhật mỗi 10 giây. Mỗi lần mở một chương tính 1 lượt đọc; mở lại cùng chương trong 60 giây không tính thêm.
6. **Đề xuất sách:** gửi tên sách, tác giả muốn thư viện bổ sung (1 lượt mỗi tài khoản) và xem phản hồi của quản trị.

### Quản trị viên

Đăng nhập `admin` để có thêm:
- Thêm, sửa, xóa sách; thêm, sửa, xóa chương trong sách.
- Quản lý tài khoản độc giả.
- Xem và phản hồi đề xuất sách.

### Quan sát dữ liệu khi demo

```redis
# Redis Insight → Workbench, hoặc: docker exec dl_redis redis-cli
HGETALL progress:{userId}:{bookId}        # vị trí đọc dở của một người với một cuốn
ZREVRANGE ranking:books 0 9 WITHSCORES    # Top 10 sách thịnh hành
```

Kịch bản demo bảo vệ (đọc tới Trang 30 rồi mở lại; đọc liên tục để BXH nhảy hạng): [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## 5. Phân công thành viên

| Thành viên | Vai trò | Phạm vi code | Công việc chính |
|---|---|---|---|
| **Vũ** | SV1 – Data Architect & CRUD Lead | `catalog/`, `identity/` | Giải trình Polyglot Persistence; thiết kế JSON Schema MongoDB và quy ước key Redis; API CRUD sách, chương, độc giả; đăng nhập và phân quyền; tài liệu kiến trúc và báo cáo hiệu năng |
| **Đạt** | SV2 – Advanced Query Specialist | `reading/`, `ranking/` | Lưu và khôi phục tiến trình đọc bằng Redis Hash; tăng lượt đọc `ZINCRBY` và Top sách `ZREVRANGE`; chống đếm lặp 60 giây; seed Redis; đo hiệu năng sơ bộ |
| **Sơn** | SV3 – Fullstack Integrator & DB Tester | `frontend/src/features/`, `scripts/seed/` | Nạp 60 sách × 5–10 chương; giao diện E-Reader, kho sách, quản trị, BXH; benchmark Redis vs MongoDB; điều phối demo |

Danh sách nhiệm vụ chi tiết và tiến độ từng người: [members/VU.md](members/VU.md), [members/DAT.md](members/DAT.md), [members/SON.md](members/SON.md).

## 6. Cấu trúc thư mục

```
digital-library/
├── backend/              # Spring Boot: catalog, identity, reading, ranking, suggestion, common
│   └── src/main/resources/mongo/   # JSON Schema MongoDB (backend tự áp khi khởi động)
├── frontend/             # React + Vite: features/ theo domain, shared/ dùng chung
├── scripts/seed/         # Nạp dữ liệu mẫu, đo hiệu năng
├── docs/                 # Kiến trúc, hợp đồng API, kịch bản demo, bằng chứng kiểm thử
├── members/              # Nhiệm vụ từng thành viên
└── docker-compose.yml    # MongoDB, Redis, Redis Insight, Mongo Express
```

## 7. Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [docs/YC_PJ.md](docs/YC_PJ.md) | Yêu cầu đề tài và barem |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Giải trình Polyglot, thiết kế MongoDB và Redis, kết quả đo hiệu năng |
| [docs/SHARED.md](docs/SHARED.md) | Hợp đồng API, quy ước dữ liệu và ranh giới code |
| [docs/RESUME_MECHANISM.md](docs/RESUME_MECHANISM.md) | Luồng lưu và mở lại đúng trang đang đọc |
| [docs/HOC_REDIS_TRONG_PROJECT.md](docs/HOC_REDIS_TRONG_PROJECT.md) | Học Redis qua chính project này |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Kịch bản demo bảo vệ |
| [docs/PLAN.md](docs/PLAN.md) | Kế hoạch 2 phase và checklist barem |

## 8. Quy ước làm việc

- Nhánh: `main` (ổn định) ← `develop` ← `feature/<tên>-<chức-năng>`. Mỗi người làm trên nhánh riêng, mở Pull Request, ít nhất 1 người review.
- Commit message: `feat:`, `fix:`, `docs:`, `chore:` kèm mô tả ngắn.
- Không commit `.env`, token hay mật khẩu thật.
