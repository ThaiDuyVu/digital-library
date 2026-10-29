import { useEffect, useState } from 'react'
import { apiGet } from '../../shared/api'
import { BookCard } from './BookCard'

const LIMIT = 20    // tổng số sách liên quan lấy về
const PER_VIEW = 5  // số thẻ hiển thị mỗi lượt; mũi tên trái/phải để xem lượt khác

/**
 * Sách cùng thể loại với cuốn đang xem; lấy theo tối đa hai thể loại đầu, bỏ chính cuốn đó.
 * Hiển thị PER_VIEW thẻ mỗi lượt, lật bằng hai nút mũi tên bên dưới.
 */
export function RelatedBooks({ book, onSelect, onRead }) {
  const [books, setBooks] = useState(null)
  const [view, setView] = useState(0) // lượt đang xem, 0-based

  const categories = book.categories.slice(0, 2)
  const categoryKey = categories.join('|')

  useEffect(() => {
    let active = true
    const names = categoryKey ? categoryKey.split('|') : []
    Promise.all(names.map((name) => {
      const params = new URLSearchParams({ category: name, page: 0, size: LIMIT + 1 })
      return apiGet(`/books?${params}`).then((data) => data.content).catch(() => [])
    }))
      .then((lists) => {
        if (!active) return
        const seen = new Set([book.id])
        const merged = []
        lists.flat().forEach((item) => {
          if (seen.has(item.id)) return
          seen.add(item.id)
          merged.push(item)
        })
        setBooks(merged.slice(0, LIMIT))
        setView(0)
      })
    return () => { active = false }
  }, [book.id, categoryKey])

  if (!books || books.length === 0) return null

  const views = Math.ceil(books.length / PER_VIEW)
  const shown = books.slice(view * PER_VIEW, (view + 1) * PER_VIEW)

  return (
    <section className="related">
      <div className="related-head">
        <h3>Sách liên quan</h3>
        <span className="muted small">Cùng thể loại {categories.join(', ')}</span>
      </div>
      <div key={view} className="book-grid related-grid">
        {shown.map((item) => (
          <BookCard key={item.id} book={item} onSelect={onSelect} onRead={onRead} />
        ))}
      </div>
      {views > 1 && (
        <div className="related-nav">
          <button
            type="button"
            className="related-arrow"
            disabled={view === 0}
            onClick={() => setView((v) => v - 1)}
            aria-label="Xem các sách liên quan trước"
          >
            <span className="icon" aria-hidden="true">chevron_left</span>
          </button>
          <span className="related-count" aria-live="polite">{view + 1} / {views}</span>
          <button
            type="button"
            className="related-arrow"
            disabled={view >= views - 1}
            onClick={() => setView((v) => v + 1)}
            aria-label="Xem thêm sách liên quan"
          >
            <span className="icon" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      )}
    </section>
  )
}
