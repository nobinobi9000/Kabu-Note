import { useMemo, useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useDividendRecords } from '../hooks/useDividendRecords'
import { useYutai } from '../hooks/useYutai'
import { supabase } from '../lib/supabase'
import { yen } from '../lib/format'
import YutaiModal from '../components/YutaiModal'
import DividendAmountModal from '../components/DividendAmountModal'

const PIE_COLORS = ['#00ff88', '#00c2ff', '#f97316', '#a855f7', '#facc15', '#ef4444', '#64748b', '#22d3ee']

function Stars({ n }) {
  if (!n) return <span className="text-slate-300 dark:text-slate-600">—</span>
  return (
    <span className="text-amber-400 text-xs">
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  )
}

function YearPie({ year, data }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">{year}年</p>
        <p className="text-sm font-bold text-accent">{yen(total)}</p>
      </div>
      {data.length === 0 ? (
        <p className="text-center py-16 text-slate-400 text-xs">配当実績がありません</p>
      ) : (
        <>
          {/* 円グラフ本体には番号だけを表示し、銘柄名は下の一覧に出す
              （銘柄数が多い/名前が長いとレイアウトが崩れるため） */}
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={110}
                paddingAngle={2}
                label={({ index }) => `${index + 1}`}
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value, _name, entry) => [yen(value), entry.payload.name]} />
            </PieChart>
          </ResponsiveContainer>

          {/* 番号対応の銘柄一覧 */}
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {data.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span
                  className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 truncate">{d.name}</span>
                <span className="flex-none font-semibold text-accent">{yen(d.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Dividend() {
  const { records, updateAmount } = useDividendRecords()
  const { records: yutaiRecords, addYutai, updateYutai, deleteYutai, getYutaiForCode } = useYutai()

  const [yutaiModal, setYutaiModal] = useState({ open: false, initial: null, defaultCode: '' })
  const [dividendEditModal, setDividendEditModal] = useState({ open: false, record: null, stockName: '' })
  const [stockNames, setStockNames] = useState({})

  // records に含まれる銘柄名を解決する（既に売却済みで filtered に無い銘柄も含むため
  // stocks テーブルを直接引く）
  useEffect(() => {
    const codes = [...new Set(records.map(r => r.code))]
    if (codes.length === 0) return
    supabase.from('stocks').select('code, name_ja').in('code', codes)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(s => { map[s.code] = s.name_ja })
        setStockNames(map)
      })
  }, [records])

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]
  const [activeYear, setActiveYear] = useState(currentYear)

  const pieDataByYear = useMemo(() => {
    const result = {}
    years.forEach(y => {
      const byCode = {}
      records
        .filter(r => r.payment_year === y)
        .forEach(r => {
          byCode[r.code] = (byCode[r.code] || 0) + Number(r.amount || 0)
        })
      result[y] = Object.entries(byCode)
        .map(([code, value]) => ({ name: stockNames[code] || code, value }))
        .sort((a, b) => b.value - a.value)
    })
    return result
  }, [records, stockNames, years])

  function openDividendEdit(rec) {
    setDividendEditModal({ open: true, record: rec, stockName: stockNames[rec.code] || rec.code })
  }
  function closeDividendEdit() {
    setDividendEditModal({ open: false, record: null, stockName: '' })
  }

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
      {/* 年度別 配当内訳（円グラフ、タブ切り替え） */}
      <div>
        <p className="text-sm font-semibold mb-3">年度別 配当実績（受取年ベース）</p>
        <div className="flex gap-2 mb-3">
          {years.map(y => (
            <button
              key={y}
              onClick={() => setActiveYear(y)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                activeYear === y
                  ? 'bg-accent text-dark-bg'
                  : 'bg-slate-100 dark:bg-dark-card text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              {y}年
            </button>
          ))}
        </div>
        <YearPie year={activeYear} data={pieDataByYear[activeYear]} />
      </div>

      {/* 配当実績テーブル */}
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-dark-border">
          <p className="text-sm font-semibold">配当実績（確定分のみ）</p>
          <p className="text-xs text-slate-400">{records.length} 件</p>
        </div>
        {records.length === 0 ? (
          <p className="text-center py-10 text-slate-400 text-sm">
            配当データがありません（権利確定・株価更新後に自動的に反映されます）
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-dark-border">
                  <th className="px-4 py-2 text-left">権利確定日</th>
                  <th className="px-4 py-2 text-left">コード</th>
                  <th className="px-4 py-2 text-left">会社名</th>
                  <th className="px-4 py-2 text-right">保有株数</th>
                  <th className="px-4 py-2 text-right">金額</th>
                  <th className="px-4 py-2 text-right">受取年</th>
                  <th className="px-4 py-2 text-left">優待</th>
                  <th className="px-4 py-2 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {records.map(rec => {
                  const yutaiList = getYutaiForCode(rec.code)
                  const topYutai  = yutaiList[0] || null
                  return (
                    <tr key={rec.id} className="border-b border-slate-50 dark:border-dark-border last:border-0 hover:bg-slate-50 dark:hover:bg-dark-bg/50">
                      <td className="px-4 py-3 text-slate-400 text-xs">{rec.ex_date || `${rec.year}/${String(rec.month).padStart(2, '0')}`}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-border text-xs font-mono font-bold">{rec.code}</span>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[160px] truncate">{stockNames[rec.code] || rec.code}</td>
                      <td className="px-4 py-3 text-right">{Number(rec.quantity).toLocaleString('ja-JP')} 株</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-500">+{yen(rec.amount)}</td>
                      <td className="px-4 py-3 text-right text-slate-400 text-xs">{rec.payment_year}年</td>
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
                            onClick={() => openAddYutai(rec.code)}
                            className="px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-dark-border text-slate-400 hover:border-orange-400 hover:text-orange-400 transition"
                          >
                            + 優待を登録
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                            ✓
                            {rec.manually_adjusted
                              ? <span className="text-slate-400">修正済</span>
                              : rec.auto_confirmed
                              ? <span className="text-slate-400">自動</span>
                              : null}
                          </span>
                          <button
                            onClick={() => openDividendEdit(rec)}
                            className="text-slate-300 dark:text-slate-600 hover:text-accent transition text-xs"
                            title="金額を修正"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 配当金額修正モーダル */}
      <DividendAmountModal
        open={dividendEditModal.open}
        onClose={closeDividendEdit}
        onSubmit={updateAmount}
        record={dividendEditModal.record}
        stockName={dividendEditModal.stockName}
      />

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
