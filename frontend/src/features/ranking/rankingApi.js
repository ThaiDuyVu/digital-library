import { apiGet } from '../../shared/api'

/**
 * Lấy Top N từ Redis ZSET (/ranking) rồi ghép tiêu đề, tác giả từ MongoDB (/books/batch).
 * Redis chỉ trả { bookId, score }. /books/batch giữ đúng thứ tự id và bỏ qua sách đã xóa,
 * nên số dòng trả về có thể ít hơn N (skipped = số sách bị bỏ).
 */
export async function loadRanking(top) {
  const entries = await apiGet(`/ranking?top=${top}`)
  if (entries.length === 0) return { rows: [], skipped: 0 }

  const ids = entries.map((entry) => entry.bookId)
  const books = await apiGet(`/books/batch?ids=${ids.join(',')}`)
  const byId = new Map(books.map((book) => [book.id, book]))

  const rows = entries
    .filter((entry) => byId.has(entry.bookId))
    .map((entry) => ({ ...entry, book: byId.get(entry.bookId) }))
  return { rows, skipped: entries.length - rows.length }
}