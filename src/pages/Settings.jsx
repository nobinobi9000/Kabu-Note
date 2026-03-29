import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Alert({ type, message }) {
  if (!message) return null
  const styles = type === 'success'
    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
    : 'bg-red-50 dark:bg-red-950 text-red-500'
  return (
    <p className={`text-sm rounded-lg px-3 py-2 ${styles}`}>{message}</p>
  )
}

const INPUT = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed'
const BTN   = 'px-4 py-2 bg-accent text-dark-bg text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition'

// ── メールアドレス変更 ────────────────────────────
function EmailSection({ currentEmail }) {
  const [newEmail, setNewEmail]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [success, setSuccess]     = useState('')
  const [error, setError]         = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSuccess(''); setError('')
    if (newEmail === currentEmail) {
      setError('現在と同じメールアドレスです')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) {
      setError(error.message)
    } else {
      setSuccess(`${newEmail} に確認メールを送信しました。メール内のリンクをクリックして変更を完了してください。`)
      setNewEmail('')
    }
    setLoading(false)
  }

  return (
    <Section title="メールアドレス">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">現在のメールアドレス</label>
          <input type="email" value={currentEmail} disabled className={INPUT} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">新しいメールアドレス</label>
          <input
            type="email" required
            placeholder="新しいメールアドレスを入力"
            value={newEmail} onChange={e => setNewEmail(e.target.value)}
            className={INPUT}
          />
        </div>
        <Alert type="success" message={success} />
        <Alert type="error"   message={error} />
        <div className="flex justify-end pt-1">
          <button type="submit" disabled={loading || !newEmail} className={BTN}>
            {loading ? '送信中...' : '確認メールを送信'}
          </button>
        </div>
      </form>
    </Section>
  )
}

// ── パスワード変更 ────────────────────────────────
function PasswordSection() {
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading]                 = useState(false)
  const [success, setSuccess]                 = useState('')
  const [error, setError]                     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSuccess(''); setError('')
    if (newPassword.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('パスワードを変更しました')
      setNewPassword('')
      setConfirmPassword('')
    }
    setLoading(false)
  }

  return (
    <Section title="パスワード">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">新しいパスワード（6文字以上）</label>
          <input
            type="password" required minLength={6}
            placeholder="新しいパスワード"
            value={newPassword} onChange={e => setNewPassword(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">新しいパスワード（確認）</label>
          <input
            type="password" required minLength={6}
            placeholder="もう一度入力"
            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            className={INPUT}
          />
        </div>
        <Alert type="success" message={success} />
        <Alert type="error"   message={error} />
        <div className="flex justify-end pt-1">
          <button type="submit" disabled={loading || !newPassword || !confirmPassword} className={BTN}>
            {loading ? '変更中...' : 'パスワードを変更'}
          </button>
        </div>
      </form>
    </Section>
  )
}

// ── アカウント削除 ────────────────────────────────
function DangerSection() {
  const [confirm, setConfirm] = useState(false)

  return (
    <Section title="危険な操作">
      {!confirm ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">アカウントを削除</p>
            <p className="text-xs text-slate-400 mt-0.5">すべての保有銘柄・履歴データが削除されます</p>
          </div>
          <button
            onClick={() => setConfirm(true)}
            className="px-4 py-2 border border-red-300 dark:border-red-800 text-red-500 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition"
          >
            アカウントを削除
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-red-500 font-medium">本当に削除しますか？この操作は取り消せません。</p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirm(false)}
              className="px-4 py-2 border border-slate-200 dark:border-dark-border text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-dark-bg transition"
            >
              キャンセル
            </button>
            <button
              className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition"
              onClick={() => alert('アカウント削除機能は現在準備中です')}
            >
              削除する
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── メインコンポーネント ───────────────────────────
export default function Settings() {
  const { user } = useAuth()

  return (
    <div className="p-6 max-w-xl space-y-5">
      <div className="mb-2">
        <h2 className="text-lg font-bold">個人設定</h2>
        <p className="text-xs text-slate-400 mt-0.5">アカウント情報の確認・変更ができます</p>
      </div>

      <EmailSection currentEmail={user?.email ?? ''} />
      <PasswordSection />
      <DangerSection />
    </div>
  )
}
