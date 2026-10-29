import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Tốc độ tính theo dòng/phút để không phụ thuộc cỡ chữ; ~18 dòng/phút gần nhịp đọc thong thả.
const MIN_LPM = 6
const MAX_LPM = 60
const STEP_LPM = 2
const DEFAULT_LPM = 18
const SPEED_KEY = 'handsfree-lpm'
const LINE_RATIO = 1.8 // khớp line-height của .reader-text

function readSpeed() {
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY))
    return saved >= MIN_LPM && saved <= MAX_LPM ? saved : DEFAULT_LPM
  } catch {
    return DEFAULT_LPM
  }
}

function writeSpeed(lpm) {
  try { localStorage.setItem(SPEED_KEY, String(lpm)) } catch { /* chỉ là tiện ích, không lưu được cũng không sao */ }
}

/** Trang này có phải trang cuối của chương không (mỗi chương bắt đầu ở một trang mới). */
function isChapterEnd(pages, index) {
  return index + 1 >= pages.length || pages[index + 1].chapterNo !== pages[index].chapterNo
}

/**
 * Chế độ đọc nghỉ tay: trang sách nằm giữa màn hình và tự cuộn.
 *
 * Vùng cuộn chỉ giữ vài trang liên tiếp của chương hiện tại: luôn nối thêm trang kế tiếp xuống dưới
 * để chữ chảy liền mạch, và khi một trang đã trôi hẳn lên khỏi khung nhìn thì gỡ nó ra, đồng thời
 * trừ scrollTop đúng bằng chiều cao trang đó để người đọc không thấy giật. Hết chương thì dừng cuộn
 * và cho chọn sang chương sau.
 *
 * Props:
 *  - pages: mảng trang của cả cuốn (giống E-Reader), startPage: trang bắt đầu (1-based)
 *  - onPageChange(page): báo trang đang ở mép trên khung nhìn để lưu tiến trình
 *  - onExit(): thoát chế độ
 */
export function HandsFreeReader({ book, pages, startPage, fontSize, onPageChange, onExit }) {
  const [shown, setShown] = useState(() => [startPage - 1]) // chỉ số trang đang nằm trong vùng cuộn
  const [status, setStatus] = useState('running') // running | paused | end
  const [lpm, setLpm] = useState(readSpeed)

  const overlayRef = useRef(null)
  const scrollRef = useRef(null)
  const offset = useRef(0)          // vị trí cuộn dạng số thực; scrollTop tự làm tròn nên không cộng dồn được
  const shiftBy = useRef(null)      // chiều cao trang vừa gỡ, chờ trừ khỏi scrollTop sau khi DOM cập nhật
  const resetScroll = useRef(false) // sang chương mới: về đầu vùng cuộn
  const busy = useRef(false)        // đã gọi setShown, đang chờ React vẽ lại
  const reported = useRef(startPage)

  const last = shown[shown.length - 1]
  const chapterEnd = isChapterEnd(pages, last)
  const nextChapterStart = chapterEnd && last + 1 < pages.length ? last + 1 : null
  const top = pages[shown[0]]
  const pxPerSecond = (fontSize * LINE_RATIO * lpm) / 60

  /** Nối trang kế tiếp, gỡ trang đã đọc xong, phát hiện hết chương. Gọi mỗi khung hình và khi cuộn tay. */
  const maintain = useCallback(() => {
    const el = scrollRef.current
    if (!el || busy.current) return
    const below = el.scrollHeight - el.scrollTop - el.clientHeight

    // Còn chưa tới một khung nhìn chữ bên dưới thì nối thêm trang của cùng chương
    if (below < el.clientHeight && !isChapterEnd(pages, last)) {
      busy.current = true
      setShown((list) => [...list, list[list.length - 1] + 1])
      return
    }
    // Trang đầu đã trôi hẳn lên trên: gỡ nó ra, vị trí nhìn thấy giữ nguyên
    const first = el.querySelector('.hf-page')
    if (shown.length > 1 && first && first.offsetHeight <= el.scrollTop) {
      busy.current = true
      shiftBy.current = first.offsetHeight
      setShown((list) => list.slice(1))
      return
    }
    if (isChapterEnd(pages, last) && below <= 1) setStatus('end')
  }, [pages, last, shown.length])

  // Sau khi DOM đổi: bù scrollTop cho trang vừa gỡ, hoặc về đầu khi sang chương
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && shiftBy.current != null) {
      offset.current = Math.max(0, offset.current - shiftBy.current)
      el.scrollTop = offset.current
      shiftBy.current = null
    }
    if (el && resetScroll.current) {
      offset.current = 0
      el.scrollTop = 0
      resetScroll.current = false
    }
    busy.current = false
  }, [shown])

  // Báo trang ở mép trên để trang đọc lưu vị trí và đếm lượt khi sang chương
  useEffect(() => {
    const page = shown[0] + 1
    if (reported.current === page) return
    reported.current = page
    onPageChange(page)
  }, [shown, onPageChange])

  // Vòng cuộn tự động
  useEffect(() => {
    if (status !== 'running') return undefined
    let frame
    let prev = performance.now()
    const tick = (now) => {
      const dt = Math.min(now - prev, 100) / 1000 // tab bị ẩn rồi quay lại thì không nhảy cóc
      prev = now
      const el = scrollRef.current
      if (el) {
        offset.current = Math.min(offset.current + pxPerSecond * dt, el.scrollHeight - el.clientHeight)
        el.scrollTop = offset.current
        maintain()
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [status, pxPerSecond, maintain])

  // Khóa phần nền: không cuộn trang, không bấm hay tab tới được cho tới khi thoát
  useEffect(() => {
    const shell = document.querySelector('.app-shell')
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    shell?.setAttribute('inert', '')
    overlayRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      shell?.removeAttribute('inert')
    }
  }, [])

  // Space: tạm dừng / chạy tiếp. Esc: thoát nhanh.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onExit()
      } else if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault() // không để Space cuộn trang hay bấm nút đang focus
        if (event.repeat) return
        setStatus((s) => (s === 'running' ? 'paused' : s === 'paused' ? 'running' : s))
      }
    }
    // Nút được kích hoạt bằng Space ở keyup, chặn luôn để không bấm nhầm nút đang focus
    function onKeyUp(event) {
      if (event.code === 'Space' || event.key === ' ') event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [onExit])

  /** Cuộn tay (lăn chuột, vuốt) vẫn được: đồng bộ lại vị trí số thực rồi nối/gỡ trang như thường. */
  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    if (Math.abs(el.scrollTop - offset.current) > 1) offset.current = el.scrollTop
    maintain()
  }

  function changeSpeed(delta) {
    setLpm((value) => {
      const next = Math.min(MAX_LPM, Math.max(MIN_LPM, value + delta))
      writeSpeed(next)
      return next
    })
  }

  function openChapter(index) {
    resetScroll.current = true
    busy.current = true
    setShown([index])
    setStatus('running')
    overlayRef.current?.focus()
  }

  const statusLabel = status === 'running' ? 'Đang tự cuộn' : status === 'paused' ? 'Tạm dừng' : 'Hết chương'

  return createPortal(
    <div
      ref={overlayRef}
      className="hf-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Chế độ đọc nghỉ tay"
      tabIndex={-1}
    >
      <div className="hf-frame">
        <header className="hf-head">
          <div className="hf-title">
            <strong>{book.title}</strong>
            <span>Chương {top.chapterNo}: {top.chapterTitle}</span>
          </div>
          <div className="hf-head-right">
            <span className={`hf-status ${status}`}>{statusLabel}</span>
            <span className="hf-page-no">Trang {shown[0] + 1} / {pages.length}</span>
          </div>
        </header>

        <div ref={scrollRef} className="hf-scroll" onScroll={onScroll}>
          {shown.map((index) => (
            <section key={index} className="hf-page" aria-label={`Trang ${index + 1}`}>
              <div className="hf-page-mark"><span>Trang {index + 1}</span></div>
              <article className="reader-text" style={{ '--reader-size': `${fontSize}px` }}>
                {pages[index].blocks.map((block, i) => (
                  block.kind === 'h' ? <h4 key={i}>{block.text}</h4> : <p key={i}>{block.text}</p>
                ))}
              </article>
            </section>
          ))}

          {chapterEnd && (
            <div className="hf-end">
              <span className="icon" aria-hidden="true">task_alt</span>
              <h3>Hết chương {pages[last].chapterNo}</h3>
              {nextChapterStart != null ? (
                <>
                  <p>Tiếp theo: Chương {pages[nextChapterStart].chapterNo}: {pages[nextChapterStart].chapterTitle}</p>
                  <button type="button" className="btn primary" onClick={() => openChapter(nextChapterStart)}>
                    Sang chương {pages[nextChapterStart].chapterNo}
                    <span className="icon sm" aria-hidden="true">arrow_forward</span>
                  </button>
                </>
              ) : (
                <>
                  <p>Bạn đã đọc tới cuối cuốn sách.</p>
                  <button type="button" className="btn primary" onClick={onExit}>Thoát chế độ</button>
                </>
              )}
            </div>
          )}
        </div>

        <footer className="hf-bar">
          <button
            type="button"
            className="btn primary"
            disabled={status === 'end'}
            onClick={() => setStatus((s) => (s === 'running' ? 'paused' : 'running'))}
          >
            <span className="icon sm" aria-hidden="true">{status === 'running' ? 'pause' : 'play_arrow'}</span>
            {status === 'running' ? 'Tạm dừng' : 'Tiếp tục'}
          </button>

          <div className="hf-speed" role="group" aria-label="Tốc độ cuộn">
            <button type="button" onClick={() => changeSpeed(-STEP_LPM)} disabled={lpm <= MIN_LPM} aria-label="Cuộn chậm hơn">
              <span className="icon sm" aria-hidden="true">remove</span>
            </button>
            <span>{lpm} dòng/phút</span>
            <button type="button" onClick={() => changeSpeed(STEP_LPM)} disabled={lpm >= MAX_LPM} aria-label="Cuộn nhanh hơn">
              <span className="icon sm" aria-hidden="true">add</span>
            </button>
          </div>

          <span className="hf-hint"><kbd>Space</kbd> tạm dừng / tiếp tục · <kbd>Esc</kbd> thoát</span>

          <button type="button" className="btn" onClick={onExit}>
            <span className="icon sm" aria-hidden="true">close</span>
            Thoát chế độ
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
