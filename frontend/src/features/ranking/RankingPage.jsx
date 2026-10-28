import { useEffect, useRef, useState } from 'react'
import { MiniCover } from '../catalog/BookCover'
import { loadRanking } from './rankingApi'

const AUTO_REFRESH_MS = 10000

/** Xu hướng so với lần tải trước: undefined = chưa có dữ liệu so sánh. */
function TrendBadge({ move }) {
  if (move === 'new') return <span className="move move-new">Mới</span>
  if (typeof move !== 'number') return <span className="muted">—</span>
  if (move > 0) return <span className="move move-up">▲ {move} hạng</span>
  if (move < 0) return <span className="move move-down">▼ {-move} hạng</span>
  return <span className="move move-same">— Giữ hạng</span>
}

/** Thể loại có tổng lượt đọc cao nhất trong các sách đang hiển thị. */
function leadingGenre(rows) {
  const totals = new Map()
  rows.forEach((row) => {
    row.book.categories.forEach((name) => {
      totals.set(name, (totals.get(name) ?? 0) + Number(row.score))
    })
  })
  let best = null
  totals.forEach((sum, name) => {
    if (!best || sum > best.sum) best = { name, sum }
  })
  return best?.name ?? '—'
}

export function RankingPage() {
  const [top, setTop] = useState(10)
  const [auto, setAuto] = useState(true)
  const [version, setVersion] = useState(0) // tăng để tải lại
  const [rows, setRows] = useState(null)
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [moves, setMoves] = useState({}) // bookId -> số hạng thay đổi (dương = lên), hoặc 'new'
  const prevRank = useRef(null) // { top, ranks: Map(bookId -> vị trí) } của lần tải trước

  useEffect(() => {
    let active = true
    loadRanking(top)
      .then((result) => {
        if (!active) return

        const nextRank = new Map(result.rows.map((row, index) => [row.bookId, index]))
        const prev = prevRank.current
        if (prev && prev.top === top) {
          const next = {}
          nextRank.forEach((index, id) => {
            next[id] = prev.ranks.has(id) ? prev.ranks.get(id) - index : 'new'
          })
          setMoves(next)
        } else {
          setMoves({}) // đổi Top N hoặc lần đầu: chưa có gì để so sánh
        }
        prevRank.current = { top, ranks: nextRank }

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

  const hasRows = rows && rows.length > 0
  const totalScore = hasRows ? rows.reduce((sum, row) => sum + Number(row.score), 0) : 0

  return (
    <section>
      <div className="page-head page-head-row">
        <div>
          <span className="eyebrow">
            <span className="icon sm" aria-hidden="true">bolt</span>
            {' '}Hệ thống xếp hạng thời gian thực
          </span>
          <h2>Sách thịnh hành</h2>
          <p>Bảng xếp hạng lượt đọc lấy từ Redis Sorted Set (<code>ranking:books</code>).</p>
        </div>

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
          <label className="auto-label">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Tự cập nhật mỗi {AUTO_REFRESH_MS / 1000} giây
          </label>
          <button type="button" className="btn primary" onClick={() => setVersion((v) => v + 1)}>
            <span className="icon sm" aria-hidden="true">refresh</span>
            Tải lại
          </button>
        </div>
      </div>

      {updatedAt && (
        <p className="muted small" style={{ margin: '0 0 16px' }}>
          Cập nhật lúc {updatedAt.toLocaleTimeString('vi-VN')}
        </p>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}
      {!rows && !error && <p className="muted">Đang tải bảng xếp hạng…</p>}

      {rows && rows.length === 0 && !error && (
        <p className="muted">
          Chưa có lượt đọc nào. Mở một chương ở tab Đọc sách để sách lên bảng xếp hạng.
        </p>
      )}

      {hasRows && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div>
                <span className="stat-label">Tổng lượt đọc (Top {rows.length})</span>
                <span className="stat-value">{totalScore.toLocaleString('vi-VN')}</span>
              </div>
              <span className="stat-icon"><span className="icon" aria-hidden="true">auto_stories</span></span>
            </div>
            <div className="stat-card">
              <div>
                <span className="stat-label">Thể loại dẫn đầu</span>
                <span className="stat-value">{leadingGenre(rows)}</span>
              </div>
              <span className="stat-icon gold"><span className="icon" aria-hidden="true">local_fire_department</span></span>
            </div>
            <div className="stat-card">
              <div>
                <span className="stat-label">Sách dẫn đầu</span>
                <span className="stat-value">{rows[0].book.title}</span>
              </div>
              <span className="stat-icon"><span className="icon" aria-hidden="true">emoji_events</span></span>
            </div>
          </div>

          <div className="rank-card">
            <div className="table-wrap">
              <table className="rank-table">
                <thead>
                  <tr>
                    <th scope="col">Hạng</th>
                    <th scope="col">Sách</th>
                    <th scope="col" className="col-genre">Thể loại</th>
                    <th scope="col" className="col-trend">Xu hướng</th>
                    <th scope="col" className="num">Lượt đọc</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.bookId}>
                      <td>
                        <span className={index < 3 ? `rank-no r${index + 1}` : 'rank-no'}>{index + 1}</span>
                      </td>
                      <td>
                        <div className="rank-book">
                          <MiniCover book={row.book} />
                          <div>
                            <strong className="book-title">{row.book.title}</strong>
                            <div className="book-author">{row.book.author}</div>
                          </div>
                        </div>
                      </td>
                      <td className="col-genre">
                        <div className="chips">
                          {row.book.categories.slice(0, 2).map((name) => (
                            <span key={name} className="chip">{name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="col-trend">
                        <TrendBadge move={moves[row.bookId]} />
                      </td>
                      <td className="num">{Number(row.score).toLocaleString('vi-VN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rank-foot">
              <span>
                <span className="icon sm" aria-hidden="true">check_circle</span>
                Đang hiển thị {rows.length} sách có lượt đọc cao nhất
              </span>
              <span>Nguồn: Redis ZSET <code>ranking:books</code></span>
            </div>
          </div>
        </>
      )}

      {skipped > 0 && (
        <p className="muted small">
          {skipped} sách trong bảng xếp hạng không còn trong kho nên không hiển thị.
        </p>
      )}
    </section>
  )
}