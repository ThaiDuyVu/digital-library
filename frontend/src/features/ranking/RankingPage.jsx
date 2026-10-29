import { useEffect, useRef, useState } from 'react'
import { BookCard } from '../catalog/BookCard'
import { loadRanking } from './rankingApi'

const AUTO_REFRESH_MS = 10000
const TREND_KEY = 'ranking-trend-v1'

/**
 * Mốc so sánh của cột Xu hướng.
 *
 * Giữ trong sessionStorage chứ không chỉ trong bộ nhớ component: người dùng hay rời tab Thịnh hành
 * để đi đọc sách rồi quay lại, mà mỗi lần rời là component bị hủy. Nếu mốc nằm trong component thì
 * lúc quay lại cột Xu hướng trống trơn, đúng vào lúc đáng lẽ phải thấy sách nhảy hạng.
 *
 * Mốc cũng được giữ nguyên qua các lần tự tải lại, không trôi theo từng 10 giây, nên mũi tên thể hiện
 * thay đổi tích lũy kể từ mốc thay vì nhấp nháy một nhịp rồi biến mất.
 */
function readBaseline(top) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TREND_KEY) ?? 'null')
    if (!saved || saved.top !== top || !saved.ranks) return null
    return { top: saved.top, at: new Date(saved.at), ranks: new Map(Object.entries(saved.ranks)) }
  } catch {
    return null // sessionStorage bị chặn (chế độ riêng tư) hoặc dữ liệu cũ hỏng
  }
}

function writeBaseline(baseline) {
  try {
    sessionStorage.setItem(TREND_KEY, JSON.stringify({
      top: baseline.top,
      at: baseline.at.toISOString(),
      ranks: Object.fromEntries(baseline.ranks),
    }))
  } catch { /* không lưu được thì vẫn còn bản trong bộ nhớ */ }
}

/** Xu hướng so với mốc: undefined = mốc vừa được đặt, chưa có gì để so. */
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

export function RankingPage({ onRead, onDetail }) {
  const [top, setTop] = useState(10)
  const [auto, setAuto] = useState(true)
  const [version, setVersion] = useState(0) // tăng để tải lại
  const [rows, setRows] = useState(null)
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [moves, setMoves] = useState({}) // bookId -> số hạng thay đổi (dương = lên), hoặc 'new'
  const [baselineAt, setBaselineAt] = useState(null) // thời điểm của mốc đang so sánh
  const baseline = useRef(null) // { top, at, ranks: Map(bookId -> vị trí) }

  useEffect(() => {
    let active = true
    loadRanking(top)
      .then((result) => {
        if (!active) return

        const nextRank = new Map(result.rows.map((row, index) => [row.bookId, index]))
        // Đổi Top N thì mốc cũ vô nghĩa: vị trí trong Top 5 không so được với vị trí trong Top 20.
        const current = baseline.current?.top === top ? baseline.current : readBaseline(top)
        if (current) {
          const next = {}
          nextRank.forEach((index, id) => {
            next[id] = current.ranks.has(id) ? current.ranks.get(id) - index : 'new'
          })
          setMoves(next)
          baseline.current = current
          setBaselineAt(current.at)
        } else {
          const fresh = { top, at: new Date(), ranks: nextRank }
          baseline.current = fresh
          writeBaseline(fresh)
          setMoves({})
          setBaselineAt(fresh.at)
        }

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

  /** Lấy thứ hạng hiện tại làm mốc mới: dùng trước khi demo để mũi tên tính từ đúng lúc bắt đầu. */
  function resetBaseline() {
    baseline.current = null
    try { sessionStorage.removeItem(TREND_KEY) } catch { /* không có cũng không sao */ }
    setVersion((v) => v + 1)
  }

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
          <button type="button" className="btn" onClick={resetBaseline} title="Lấy thứ hạng hiện tại làm mốc cho cột Xu hướng">
            <span className="icon sm" aria-hidden="true">flag</span>
            Đặt lại mốc
          </button>
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
            <div className="rank-list-head">
              <span>Top {rows.length} theo lượt đọc</span>
              {baselineAt && (
                <span>Xu hướng so với mốc {baselineAt.toLocaleTimeString('vi-VN')}</span>
              )}
            </div>
            <ol className="rank-list">
              {rows.map((row, index) => (
                <li key={row.bookId}>
                  <BookCard
                    horizontal
                    book={row.book}
                    onSelect={onDetail}
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
                          {Number(row.score).toLocaleString('vi-VN')} lượt đọc
                        </span>
                        <TrendBadge move={moves[row.bookId]} />
                      </span>
                    )}
                  />
                </li>
              ))}
            </ol>
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