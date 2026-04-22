import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBroker } from '../context/BrokerContext'

const NAV = [
  { to: '/dashboard', label: 'サマリー', icon: '▣', mobileIcon: '📊' },
  { to: '/stocks',    label: '個別銘柄', icon: '≡', mobileIcon: '📋' },
  { to: '/sector',    label: 'セクター', icon: '◎', mobileIcon: '🍩' },
  { to: '/dividend',  label: '配当',     icon: '¥', mobileIcon: '💴' },
  { to: '/market',    label: '市場',     icon: '🌐', mobileIcon: '🌐' },
]

const NAV_BOTTOM = [
  { to: '/settings', label: '個人設定', icon: '⚙️', mobileIcon: '⚙️' },
]

export default function Layout({ children }) {
  const navigate = useNavigate()
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

      {/* ━━━ サイドバー（md以上のみ表示） ━━━ */}
      <aside className="hidden md:flex w-40 flex-shrink-0 flex-col bg-white dark:bg-dark-card border-r border-slate-200 dark:border-dark-border">
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
        <div className="px-3 py-4 border-t border-slate-200 dark:border-dark-border space-y-1">
          {NAV_BOTTOM.map(({ to, label, icon }) => (
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

      {/* ━━━ メインエリア ━━━ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* モバイル用トップバー（md未満のみ表示） */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-dark-card border-b border-slate-200 dark:border-dark-border flex-shrink-0">
          <p className="text-base font-bold text-accent">Kabu Note</p>
          <button
            onClick={() => setDark(d => !d)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-bg transition text-sm"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </header>

        {/* ブローカーフィルター（共通） */}
        {brokers.length > 0 && (
          <header className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-dark-card border-b border-slate-200 dark:border-dark-border overflow-x-auto flex-shrink-0 scrollbar-none">
            {['全て', ...brokers].map(b => (
              <button
                key={b}
                onClick={() => setSelected(b)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition whitespace-nowrap flex-shrink-0 ${
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

        {/* ページコンテンツ（モバイルはボトムナビ分 pb-16 を確保） */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-dark-bg pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* ━━━ ボトムナビ（md未満のみ表示） ━━━ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-card border-t border-slate-200 dark:border-dark-border flex safe-bottom">
        {[...NAV, ...NAV_BOTTOM].map(({ to, label, mobileIcon }) => (
          <NavLink
            key={to} to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                isActive ? 'text-accent' : 'text-slate-400'
              }`
            }
          >
            <span className="text-xl leading-tight">{mobileIcon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
