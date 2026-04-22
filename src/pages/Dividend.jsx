import { useMemo, useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { useBroker } from '../context/BrokerContext'
import { useDividendRecords } from '../hooks/useDividendRecords'
import { useYutai } from '../hooks/useYutai'
import { yen } from '../lib/format'
import YutaiModal from '../components/YutaiModal'

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12']

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-slate-400 mb-1">{label}月</p>
      {payload.map(p => p.value > 0 && (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {yen(p.value)}
        </p>
      ))}
    </div>
  )
}

function Stars({ n }) {
  if (!n) return <span className="text-slate-300 dark:text-slate-600">—</span>
  return (
    <span className="text-amber-400 text-xs">
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  )
}

export default function Dividend() {
  const { filtered } = useBroker()
  const { records, autoConfirm, manualConfirm, isConfirmed, getRecord } = useDividendRecords(filtered)
  const { records: yutaiRecords, addYutai, updateYutai, deleteYutai, getYutaiForCode } = useYutai()

  const [yutaiModal, setYutaiModal] = useState({ open: false, initial: null, defaultCode: '' })

  // 起動時に自動確定を実行
  useEffect(() => { autoConfirm() }, [autoConfirm])

  const { monthlyData, annualConfirmed, annualForecast, annualYutai, withDividend } = useMemo(() => {
    const confirmedMap = {}
    const forecastMap  = {}
    const yutaiMap     = {}
    MONTHS.forEach(m => {
      confirmedMap[m] = 0
      forecastMap[m]  = 0
      yutaiMap[m]     = 0
    })

    // 配当集計
    filtered.forEach(h => {
      const month   = h.stock?.dividend_month?.slice(5, 7)
      const divRate = Number(h.stock?.dividend_rate || 0)
      if (!month || divRate === 0) return

      const amount = divRate * Number(h.quantity)
      if (isConfirmed(h.code, h.stock.dividend_month)) {
        confirmedMap[month] = (confirmedMap[month] || 0) + amount
      } else {
        forecastMap[month] = (forecastMap[month] || 0) + amount
      }
    })

    // 優待集計（month は 1〜12 の数値なので 2桁文字列に変換）
    yutaiRecords.forEach(r => {
      const key = String(r.month).padStart(2, '0')
      if (key in yutaiMap) {
        yutaiMap[key] = (yutaiMap[key] || 0) + Number(r.value_yen || 0)
      }
    })

    const monthly = MONTHS.map(m => ({
      month:     `${Number(m)}月`,
      confirmed: confirmedMap[m],
      forecast:  forecastMap[m],
      yutai:     yutaiMap[m],
    }))

    const totalConfirmed = Object.values(confirmedMap).reduce((s, v) => s + v, 0)
    const totalForecast  = Object.values(forecastMap).reduce((s, v) => s + v, 0)
    const totalYutai     = Object.values(yutaiMap).reduce((s, v) => s + v, 0)

    const list = filtered
      .filter(h => Number(h.stock?.dividend_rate || 0) > 0)
      .sort((a, b) => (a.stock?.dividend_month || '').localeCompare(b.stock?.dividend_month || ''))

    return {
      monthlyData:     monthly,
      annualConfirmed: totalConfirmed,
      annualForecast:  totalForecast,
      annualYutai:     totalYutai,
      withDividend:    list,
    }
  }, [filtered, records, yutaiRecords, isConfirmed])

  const annualDividend = annualConfirmed + annualForecast
  const annualTotal    = annualDividend + annualYutai

  function openAddYutai(code) {
    setYutaiModal({ open: true, initial: null, defaultCode: code })
  }
  function openEditYutai(rec) {
    setYutaiModal({ open: true, initial: rec, defaultCode: rec.code })
  }
  function closeYutaiModal() {
    setYutaiModal({ open: false, initial: null, defaultCode: '' })
  }

  async function handleYutaiSubmit(data) {
    if (data.id) {
      const { id, ...rest } = data
      await updateYutai(id, rest)
    } else {
      const { id, ...rest } = data
      await addYutai(rest)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* 配当カレンダー */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold">配当・優待カレンダー</p>
          <p className="text-sm font-bold text-accent">年間合計 {yen(annualTotal)}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-4">
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-accent mr-1" />
            配当（確定）{yen(annualConfirmed)}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-accent/30 mr-1" />
            配当（予定）{yen(annualForecast)}
          </span>
          {annualYutai > 0 && (
            <span>
              <span className="inline-block w-2 h-2 rounded-sm bg-orange-400 mr-1" />
              優待相当 {yen(annualYutai)}
            </span>
          )}
        </div>
        {annualDividend === 0 && annualYutai === 0 ? (
          <p className="text-center py-16 text-slate-400 text-sm">配当データがありません（株価更新後に表示されます）</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d28" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tickFormatter={v => `¥${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="confirmed" stackId="div" fill="#00ff88"   name="配当（確定）" radius={[0,0,0,0]} />
              <Bar dataKey="forecast"  stackId="div" fill="#00ff8840" name="配当（予定）" radius={[0,0,0,0]} />
              <Bar dataKey="yutai"     stackId="yut" fill="#f97316"   name="優待相当額"  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 配当銘柄テーブル */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-dark-border">
          <p className="text-sm font-semibold">配当銘柄</p>
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
                  <th className="px-4 py-2 text-left">優待</th>
                  <th className="px-4 py-2 text-left">証券会社</th>
                  <th className="px-4 py-2 text-center">確定</th>
                </tr>
              </thead>
              <tbody>
                {withDividend.map(h => {
                  const divRate   = Number(h.stock.dividend_rate)
                  const expected  = divRate * Number(h.quantity)
                  const confirmed = isConfirmed(h.code, h.stock.dividend_month)
                  const rec       = getRecord(h.code, h.stock.dividend_month)
                  const yutaiList = getYutaiForCode(h.code)
                  const topYutai  = yutaiList[0] || null   // 最初の1件を表示

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

                      {/* 優待列 */}
                      <td className="px-4 py-3 min-w-[160px]">
                        {topYutai ? (
                          <button
                            onClick={() => openEditYutai(topYutai)}
                            className="text-left space-y-0.5 hover:opacity-80 transition"
                          >
                            <p className="text-xs text-orange-500 font-medium truncate max-w-[140px]">
                              {topYutai.content || `¥${(topYutai.value_yen || 0).toLocaleString('ja-JP')}`}
                            </p>
                            <Stars n={topYutai.satisfaction} />
                          </button>
                        ) : (
                          <button
                            onClick={() => openAddYutai(h.code)}
                            className="px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-dark-border text-slate-400 hover:border-orange-400 hover:text-orange-400 transition"
                          >
                            + 優待を登録
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-400 text-xs">{h.broker || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {confirmed ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                            ✓{rec?.auto_confirmed && <span className="text-slate-400">自動</span>}
                          </span>
                        ) : (
                          <button
                            onClick={() => manualConfirm(h)}
                            className="px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-dark-border text-slate-400 hover:border-emerald-500 hover:text-emerald-500 transition"
                          >
                            確定
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 年間合計サマリー */}
      {(annualDividend > 0 || annualYutai > 0) && (
        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-3">年間受取サマリー</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">配当（確定）</span>
              <span className="font-semibold text-emerald-500">+{yen(annualConfirmed)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">配当（予定）</span>
              <span className="font-semibold text-slate-500">+{yen(annualForecast)}</span>
            </div>
            {annualYutai > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-400">優待相当額</span>
                <span className="font-semibold text-orange-500">+{yen(annualYutai)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-dark-border">
              <span className="font-semibold">合計</span>
              <span className="font-bold text-emerald-500">+{yen(annualTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 優待モーダル */}
      <YutaiModal
        open={yutaiModal.open}
        onClose={closeYutaiModal}
        onSubmit={handleYutaiSubmit}
        onDelete={yutaiModal.initial ? (id) => deleteYutai(id) : undefined}
        initial={yutaiModal.initial}
        defaultCode={yutaiModal.defaultCode}
      />
    </div>
  )
}
