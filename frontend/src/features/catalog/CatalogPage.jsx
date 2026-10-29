import { useState } from 'react'
import { useAuth } from '../../shared/auth-context'
import { AdminPanel } from './AdminPanel'
import { BookDetail } from './BookDetail'
import { BookList } from './BookList'

export function CatalogPage({ onRead, initialBookId = null }) {
  const { isAdmin } = useAuth()
  // Mở thẳng trang chi tiết khi được gọi từ nút "Xem chi tiết" ở trang khác
  const [view, setView] = useState(initialBookId ? 'detail' : 'list') // list | detail | admin
  const [bookId, setBookId] = useState(initialBookId)
  // Tăng sau khi vào trang quản trị để danh sách tải lại dữ liệu mới
  const [listVersion, setListVersion] = useState(0)

  function openBook(id) {
    setBookId(id)
    setView('detail')
    window.scrollTo({ top: 0 })
  }

  function backToList() {
    setView('list')
  }

  function leaveAdmin() {
    setListVersion((v) => v + 1)
    setView('list')
  }

  if (view === 'admin') {
    return <AdminPanel onBack={leaveAdmin} />
  }

  return (
    <>
      {/* Giữ BookList luôn được mount để khi quay lại vẫn còn từ khóa, thể loại, trang đang xem */}
      <div hidden={view !== 'list'}>
        {isAdmin && (
          <div className="admin-bar">
            <button type="button" className="btn" onClick={() => setView('admin')}>
              Quản trị kho sách
            </button>
          </div>
        )}
        <BookList key={listVersion} onSelect={openBook} onRead={onRead} />
      </div>

      {view === 'detail' && <BookDetail bookId={bookId} onBack={backToList} onRead={onRead} onSelect={openBook} />}
    </>
  )
}