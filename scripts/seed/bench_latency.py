#!/usr/bin/env python3
"""Đo độ trễ Redis vs MongoDB cho dữ liệu của đồ án (Phase 2 – Sơn phối hợp Đạt, barem mục 4).

Bốn phép đo, mỗi phép chạy cùng thao tác trên cả hai CSDL, xen kẽ ngẫu nhiên từng cặp:
  1. read_progress   : Redis HGETALL            vs MongoDB find_one theo _id
  2. write_progress  : Redis HSET (lật trang)   vs MongoDB update_one upsert
  3. ranking_incr    : Redis ZINCRBY            vs MongoDB update_one $inc
  4. ranking_top10   : Redis ZREVRANGE 0 9      vs MongoDB find().sort(score -1).limit(10)

An toàn: chỉ dùng database riêng `digital_library_bench` và key tiền tố `bench:`.
Không đụng dữ liệu thật (books, users, progress:*, ranking:books, session:*). Không dùng FLUSH.

Phạm vi: chỉ đo thời gian truy vấn CSDL (kết nối giữ sẵn), KHÔNG gồm HTTP, xác thực, Spring.

Dùng:
  python bench_latency.py                    # 1000 mẫu, warm-up 200
  python bench_latency.py --samples 2000 --warmup 300
  python bench_latency.py --keep             # giữ dữ liệu bench để xem bằng Compass / Redis Insight
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
IDS_PATH = HERE / "book_ids.json"
DEFAULT_MONGO_URI = os.environ.get(
    "MONGO_URI", "mongodb://admin:admin123@localhost:27017/digital_library?authSource=admin")
DEFAULT_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
BENCH_DB = "digital_library_bench"
PROD_DB = "digital_library"
PROGRESS_COLL = "bench_progress"
RANKING_COLL = "bench_ranking"
REDIS_PREFIX = "bench:"
RANKING_KEY = REDIS_PREFIX + "ranking"
POSITIONS = 50  # số vị trí tiến trình = số sách trong BXH


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_book_ids(count: int) -> list[str]:
    if not IDS_PATH.exists():
        sys.exit(f"Không thấy {IDS_PATH.name}. Chạy seed_books.py trước.")
    ids = [item["bookId"] for item in json.loads(IDS_PATH.read_text(encoding="utf-8"))]
    if len(ids) < count:
        sys.exit(f"Cần ít nhất {count} sách trong {IDS_PATH.name}, hiện có {len(ids)}.")
    return ids[:count]


def timed(fn, arg) -> int:
    start = time.perf_counter_ns()
    fn(arg)
    return time.perf_counter_ns() - start


def run_case(name, redis_fn, mongo_fn, warmup, samples, rng):
    for i in range(warmup):
        redis_fn(i)
        mongo_fn(i)
    rows = []
    for i in range(samples):
        order = [("redis", redis_fn), ("mongo", mongo_fn)]
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
        ratio = per_backend["mongo"]["median"] / per_backend["redis"]["median"]
        for backend in ("redis", "mongo"):
            s = per_backend[backend]
            last = f"{ratio:.2f}x" if backend == "mongo" else ""
            lines.append(
                f"| {case} | {backend} | {s['n']} | {s['mean']:.3f} | {s['median']:.3f} "
                f"| {s['p95']:.3f} | {s['p99']:.3f} | {last} |")
    return "\n".join(lines)


def environment(r, mongo_client, args) -> dict:
    env = {
        "timestamp": iso_now(),
        "python": platform.python_version(),
        "os": platform.platform(),
        "redis_version": r.info("server").get("redis_version"),
        "mongo_version": mongo_client.server_info().get("version"),
        "samples_per_backend": args.samples,
        "warmup_per_backend": args.warmup,
        "seed": args.seed,
        "positions": POSITIONS,
        "concurrency": 1,
    }
    try:
        env["redis_appendonly"] = r.config_get("appendonly").get("appendonly")
    except redis.RedisError:
        env["redis_appendonly"] = "không đọc được"
    return env


def cleanup(r, mongo_client, progress_keys):
    r.delete(*progress_keys, RANKING_KEY)  # chỉ xóa đúng key bench đã tạo
    mongo_client.drop_database(BENCH_DB)    # database riêng của script


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mongo-uri", default=DEFAULT_MONGO_URI)
    parser.add_argument("--redis-url", default=DEFAULT_REDIS_URL)
    parser.add_argument("--samples", type=int, default=1000)
    parser.add_argument("--warmup", type=int, default=200)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--out", default=str(HERE / "bench_out"), help="thư mục ghi kết quả")
    parser.add_argument("--keep", action="store_true", help="giữ dữ liệu bench sau khi đo")
    args = parser.parse_args()

    if BENCH_DB == PROD_DB:  # chốt an toàn, phòng sửa nhầm hằng số
        sys.exit("BENCH_DB trùng database thật, dừng.")

    try:
        r = redis.Redis.from_url(args.redis_url, decode_responses=True)
        r.ping()
        mongo_client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=3000)
        mongo_client.admin.command("ping")
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"Không kết nối được Redis/MongoDB: {exc}\nKiểm tra `docker compose ps`.")

    db = mongo_client[BENCH_DB]
    progress = db[PROGRESS_COLL]
    ranking = db[RANKING_COLL]

    book_ids = load_book_ids(POSITIONS)
    user_ids = [f"5eed{n:020x}" for n in range(1, 11)]
    pairs = [(user_ids[i % len(user_ids)], book_ids[i]) for i in range(POSITIONS)]
    redis_keys = [f"{REDIS_PREFIX}progress:{u}:{b}" for u, b in pairs]
    mongo_ids = [f"{u}:{b}" for u, b in pairs]

    # --- Chuẩn bị dữ liệu bench (cùng nội dung ở hai bên) ---
    cleanup(r, mongo_client, redis_keys)
    ranking.create_index([("score", DESCENDING)])  # công bằng: Mongo có index cho sort
    now = iso_now()
    for i in range(POSITIONS):
        fields = {"chapter": 1 + i % 5, "page": 1 + i % 30, "line": 0, "updatedAt": now}
        r.hset(redis_keys[i], mapping=fields)
        progress.replace_one({"_id": mongo_ids[i]}, {"_id": mongo_ids[i], **fields}, upsert=True)
        r.zadd(RANKING_KEY, {book_ids[i]: 100 + i})
        ranking.replace_one({"_id": book_ids[i]}, {"_id": book_ids[i], "score": 100 + i}, upsert=True)

    # --- Thao tác đo ---
    def redis_read(i):
        return r.hgetall(redis_keys[i % POSITIONS])

    def mongo_read(i):
        return progress.find_one({"_id": mongo_ids[i % POSITIONS]})

    def redis_write(i):
        r.hset(redis_keys[i % POSITIONS], mapping={
            "chapter": 1 + i % 5, "page": 1 + i % 30, "line": 0, "updatedAt": iso_now()})

    def mongo_write(i):
        progress.update_one(
            {"_id": mongo_ids[i % POSITIONS]},
            {"$set": {"chapter": 1 + i % 5, "page": 1 + i % 30, "line": 0, "updatedAt": iso_now()}},
            upsert=True)

    def redis_incr(i):
        r.zincrby(RANKING_KEY, 1, book_ids[i % POSITIONS])

    def mongo_incr(i):
        ranking.update_one({"_id": book_ids[i % POSITIONS]}, {"$inc": {"score": 1}})

    def redis_top(_):
        return r.zrevrange(RANKING_KEY, 0, 9, withscores=True)

    def mongo_top(_):
        return list(ranking.find().sort("score", DESCENDING).limit(10))

    cases = [
        ("read_progress", redis_read, mongo_read),
        ("write_progress", redis_write, mongo_write),
        ("ranking_incr", redis_incr, mongo_incr),
        ("ranking_top10", redis_top, mongo_top),
    ]

    rng = random.Random(args.seed)
    rows = []
    for name, redis_fn, mongo_fn in cases:
        print(f"Đang đo {name} …", flush=True)
        rows += run_case(name, redis_fn, mongo_fn, args.warmup, args.samples, rng)

    summary = summarize(rows)
    env = environment(r, mongo_client, args)
    table = markdown_table(summary)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "bench-raw.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["case", "backend", "iteration", "nanoseconds"])
        writer.writerows(rows)
    (out_dir / "bench-summary.json").write_text(
        json.dumps({"environment": env, "summary": summary}, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "bench-summary.md").write_text(table + "\n", encoding="utf-8")

    print("\n" + table)
    print(f"\nMôi trường: Redis {env['redis_version']} (appendonly={env['redis_appendonly']}), "
          f"MongoDB {env['mongo_version']}, Python {env['python']}")
    print(f"Đã ghi kết quả vào {out_dir}")

    if not args.keep:
        cleanup(r, mongo_client, redis_keys)
        print("Đã dọn dữ liệu bench (database digital_library_bench và key bench:*).")


if __name__ == "__main__":
    main()