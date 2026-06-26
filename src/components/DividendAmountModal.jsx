import { useState, useEffect } from 'react'
import { yen } from '../lib/format'

export default function DividendAmountModal({ open, onClose, onSubmit, record, stockName }) {
  const [ratePerShare, setRatePerShare] = useState('')

  useEffect(() => {
    if (open && record) {
      const r = record.quantity > 0
        ? Math.round((record.amount / record.quantity) * 100) / 100
        : 0
      setRatePerShare(String(r))
    }
  }, [open, record])

  if (!open || !record) return null

  const rate  = Number(ratePerShare) || 0
  const total = Math.round(rate * record.quantity)

  function handleSubmit(e) {
    e.preventDefault()
    if (rate <= 0) return
    onSubmit(record.id, rate)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-6 w-full max-w-sm space-y-4">
        <div>
          <h3 className="font-semibold text-sm">配当金額を修正</h3>
          <p className="text-xs text-slate-400 mt-0.5">{stockName}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              1株あたり配当額（税引き前）
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={ratePerShare}
                onChange={e => setRatePerShare(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="0"
                autoFocus
              />
              <span className="text-sm text-slate-400 whitespace-nowrap">円 / 株</span>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-dark-bg rounded-lg p-3 text-sm space-y-1.5">
            <div className="flex justify-between text-slate-400 text-xs">
              <span>保有株数</span>
              <span>{Number(record.quantity).toLocaleString('ja-JP')} 株</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>受取予定額（税引き前）</span>
              <span className="text-emerald-500">{yen(total)}</span>
            </div>
            <div className="flex justify-between text-slate-400 text-xs border-t border-slate-200 dark:border-dark-border pt-1.5 mt-1">
              <span>現在の登録額</span>
              <span>{yen(record.amount)}</span>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-200 dark:border-dark-border rounded-lg hover:bg-slate-50 dark:hover:bg-dark-bg transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={rate <= 0}
              className="px-4 py-2 text-sm bg-accent text-dark-bg font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
