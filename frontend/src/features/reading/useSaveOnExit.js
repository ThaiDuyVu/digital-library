import { useCallback, useEffect, useRef } from 'react'
import { getToken } from '../../shared/api'

// Trang được đánh số trên cả cuốn nên chỉ cần page+line là xác định được vị trí; chapter suy ra từ page.
const keyOf = (pos) => `${pos.page}:${pos.line}`

/**
 * Lưu vị trí đọc khi người dùng đóng tab / chuyển tab / tải lại trang.
 * - Dùng fetch({ keepalive: true }) để trình duyệt vẫn hoàn tất request khi trang đang đóng.
 * - Không dùng navigator.sendBeacon vì nó chỉ gửi POST và không gắn được header Authorization.
 * - Chỉ gửi khi vị trí khác với lần đã lưu thành công, tránh ghi Redis thừa.
 */
export function useSaveOnExit({ userId, bookId, pos, chapterNo }) {
  const latest = useRef(null)    // vị trí mới nhất
  const savedKey = useRef(null)  // "page:line" đã được lưu xong

  useEffect(() => {
    latest.current = userId && bookId && pos && chapterNo != null
      ? { userId, bookId, chapterNo, pos }
      : null
  }, [userId, bookId, pos, chapterNo])

  // Đổi sách thì coi như chưa lưu gì
  useEffect(() => {
    savedKey.current = null
  }, [bookId])

  // ReadingPage gọi khi PUT thành công hoặc khi vừa khôi phục vị trí từ Redis
  const markSaved = useCallback((page, line) => {
    savedKey.current = `${page}:${line}`
  }, [])

  useEffect(() => {
    function flush() {
      const current = latest.current
      const token = getToken()
      if (!current || !token) return
      const key = keyOf(current.pos)
      if (savedKey.current === key) return

      savedKey.current = key
      fetch(`/api/progress/${current.userId}/${current.bookId}`, {
        method: 'PUT',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chapter: current.chapterNo,
          page: current.pos.page,
          line: current.pos.line,
        }),
      }).catch(() => {
        savedKey.current = null // gửi lỗi thì lần sau thử lại
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return { markSaved }
}
