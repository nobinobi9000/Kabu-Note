import { useState, useEffect } from 'react'

export default function SellModal({ open, holding, onClose, onSubmit }) {
  const [qty,       setQty]       = useState('')
  const [price,     setPrice]     = useState('')
  const [date,      setDate]      = useState('')
  const [addToCash, setAddToCash] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    if (holding) {
      setQty(String(holding.quantity))
      setPrice(String(holding.stock?.price || ''))
      setDate(new Date().toISOString().slice(0, 10))
      setAddToCash(false)
      setError('')
    }
  }, [holding])

  if (!open || !holding) return null

  const sellQty   = Number(qty)
  const sellPrice = Number(price)
  const proceeds  = sellPrice * sellQty
  const pnl       = (sellPrice - Number(holding.cost_price)) * sellQty
  const showPreview = sellQty > 0 && sellPrice > 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (sellQty <= 0 || sellQty > Number(holding.quantity)) {
      return setError(`株数は 1〜${holding.quantity} の範囲で入力してください`)
    }
    if (sellPrice <= 0) return setError('売却単価を入力してください')
    setLoading(true)
    setError('')
    try {
      await onSubmit({ sellQuantity: sellQty, sellPrice, date, addToCash })
      onClose()
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl shadow-xl p-6">
        <h3 className="text-sm font-bold mb-4">
          売却: <span className="text-accent">{holding.stock?.name_ja || holding.code}</span>
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 売却株数 */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              売却株数　<span className="text-slate-500">（保有: {Number(holding.quantity).toLocaleString('ja-JP')} 株）</span>
            </label>
            <input
              type="number" value={qty} onChange={e => setQty(e.target.value)}
              min="1" max={holding.quantity} step="1" required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* 売却単価 */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              売却単価（円）
              {holding.stock?.price && (
                <span className="text-slate-500">現在値: ¥{Number(holding.stock.price).toLocaleString('ja-JP')}</span>
              )}
            </label>
            <input
              type="number" value={price} onChange={e => setPrice(e.target.value)}
              min="0" step="0.1" required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* 売却日 */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">売却日</label>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* プレビュー */}
          {showPreview && (
            <div className="rounded-lg bg-slate-50 dark:bg-dark-bg p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">売却代金</span>
                <span className="font-semibold">¥{proceeds.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">実現損益</span>
                <span className={`font-semibold ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {pnl >= 0 ? '+' : ''}¥{Math.abs(pnl).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>取得単価</span>
                <span>¥{Number(holding.cost_price).toLocaleString('ja-JP')}</span>
              </div>
            </div>
          )}

          {/* 現金オプション */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox" checked={addToCash} onChange={e => setAddToCash(e.target.checked)}
              className="mt-0.5 rounded border-slate-300"
            />
            <span className="text-xs leading-relaxed">
              売却代金を現金として資産グラフに残す
              <br />
              <span className="text-slate-400">（チェックなし: 資産から削除）</span>
            </span>
          </label>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-dark-border text-sm hover:bg-slate-50 dark:hover:bg-dark-bg transition"
            >
              キャンセル
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition disabled:opacity-50"
            >
              {loading ? '処理中...' : '売却する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
