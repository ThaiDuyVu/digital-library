import { useState } from 'react'

// Bảng màu bìa theo DESIGN.md (Navy, Burgundy, Forest, Plum, Ochre...)
const COVER_COLORS = [
  '#1f7a5c', '#1e3a5f', '#8c3a27', '#135d66', '#7a3410', '#4c1d95',
  '#334155', '#365314', '#312e81', '#881337', '#5c1d24', '#432344', '#6d501b', '#1f4a38',
]

/** Cùng một sách luôn ra cùng một màu (băm từ id hoặc tên). */
function colorFor(book) {
  const seed = String(book.id ?? book.title ?? '')
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return COVER_COLORS[hash % COVER_COLORS.length]
}

/** Chọn icon theo thể loại đầu tiên; không khớp thì dùng icon sách mặc định. */
function iconFor(book) {
  const name = (book.categories?.[0] ?? '').toLowerCase()
  if (name.includes('văn')) return 'menu_book'
  if (name.includes('trinh')) return 'travel_explore'
  if (name.includes('kinh')) return 'trending_up'
  if (name.includes('tâm')) return 'psychology'
  if (name.includes('lịch')) return 'history_edu'
  if (name.includes('công nghệ') || name.includes('nosql') || name.includes('khoa')) return 'memory'
  return 'auto_stories'
}

const initialOf = (book) => (book.title ?? '?').trim().charAt(0).toUpperCase()

/** Bìa lớn: ảnh nếu có coverUrl và tải được, ngược lại là bìa chữ kiểu bìa cứng. */
export function BookCover({ book, className = '' }) {
  const [failed, setFailed] = useState(false)

  if (book.coverUrl && !failed) {
    return (
      <div className={`cover has-image ${className}`} style={{ '--cover': colorFor(book) }}>
        <img src={book.coverUrl} alt={`Bìa sách ${book.title}`} loading="lazy" onError={() => setFailed(true)} />
      </div>
    )
  }

  return (
    <div className={`cover ${className}`} style={{ '--cover': colorFor(book) }} aria-hidden="true">
      <div className="cover-top">
        <span className="cover-letter">{initialOf(book)}</span>
        <span className="icon">{iconFor(book)}</span>
      </div>
      <div className="cover-bottom">
        <p className="cover-title">{book.title}</p>
        <p className="cover-author">{book.author}</p>
      </div>
    </div>
  )
}

/** Bìa nhỏ dùng trong bảng xếp hạng. */
export function MiniCover({ book }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="cover-mini" style={{ '--cover': colorFor(book) }} aria-hidden="true">
      {book.coverUrl && !failed
        ? <img src={book.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        : initialOf(book)}
    </span>
  )
}