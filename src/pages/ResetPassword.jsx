import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [email, setEmail]     = useState('')
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-bg px-4">
        <div className="text-center space-y-3">
          <p className="text-2xl">📩</p>
          <p className="font-semibold">リセットメールを送信しました</p>
          <p className="text-sm text-slate-500">メール内のリンクからパスワードを再設定してください。</p>
          <Link to="/" className="text-sm text-accent hover:underline">ログインへ戻る</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-accent">Kabu Note</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">カブノート</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">パスワードリセット</h2>
          <p className="text-sm text-slate-500">登録済みのメールアドレスを入力してください。リセット用リンクを送信します。</p>
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded p-2">{error}</p>}
          <div>
            <label className="block text-sm font-medium mb-1">メールアドレス</label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full py-2 bg-accent text-dark-bg font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? '送信中...' : 'リセットメールを送信'}
          </button>
          <p className="text-center text-sm text-slate-500">
            <Link to="/" className="text-accent hover:underline">ログインへ戻る</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
