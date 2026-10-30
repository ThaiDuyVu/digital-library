#!/usr/bin/env python3
"""Đo độ trễ Redis vs MongoDB trên **bản sao của dữ liệu thật** (bổ sung cho bench_latency.py).

Khác biệt so với `bench_latency.py`: script đó dựng 50 bản ghi bịa trong một database rỗng,
nên MongoDB được đo trong điều kiện quá thuận lợi (working set gần như trống). Script này
sao chép nguyên dữ liệu đang chạy sang vùng riêng rồi mới đo, để MongoDB phải làm việc cạnh
collection `books` thật (~5 MB toàn văn) đúng như lúc phục vụ người đọc.

Nguồn dữ liệu (CHỈ ĐỌC, không ghi, không xóa):
  - MongoDB `digital_library`: collection `books`, `users`
  - Redis DB0: các Hash `progress:*` và ZSET `ranking:books`

Đích (tạo mới, dọn sạch khi xong):
  - MongoDB `digital_library_bench_real`: `books`, `users`, `progress`, `ranking`
  - Redis: các key tiền tố `benchreal:`

`progress` và `ranking` phía MongoDB được dựng từ **đúng giá trị** đọc ở Redis, nên hai bên
giữ cùng nội dung — đây là phép so "nếu lưu tiến trình trong MongoDB thì chậm hơn bao nhiêu".

Năm phép đo:
  1. read_progress   : Redis HGETALL            vs MongoDB find_one theo _id
  2. write_progress  : Redis HSET (lật trang)   vs MongoDB update_one upsert
  3. ranking_incr    : Redis ZINCRBY            vs MongoDB update_one $inc
  4. ranking_top10   : Redis ZREVRANGE 0 9      vs MongoDB find().sort(score -1).limit(10)
  5. read_chapter    : chỉ MongoDB — đọc một chương toàn văn bằng $elemMatch (tham chiếu,
                       Redis không giữ nội dung nên không có vế so sánh)

Phạm vi: chỉ đo thời gian truy vấn CSDL (kết nối giữ sẵn), KHÔNG gồm HTTP, xác thực, Spring.

Dùng:
  python bench_latency_real.py
  python bench_latency_real.py --samples 2000 --out bench_out_real
  python bench_latency_real.py --keep     # giữ bản sao để xem bằng Compass / Redis Insight
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import platform
import random
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import redis
    from pymongo import DESCENDING, MongoClient
except ImportError:  # pragma: no cover
    sys.exit("Thiếu thư viện. Chạy: pip install -r requirements.txt")

HERE = Path(__file__).resolve().parent
DEFAULT_MONGO_URI = os.environ.get(
    "MONGO_URI", "mongodb://admin:admin123@localhost:27017/digital_library?authSource=admin")
DEFAULT_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

PROD_DB = "digital_library"
BENCH_DB = "digital_library_bench_real"
REDIS_PREFIX = "benchreal:"
RANKING_KEY = REDIS_PREFIX + "ranking"
PROD_RANKING_KEY = "ranking:books"
PROD_PROGRESS_PATTERN = "progress:*"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def timed(fn, arg) -> int:
    start = time.perf_counter_ns()
    fn(arg)
    return time.perf_counter_ns() - start


def run_case(name, redis_fn, mongo_fn, warmup, samples, rng):
    """Chạy một phép đo. redis_fn=None nghĩa là phép đo chỉ có vế MongoDB."""
    for i in range(warmup):
        if redis_fn:
            redis_fn(i)
        mongo_fn(i)
    rows = []
    for i in range(samples):
        order = [("mongo", mongo_fn)]
        if redis_fn:
            order.insert(0, ("redis", redis_fn))
            if rng.random() < 0.5:  # xen kẽ thứ tự để không bên nào luôn chạy trước
                order.reverse()
        for backend, fn in order:
            rows.append((name, backend, i, timed(fn, i)))
    return rows


def percentile(sorted_values, p):
    index = max(0, math.ceil(p * len(sorted_values)) - 1)
    return sorted_values[index]


def summarize(rows):
    groups: dict[tuple[str, str], list[int]] = {}
    for case, backend, _, nanos in rows:
        groups.setdefault((case, backend), []).append(nanos)
    summary = {}
    for (case, backend), values in groups.items():
        values.sort()
        ms = [v / 1e6 for v in values]
        summary.setdefault(case, {})[backend] = {
            "n": len(ms),
            "mean": statistics.fmean(ms),
            "median": statistics.median(ms),
            "p95": percentile(ms, 0.95),
            "p99": percentile(ms, 0.99),
            "max": ms[-1],
        }
    return summary


def markdown_table(summary) -> str:
    lines = [
        "| Phép đo | CSDL | n | Trung bình (ms) | Trung vị (ms) | p95 (ms) | p99 (ms) | Mongo/Redis (trung vị) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for case, per_backend in summary.items():
        has_both = "redis" in per_backend and "mongo" in per_backend
        ratio = per_backend["mongo"]["median"] / per_backend["redis"]["median"] if has_both else None
        for backend in ("redis", "mongo"):
            if backend not in per_backend:
                continue
            s = per_backend[backend]
            last = f"{ratio:.2f}x" if backend == "mongo" and ratio else "–" if backend == "mongo" else ""
            lines.append(
                f"| {case} | {backend} | {s['n']} | {s['mean']:.3f} | {s['median']:.3f} "
                f"| {s['p95']:.3f} | {s['p99']:.3f} | {last} |")
    return "\n".join(lines)


def copy_mongo_collection(src_db, dst_db, name):
    """Sao chép nguyên văn một collection, giữ cả index để điều kiện truy vấn giống bản thật."""
    docs = list(src_db[name].find())
    if docs:
        dst_db[name].insert_many(docs, ordered=False)
    for index in src_db[name].list_indexes():
        if index["name"] == "_id_":
            continue
        keys = list(index["key"].items())
        options = {k: v for k, v in index.items()
                   if k in ("unique", "weights", "default_language", "textIndexVersion")}
        options.pop("textIndexVersion", None)
        if "weights" in options:  # text index: dựng lại từ weights
            keys = [(field, "text") for field in options.pop("weights")]
        try:
            dst_db[name].create_index(keys, name=index["name"], **options)
        except Exception as exc:  # noqa: BLE001 — index phụ không dựng được thì bỏ qua, có ghi log
            print(f"  (bỏ qua index {index['name']} của {name}: {exc})")
    return len(docs)


def read_real_progress(r):
    """Đọc mọi Hash progress:* thật bằng SCAN (không dùng KEYS). Chỉ đọc, không ghi."""
    out = []
    for key in r.scan_iter(match=PROD_PROGRESS_PATTERN, count=500):
        parts = key.split(":")
        if len(parts) != 3:
            continue
        fields = r.hgetall(key)
        if fields:
            out.append((parts[1], parts[2], fields))
    out.sort()
    return out


def cleanup(r, mongo_client):
    keys = list(r.scan_iter(match=REDIS_PREFIX + "*", count=500))
    if keys:
        r.delete(*keys)  # chỉ xóa đúng key benchreal: do script tạo
    mongo_client.drop_database(BENCH_DB)  # database riêng của script


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mongo-uri", default=DEFAULT_MONGO_URI)
    parser.add_argument("--redis-url", default=DEFAULT_REDIS_URL)
    parser.add_argument("--samples", type=int, default=1000)
    parser.add_argument("--warmup", type=int, default=200)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--out", default=str(HERE / "bench_out_real"), help="thư mục ghi kết quả")
    parser.add_argument("--keep", action="store_true", help="giữ bản sao sau khi đo")
    args = parser.parse_args()

    if BENCH_DB == PROD_DB or not REDIS_PREFIX:  # chốt an toàn, phòng sửa nhầm hằng số
        sys.exit("Đích trùng dữ liệu thật, dừng.")

    try:
        r = redis.Redis.from_url(args.redis_url, decode_responses=True)
        r.ping()
        mongo_client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=3000)
        mongo_client.admin.command("ping")
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"Không kết nối được Redis/MongoDB: {exc}\nKiểm tra `docker compose ps`.")

    src_db = mongo_client[PROD_DB]
    if src_db.books.count_documents({}) == 0:
        sys.exit(f"Database {PROD_DB} chưa có sách. Chạy seed_books.py trước.")

    # --- 1. Đọc dữ liệu thật ---
    print("Đọc dữ liệu thật (chỉ đọc) …")
    real_progress = read_real_progress(r)
    real_ranking = r.zrange(PROD_RANKING_KEY, 0, -1, withscores=True)
    if not real_progress or not real_ranking:
        sys.exit("Redis chưa có progress:* hoặc ranking:books. Chạy seed_redis.py trước.")
    print(f"  {len(real_progress)} tiến trình, {len(real_ranking)} sách trong BXH")

    # --- 2. Nhân bản sang vùng riêng ---
    print(f"Nhân bản sang {BENCH_DB} và key {REDIS_PREFIX}* …")
    cleanup(r, mongo_client)
    db = mongo_client[BENCH_DB]
    n_books = copy_mongo_collection(src_db, db, "books")
    n_users = copy_mongo_collection(src_db, db, "users")
    print(f"  MongoDB: {n_books} sách, {n_users} độc giả")

    progress = db["progress"]
    ranking = db["ranking"]
    redis_keys, mongo_ids = [], []
    for user_id, book_id, fields in real_progress:
        rkey = f"{REDIS_PREFIX}progress:{user_id}:{book_id}"
        mid = f"{user_id}:{book_id}"
        r.hset(rkey, mapping=fields)
        progress.replace_one({"_id": mid}, {"_id": mid, **fields}, upsert=True)
        redis_keys.append(rkey)
        mongo_ids.append(mid)

    ranking_ids = []
    for book_id, score in real_ranking:
        r.zadd(RANKING_KEY, {book_id: score})
        ranking.replace_one({"_id": book_id}, {"_id": book_id, "score": score}, upsert=True)
        ranking_ids.append(book_id)
    ranking.create_index([("score", DESCENDING)])  # công bằng: Mongo có index cho sort

    n_pos = len(redis_keys)
    n_rank = len(ranking_ids)
    bench_size = db.command("dbstats")["dataSize"]
    print(f"  Redis: {n_pos} Hash, ZSET {n_rank} sách; bench dataSize {bench_size/1e6:.1f} MB")

    # Danh sách (bookId, chapterNo) có thật để đo đọc chương toàn văn
    chapters = [(str(b["_id"]), b["chapters"][len(b["chapters"]) // 2]["chapterNo"])
                for b in db.books.find({}, {"chapters.chapterNo": 1}) if b.get("chapters")]

    # --- 3. Thao tác đo ---
    def redis_read(i):
        return r.hgetall(redis_keys[i % n_pos])

    def mongo_read(i):
        return progress.find_one({"_id": mongo_ids[i % n_pos]})

    def redis_write(i):
        r.hset(redis_keys[i % n_pos], mapping={
            "chapter": 1 + i % 5, "page": 1 + i % 30, "line": i % 20, "updatedAt": iso_now()})

    def mongo_write(i):
        progress.update_one(
            {"_id": mongo_ids[i % n_pos]},
            {"$set": {"chapter": 1 + i % 5, "page": 1 + i % 30, "line": i % 20,
                      "updatedAt": iso_now()}},
            upsert=True)

    def redis_incr(i):
        r.zincrby(RANKING_KEY, 1, ranking_ids[i % n_rank])

    def mongo_incr(i):
        ranking.update_one({"_id": ranking_ids[i % n_rank]}, {"$inc": {"score": 1}})

    def redis_top(_):
        return r.zrevrange(RANKING_KEY, 0, 9, withscores=True)

    def mongo_top(_):
        return list(ranking.find().sort("score", DESCENDING).limit(10))

    def mongo_chapter(i):
        book_id, chapter_no = chapters[i % len(chapters)]
        return db.books.find_one(
            {"_id": book_id}, {"title": 1, "chapters": {"$elemMatch": {"chapterNo": chapter_no}}})

    cases = [
        ("read_progress", redis_read, mongo_read),
        ("write_progress", redis_write, mongo_write),
        ("ranking_incr", redis_incr, mongo_incr),
        ("ranking_top10", redis_top, mongo_top),
        ("read_chapter", None, mongo_chapter),
    ]

    rng = random.Random(args.seed)
    rows = []
    for name, redis_fn, mongo_fn in cases:
        print(f"Đang đo {name} …", flush=True)
        rows += run_case(name, redis_fn, mongo_fn, args.warmup, args.samples, rng)

    summary = summarize(rows)
    env = {
        "timestamp": iso_now(),
        "dataset": "bản sao dữ liệu thật",
        "source_mongo_db": PROD_DB,
        "source_redis_db": 0,
        "python": platform.python_version(),
        "os": platform.platform(),
        "redis_version": r.info("server").get("redis_version"),
        "mongo_version": mongo_client.server_info().get("version"),
        "samples_per_backend": args.samples,
        "warmup_per_backend": args.warmup,
        "seed": args.seed,
        "positions": n_pos,
        "ranking_members": n_rank,
        "books_copied": n_books,
        "users_copied": n_users,
        "bench_data_size_mb": round(bench_size / 1e6, 2),
        "concurrency": 1,
    }
    try:
        env["redis_appendonly"] = r.config_get("appendonly").get("appendonly")
    except redis.RedisError:
        env["redis_appendonly"] = "không đọc được"

    table = markdown_table(summary)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "bench-real-raw.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["case", "backend", "iteration", "nanoseconds"])
        writer.writerows(rows)
    (out_dir / "bench-real-summary.json").write_text(
        json.dumps({"environment": env, "summary": summary}, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "bench-real-summary.md").write_text(table + "\n", encoding="utf-8")

    print("\n" + table)
    print(f"\nMôi trường: Redis {env['redis_version']} (appendonly={env['redis_appendonly']}), "
          f"MongoDB {env['mongo_version']}, Python {env['python']}, {platform.platform()}")
    print(f"Dữ liệu: bản sao của {n_books} sách, {n_pos} tiến trình, ZSET {n_rank} sách "
          f"({env['bench_data_size_mb']} MB)")
    print(f"Đã ghi kết quả vào {out_dir}")

    if not args.keep:
        cleanup(r, mongo_client)
        print(f"Đã dọn bản sao (database {BENCH_DB} và key {REDIS_PREFIX}*). "
              "Dữ liệu thật không bị thay đổi.")


if __name__ == "__main__":
    main()
