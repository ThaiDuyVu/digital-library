import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPut } from '../../shared/api'
import { useAuth } from '../../shared/auth-context'
import { SuggestionCard } from './SuggestionCard'
import './suggestions.css'

const filters = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ phản hồi' },
  { id: 'replied', label: 'Đã phản hồi' },
]

function ReplyCard({ suggestion, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [reply, setReply] = useState(suggestion.reply ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)

  async function save(event) {
    event.preventDefault()
    if (savingRef.current || !reply.trim()) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await apiPut(`/admin/suggestions/${suggestion.id}/reply`, { reply: reply.trim() })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <SuggestionCard suggestion={suggestion} showUser>
      {editing ? (
        <form className="form suggestion-reply-form" onSubmit={save}>
          <label className="field" htmlFor={`reply-${suggestion.id}`}>
            Phản hồi cho {suggestion.username}
            <textarea id={`reply-${suggestion.id}`} rows={4} maxLength={2000} required autoFocus
              placeholder="Cảm ơn bạn đã đề xuất! Thư viện sẽ…" value={reply} disabled={saving}
              onChange={(event) => setReply(event.target.value)} />
          </label>
          <span className="muted small">{reply.length}/2000 ký tự · Người dùng sẽ thấy phản hồi trong tab Đề xuất sách.</span>
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={saving || !reply.trim()}>{saving ? 'Đang lưu…' : 'Gửi phản hồi'}</button>
            <button type="button" className="btn" disabled={saving} onClick={() => setEditing(false)}>Hủy</button>
          </div>
        </form>
      ) : <button type="button" className="btn outline-primary" onClick={() => setEditing(true)}>
        <span className="icon sm" aria-hidden="true">reply</span>{suggestion.reply ? 'Sửa phản hồi' : 'Phản hồi'}
      </button>}
    </SuggestionCard>
  )
}

function AdminSuggestions() {
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState(null)
  const queryKey = `${page}-${status}-${version}`
  const loading = result?.key !== queryKey
  const data = loading ? null : result.data
  const error = loading ? '' : result.error

  useEffect(() => {
    let active = true
    apiGet(`/admin/suggestions?page=${page}&size=10&status=${status}`)
      .then((result) => {
        if (!active) return
        if (page > 0 && result.content.length === 0) { setPage(page - 1); return }
        setResult({ key: queryKey, data: result, error: '' })
      })
      .catch((err) => { if (active) setResult({ key: queryKey, data: null, error: err.message }) })
    return () => { active = false }
  }, [page, status, queryKey])

  return (
    <section className="panel">
      <div className="suggestion-admin-toolbar">
        <div className="suggestion-filters" aria-label="Lọc đề xuất">
          {filters.map((filter) => <button key={filter.id} type="button"
            className={`btn ${status === filter.id ? 'primary' : ''}`} aria-pressed={status === filter.id}
            onClick={() => { setStatus(filter.id); setPage(0); setNotice('') }}>{filter.label}</button>)}
        </div>
        <button type="button" className="btn" disabled={loading} onClick={() => setVersion((v) => v + 1)}>
          <span className="icon sm" aria-hidden="true">refresh</span>Làm mới
        </button>
      </div>
      {notice && <p className="success-text" role="status">{notice}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {loading && <p className="muted" role="status">Đang tải đề xuất…</p>}
      {data && <p className="muted small">{data.totalElements} đề xuất{status !== 'all' ? ` · ${filters.find((f) => f.id === status).label}` : ''} · Mới nhất trước</p>}
      <div className="suggestion-admin-list" aria-busy={loading}>
        {data?.content.map((suggestion) => <ReplyCard key={`${suggestion.id}-${suggestion.repliedAt ?? ''}`} suggestion={suggestion}
          onSaved={() => { setNotice('Đã lưu phản hồi. Người dùng có thể xem trong tab Đề xuất sách.'); setVersion((v) => v + 1) }} />)}
      </div>
      {data?.content.length === 0 && <div className="suggestion-empty">
        <span className="icon" aria-hidden="true">forum</span>
        <h3>{status === 'pending' ? 'Đã trả lời hết rồi!' : 'Chưa có đề xuất nào'}</h3>
        <p>{status === 'pending' ? 'Những lời nhắn mới của độc giả sẽ xuất hiện ở đây.' : 'Đề xuất phù hợp với bộ lọc sẽ xuất hiện tại đây.'}</p>
      </div>}
      {data && data.totalPages > 1 && <div className="pager">
        <button type="button" className="btn" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>← Trước</button>
        <span>Trang {data.page + 1} / {data.totalPages}</span>
        <button type="button" className="btn" disabled={page + 1 >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Sau →</button>
      </div>}
    </section>
  )
}

export function AdminSuggestionsPage() {
  const { user, isAdmin, loading } = useAuth()
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Lắng nghe độc giả</span>
        <h2>Quản lý đề xuất sách</h2>
        <p>Xem những cuốn sách được mong đợi và gửi lời hồi âm đến người đề xuất.</p>
      </div>
      {loading ? <p className="muted" role="status">Đang kiểm tra quyền…</p> : user && isAdmin ? <AdminSuggestions /> :
        <p className="error-text" role="alert">Bạn cần đăng nhập bằng tài khoản quản trị để xem đề xuất.</p>}
    </>
  )
}
