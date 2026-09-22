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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
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
    </div>
  )
}
