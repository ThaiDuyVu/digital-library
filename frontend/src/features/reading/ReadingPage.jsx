import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiGet, apiPost, apiPut } from '../../shared/api'
import { useAuth } from '../../shared/auth-context'
import { useSaveOnExit } from './useSaveOnExit'
import { TopBooksWidget } from '../ranking/TopBooksWidget'

// Số ký tự tối đa mỗi trang. Backend chưa giới hạn page nên phân trang hoàn toàn ở client.
const PAGE_CHARS = 1600

// Cỡ chữ vùng đọc (px) – chỉ ảnh hưởng hiển thị, không đổi cách chia trang
const MIN_FONT = 15
const MAX_FONT = 24
const DEFAULT_FONT = 18

/** Cắt đoạn quá dài thành nhiều đoạn, ưu tiên cắt ở cuối câu, sau đó ở khoảng trắng. */
function splitLong(text, limit) {
  const chunks = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('. ', limit)
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit)
    if (cut < limit * 0.5) cut = limit
    chunks.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

/** Chia một chương (content + sections) thành các trang; mỗi trang là mảng khối {kind, text}. */
function paginate(chapter) {
  const blocks = []
  const pushText = (text) => {
    for (const part of String(text ?? '').split(/\n+/)) {
      const trimmed = part.trim()
      if (trimmed) {
        splitLong(trimmed, PAGE_CHARS).forEach((chunk) => blocks.push({ kind: 'p', text: chunk }))
      }
    }
  }
  pushText(chapter.content)
  for (const section of chapter.sections ?? []) {
    if (section.heading) blocks.push({ kind: 'h', text: section.heading })
    pushText(section.text)
  }

  const pages = []
  let current = []
  let used = 0
  for (const block of blocks) {
    const size = block.text.length
    if (current.length > 0 && used + size > PAGE_CHARS) {
      // Không để tiêu đề mục nằm cuối trang một mình: chuyển nó sang trang sau
      const orphan = current[current.length - 1].kind === 'h' ? current.pop() : null
      pages.push(current)
      current = orphan ? [orphan] : []
      used = orphan ? orphan.text.length : 0
    }
    current.push(block)
    used += size
  }
  if (current.length > 0) pages.push(current)
  return pages.length > 0 ? pages : [[]]
}

export function ReadingPage() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id

  // Danh sách sách để chọn
  const [query, setQuery] = useState('')
  const [books, setBooks] = useState([])
  const [listError, setListError] = useState('')

  // Sách đang đọc và vị trí
  const [bookId, setBookId] = useState('')
  const [book, setBook] = useState(null)
  const [pos, setPos] = useState(null) // { chapterNo, page }
  const [resumeNote, setResumeNote] = useState('')
  const [bookError, setBookError] = useState('')
  const [chapter, setChapter] = useState(null)
  const [chapterError, setChapterError] = useState('')
  const [saveState, setSaveState] = useState('') // '' | 'saving' | 'saved' | 'error'
  const [fontSize, setFontSize] = useState(DEFAULT_FONT)

  const countedRef = useRef(null) // "bookId:chapterNo" đã gọi /read, tránh tăng lặp khi render lại
  const saveSeq = useRef(0)
  const articleRef = useRef(null)

  const { markSaved } = useSaveOnExit({ userId, bookId, pos })

  // 1. Tải danh sách sách (tối đa 100 theo giới hạn của API), tìm kiếm theo từ khóa
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (!userId) return undefined
    let active = true
    const params = new URLSearchParams({ page: 0, size: 100 })
    if (search) params.set('q', search)
    apiGet(`/books?${params}`)
      .then((data) => { if (active) { setBooks(data.content); setListError('') } })
      .catch((err) => { if (active) setListError(err.message) })
    return () => { active = false }
  }, [userId, search])

  // 2. Chọn sách: tải mục lục và tiến trình đã lưu (GET progress, 404 = chưa đọc bao giờ)
  useEffect(() => {
    countedRef.current = null
    setBook(null)
    setChapter(null)
    setPos(null)
    setResumeNote('')
    setBookError('')
    setChapterError('')
    setSaveState('')
    if (!bookId || !userId) return undefined

    let active = true
    Promise.all([
      apiGet(`/books/${bookId}`),
      apiGet(`/progress/${userId}/${bookId}`).catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }),
    ])
      .then(([detail, saved]) => {
        if (!active) return
        setBook(detail)
        const first = detail.chapters[0]?.chapterNo
        if (first == null) {
          setBookError('Sách này chưa có chương nào.')
          return
        }
        // Chương đã lưu có thể đã bị xóa: khi đó mở lại từ đầu
        const canResume = saved && detail.chapters.some((c) => c.chapterNo === saved.chapter)
        const start = canResume
          ? { chapterNo: saved.chapter, page: saved.page }
          : { chapterNo: first, page: 1 }
        setPos(start)
        markSaved(start.chapterNo, start.page) // vị trí vừa mở chưa đổi, không cần lưu lại khi thoát
        if (canResume) setResumeNote(`Tiếp tục từ chương ${saved.chapter}, trang ${saved.page}.`)
      })
      .catch((err) => { if (active) setBookError(err.message) })
    return () => { active = false }
  }, [bookId, userId, markSaved])

  // 3. Mở chương: tải nội dung và tăng lượt đọc đúng một lần cho mỗi lần mở chương
  const chapterNo = pos?.chapterNo
  useEffect(() => {
    setChapter(null)
    setChapterError('')
    if (!bookId || chapterNo == null) return undefined

    let active = true
    apiGet(`/books/${bookId}/chapters/${chapterNo}`)
      .then((data) => {
        if (!active) return
        setChapter(data)
        const key = `${bookId}:${chapterNo}`
        if (countedRef.current !== key) {
          countedRef.current = key
          apiPost(`/books/${bookId}/read?chapterNo=${chapterNo}`).catch(() => {}) // lỗi đếm lượt không chặn việc đọc
        }
      })
      .catch((err) => { if (active) setChapterError(err.message) })
    return () => { active = false }
  }, [bookId, chapterNo])

  const pages = useMemo(() => (chapter ? paginate(chapter) : null), [chapter])
  const totalPages = pages?.length ?? 1
  const page = pos ? Math.min(Math.max(pos.page, 1), totalPages) : 1

  // 4. Lật trang hoặc đổi chương: cập nhật vị trí và lưu lên Redis (PUT progress)
  function go(nextChapter, nextPage) {
    setPos({ chapterNo: nextChapter, page: nextPage })
    setResumeNote('')
    articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    const seq = ++saveSeq.current
    setSaveState('saving')
    apiPut(`/progress/${userId}/${bookId}`, { chapter: nextChapter, page: nextPage, line: 0 })
      .then(() => {
        markSaved(nextChapter, nextPage)
        if (seq === saveSeq.current) setSaveState('saved')
      })
      .catch(() => { if (seq === saveSeq.current) setSaveState('error') })
  }

  function handleSearch(event) {
    event.preventDefault()
    setSearch(query.trim())
  }

  if (authLoading) {
    return <section className="panel"><p className="muted">Đang kiểm tra phiên đăng nhập…</p></section>
  }
  if (!user) {
    return (
      <section className="panel reader-empty">
        <span className="icon" aria-hidden="true">lock</span>
        <h2>Đọc sách</h2>
        <p>Đăng nhập ở tab Tài khoản để đọc sách và lưu vị trí đang đọc.</p>
      </section>
    )
  }

  const chapters = book?.chapters ?? []
  const chapterIndex = chapters.findIndex((c) => c.chapterNo === chapterNo)
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null
  const nextChapter = chapterIndex >= 0 ? chapters[chapterIndex + 1] ?? null : null

  return (
    <section>
      <div className="page-head">
        <span className="eyebrow">E-Reader</span>
        <h2>Đọc sách</h2>
      </div>

      <div className="reader-layout">
        <div className="reader-main">
          <div className="toolbar-card" style={{ marginBottom: 0 }}>
            <form className="reader-controls" onSubmit={handleSearch}>
              <div className="reader-search">
                <label className="input-icon">
                  <span className="icon" aria-hidden="true">search</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tìm theo tên sách hoặc tác giả…"
                    aria-label="Tìm sách để đọc"
                  />
                </label>
                <button type="submit" className="btn">Tìm</button>
              </div>
              <select
                className="select"
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                aria-label="Chọn sách"
              >
                <option value="">Chọn sách để đọc…</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>{b.title} – {b.author}</option>
                ))}
              </select>
            </form>

            {book && pos && (
              <div className="reader-controls" style={{ marginTop: 10 }}>
                <select
                  className="select"
                  value={pos.chapterNo}
                  onChange={(e) => go(Number(e.target.value), 1)}
                  aria-label="Chọn chương"
                >
                  {chapters.map((c) => (
                    <option key={c.chapterNo} value={c.chapterNo}>
                      Chương {c.chapterNo}: {c.title}
                    </option>
                  ))}
                </select>
                <div className="size-group" role="group" aria-label="Cỡ chữ">
                  <button
                    type="button"
                    aria-label="Giảm cỡ chữ"
                    disabled={fontSize <= MIN_FONT}
                    onClick={() => setFontSize((size) => Math.max(MIN_FONT, size - 1))}
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    aria-label="Tăng cỡ chữ"
                    disabled={fontSize >= MAX_FONT}
                    onClick={() => setFontSize((size) => Math.min(MAX_FONT, size + 1))}
                  >
                    A+
                  </button>
                </div>
              </div>
            )}
          </div>

          {listError && <p className="error-text" role="alert" style={{ margin: 0 }}>{listError}</p>}
          {bookError && <p className="error-text" role="alert" style={{ margin: 0 }}>{bookError}</p>}

          {resumeNote && (
            <div className="resume-bar" role="status">
              <span className="icon" aria-hidden="true">check_circle</span>
              {resumeNote}
            </div>
          )}

          <div ref={articleRef} className="reader-card" style={{ scrollMarginTop: 150 }}>
            {!bookId && !listError && (
              <div className="reader-empty">
                <span className="icon" aria-hidden="true">menu_book</span>
                <p className="muted">
                  Chọn một cuốn sách. Nếu bạn đã đọc dở, trang sẽ mở lại đúng vị trí đã lưu.
                </p>
              </div>
            )}
            {bookId && !book && !bookError && <p className="muted">Đang tải sách…</p>}

            {book && pos && (
              <>
                <div className="reader-head">
                  {book.categories[0] && <span className="tag">{book.categories[0]}</span>}
                  <h3 className="reader-book-title">{book.title}</h3>
                  <p className="reader-meta">
                    <span>Tác giả: <strong>{book.author}</strong></span>
                    {book.categories.length > 0 && <span>Thể loại: {book.categories.join(', ')}</span>}
                  </p>
                </div>

                {chapterError && <p className="error-text" role="alert">{chapterError}</p>}
                {!chapter && !chapterError && <p className="muted">Đang tải chương…</p>}

                {chapter && pages && (
                  <>
                    <div className="reader-chapter-banner">
                      <span>Chương {chapter.chapterNo}: {chapter.title}</span>
                      <span>Trang {page} / {totalPages}</span>
                    </div>

                    <article className="reader-text" style={{ '--reader-size': `${fontSize}px` }}>
                      {pages[page - 1].map((block, index) => (
                        block.kind === 'h'
                          ? <h4 key={index}>{block.text}</h4>
                          : <p key={index}>{block.text}</p>
                      ))}
                    </article>

                    <div className="reader-foot">
                      <div className="reader-pager">
                        <button
                          type="button"
                          className="btn"
                          disabled={page <= 1}
                          onClick={() => go(pos.chapterNo, page - 1)}
                        >
                          <span className="icon sm" aria-hidden="true">arrow_back</span>
                          Trang trước
                        </button>
                        <span className="page-indicator">
                          <span className="icon sm" aria-hidden="true">auto_stories</span>
                          Trang {page} / {totalPages}
                        </span>
                        <button
                          type="button"
                          className="btn"
                          disabled={page >= totalPages}
                          onClick={() => go(pos.chapterNo, page + 1)}
                        >
                          Trang sau
                          <span className="icon sm" aria-hidden="true">arrow_forward</span>
                        </button>
                      </div>

                      <div className="chapter-jump">
                        <button
                          type="button"
                          className="btn ghost small-btn"
                          disabled={!prevChapter}
                          onClick={() => go(prevChapter.chapterNo, 1)}
                        >
                          <span className="icon sm" aria-hidden="true">chevron_left</span>
                          Chương trước
                        </button>
                        <button
                          type="button"
                          className={page >= totalPages && nextChapter ? 'btn primary small-btn' : 'btn ghost small-btn'}
                          disabled={!nextChapter}
                          onClick={() => go(nextChapter.chapterNo, 1)}
                        >
                          Chương sau
                          <span className="icon sm" aria-hidden="true">chevron_right</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <p className={saveState === 'error' ? 'save-status error' : 'save-status'} role="status">
                  {saveState === 'saving' && 'Đang lưu vị trí đọc…'}
                  {saveState === 'saved' && (
                    <>
                      <span className="icon sm" aria-hidden="true">cloud_done</span>
                      Đã lưu vị trí đọc vào Redis.
                    </>
                  )}
                  {saveState === 'error' && 'Chưa lưu được vị trí đọc. Kiểm tra kết nối rồi lật trang lại.'}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="reader-side">
          <TopBooksWidget top={5} intervalMs={5000} currentBookId={bookId} />
        </div>
      </div>
    </section>
  )
}