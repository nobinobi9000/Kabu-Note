import { useEffect, useState } from 'react'

const FIELD = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent'

export default function WatchlistModal({ open, onClose, onSubmit, initial }) {
  const isEdit = Boolean(initial)
  const [code,    setCode]    = useState('')
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (open) {
      setCode(initial?.code ?? '')
      setNote(initial?.note ?? '')
      setError('')
    }
  }, [open, initial])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!code) {
      setError('証券コードは必須です')
      return
    }
    setLoading(true)
    try {
      await onSubmit({ code, note })
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          {isEdit ? 'メモを編集' : 'ウォッチリストに追加'}
        </h2>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded p-2">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              証券コード <span className="text-red-400">*</span>
            </label>
            <input
              type="text" inputMode="numeric" pattern="\d{4}" maxLength={4}
              placeholder="例: 7203"
              value={code} onChange={e => setCode(e.target.value)}
              disabled={isEdit}
              className={`${FIELD} ${isEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {isEdit && (
              <p className="text-xs text-slate-400 mt-1">証券コードは変更できません</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              メモ <span className="text-xs text-slate-400">（任意）</span>
            </label>
            <input
              type="text" placeholder="例: 決算後に検討"
              value={note} onChange={e => setNote(e.target.value)}
              className={FIELD}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-dark-border text-sm hover:bg-slate-50 dark:hover:bg-dark-bg transition"
            >
              キャンセル
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 py-2 bg-accent text-dark-bg text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition"
            >
              {loading ? '保存中...' : isEdit ? '更新する' : '追加する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
