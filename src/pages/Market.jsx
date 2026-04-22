import { useScreenerData } from '../hooks/useScreenerData'

const SCREENER_URL = 'https://nobi-labo.com/japan-stock-screener/'

/** avg_score に応じたタイルの背景色クラス */
function heatColor(score) {
  if (score >= 70) return 'bg-emerald-500 text-white'
  if (score >= 60) return 'bg-emerald-400 text-white'
  if (score >= 50) return 'bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100'
  if (score >= 40) return 'bg-amber-300 dark:bg-amber-700 text-amber-900 dark:text-amber-100'
  if (score >= 30) return 'bg-orange-300 dark:bg-orange-700 text-orange-900 dark:text-orange-100'
  return 'bg-red-400 dark:bg-red-700 text-white'
}

/** スコアレベルのラベル */
function scoreLabel(score) {
  if (score >= 70) return '強気'
  if (score >= 60) return 'やや強気'
  if (score >= 50) return '中立'
  if (score >= 40) return 'やや弱気'
  return '弱気'
}

export default function Market() {
  const { data, loading, error } = useScreenerData()

  const isToday = data?.date === new Date().toISOString().slice(0, 10)
  const heatmap = data?.sector_heatmap || []

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* ヘッダー */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm font-semibold">市場マップ</p>
            <p className="text-xs text-slate-400 mt-0.5">
              セクター別テクニカルスコア分布
              {data && !isToday && (
                <span className="ml-1">（最終更新: {data.date}）</span>
              )}
              {data && isToday && (
                <span className="ml-1 text-emerald-500">（本日更新済み）</span>
              )}
            </p>
          </div>
          <a
            href={SCREENER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline whitespace-nowrap"
          >
            スクリーナーで詳細 →
          </a>
        </div>

        {/* 凡例 */}
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            { label: '70以上 強気',    cls: 'bg-emerald-500 text-white' },
            { label: '60〜 やや強気', cls: 'bg-emerald-300 text-emerald-900' },
            { label: '50〜 中立',      cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100' },
            { label: '40〜 やや弱気', cls: 'bg-amber-300 text-amber-900' },
            { label: '30未満 弱気',   cls: 'bg-red-400 text-white' },
          ].map(({ label, cls }) => (
            <span key={label} className={`px-2 py-0.5 rounded text-[10px] font-medium ${cls}`}>
              {label}
            </span>
          ))}
        </div>

        <p className="text-[10px] text-slate-400 mt-2">
          ※ スコアはテクニカル指標の平均値です。騰落率ではありません。
        </p>
      </div>

      {/* ヒートマップグリッド */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
        <p className="text-sm font-semibold mb-4">セクター別スコアマップ</p>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-accent rounded-full animate-spin border-t-transparent" />
          </div>
        )}

        {!loading && error && (
          <p className="text-center py-16 text-slate-400 text-sm">{error}</p>
        )}

        {!loading && !error && heatmap.length === 0 && (
          <p className="text-center py-16 text-slate-400 text-sm">データがありません</p>
        )}

        {!loading && !error && heatmap.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {heatmap.map(s => (
              <div
                key={s.name}
                className={`rounded-xl p-4 flex flex-col gap-1 transition-transform hover:scale-[1.02] ${heatColor(s.avg_score)}`}
              >
                <p className="text-xs font-semibold leading-tight">{s.name}</p>
                <p className="text-2xl font-bold leading-none">{s.avg_score}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] opacity-80">{scoreLabel(s.avg_score)}</p>
                  <p className="text-[10px] opacity-70">{s.stock_count}銘柄</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* スクリーナーへの誘導 */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5 text-center space-y-3">
        <p className="text-sm font-semibold">さらに詳しく見る</p>
        <p className="text-xs text-slate-400">
          個別銘柄のテクニカルスコア詳細・ランキングは日本株スクリーナーで確認できます。
        </p>
        <a
          href={SCREENER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-5 py-2 rounded-lg bg-accent text-dark-bg text-sm font-semibold hover:opacity-90 transition"
        >
          日本株スクリーナーで詳細を見る →
        </a>
      </div>

    </div>
  )
}
