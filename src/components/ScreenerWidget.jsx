import { useScreenerData } from '../hooks/useScreenerData'

const SCREENER_URL = 'https://nobi-labo.com/japan-stock-screener/'

/** リスクタグに合わせたバッジ色 */
function riskColor(tag) {
  if (!tag) return 'bg-slate-100 dark:bg-dark-border text-slate-500'
  if (tag.includes('安定')) return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
  if (tag.includes('注意')) return 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
  return 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
}

/** スコアに合わせたテキスト色 */
function scoreColor(score) {
  if (score >= 70) return 'text-emerald-500'
  if (score >= 50) return 'text-amber-500'
  return 'text-red-400'
}

export default function ScreenerWidget() {
  const { data, loading, error } = useScreenerData()

  const isToday = data?.date === new Date().toISOString().slice(0, 10)

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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
