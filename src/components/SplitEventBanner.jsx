import { useState } from 'react'
import { useSplitEvents } from '../hooks/useSplitEvents'

export default function SplitEventBanner() {
  const { events, loading, applySplit, dismissSplit } = useSplitEvents()
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState('')

  if (loading || events.length === 0) return null

  async function handleApply(event) {
    setProcessingId(event.id)
    setError('')
    try {
      await applySplit(event)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessingId(null)
    }
  }

  async function handleDismiss(event) {
    setProcessingId(event.id)
    setError('')
    try {
      await dismissSplit(event)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-500 text-sm">{error}</div>
      )}
      {events.map(ev => (
        <div
          key={ev.id}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-sm"
        >
          <p>
            <span className="font-semibold">{ev.code}</span>
            {' '}で株式{Number(ev.ratio) >= 1 ? '分割' : '併合'}が検知されました
            （比率: {ev.ratio}倍、{ev.split_date}）。保有株数・取得単価を調整しますか？
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => handleDismiss(ev)}
              disabled={processingId === ev.id}
              className="px-3 py-1.5 rounded text-xs border border-slate-200 dark:border-dark-border hover:bg-slate-50 dark:hover:bg-dark-bg transition disabled:opacity-50"
            >
              無視する
            </button>
            <button
              onClick={() => handleApply(ev)}
              disabled={processingId === ev.id}
              className="px-3 py-1.5 rounded text-xs bg-accent text-dark-bg font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {processingId === ev.id ? '処理中...' : '適用する'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
