import { useState } from 'react'
import { useScreenerData } from '../hooks/useScreenerData'
import { useScreenerPremium } from '../hooks/useScreenerPremium'
import { useWatchlist } from '../hooks/useWatchlist'

const SCREENER_URL = 'https://nobi-labo.com/japan-stock-screener/'

/** リスクタグに合わせたバッジ色 */
function riskColor(tag) {
  if (!tag) return 'bg-slate-100 dark:bg-dark-border text-slate-500'
  if (tag.includes('安定')) return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
  if (tag.includes('注意')) return 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
  return 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
}

/** 無償版total_score(0〜100)に合わせたテキスト色 */
function scoreColor(score) {
  if (score >= 70) return 'text-emerald-500'
  if (score >= 50) return 'text-amber-500'
  return 'text-red-400'
}

/** 有償版jvqm_score(0〜11程度の点数)に合わせたテキスト色。total_scoreとスケールが
    全く異なるため別関数にする(2026-09-17、混同を避けるため分離) */
function jvqmScoreColor(score) {
  if (score >= 8) return 'text-emerald-500'
  if (score >= 5) return 'text-amber-500'
  return 'text-slate-400'
}

export default function ScreenerWidget() {
  const { data, loading, error } = useScreenerData()
  const { isPremium, top30, loading: premiumLoading } = useScreenerPremium()
  const { addToWatchlist, watchedCodes } = useWatchlist()
  const [addingCode, setAddingCode] = useState(null)

  const isToday = data?.date === new Date().toISOString().slice(0, 10)

  async function handleAddToWatchlist(stock) {
    setAddingCode(stock.code)
    try {
      await addToWatchlist({ code: stock.code, name: stock.name, sector: stock.sector })
    } finally {
      setAddingCode(null)
    }
  }

  // 有償相当ユーザーは上位30銘柄、それ以外は無償版(中位帯3銘柄)を表示する(2026-09-17)
  if (isPremium) {
    return (
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">今日のピックアップ（上位30銘柄）</p>
          <a
            href={SCREENER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline whitespace-nowrap"
          >
            Webで詳細を見る →
          </a>
        </div>

        {premiumLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-4 h-4 border-2 border-accent rounded-full animate-spin border-t-transparent" />
          </div>
        ) : top30.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">データがありません</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {top30.map((stock, i) => (
              <div
                key={stock.code}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-dark-bg text-xs"
              >
                <span className="text-slate-400 w-5 flex-none">{i + 1}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dark-border font-mono font-bold flex-none">
                  {stock.code}
                </span>
                <span className="flex-1 truncate">{stock.name}</span>
                {stock.momentum_12m != null && (
                  <span className={stock.momentum_12m > 0 ? 'text-emerald-500' : 'text-red-400'}>
                    {stock.momentum_12m > 0 ? '+' : ''}{stock.momentum_12m}%
                  </span>
                )}
                <span className={`font-bold w-10 text-right flex-none ${jvqmScoreColor(stock.jvqm_score)}`}>
                  {stock.jvqm_score}
                </span>
                <button
                  onClick={() => handleAddToWatchlist(stock)}
                  disabled={watchedCodes.has(stock.code) || addingCode === stock.code}
                  className="flex-none text-accent disabled:opacity-30 disabled:cursor-default"
                  title={watchedCodes.has(stock.code) ? 'ウォッチ済み' : 'ウォッチに追加'}
                >
                  {watchedCodes.has(stock.code) ? '★' : '☆'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">今日のピックアップ</p>
          <p className="text-xs text-slate-400 mt-0.5">
            日本株スクリーナー・無料枠 3銘柄
            {data && !isToday && (
              <span className="ml-1">（最終更新: {data.date}）</span>
            )}
          </p>
        </div>
        <a
          href={SCREENER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline whitespace-nowrap"
        >
          詳細はこちら →
        </a>
      </div>

      {/* ローディング */}
      {loading && (
        <div className="flex justify-center py-6">
          <div className="w-4 h-4 border-2 border-accent rounded-full animate-spin border-t-transparent" />
        </div>
      )}

      {/* エラー */}
      {!loading && error && (
        <p className="text-xs text-slate-400 text-center py-4">{error}</p>
      )}

      {/* データ表示 */}
      {!loading && !error && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {data.top3.map((stock, i) => (
            <div
              key={stock.code}
              className="border border-slate-100 dark:border-dark-border rounded-lg p-3 space-y-1.5"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-mono">{i + 1}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dark-border text-xs font-mono font-bold">
                  {stock.code}
                </span>
                <span className={`ml-auto text-xs font-bold ${scoreColor(stock.score)}`}>
                  {stock.score}点
                </span>
              </div>
              <p className="text-xs font-medium leading-tight truncate">{stock.name}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {stock.sector && (
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-dark-border text-[10px] text-slate-500">
                    {stock.sector}
                  </span>
                )}
                {stock.risk_tag && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${riskColor(stock.risk_tag)}`}>
                    {stock.risk_tag}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleAddToWatchlist(stock)}
                disabled={watchedCodes.has(stock.code) || addingCode === stock.code}
                className="w-full mt-1 py-1 rounded text-[11px] font-medium border border-slate-200 dark:border-dark-border text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-default transition"
              >
                {watchedCodes.has(stock.code) ? '★ ウォッチ済み' : addingCode === stock.code ? '追加中...' : '☆ ウォッチに追加'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
