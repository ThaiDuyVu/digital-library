import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost } from '../../shared/api'
import { useAuth } from '../../shared/auth-context'
import { SuggestionCard } from './SuggestionCard'
import './suggestions.css'

function MemberSuggestions() {
  const [data, setData] = useState(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const [vipOpen, setVipOpen] = useState(false)
  const requestId = useRef(0)
  const mounted = useRef(false)
  const sendingRef = useRef(false)

  const refresh = useCallback(async (silent = false) => {
    const id = ++requestId.current
    if (!silent) setLoading(true)
    try {
      const result = await apiGet('/suggestions/mine')
      if (mounted.current && id === requestId.current) { setData(result); setError('') }
    } catch (err) {
      if (mounted.current && id === requestId.current) setError(err.message)
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    Promise.resolve().then(() => { if (mounted.current) refresh() })
    const check = () => { if (!document.hidden && !sendingRef.current) refresh(true) }
    const timer = window.setInterval(check, 30000)
    window.addEventListener('focus', check)
    return () => {
      mounted.current = false
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [refresh])

  async function submit(event) {
    event.preventDefault()
    if (sendingRef.current || !data || data.suggestion || !description.trim()) return
    sendingRef.current = true
    requestId.current++
    setSending(true)
    setError('')
    setNotice('')
    try {
      const suggestion = await apiPost('/suggestions', { description: description.trim() })
      if (!mounted.current) return
      setData({ limit: 1, suggestion })
      setDescription('')
      setNotice('Đề xuất đã đến tay thư viện. Cảm ơn bạn đã góp một ý tưởng cho kệ sách!')
    } catch (err) {
      if (!mounted.current) return
      // Đồng bộ lại lượt gửi nếu một tab khác đã gửi thành công trước đó.
      if (err.status === 409) await refresh(true)
      if (mounted.current) setError(err.message)
    } finally {
      sendingRef.current = false
      if (mounted.current) { setSending(false); setLoading(false) }
    }
  }

  const used = Boolean(data?.suggestion)
  const unavailable = loading || sending || !data || used

  return (
    <>
      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="success-text" role="status">{notice}</p>}
      <div className="suggestions-grid">
        <section className="panel suggestion-compose" aria-labelledby="suggestion-compose-title">
          <div className="suggestion-section-head">
            <h3 id="suggestion-compose-title">Gửi một mong muốn</h3>
            <span className="suggestion-quota">{data ? `${used ? 0 : data.limit}/${data.limit} lượt còn lại` : 'Đang tải lượt gửi…'}</span>
          </div>
          <p className="muted small">Một cuốn sách hay có thể bắt đầu từ đề xuất của bạn.</p>
          <form className="form" onSubmit={submit}>
            <label className="field" htmlFor="suggestion-description">
              Cuốn sách bạn muốn đọc
              <textarea id="suggestion-description" rows={6} maxLength={1000} required
                value={description} disabled={unavailable}
                aria-describedby="suggestion-hint suggestion-limit"
                placeholder="Ví dụ: Hoàng tử bé — Antoine de Saint-Exupéry. Mình rất mong được đọc cuốn này tại thư viện!"
                onChange={(event) => setDescription(event.target.value)} />
            </label>
            <div className="suggestion-field-note">
              <span id="suggestion-hint">Bạn hãy điền tên và tác giả quyển sách mà bạn mong muốn được bổ sung.</span>
              <span>{description.length}/1000</span>
            </div>
            <p className="suggestion-limit" id="suggestion-limit">
              <span className="icon sm" aria-hidden="true">info</span>
              {used ? 'Bạn đã dùng hết 1 lượt đề xuất của tài khoản. Theo dõi hồi âm trong mục Đề xuất của bạn nhé!' : 'Mỗi tài khoản có 1 lượt gửi đề xuất. Bạn nhớ kiểm tra nội dung trước khi gửi nhé.'}
            </p>
            <button className="btn primary" type="submit" disabled={unavailable || !description.trim()}>
              <span className="icon sm" aria-hidden="true">{used ? 'check_circle' : 'send'}</span>
              {sending ? 'Đang gửi…' : used ? 'Đã sử dụng lượt đề xuất' : 'Gửi đề xuất'}
            </button>
          </form>
          <aside className="suggestion-vip">
            <span className="suggestion-vip-icon" aria-hidden="true">✦</span>
            <div>
              <h4>Kệ sách trong mơ còn dài?</h4>
              <p>Hội mọt sách luôn có thêm một cuốn muốn đọc!</p>
              <button className="btn suggestion-vip-btn" type="button" aria-expanded={vipOpen}
                aria-controls="suggestion-vip-note" onClick={() => setVipOpen(!vipOpen)}>
                <span className="icon sm" aria-hidden="true">workspace_premium</span>Nạp VIP để tăng số lượng đề xuất
              </button>
              {vipOpen && <p id="suggestion-vip-note" className="suggestion-vip-note" role="status">VIP đang được ủ như một cuốn sách hay ✨ Tính năng sắp ra mắt; hiện chưa hỗ trợ nạp VIP hay tăng lượt gửi.</p>}
            </div>
          </aside>
        </section>
        <section className="panel suggestion-history" aria-labelledby="suggestion-history-title" aria-busy={loading}>
          <div className="suggestion-section-head">
            <h3 id="suggestion-history-title">Đề xuất của bạn</h3>
            <button className="btn small-btn" type="button" disabled={loading || sending} onClick={() => refresh()}>
              <span className="icon sm" aria-hidden="true">refresh</span>Làm mới
            </button>
          </div>
          <p className="muted small">Lời nhắn từ thư viện sẽ xuất hiện tại đây.</p>
          {loading && !data && <p className="muted" role="status">Đang tải đề xuất…</p>}
          {data?.suggestion && <SuggestionCard suggestion={data.suggestion} />}
          {data && !data.suggestion && (
            <div className="suggestion-empty">
              <span className="icon" aria-hidden="true">markunread_mailbox</span>
              <h4>Chưa có lời nhắn nào</h4>
              <p>Gửi cuốn sách bạn yêu thích, rồi chờ thư viện hồi âm nhé.</p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

export function SuggestionsPage({ onLogin }) {
  const { user, loading } = useAuth()
  return (
    <>
      <div className="hero suggestion-hero">
        <span className="eyebrow"><span className="icon sm" aria-hidden="true">auto_awesome</span>Cùng làm đầy kệ sách</span>
        <h2>Bạn muốn đọc cuốn sách nào?</h2>
        <p>Gửi một đề xuất nhỏ, mở thêm một thế giới mới. Thư viện luôn sẵn lòng lắng nghe bạn.</p>
      </div>
      {loading ? <p className="muted" role="status">Đang kiểm tra phiên…</p> : user ? <MemberSuggestions /> : (
        <section className="panel suggestion-empty">
          <span className="icon" aria-hidden="true">add_comment</span>
          <h3>Đăng nhập để gửi đề xuất</h3>
          <p>Bạn sẽ có 1 lượt gửi và nhận phản hồi của thư viện ngay trong tab này.</p>
          <button type="button" className="btn primary" onClick={onLogin}>Đăng nhập ngay</button>
        </section>
      )}
    </>
  )
}
