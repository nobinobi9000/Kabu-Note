import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBroker } from '../context/BrokerContext'

const NAV = [
  { to: '/dashboard', label: 'サマリー',  icon: '▣' },
  { to: '/stocks',    label: '個別銘柄',  icon: '≡' },
  { to: '/sector',    label: 'セクター',  icon: '◎' },
  { to: '/dividend',  label: '配当',      icon: '¥' },
]

export default function Layout({ children }) {
  const navigate                  = useNavigate()
  const { brokers, selected, setSelected } = useBroker()
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* サイドバー */}
      <aside className="w-40 flex-shrink-0 flex flex-col bg-white dark:bg-dark-card border-r border-slate-200 dark:border-dark-border">
        <div className="px-4 py-5 border-b border-slate-200 dark:border-dark-border">
          <p className="text-lg font-bold text-accent">Kabu Note</p>
          <p className="text-xs text-slate-400 mt-0.5">カブノート</p>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-bg'
                }`
              }
            >
              <span>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-200 dark:border-dark-border space-y-2">
          <button
            onClick={() => setDark(d => !d)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-bg transition"
          >
            {dark ? '☀️' : '🌙'} {dark ? 'ライト' : 'ダーク'}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-bg transition"
          >
            🚪 ログアウト
          </button>
        </div>
      </aside>

      {/* メインエリア */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ブローカーフィルターヘッダー */}
        {brokers.length > 0 && (
          <header className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-dark-card border-b border-slate-200 dark:border-dark-border flex-wrap">
            {['全て', ...brokers].map(b => (
              <button
                key={b}
                onClick={() => setSelected(b)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  selected === b
                    ? 'bg-accent text-dark-bg'
                    : 'bg-slate-100 dark:bg-dark-border text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {b}
              </button>
            ))}
          </header>
        )}

        {/* ページコンテンツ */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-dark-bg">
          {children}
        </main>
      </div>
    </div>
  )
}
