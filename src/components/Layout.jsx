import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// デスクトップ用サイドバー: 全項目をフラットに表示（画面幅に余裕があるため簡素化は不要）
const NAV = [
  { to: '/dashboard', label: 'ホーム',   icon: '🏠' },
  { to: '/stocks',    label: '保有銘柄', icon: '📋' },
  { to: '/sector',    label: 'セクター', icon: '🍩' },
  { to: '/dividend',  label: '配当',     icon: '💴' },
  { to: '/market',    label: '市場',     icon: '🌐' },
  { to: '/pickup',    label: 'pickup',   icon: '🎯' },
  { to: '/watchlist', label: 'ウォッチ', icon: '⭐' },
]

const NAV_BOTTOM = [
  { to: '/settings', label: '個人設定', icon: '⚙️' },
]

// モバイル用ボトムナビ。
// トップレベル(4ボタン): ホーム/保有銘柄/市場/個人設定
// 保有銘柄・市場セクションに入ると5ボタンになり、先頭に「戻る」(全体ホームへ)が付く。
// 個人設定は独立セクション扱いで「戻る」1つだけ(2026-09-19、ユーザー指定の表に合わせて確定)。
const BACK_TAB = { to: '/dashboard', label: '戻る', icon: '←' }

const MOBILE_TOP_LEVEL = [
  { to: '/dashboard', label: 'ホーム',   icon: '🏠' },
  { to: '/stocks',    label: '保有銘柄', icon: '📋' },
  { to: '/market',    label: '市場',     icon: '🌐' },
  { to: '/settings',  label: '個人設定', icon: '⚙️' },
]

const SECTIONS = {
  holdings: {
    paths: ['/stocks', '/sector', '/dividend'],
    tabs: [
      BACK_TAB,
      { to: '/stocks',   label: '保有銘柄', icon: '📋' },
      { to: '/sector',   label: 'セクター', icon: '🍩' },
      { to: '/dividend', label: '配当',     icon: '💴' },
      { to: '/settings', label: '個人設定', icon: '⚙️' },
    ],
  },
  market: {
    paths: ['/market', '/pickup', '/watchlist'],
    tabs: [
      BACK_TAB,
      { to: '/market',    label: '市場',     icon: '🌐' },
      { to: '/pickup',    label: 'pickup',   icon: '🎯' },
      { to: '/watchlist', label: 'ウォッチ', icon: '⭐' },
      { to: '/settings',  label: '個人設定', icon: '⚙️' },
    ],
  },
  settings: {
    paths: ['/settings'],
    tabs: [BACK_TAB],
  },
}

function findSection(pathname) {
  for (const [key, section] of Object.entries(SECTIONS)) {
    if (section.paths.includes(pathname)) return key
  }
  return null
}

function currentMobileTabs(pathname) {
  const key = findSection(pathname)
  return key ? SECTIONS[key].tabs : MOBILE_TOP_LEVEL
}

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
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

  const inSection = Boolean(findSection(location.pathname))
  const mobileTabs = currentMobileTabs(location.pathname)

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

        {/* モバイル用トップバー（md未満のみ表示）。ロゴタップで常に全体ホームへ戻る */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-dark-card border-b border-slate-200 dark:border-dark-border flex-shrink-0">
          <button onClick={() => navigate('/dashboard')} className="text-base font-bold text-accent">
            Kabu Note
          </button>
          <button
            onClick={() => setDark(d => !d)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-bg transition text-sm"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </header>

        {/* ページコンテンツ（モバイルはボトムナビ分 pb-16 を確保） */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-dark-bg pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* ━━━ ボトムナビ（md未満のみ表示）: 常に4ボタン ━━━
          保有銘柄/市場セクションに入るとタブの中身が切り替わるため、切り替わった
          ことが一目で分かるよう、セクション中は上端の縁取りとアクティブタブの
          見た目を明るく変える(2026-09-19、ユーザー要望) */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-card flex safe-bottom transition-colors ${
        inSection ? 'border-t-2 border-accent' : 'border-t border-slate-200 dark:border-dark-border'
      }`}>
        {mobileTabs.map(({ to, label, icon }) => (
          <NavLink
            key={to} to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? inSection
                    ? 'text-accent bg-accent/10 font-bold'
                    : 'text-accent'
                  : 'text-slate-400'
              }`
            }
          >
            <span className="text-xl leading-tight">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
