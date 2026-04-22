import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts'
import { useBroker } from '../context/BrokerContext'
import { useDailyHistory } from '../hooks/useDailyHistory'
import { useTransactions } from '../hooks/useTransactions'
import { useAnnualSummary } from '../hooks/useAnnualSummary'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { yen, pnlYen, pct, diff } from '../lib/format'
import ScreenerWidget from '../components/ScreenerWidget'

const RANGES = [
  { label: '30日', days: 30 },
  { label: '90日', days: 90 },
  { label: '1年',  days: 365 },
]

function KpiCard({ label, value, sub, positive }) {
  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-xl md:text-2xl font-bold ${positive === true ? 'text-emerald-500' : positive === false ? 'text-red-500' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey === 'total_pnl_rate' ? `${p.value?.toFixed(2)}%` : yen(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user }    = useAuth()
  const { filtered } = useBroker()
  const [range, setRange]   = useState(30)
  const { data: history, loading: histLoading } = useDailyHistory(range)
  const { transactions }  = useTransactions()
  const { summaries }     = useAnnualSummary()
  const [cashBalance, setCashBalance] = useState(0)

  // 現金残高を取得
  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('cash_balance').eq('id', user.id).maybeSingle()
      .then(({ data }) => setCashBalance(data?.cash_balance || 0))
  }, [user])

  // KPI集計（現金含む）
  const totalMarket = filtered.reduce((s, h) => s + (h.mktVal || 0), 0) + cashBalance
  const totalCost   = filtered.reduce((s, h) => s + (h.costVal || 0), 0)
  const totalPnl    = totalMarket - totalCost - cashBalance  // 含み損益（現金除く）
  const pnlRate     = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  // チャートデータ整形
  const chartData = history.map(r => ({
    date:               r.date.slice(5),
    total_market_value: r.total_market_value,
    total_pnl_rate:     r.total_pnl_rate,
  }))

  // 売却イベント（チャートの日付に存在するものだけ）
  const chartDateSet = new Set(chartData.map(d => d.date))
  const sellEvents = transactions
    .filter(t => t.type === 'sell')
    .map(t => ({ ...t, chartDate: t.date?.slice(5) }))
    .filter(t => chartDateSet.has(t.chartDate))
    // 同日複数をまとめる
    .reduce((acc, t) => {
      const key = t.chartDate
      if (!acc[key]) acc[key] = { date: key, codes: [], pnl: 0 }
      acc[key].codes.push(t.code)
      acc[key].pnl += Number(t.realized_pnl || 0)
      return acc
    }, {})

  // 年間サマリー
  const currentYear = new Date().getFullYear()
  const getSum = (year) => summaries.find(s => s.year === year) || { realized_pnl: 0, received_dividends: 0 }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard label="総評価額" value={yen(totalMarket)} sub={cashBalance > 0 ? `現金 ${yen(cashBalance)} 含む` : undefined} />
        <KpiCard
          label="含み損益"
          value={pnlYen(totalPnl)}
          positive={totalPnl >= 0}
        />
        <KpiCard
          label="損益率"
          value={pct(pnlRate)}
          positive={pnlRate >= 0}
          sub={`取得価額: ${yen(totalCost)}`}
        />
        {cashBalance > 0 && (
          <KpiCard label="現金残高" value={yen(cashBalance)} />
        )}
      </div>

      {/* スクリーナーウィジェット */}
      <ScreenerWidget />

      {/* 資産推移グラフ */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold">資産推移</p>
            <p className="text-xs text-slate-400 mt-0.5">全口座合計（証券会社フィルター対象外）</p>
          </div>
          <div className="flex gap-1">
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setRange(r.days)}
                className={`px-3 py-1 text-xs rounded-full transition ${
                  range === r.days
                    ? 'bg-accent text-dark-bg font-semibold'
                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-border'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {histLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-accent rounded-full animate-spin border-t-transparent" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            データがまだありません（株価更新後に表示されます）
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d28" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis
                yAxisId="left"
                tickFormatter={v => `${(v / 10000).toFixed(0)}万`}
                tick={{ fontSize: 10, fill: '#64748b' }}
              />
              <YAxis
                yAxisId="right" orientation="right"
                tickFormatter={v => `${v.toFixed(1)}%`}
                tick={{ fontSize: 10, fill: '#64748b' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                yAxisId="left"
                type="monotone" dataKey="total_market_value"
                name="総評価額" stroke="#00ff88" strokeWidth={2} dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone" dataKey="total_pnl_rate"
                name="損益率(%)" stroke="#f59e0b" strokeWidth={1.5}
                strokeDasharray="4 2" dot={false}
              />
              {/* 売却イベントの縦線 */}
              {Object.values(sellEvents).map(ev => (
                <ReferenceLine
                  key={ev.date}
                  yAxisId="left"
                  x={ev.date}
                  stroke="#f97316"
                  strokeDasharray="3 3"
                  label={{
                    value: ev.codes.join('/'),
                    position: 'top',
                    fontSize: 9,
                    fill: '#f97316',
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 個別銘柄テーブル */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-dark-border">
          <p className="text-sm font-semibold">個別銘柄</p>
          <p className="text-xs text-slate-400">{filtered.length} 件</p>
        </div>
        {filtered.length === 0 ? (
          <p className="text-center py-10 text-slate-400 text-sm">銘柄が登録されていません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-dark-border">
                  <th className="px-4 py-2 text-left">コード</th>
                  <th className="px-4 py-2 text-left">会社名</th>
                  <th className="px-4 py-2 text-left">業種</th>
                  <th className="px-4 py-2 text-right">終値</th>
                  <th className="px-4 py-2 text-right">前日差</th>
                  <th className="px-4 py-2 text-right">保有株数</th>
                  <th className="px-4 py-2 text-right">現在損益</th>
                  <th className="px-4 py-2 text-right">配当額</th>
                  <th className="px-4 py-2 text-right">配当月</th>
                  <th className="px-4 py-2 text-left">証券会社</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(h => (
                  <tr key={h.id} className="border-b border-slate-50 dark:border-dark-border last:border-0 hover:bg-slate-50 dark:hover:bg-dark-bg/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-border text-xs font-mono font-bold">{h.code}</span>
                    </td>
                    <td className="px-4 py-3 font-medium max-w-[160px] truncate">
                      {h.stock?.name_ja || <span className="text-slate-400 text-xs">取得待ち</span>}
                    </td>
                    <td className="px-4 py-3">
                      {h.stock?.sector
                        ? <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dark-border text-xs">{h.stock.sector}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">{h.stock?.price ? yen(h.stock.price) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {h.stock?.price_change != null
                        ? <span className={`text-xs ${Number(h.stock.price_change) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{diff(h.stock.price_change)}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">{Number(h.quantity).toLocaleString('ja-JP')} 株</td>
                    <td className="px-4 py-3 text-right">
                      {h.stock?.price
                        ? <span className={`font-semibold ${h.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{pnlYen(h.pnl)}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">{h.stock?.dividend_rate ? `¥${h.stock.dividend_rate}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">{h.stock?.dividend_month || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{h.broker || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 年間損益サマリー */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
        <div className="mb-4">
          <p className="text-sm font-semibold">年間損益サマリー</p>
          <p className="text-xs text-slate-400 mt-0.5">全口座合計（証券会社フィルター対象外）</p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {[currentYear, currentYear - 1].map(year => {
            const s     = getSum(year)
            const total = (s.realized_pnl || 0) + (s.received_dividends || 0)
            return (
              <div key={year}>
                <p className="text-xs font-semibold text-slate-400 mb-2">{year}年</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">売却損益</span>
                    <span className={`font-semibold ${(s.realized_pnl || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {pnlYen(s.realized_pnl || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">受取配当（確定）</span>
                    <span className="font-semibold text-emerald-500">
                      +{yen(s.received_dividends || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-dark-border">
                    <span className="font-semibold">合計</span>
                    <span className={`font-bold ${total >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {pnlYen(total)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
