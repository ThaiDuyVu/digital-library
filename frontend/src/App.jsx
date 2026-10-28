import { useState } from 'react'
import { CatalogPage } from './features/catalog/CatalogPage'
import { IdentityPage } from './features/identity/IdentityPage'
import { RankingPage } from './features/ranking/RankingPage'
import { ReadingPage } from './features/reading/ReadingPage'
import { AuthProvider } from './shared/AuthProvider'
import { useAuth } from './shared/auth-context'
import { HealthBadge } from './shared/HealthBadge'

const pages = [
  { id: 'catalog', label: 'Kho sách', icon: 'collections_bookmark', component: CatalogPage },
  { id: 'reading', label: 'Đọc sách', icon: 'auto_stories', component: ReadingPage },
  { id: 'ranking', label: 'Thịnh hành', icon: 'trending_up', component: RankingPage },
  { id: 'identity', label: 'Tài khoản', icon: 'account_circle', component: IdentityPage },
]

function initialsOf(user) {
  const name = (user.fullName || user.username || '?').trim()
  const parts = name.split(/\s+/)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

function UserBox({ onLogin }) {
  const { user, isAdmin, loading, logout } = useAuth()

  if (loading) return <span className="muted small">Đang kiểm tra phiên…</span>

  if (!user) {
    return (
      <button type="button" className="btn outline-primary small-btn" onClick={onLogin}>
        Đăng nhập
      </button>
    )
  }

  return (
    <div className="user-box">
      <span className="user-name">
        {user.fullName || user.username}
        {isAdmin && <span className="badge">Admin</span>}
        <span className="avatar" aria-hidden="true">{initialsOf(user)}</span>
      </span>
      <button type="button" className="btn outline-primary small-btn" onClick={logout}>
        Đăng xuất
      </button>
    </div>
  )
}

function Shell() {
  const [active, setActive] = useState('catalog')
  const CurrentPage = pages.find((page) => page.id === active).component

  return (
    <div className="app-shell">
      <div className="site-top">
        <div className="site-top-inner">
          <header className="site-header">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">
                <span className="icon lg">menu_book</span>
              </span>
              <div className="brand-text">
                <span className="eyebrow">Đồ án NoSQL · MongoDB + Redis</span>
                <h1>Thư viện số</h1>
              </div>
            </div>
            <div className="header-right">
              <HealthBadge />
              <UserBox onLogin={() => setActive('identity')} />
            </div>
          </header>
          <nav className="site-nav" aria-label="Chức năng chính">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                className={active === page.id ? 'active' : ''}
                onClick={() => setActive(page.id)}
                aria-current={active === page.id ? 'page' : undefined}
              >
                <span className="icon sm" aria-hidden="true">{page.icon}</span>
                {page.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      <main className="app-body"><CurrentPage /></main>
      <footer className="site-footer">
        Đồ án môn NoSQL · Polyglot Persistence (MongoDB + Redis)
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}