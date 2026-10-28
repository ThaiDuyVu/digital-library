import { useCallback, useEffect, useRef } from 'react'
import { getToken } from '../../shared/api'

const keyOf = (pos) => `${pos.chapterNo}:${pos.page}`

/**
 * Lưu vị trí đọc khi người dùng đóng tab / chuyển tab / tải lại trang.
 * - Dùng fetch({ keepalive: true }) để trình duyệt vẫn hoàn tất request khi trang đang đóng.
 * - Không dùng navigator.sendBeacon vì nó chỉ gửi POST và không gắn được header Authorization.
 * - Chỉ gửi khi vị trí khác với lần đã lưu thành công, tránh ghi Redis thừa.
 */
export function useSaveOnExit({ userId, bookId, pos }) {
  const latest = useRef(null)    // vị trí mới nhất
  const savedKey = useRef(null)  // "chapterNo:page" đã được lưu xong

  useEffect(() => {
    latest.current = userId && bookId && pos ? { userId, bookId, pos } : null
  }, [userId, bookId, pos])

  // Đổi sách thì coi như chưa lưu gì
  useEffect(() => {
    savedKey.current = null
  }, [bookId])

  // ReadingPage gọi khi PUT thành công hoặc khi vừa khôi phục vị trí từ Redis
  const markSaved = useCallback((chapterNo, page) => {
    savedKey.current = `${chapterNo}:${page}`
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
          chapter: current.pos.chapterNo,
          page: current.pos.page,
          line: 0,
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