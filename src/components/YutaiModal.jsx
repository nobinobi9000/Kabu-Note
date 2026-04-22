import { useState, useEffect } from 'react'

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12]

/**
 * 優待登録・編集モーダル。
 *
 * Props:
 *   open       : boolean
 *   onClose    : () => void
 *   onSubmit   : (data) => Promise<void>   — 登録/更新
 *   onDelete   : (id) => Promise<void>     — 削除（initialがあるとき）
 *   initial    : record | null             — 編集時は既存レコード、新規はnull
 *   defaultCode: string                    — 新規登録時のデフォルト銘柄コード
 */
export default function YutaiModal({ open, onClose, onSubmit, onDelete, initial, defaultCode = '' }) {
  const [code,         setCode]         = useState('')
  const [month,        setMonth]        = useState(3)
  const [content,      setContent]      = useState('')
  const [valueYen,     setValueYen]     = useState('')
  const [notes,        setNotes]        = useState('')
  const [satisfaction, setSatisfaction] = useState(null)
  const [receivedAt,   setReceivedAt]   = useState('')
  const [saving,       setSaving]       = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setCode(initial.code || '')
      setMonth(initial.month || 3)
      setContent(initial.content || '')
      setValueYen(initial.value_yen != null ? String(initial.value_yen) : '')
      setNotes(initial.notes || '')
      setSatisfaction(initial.satisfaction || null)
      setReceivedAt(initial.received_at || '')
    } else {
      setCode(defaultCode)
      setMonth(3)
      setContent('')
      setValueYen('')
      setNotes('')
      setSatisfaction(null)
      setReceivedAt('')
    }
  }, [open, initial, defaultCode])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        ...(initial ? { id: initial.id } : {}),
        code:         code.trim(),
        month:        Number(month),
        content:      content.trim() || null,
        value_yen:    valueYen !== '' ? Number(valueYen) : 0,
        notes:        notes.trim() || null,
        satisfaction: satisfaction || null,
        received_at:  receivedAt || null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!initial || !onDelete) return
    setSaving(true)
    try {
      await onDelete(initial.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">{initial ? '優待を編集' : '優待を登録'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 銘柄コード */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">銘柄コード</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="例: 7203"
              required
              disabled={!!initial}
              className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
          </div>

          {/* 権利確定月 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">権利確定月</label>
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              disabled={!!initial}
              className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            >
              {MONTHS.map(m => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>

          {/* 優待内容 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">優待内容</label>
            <input
              type="text"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="例: QUOカード¥1,000"
              className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* 金額相当 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">金額相当（円）</label>
            <input
              type="number"
              value={valueYen}
              onChange={e => setValueYen(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* 届いた日（任意） */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">届いた日（任意）</label>
            <input
              type="date"
              value={receivedAt}
              onChange={e => setReceivedAt(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* 満足度 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">満足度（届いた後に記録）</label>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSatisfaction(satisfaction === n ? null : n)}
                  className={`flex-1 py-1.5 rounded-lg text-lg transition ${
                    satisfaction >= n ? 'text-amber-400' : 'text-slate-200 dark:text-slate-600'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* メモ */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">メモ（任意）</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="自由記入"
              className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {/* ボタン */}
          <div className="flex gap-2 pt-1">
            {initial && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="px-3 py-2 rounded-lg text-sm text-red-500 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 transition disabled:opacity-50"
              >
                削除
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm border border-slate-200 dark:border-dark-border text-slate-500 hover:bg-slate-50 dark:hover:bg-dark-bg transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || !code.trim()}
              className="flex-1 py-2 rounded-lg text-sm bg-accent text-dark-bg font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? '保存中…' : initial ? '更新' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
