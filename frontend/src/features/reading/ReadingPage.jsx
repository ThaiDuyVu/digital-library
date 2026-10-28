import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiGet, apiPost, apiPut } from '../../shared/api'
import { useAuth } from '../../shared/auth-context'
import { useSaveOnExit } from './useSaveOnExit'
import { TopBooksWidget } from '../ranking/TopBooksWidget'

// Số ký tự tối đa mỗi trang. Backend không giới hạn page vì cách chia trang thuộc frontend.
const PAGE_CHARS = 1600

// Cỡ chữ vùng đọc (px) – chỉ ảnh hưởng hiển thị, không đổi cách chia trang
const MIN_FONT = 15
const MAX_FONT = 24
const DEFAULT_FONT = 18

// Chừa chỗ cho thanh điều hướng dính trên khi tính dòng đang đọc
const STICKY_OFFSET = 160

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
function paginateChapter(chapter) {
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

/**
 * Đánh số trang liên tục trên TOÀN CUỐN sách, không phải trong từng chương.
 *
 * Kịch bản demo yêu cầu đọc tới "Trang 30"; chương dài nhất trong kho chỉ khoảng 7 trang nên
 * đánh số theo chương thì không bao giờ tới được mốc đó. Tính cả cuốn thì trung bình mỗi sách
 * có khoảng 37 trang. Mỗi chương vẫn bắt đầu ở một trang mới.
 */
function paginateBook(chapters) {
  const pages = []
  for (const chapter of chapters) {
    for (const blocks of paginateChapter(chapter)) {
      pages.push({ chapterNo: chapter.chapterNo, chapterTitle: chapter.title, blocks })
    }
  }
  return pages
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
  const [pos, setPos] = useState(null) // { page, line } – page tính trên cả cuốn
  const [resumeNote, setResumeNote] = useState('')
  const [bookError, setBookError] = useState('')
  const [saveState, setSaveState] = useState('') // '' | 'saving' | 'saved' | 'error'
  const [fontSize, setFontSize] = useState(DEFAULT_FONT)

  const countedRef = useRef(null)   // "bookId:chapterNo" đã gọi /read, tránh tăng lặp khi render lại
  const inFlight = useRef(false)    // đang có một PUT tiến trình chạy
  const pendingSave = useRef(null)  // vị trí mới nhất còn chờ gửi
  const articleRef = useRef(null)
  const textRef = useRef(null)      // vùng văn bản, dùng để quy đổi vị trí cuộn ra số dòng
  const pendingLine = useRef(null)  // dòng cần cuộn tới sau khi khôi phục vị trí

  /** Chiều cao một dòng văn bản đang hiển thị, để quy đổi giữa pixel và số dòng. */
  const lineHeight = useCallback(() => {
    const article = textRef.current
    const measured = article ? parseFloat(getComputedStyle(article).lineHeight) : NaN
    return Number.isFinite(measured) && measured > 0 ? measured : fontSize * 1.6
  }, [fontSize])

  const pages = useMemo(() => (book ? paginateBook(book.chapters) : null), [book])
  const totalPages = pages?.length ?? 0
  const page = pos && totalPages > 0 ? Math.min(Math.max(pos.page, 1), totalPages) : 1
  const currentPage = pages?.[page - 1] ?? null
  const chapterNo = currentPage?.chapterNo ?? null

  const { markSaved } = useSaveOnExit({ userId, bookId, pos, chapterNo })

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

  // 2. Chọn sách: tải TOÀN VĂN cả cuốn (cần để đánh số trang liên tục) và tiến trình đã lưu
  useEffect(() => {
    countedRef.current = null
    pendingLine.current = null
    setBook(null)
    setPos(null)
    setResumeNote('')
    setBookError('')
    setSaveState('')
    if (!bookId || !userId) return undefined

    let active = true
    Promise.all([
      apiGet(`/books/${bookId}/content`),
      apiGet(`/progress/${userId}/${bookId}`).catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }),
    ])
      .then(([content, saved]) => {
        if (!active) return
        const total = paginateBook(content.chapters).length
        if (total === 0) {
          setBook(content)
          setBookError('Sách này chưa có nội dung để đọc.')
          return
        }
        setBook(content)

        if (!saved) {
          setPos({ page: 1, line: 0 })
          markSaved(1, 0)
          return
        }
        // Trang đã lưu có thể vượt số trang hiện có nếu sách bị sửa ngắn lại: kéo về trang cuối.
        const wanted = Number(saved.page) || 1
        const start = Math.min(Math.max(wanted, 1), total)
        const line = Math.max(Number(saved.line) || 0, 0)
        setPos({ page: start, line })
        pendingLine.current = line
        if (start === wanted) {
          markSaved(start, line)
          setResumeNote(`Tiếp tục từ trang ${start}${line > 0 ? `, dòng ${line + 1}` : ''}.`)
        } else {
          // Ghi lại ngay để Redis thôi giữ số trang không còn tồn tại
          setResumeNote(`Vị trí đã lưu (trang ${wanted}) không còn trong sách này; mở lại ở trang ${start}.`)
        }
      })
      .catch((err) => { if (active) setBookError(err.message) })
    return () => { active = false }
  }, [bookId, userId, markSaved])

  /**
   * Lưu vị trí lên Redis. Dùng chung cho lật trang, đổi chương và tự chữa vị trí quá hạn.
   *
   * Chỉ cho một PUT chạy mỗi lúc: lật trang nhanh sinh nhiều request song song và chúng không
   * về đích theo thứ tự gửi, nên vị trí cũ có thể ghi đè vị trí mới trong Redis. Vị trí nào tới
   * trong lúc đang gửi thì xếp hàng, chỉ giữ cái mới nhất.
   */
  const save = useCallback(async (nextPage, nextLine, nextChapterNo) => {
    if (!userId || !bookId || nextChapterNo == null) return
    pendingSave.current = { chapter: nextChapterNo, page: nextPage, line: nextLine }
    if (inFlight.current) return
    inFlight.current = true
    setSaveState('saving')
    try {
      while (pendingSave.current) {
        const body = pendingSave.current
        pendingSave.current = null
        await apiPut(`/progress/${userId}/${bookId}`, body)
        markSaved(body.page, body.line)
      }
      setSaveState('saved')
    } catch {
      pendingSave.current = null
      setSaveState('error')
    } finally {
      inFlight.current = false
    }
  }, [userId, bookId, markSaved])

  // 3. Vị trí đã lưu vượt số trang có thật: ghi lại vị trí đã kéo về để lần sau mở đúng
  useEffect(() => {
    if (!pos || !chapterNo || totalPages === 0) return
    if (pos.page >= 1 && pos.page <= totalPages) return
    save(page, pos.line, chapterNo)
    setPos({ page, line: pos.line })
  }, [pos, page, chapterNo, totalPages, save])

  // 4. Mở chương mới: tăng lượt đọc đúng một lần cho mỗi lần mở chương
  useEffect(() => {
    if (!bookId || chapterNo == null) return
    const key = `${bookId}:${chapterNo}`
    if (countedRef.current === key) return
    countedRef.current = key
    apiPost(`/books/${bookId}/read?chapterNo=${chapterNo}`).catch(() => {}) // lỗi đếm lượt không chặn việc đọc
  }, [bookId, chapterNo])

  // 5. Sau khi trang đã render, cuộn tới đúng dòng đã lưu (một lần cho mỗi lần khôi phục)
  useEffect(() => {
    if (pendingLine.current == null || !currentPage) return
    const line = pendingLine.current
    pendingLine.current = null
    if (line <= 0) return // dòng đầu trang thì giữ nguyên đầu trang
    // Đợi trình duyệt dựng xong layout mới đo được vị trí dòng
    const frame = requestAnimationFrame(() => {
      const article = textRef.current
      if (!article) return
      window.scrollTo({ top: window.scrollY + article.getBoundingClientRect().top + line * lineHeight() - STICKY_OFFSET })
    })
    return () => cancelAnimationFrame(frame)
  }, [currentPage, lineHeight])

  // 6. Theo dõi dòng đang đọc: số dòng văn bản đã trôi qua mép trên vùng đọc
  useEffect(() => {
    if (!currentPage) return undefined
    function onScroll() {
      const article = textRef.current
      if (!article) return
      const passed = STICKY_OFFSET - article.getBoundingClientRect().top
      const line = Math.max(0, Math.round(passed / lineHeight()))
      setPos((prev) => (prev && prev.line !== line ? { ...prev, line } : prev))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [currentPage, lineHeight])

  /** Chuyển tới một trang bất kỳ của cuốn sách và lưu vị trí. */
  function go(nextPage) {
    if (!pages || nextPage < 1 || nextPage > totalPages) return
    pendingLine.current = null
    setPos({ page: nextPage, line: 0 })
    setResumeNote('')
    articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    save(nextPage, 0, pages[nextPage - 1].chapterNo)
  }

  /** Trang đầu tiên của một chương trong cách đánh số liên tục. */
  function firstPageOf(targetChapterNo) {
    const index = pages?.findIndex((p) => p.chapterNo === targetChapterNo) ?? -1
    return index < 0 ? null : index + 1
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

            {book && pos && chapterNo != null && (
              <div className="reader-controls" style={{ marginTop: 10 }}>
                <select
                  className="select"
                  value={chapterNo}
                  onChange={(e) => {
                    const target = firstPageOf(Number(e.target.value))
                    if (target) go(target)
                  }}
                  aria-label="Chọn chương"
                >
                  {chapters.map((c) => (
                    <option key={c.chapterNo} value={c.chapterNo}>
                      Chương {c.chapterNo}: {c.title}
                    </option>
                  ))}
                </select>
                <label className="input-icon reader-jump">
                  <span className="icon" aria-hidden="true">input</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={page}
                    onChange={(e) => go(Number(e.target.value))}
                    aria-label="Nhảy tới trang"
                  />
                </label>
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

            {book && currentPage && (
              <>
                <div className="reader-head">
                  {book.categories[0] && <span className="tag">{book.categories[0]}</span>}
                  <h3 className="reader-book-title">{book.title}</h3>
                  <p className="reader-meta">
                    <span>Tác giả: <strong>{book.author}</strong></span>
                    {book.categories.length > 0 && <span>Thể loại: {book.categories.join(', ')}</span>}
                  </p>
                </div>

                <div className="reader-chapter-banner">
                  <span>Chương {currentPage.chapterNo}: {currentPage.chapterTitle}</span>
                  <span>Trang {page} / {totalPages}</span>
                </div>

                <article ref={textRef} className="reader-text" style={{ '--reader-size': `${fontSize}px` }}>
                  {currentPage.blocks.map((block, index) => (
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
                      onClick={() => go(page - 1)}
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
                      onClick={() => go(page + 1)}
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
                      onClick={() => go(firstPageOf(prevChapter.chapterNo))}
                    >
                      <span className="icon sm" aria-hidden="true">chevron_left</span>
                      Chương trước
                    </button>
                    <button
                      type="button"
                      className={nextChapter ? 'btn primary small-btn' : 'btn ghost small-btn'}
                      disabled={!nextChapter}
                      onClick={() => go(firstPageOf(nextChapter.chapterNo))}
                    >
                      Chương sau
                      <span className="icon sm" aria-hidden="true">chevron_right</span>
                    </button>
                  </div>
                </div>

                <p className={saveState === 'error' ? 'save-status error' : 'save-status'} role="status">
                  {saveState === 'saving' && 'Đang lưu vị trí đọc…'}
                  {saveState === 'saved' && (
                    <>
                      <span className="icon sm" aria-hidden="true">cloud_done</span>
                      Đã lưu trang {page}, dòng {(pos?.line ?? 0) + 1} vào Redis.
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
