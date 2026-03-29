import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useBroker } from '../context/BrokerContext'
import { yen } from '../lib/format'

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-slate-400 mb-1">{label}月</p>
      <p className="text-accent font-semibold">{yen(payload[0].value)}</p>
    </div>
  )
}

export default function Dividend() {
  const { filtered } = useBroker()

  const { monthlyData, annualTotal, withDividend } = useMemo(() => {
    const map = {}
    MONTHS.forEach(m => { map[m] = 0 })

    filtered.forEach(h => {
      const month = h.stock?.dividend_month?.slice(5, 7)  // "YYYY/MM" → "MM"
      const divRate = Number(h.stock?.dividend_rate || 0)
      if (month && divRate > 0) {
        map[month] = (map[month] || 0) + divRate * Number(h.quantity)
      }
    })

    const monthly = MONTHS.map(m => ({ month: `${Number(m)}月`, value: map[m] }))
    const annual = Object.values(map).reduce((s, v) => s + v, 0)
    const list = filtered.filter(h => Number(h.stock?.dividend_rate || 0) > 0)
      .sort((a, b) => (a.stock?.dividend_month || '').localeCompare(b.stock?.dividend_month || ''))

    return { monthlyData: monthly, annualTotal: annual, withDividend: list }
  }, [filtered])

  return (
    <div className="p-6 space-y-6">
      {/* 配当カレンダー */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold">配当カレンダー</p>
          <p className="text-sm font-bold text-accent">年間予測 {yen(annualTotal)}</p>
        </div>
        {annualTotal === 0 ? (
          <p className="text-center py-16 text-slate-400 text-sm">配当データがありません（株価更新後に表示されます）</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d28" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tickFormatter={v => `¥${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="配当額" fill="#00ff88" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 配当予定銘柄テーブル */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-dark-border">
          <p className="text-sm font-semibold">配当予定銘柄</p>
          <p className="text-xs text-slate-400">{withDividend.length} 件</p>
        </div>
        {withDividend.length === 0 ? (
          <p className="text-center py-10 text-slate-400 text-sm">配当データがありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-dark-border">
                  <th className="px-4 py-2 text-left">コード</th>
                  <th className="px-4 py-2 text-left">会社名</th>
                  <th className="px-4 py-2 text-right">配当額（1株）</th>
                  <th className="px-4 py-2 text-right">保有株数</th>
                  <th className="px-4 py-2 text-right">配当予定額</th>
                  <th className="px-4 py-2 text-right">配当月</th>
                  <th className="px-4 py-2 text-left">証券会社</th>
                </tr>
              </thead>
              <tbody>
                {withDividend.map(h => {
                  const divRate = Number(h.stock.dividend_rate)
                  const expected = divRate * Number(h.quantity)
                  return (
                    <tr key={h.id} className="border-b border-slate-50 dark:border-dark-border last:border-0 hover:bg-slate-50 dark:hover:bg-dark-bg/50">
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-border text-xs font-mono font-bold">{h.code}</span>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[160px] truncate">{h.stock.name_ja}</td>
                      <td className="px-4 py-3 text-right">¥{divRate.toLocaleString('ja-JP')}</td>
                      <td className="px-4 py-3 text-right">{Number(h.quantity).toLocaleString('ja-JP')} 株</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-500">+{yen(expected)}</td>
                      <td className="px-4 py-3 text-right text-slate-400 text-xs">{h.stock.dividend_month || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{h.broker || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
