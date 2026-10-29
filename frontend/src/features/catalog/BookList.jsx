import { useEffect, useState } from 'react'
import { apiGet } from '../../shared/api'
import { BookCard } from './BookCard'

const PAGE_SIZE = 12

/** Danh sách số trang rút gọn: 1 2 3 … 6 (0-based vào, null = dấu ba chấm). */
function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  const pages = new Set([0, total - 1, current - 1, current, current + 1])
  const sorted = [...pages].filter((n) => n >= 0 && n < total).sort((a, b) => a - b)
  const out = []
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null)
    out.push(n)
  })
  return out
}

export function BookList({ onSelect, onRead }) {
  const [categories, setCategories] = useState([])
  const [draft, setDraft] = useState('')
  const [filters, setFilters] = useState({ q: '', category: '', page: 0 })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Danh sách thể loại cho ô lọc (tải một lần)
  useEffect(() => {
    apiGet('/books/categories')
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  // Tải danh sách mỗi khi bộ lọc hoặc trang đổi
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ page: filters.page, size: PAGE_SIZE })
    if (filters.q) params.set('q', filters.q)
    if (filters.category) params.set('category', filters.category)

    setLoading(true)
    setError('')
    apiGet(`/books?${params}`)
      .then((data) => { if (active) setResult(data) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters])

  function handleSearch(event) {
    event.preventDefault()
    setFilters((prev) => ({ ...prev, q: draft.trim(), page: 0 }))
  }

  function handleCategory(event) {
    setFilters((prev) => ({ ...prev, category: event.target.value, page: 0 }))
  }

  function clearFilters() {
    setDraft('')
    setFilters({ q: '', category: '', page: 0 })
  }

  const books = result?.content ?? []
  const hasFilter = Boolean(filters.q || filters.category)

  const from = result ? result.page * PAGE_SIZE + 1 : 0
  const to = result ? result.page * PAGE_SIZE + books.length : 0

  return (
    <section>
      <div className="page-head">
        <span className="eyebrow">Kho tài liệu</span>
        <h2>Kho sách</h2>
      </div>

      <div className="toolbar-card">
        <form className="toolbar" onSubmit={handleSearch}>
          <label className="input-icon">
            <span className="icon" aria-hidden="true">search</span>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tìm theo tên sách hoặc tác giả…"
              aria-label="Tìm kiếm sách"
            />
          </label>
          <select value={filters.category} onChange={handleCategory} aria-label="Lọc theo thể loại">
            <option value="">Tất cả thể loại</option>
            {categories.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button type="submit" className="btn primary">
            <span className="icon sm" aria-hidden="true">search</span>
            Tìm
          </button>
          {hasFilter && (
            <button type="button" className="btn" onClick={clearFilters}>Xóa lọc</button>
          )}
          <span className="toolbar-spacer" />
          {result && <span className="count-pill">{result.totalElements} sách</span>}
        </form>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {loading && !result && <p className="muted">Đang tải danh sách sách…</p>}

      {result && (filters.q || filters.category) && (
        <p className="muted result-count">
          Kết quả
          {filters.q && <> khớp “{filters.q}”</>}
          {filters.category && <> trong thể loại “{filters.category}”</>}
        </p>
      )}

      {result && books.length === 0 && !loading && (
        <p className="muted">Không tìm thấy sách phù hợp.</p>
      )}

      <div className={`book-grid ${loading ? 'dimmed' : ''}`}>
        {books.map((book) => (
          <BookCard key={book.id} book={book} onSelect={onSelect} onRead={onRead} />
        ))}
      </div>

      {result && result.totalPages > 0 && (
        <div className="pager-bar">
          <span className="muted small">
            Hiển thị <strong>{from} - {to}</strong> trên <strong>{result.totalElements}</strong> sách
          </span>
          {result.totalPages > 1 && (
            <div className="pager-nav">
              <button
                type="button"
                className="btn ghost small-btn"
                disabled={filters.page === 0 || loading}
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                <span className="icon sm" aria-hidden="true">chevron_left</span>
                Trang trước
              </button>
              {pageNumbers(result.page, result.totalPages).map((n, i) => (
                n === null
                  ? <span key={`gap-${i}`} className="page-gap">…</span>
                  : (
                    <button
                      key={n}
                      type="button"
                      className={n === result.page ? 'page-num active' : 'page-num'}
                      disabled={loading}
                      aria-current={n === result.page ? 'page' : undefined}
                      onClick={() => setFilters((prev) => ({ ...prev, page: n }))}
                    >
                      {n + 1}
                    </button>
                  )
              ))}
              <button
                type="button"
                className="btn ghost small-btn"
                disabled={filters.page + 1 >= result.totalPages || loading}
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                Trang sau
                <span className="icon sm" aria-hidden="true">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}