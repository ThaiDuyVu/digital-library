import { useEffect, useState } from 'react'
import { apiGet } from '../../shared/api'

const AUTO_REFRESH_MS = 10000

/**
 * Lấy Top N từ Redis ZSET rồi ghép tiêu đề/tác giả từ MongoDB.
 * Redis chỉ trả { bookId, score }; /books/batch giữ đúng thứ tự id và bỏ qua sách đã xóa,
 * nên số dòng hiển thị có thể ít hơn N.
 */
async function loadRanking(top) {
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

export function RankingPage() {
  const [top, setTop] = useState(10)
  const [auto, setAuto] = useState(true)
  const [version, setVersion] = useState(0) // tăng để tải lại
  const [rows, setRows] = useState(null)
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let active = true
    loadRanking(top)
      .then((result) => {
        if (!active) return
        setRows(result.rows)
        setSkipped(result.skipped)
        setError('')
        setUpdatedAt(new Date())
      })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [top, version])

  // Tự tải lại định kỳ để BXH nhảy vị trí khi có lượt đọc mới (bỏ qua khi tab trình duyệt đang ẩn)
  useEffect(() => {
    if (!auto) return undefined
    const timer = setInterval(() => {
      if (!document.hidden) setVersion((v) => v + 1)
    }, AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [auto])

  return (
    <section className="panel">
      <h2>Sách thịnh hành</h2>

      <div className="toolbar">
        <select
          value={top}
          onChange={(e) => setTop(Number(e.target.value))}
          aria-label="Số sách hiển thị"
        >
          <option value={5}>Top 5</option>
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
          <option value={50}>Top 50</option>
        </select>
        <button type="button" className="btn" onClick={() => setVersion((v) => v + 1)}>
          Tải lại
        </button>
        <label className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Tự cập nhật mỗi {AUTO_REFRESH_MS / 1000} giây
        </label>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {!rows && !error && <p className="muted">Đang tải bảng xếp hạng…</p>}

      {rows && rows.length === 0 && !error && (
        <p className="muted">
          Chưa có lượt đọc nào. Mở một chương ở tab Đọc sách để sách lên bảng xếp hạng.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Hạng</th>
                <th scope="col">Sách</th>
                <th scope="col">Thể loại</th>
                <th scope="col" style={{ textAlign: 'right' }}>Lượt đọc</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.bookId}>
                  <td>{index + 1}</td>
                  <td>
                    <strong className="book-title">{row.book.title}</strong>
                    <div className="book-author">{row.book.author}</div>
                  </td>
                  <td>
                    <div className="chips">
                      {row.book.categories.slice(0, 2).map((name) => (
                        <span key={name} className="chip">{name}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {Number(row.score).toLocaleString('vi-VN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {skipped > 0 && (
        <p className="muted small">
          {skipped} sách trong bảng xếp hạng không còn trong kho nên không hiển thị.
        </p>
      )}
      {updatedAt && (
        <p className="muted small">
          Cập nhật lúc {updatedAt.toLocaleTimeString('vi-VN')}
        </p>
      )}
    </section>
  )
}