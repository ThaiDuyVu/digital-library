import { useEffect, useRef, useState } from 'react'
import { BookCard } from '../catalog/BookCard'
import { loadRanking } from './rankingApi'

function MoveBadge({ move }) {
  if (move === 'new') return <span className="move move-new">mới</span>
  if (typeof move === 'number' && move > 0) return <span className="move move-up">▲ {move}</span>
  if (typeof move === 'number' && move < 0) return <span className="move move-down">▼ {-move}</span>
  return null
}

/**
 * Widget Top sách thịnh hành (Redis ZSET `ranking:books`).
 * Props:
 *  - top: số sách hiển thị (mặc định 5)
 *  - intervalMs: chu kỳ cập nhật (mặc định 10 giây, tạm dừng khi tab bị ẩn)
 *  - currentBookId: sách đang đọc, được làm nổi bật nếu có trong Top
 *  - onSelect, onRead: mở chi tiết / mở để đọc, giống thẻ ở trang Thịnh hành
 */
export function TopBooksWidget({ top = 5, intervalMs = 10000, currentBookId = '', onSelect, onRead }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [moves, setMoves] = useState({}) // bookId -> số hạng thay đổi (dương = lên), hoặc 'new'
  const prevRank = useRef(null)

  useEffect(() => {
    let active = true
    prevRank.current = null

    async function refresh() {
      try {
        const result = await loadRanking(top)
        if (!active) return

        const nextRank = new Map(result.rows.map((row, index) => [row.bookId, index]))
        const prev = prevRank.current
        if (prev) {
          const next = {}
          nextRank.forEach((index, id) => {
            next[id] = prev.has(id) ? prev.get(id) - index : 'new'
          })
          setMoves(next)
        }
        prevRank.current = nextRank

        setRows(result.rows)
        setError('')
      } catch (err) {
        if (active) setError(err.message)
      }
    }

    refresh()
    const timer = setInterval(() => {
      if (!document.hidden) refresh()
    }, intervalMs)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [top, intervalMs])

  return (
    <aside className="top-widget" aria-label="Top sách thịnh hành">
      <div className="top-widget-head">
        <h4>
          <span className="icon" aria-hidden="true">trending_up</span>
          Top thịnh hành
        </h4>
        <span className="live-pill">Real-time</span>
      </div>
      <p className="top-widget-note">
        Xếp hạng theo lượt mở chương, lấy từ Redis Sorted Set và tự cập nhật định kỳ.
      </p>

      {error && <p className="error-text small" role="alert">{error}</p>}
      {!rows && !error && <p className="muted small">Đang tải…</p>}
      {rows && rows.length === 0 && !error && (
        <p className="muted small">Chưa có lượt đọc nào.</p>
      )}

      {rows && rows.length > 0 && (
        <ol className="top-list">
          {rows.map((row, index) => {
            const isCurrent = row.bookId === currentBookId
            return (
              <li key={row.bookId}>
                <BookCard
                  horizontal
                  compact
                  className={isCurrent ? 'current' : ''}
                  book={row.book}
                  onSelect={onSelect}
                  onRead={onRead}
                  lead={(
                    <span className={index < 3 ? `rank-no r${index + 1}` : 'rank-no'} aria-label={`Hạng ${index + 1}`}>
                      {index + 1}
                    </span>
                  )}
                  meta={(
                    <span className="rank-meta">
                      <span className="rank-score">
                        <span className="icon sm" aria-hidden="true">visibility</span>
                        {Number(row.score).toLocaleString('vi-VN')}
                      </span>
                      <MoveBadge move={moves[row.bookId]} />
                      {isCurrent && <span className="top-reading-tag">Đang đọc</span>}
                    </span>
                  )}
                />
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}