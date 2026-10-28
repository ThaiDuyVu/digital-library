import { useState } from 'react'
import { useAuth } from '../../shared/auth-context'

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,32}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function initialsOf(user) {
  const name = (user.fullName || user.username || '?').trim()
  const parts = name.split(/\s+/)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

/** Ô nhập có icon bên trái. */
function IconField({ label, icon, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-icon">
        <span className="icon" aria-hidden="true">{icon}</span>
        {children}
      </span>
    </label>
  )
}

function LoginForm({ onSuccess }) {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username.trim(), password)
      onSuccess?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <IconField label="Tên đăng nhập" icon="person">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Nhập tên đăng nhập…"
          autoComplete="username"
          required
        />
      </IconField>
      <IconField label="Mật khẩu" icon="lock">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nhập mật khẩu…"
          autoComplete="current-password"
          required
        />
      </IconField>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="btn primary block" disabled={busy}>
        <span className="icon sm" aria-hidden="true">login</span>
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập vào hệ thống'}
      </button>
    </form>
  )
}

function RegisterForm({ onRegistered }) {
  const { register } = useAuth()
  const [form, setForm] = useState({ username: '', email: '', fullName: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  function validate() {
    if (!USERNAME_PATTERN.test(form.username.trim())) {
      return 'Tên đăng nhập chỉ gồm chữ, số, dấu _ hoặc . và dài 3–32 ký tự.'
    }
    if (!EMAIL_PATTERN.test(form.email.trim())) return 'Email không hợp lệ.'
    if (form.fullName.length > 100) return 'Họ tên tối đa 100 ký tự.'
    if (form.password.length < 6 || form.password.length > 72) {
      return 'Mật khẩu phải dài 6–72 ký tự.'
    }
    if (form.password !== form.confirm) return 'Mật khẩu nhập lại không khớp.'
    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setBusy(true)
    try {
      await register({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim() || null,
      })
      onRegistered(form.username.trim())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <IconField label="Tên đăng nhập" icon="person">
        <input value={form.username} onChange={update('username')} autoComplete="username" required />
      </IconField>
      <IconField label="Email" icon="alternate_email">
        <input
          type="email"
          value={form.email}
          onChange={update('email')}
          placeholder="email@domain.edu.vn"
          autoComplete="email"
          required
        />
      </IconField>
      <IconField label="Họ và tên (không bắt buộc)" icon="badge">
        <input value={form.fullName} onChange={update('fullName')} autoComplete="name" maxLength={100} />
      </IconField>
      <IconField label="Mật khẩu" icon="lock">
        <input type="password" value={form.password} onChange={update('password')} autoComplete="new-password" required />
      </IconField>
      <IconField label="Nhập lại mật khẩu" icon="lock_reset">
        <input type="password" value={form.confirm} onChange={update('confirm')} autoComplete="new-password" required />
      </IconField>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="btn primary block" disabled={busy}>
        <span className="icon sm" aria-hidden="true">person_add</span>
        {busy ? 'Đang đăng ký…' : 'Tạo tài khoản'}
      </button>
    </form>
  )
}

function AccountInfo() {
  const { user, isAdmin, logout } = useAuth()
  return (
    <div className="profile">
      <div className="profile-avatar" aria-hidden="true">{initialsOf(user)}</div>
      <h3>Xin chào, {user.fullName || user.username}</h3>
      <span className="role-chip">
        <span className="icon sm" aria-hidden="true">{isAdmin ? 'admin_panel_settings' : 'school'}</span>
        {isAdmin ? 'Quản trị viên' : 'Độc giả'}
      </span>

      <dl className="info-list">
        <dt><span className="icon sm" aria-hidden="true">badge</span>Tên đăng nhập</dt>
        <dd>{user.username}</dd>
        <dt><span className="icon sm" aria-hidden="true">mail</span>Email</dt>
        <dd>{user.email}</dd>
        <dt><span className="icon sm" aria-hidden="true">verified_user</span>Vai trò</dt>
        <dd>{isAdmin ? 'Quản trị viên' : 'Độc giả'}</dd>
        <dt><span className="icon sm" aria-hidden="true">calendar_today</span>Ngày tạo</dt>
        <dd>{new Date(user.createdAt).toLocaleDateString('vi-VN')}</dd>
      </dl>

      <button type="button" className="btn block" onClick={logout}>
        <span className="icon sm" aria-hidden="true">logout</span>
        Đăng xuất
      </button>
    </div>
  )
}

/** Mô tả luồng dữ liệu NoSQL của chức năng tài khoản (đúng với backend). */
function ArchitectureCard() {
  return (
    <section className="arch-card" aria-label="Kiến trúc tích hợp">
      <div className="arch-head">
        <div>
          <span className="eyebrow">Kiến trúc tích hợp</span>
          <h3>Luồng xử lý dữ liệu NoSQL</h3>
        </div>
        <div className="arch-tags">
          <span className="tag-pill">Bcrypt</span>
          <span className="tag-pill blue">Phiên trên Redis</span>
        </div>
      </div>
      <div className="arch-grid">
        <div className="arch-item">
          <h4><span className="icon" aria-hidden="true">database</span>1. Xác thực thực thể</h4>
          <p>
            Tài khoản lưu trong collection <code>users</code> của MongoDB, có unique index trên{' '}
            <code>username</code> và <code>email</code>. Mật khẩu được băm bằng bcrypt.
          </p>
        </div>
        <div className="arch-item">
          <h4><span className="icon" aria-hidden="true">key</span>2. Phiên đăng nhập</h4>
          <p>
            Redis lưu phiên theo khóa <code>session:&lt;sha256(token)&gt;</code> kèm thời hạn (TTL, mặc định 7 ngày)
            nên phiên tự hết hạn mà không cần dọn thủ công.
          </p>
        </div>
        <div className="arch-item">
          <h4><span className="icon" aria-hidden="true">bookmark</span>3. Vị trí đang đọc</h4>
          <p>
            Chương và trang đang đọc lưu trong Redis Hash{' '}
            <code>progress:&lt;userId&gt;:&lt;bookId&gt;</code>, giúp mở lại sách đúng chỗ đã dừng.
          </p>
        </div>
      </div>
    </section>
  )
}

export function IdentityPage() {
  const { user, loading } = useAuth()
  const [mode, setMode] = useState('login')
  const [notice, setNotice] = useState('')

  return (
    <section>
      <div className="hero">
        <span className="eyebrow">
          <span className="icon sm" aria-hidden="true">shield_person</span>
          Hệ thống quản lý danh tính độc giả
        </span>
        <h2>Trung tâm Tài khoản &amp; Xác thực</h2>
        <p>
          Đăng nhập để đọc sách và lưu vị trí đang đọc. Thông tin tài khoản nằm trong MongoDB,
          còn phiên đăng nhập được giữ bằng Redis.
        </p>
      </div>

      <div className="account-grid">
        <div className="account-card">
          {loading && <p className="muted">Đang kiểm tra phiên đăng nhập…</p>}

          {!loading && user && <AccountInfo />}

          {!loading && !user && (
            <>
              <div className="tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={mode === 'login' ? 'active' : ''}
                  onClick={() => { setMode('login'); setNotice('') }}
                >
                  <span className="icon sm" aria-hidden="true">login</span>
                  Đăng nhập
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'register'}
                  className={mode === 'register' ? 'active' : ''}
                  onClick={() => { setMode('register'); setNotice('') }}
                >
                  <span className="icon sm" aria-hidden="true">person_add</span>
                  Đăng ký
                </button>
              </div>

              {notice && <p className="success-text" role="status">{notice}</p>}

              {mode === 'login' ? (
                <LoginForm />
              ) : (
                <RegisterForm
                  onRegistered={(username) => {
                    setNotice(`Đăng ký thành công. Hãy đăng nhập bằng tài khoản "${username}".`)
                    setMode('login')
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      <ArchitectureCard />
    </section>
  )
}