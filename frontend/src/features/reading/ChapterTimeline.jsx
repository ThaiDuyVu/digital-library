import { useEffect, useRef } from 'react'

/**
 * Cây mốc chương nằm ngang, trái sang phải: chương đã qua, chương đang đọc, chương phía trước.
 * Bấm vào một mốc để chọn chương; việc hỏi xác nhận do trang đọc quyết định qua onPick.
 */
export function ChapterTimeline({ chapters, current, onPick }) {
  const trackRef = useRef(null)
  const currentIndex = chapters.findIndex((c) => c.chapterNo === current)

  // Giữ mốc đang đọc trong tầm nhìn khi sách nhiều chương; chỉ cuộn ngang, không kéo cả trang
  useEffect(() => {
    const track = trackRef.current
    const node = track?.querySelector('[aria-current="step"]')
    if (!track || !node) return
    track.scrollTo({ left: node.offsetLeft - (track.clientWidth - node.offsetWidth) / 2, behavior: 'smooth' })
  }, [current])

  return (
    <nav className="timeline" aria-label="Chọn chương">
      <ol ref={trackRef} className="timeline-track">
        {chapters.map((chapter, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
          return (
            <li key={chapter.chapterNo} className={`timeline-step ${state}`}>
              <button
                type="button"
                className="timeline-node"
                onClick={() => onPick(chapter)}
                aria-current={state === 'current' ? 'step' : undefined}
                title={`Chương ${chapter.chapterNo}: ${chapter.title}`}
              >
                <span className="timeline-dot">
                  {state === 'done'
                    ? <span className="icon sm" aria-hidden="true">check</span>
                    : chapter.chapterNo}
                </span>
                <span className="timeline-label">
                  <span className="timeline-no">Chương {chapter.chapterNo}</span>
                  <span className="timeline-title">{chapter.title}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
