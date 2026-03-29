import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useBroker } from '../context/BrokerContext'
import { yen, pnlYen } from '../lib/format'

const COLORS = [
  '#00ff88','#f59e0b','#3b82f6','#ec4899','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ef4444','#a855f7',
]

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-lg p-3 text-xs shadow-lg">
      <p className="font-semibold mb-1">{d.name}</p>
      <p>{yen(d.value)}</p>
      <p className="text-slate-400">{d.payload.pct.toFixed(1)}%</p>
    </div>
  )
}

export default function Sector() {
  const { filtered } = useBroker()

  const { sectorData, totalMarket } = useMemo(() => {
    const map = {}
    let total = 0
    filtered.forEach(h => {
      const s = h.stock?.sector || '未分類'
      map[s] = (map[s] || 0) + (h.mktVal || 0)
      total += (h.mktVal || 0)
    })
    const arr = Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
    return { sectorData: arr, totalMarket: total }
  }, [filtered])

  return (
    <div className="p-6 space-y-6">
      {/* ドーナツグラフ */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
        <p className="text-sm font-semibold mb-4">セクター構成</p>
        {sectorData.length === 0 ? (
          <p className="text-center py-16 text-slate-400 text-sm">データがありません</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={sectorData}
                cx="50%" cy="50%"
                innerRadius={80} outerRadius={130}
                paddingAngle={2}
                dataKey="value"
                label={({ name, pct }) => `${pct.toFixed(1)}%`}
                labelLine={false}
              >
                {sectorData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => <span className="text-xs">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* セクター別サマリーテーブル */}
      {sectorData.length > 0 && (
        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-dark-border">
            <p className="text-sm font-semibold">セクター別内訳</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-dark-border">
                <th className="px-5 py-2 text-left">セクター</th>
                <th className="px-5 py-2 text-right">評価額</th>
                <th className="px-5 py-2 text-right">構成比</th>
                <th className="px-5 py-2 w-40" />
              </tr>
            </thead>
            <tbody>
              {sectorData.map((s, i) => (
                <tr key={s.name} className="border-b border-slate-50 dark:border-dark-border last:border-0">
                  <td className="px-5 py-3 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    {s.name}
                  </td>
                  <td className="px-5 py-3 text-right">{yen(s.value)}</td>
                  <td className="px-5 py-3 text-right text-slate-400">{s.pct.toFixed(1)}%</td>
                  <td className="px-5 py-3">
                    <div className="h-1.5 bg-slate-100 dark:bg-dark-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${s.pct}%`, background: COLORS[i % COLORS.length] }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 銘柄一覧（セクター順） */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-dark-border">
          <p className="text-sm font-semibold">個別銘柄</p>
          <p className="text-xs text-slate-400">{filtered.length} 件</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-dark-border">
                <th className="px-4 py-2 text-left">コード</th>
                <th className="px-4 py-2 text-left">会社名</th>
                <th className="px-4 py-2 text-left">業種</th>
                <th className="px-4 py-2 text-right">評価額</th>
                <th className="px-4 py-2 text-right">現在損益</th>
                <th className="px-4 py-2 text-left">証券会社</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].sort((a, b) => (a.stock?.sector || '').localeCompare(b.stock?.sector || '')).map(h => (
                <tr key={h.id} className="border-b border-slate-50 dark:border-dark-border last:border-0 hover:bg-slate-50 dark:hover:bg-dark-bg/50">
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
                  <td className="px-4 py-3 text-right">{yen(h.mktVal)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${h.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{pnlYen(h.pnl)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{h.broker || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
