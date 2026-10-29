#!/usr/bin/env python3
"""Nạp nội dung 5 sách demo do Sơn soạn (thư mục `demo_books/`) đè lên các sách seed tương ứng.

Vì sao có script riêng thay vì sửa `seed_books.py`:
  * `seed_books.py` sinh nội dung bằng mẫu câu, chạy lại là ghi đè. Script này chạy SAU nó để
    thay nội dung 5 cuốn bằng văn bản viết tay, nên thứ tự bắt buộc là:
        python seed_books.py && python seed_demo_books.py && python seed_redis.py
  * File JSON bàn giao để `_id` dạng chuỗi và thiếu `createdAt`/`coverUrl`. Backend dùng ObjectId và
    validator MongoDB bắt buộc `createdAt`, nên phải chuyển kiểu và lấy lại hai trường đó từ bản ghi
    đang có. Ghi thẳng chuỗi sẽ tạo thêm một document trùng tên mà API không tìm ra.

Đặc điểm:
  * Chỉ đụng đúng các `_id` có trong `demo_books/`; không xóa, không sửa sách khác.
  * Giữ nguyên `_id`, `createdAt` và `coverUrl` cũ nên tiến trình đọc (`progress:*`) và điểm xếp hạng
    (`ranking:books`) của các sách này vẫn trỏ đúng.
  * Kiểm tra theo `books.schema.json` trước khi ghi, dùng chung bộ kiểm tra của `seed_books.py`.
  * In số trang E-Reader của từng cuốn để biết mốc "Trang 30" còn đạt hay không.

Dùng:
  python seed_demo_books.py --dry-run    # chỉ kiểm tra, không ghi
  python seed_demo_books.py              # ghi vào MongoDB
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from bson import ObjectId
    from pymongo import MongoClient
except ImportError:  # pragma: no cover
    sys.exit("Thiếu pymongo. Chạy: pip install -r requirements.txt")

from seed_books import DEFAULT_URI, SCHEMA_PATH, validate_all
from seed_redis import paginate_book

HERE = Path(__file__).resolve().parent
BOOKS_DIR = HERE / "demo_books"
MIN_PAGES_FOR_DEMO = 40  # cuốn dùng cho mốc "Trang 30" phải còn đủ trang


def load_payloads(folder: Path) -> list[dict]:
    """Đọc mọi file JSON trong thư mục; mỗi file là một mảng chứa một sách."""
    books: list[dict] = []
    for path in sorted(folder.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for raw in data if isinstance(data, list) else [data]:
            raw["_source"] = path.name
            books.append(raw)
    return books


def to_document(raw: dict, existing: dict | None, now: datetime) -> dict:
    """Chuyển JSON bàn giao thành document đúng kiểu mà backend và validator chờ đợi."""
    chapters = []
    for chapter in raw.get("chapters") or []:
        sections = [
            {
                "sectionNo": int(section["sectionNo"]),
                "heading": section["heading"],
                "text": section["text"],
            }
            for section in chapter.get("sections") or []
        ]
        chapters.append({
            "chapterNo": int(chapter["chapterNo"]),
            "title": chapter["title"],
            "content": chapter.get("content", ""),
            "sections": sections,
        })

    document = {
        "_id": ObjectId(raw["_id"]),
        "title": raw["title"],
        "author": raw["author"],
        "categories": list(raw.get("categories") or []),
        "description": raw.get("description", ""),
        "chapters": chapters,
        # Sách đã có trong kho: giữ ngày tạo và ảnh bìa cũ, chỉ nội dung là mới.
        "createdAt": (existing or {}).get("createdAt") or now,
        "updatedAt": now,
    }
    cover = raw.get("coverUrl") or (existing or {}).get("coverUrl")
    if cover:
        document["coverUrl"] = cover
    return document


def describe(document: dict, raw: dict, existing: dict | None) -> list[str]:
    """Dòng mô tả một cuốn kèm cảnh báo, để xem trước khi ghi."""
    pages = len(paginate_book(document["chapters"]))
    lengths = [len(c["content"]) for c in document["chapters"]]
    lines = [
        f"{raw['_source']}  {document['_id']}  {document['title']}",
        f"    {len(document['chapters'])} chương, nội dung {min(lengths)}–{max(lengths)} ký tự/chương, {pages} trang",
    ]
    if existing is None:
        lines.append("    ! CẢNH BÁO: id này chưa có trong kho, sẽ tạo sách mới")
    elif existing["title"] != document["title"]:
        lines.append(f"    ! Đổi tên: \"{existing['title']}\" → \"{document['title']}\"")
    if not 5 <= len(document["chapters"]) <= 10:
        lines.append("    ! CẢNH BÁO: số chương ngoài khoảng 5–10 của định mức dữ liệu mẫu")
    if pages < MIN_PAGES_FOR_DEMO:
        lines.append(f"    - Dưới {MIN_PAGES_FOR_DEMO} trang: không dùng cuốn này cho mốc \"Trang 30\"")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default=str(BOOKS_DIR), help="thư mục chứa JSON sách demo")
    parser.add_argument("--uri", default=os.environ.get("MONGO_URI", DEFAULT_URI), help="MongoDB URI (mặc định lấy MONGO_URI)")
    parser.add_argument("--dry-run", action="store_true", help="chỉ kiểm tra và in, không ghi DB")
    args = parser.parse_args()

    folder = Path(args.dir)
    if not folder.is_dir():
        sys.exit(f"Không thấy thư mục {folder}")
    payloads = load_payloads(folder)
    if not payloads:
        sys.exit(f"Không có file JSON nào trong {folder}")

    client = MongoClient(args.uri, serverSelectionTimeoutMS=5000)
    collection = client.get_default_database()["books"]
    now = datetime.now(timezone.utc).replace(microsecond=0)

    documents = []
    for raw in payloads:
        existing = collection.find_one({"_id": ObjectId(raw["_id"])}, {"createdAt": 1, "coverUrl": 1, "title": 1})
        document = to_document(raw, existing, now)
        print("\n".join(describe(document, raw, existing)))
        documents.append(document)

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    errors = validate_all([{k: v for k, v in d.items()} for d in documents], schema)
    if errors:
        sys.exit("Dữ liệu vi phạm schema:\n  " + "\n  ".join(errors[:20]))
    print(f"\nKiểm tra schema: OK ({len(documents)} sách)")

    if args.dry_run:
        print("--dry-run: không ghi MongoDB.")
        client.close()
        return

    for document in documents:
        collection.replace_one({"_id": document["_id"]}, document, upsert=True)
    print(f"Đã ghi {len(documents)} sách vào {collection.database.name}.books")
    print("Nhắc: chạy lại seed_books.py sẽ ghi đè các sách này về nội dung sinh tự động.")
    client.close()


if __name__ == "__main__":
    main()
