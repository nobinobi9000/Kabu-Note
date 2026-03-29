import { useState } from 'react'
import { useHoldings } from '../hooks/useHoldings'
import HoldingModal from '../components/HoldingModal'
import ConfirmDialog from '../components/ConfirmDialog'
import { yen, pnlYen, diff } from '../lib/format'

function PnlCell({ value }) {
  const pos = value >= 0
  return (
    <span className={`font-semibold ${pos ? 'text-emerald-500' : 'text-red-500'}`}>
      {pnlYen(value)}
    </span>
  )
}

function DiffCell({ value }) {
  const pos = Number(value) >= 0
  return (
    <span className={`text-sm ${pos ? 'text-emerald-500' : 'text-red-500'}`}>
      {diff(value)}
    </span>
  )
}

export default function Stocks() {
  const { holdings, loading, error, addHolding, updateHolding, deleteHolding } = useHoldings()

  const [modal,   setModal]   = useState({ open: false, item: null })
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })

  function openAdd()          { setModal({ open: true,  item: null }) }
  function openEdit(item)     { setModal({ open: true,  item }) }
  function closeModal()       { setModal({ open: false, item: null }) }

  function openDelete(item) {
    setConfirm({ open: true, id: item.id, name: item.stock?.name_ja || item.code })
  }
  function closeConfirm() { setConfirm({ open: false, id: null, name: '' }) }

  async function handleSubmit(data) {
    if (modal.item) {
      await updateHolding(modal.item.id, data)
    } else {
      await addHolding(data)
    }
  }

  async function handleDelete() {
    await deleteHolding(confirm.id)
    closeConfirm()
  }

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">個別銘柄</h2>
          <p className="text-xs text-slate-400 mt-0.5">{holdings.length} 件</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-dark-bg text-sm font-semibold rounded-lg hover:opacity-90 transition"
        >
          <span className="text-lg leading-none">+</span> 銘柄を追加
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-500 text-sm">{error}</div>
      )}

      {/* ローディング */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent rounded-full animate-spin border-t-transparent" />
        </div>
      ) : holdings.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">📒</p>
          <p className="font-medium">保有銘柄がまだありません</p>
          <p className="text-sm mt-1">「銘柄を追加」から登録してください</p>
        </div>
      ) : (
        /* テーブル */
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dark-border">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 dark:border-dark-border text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">コード</th>
                <th className="px-4 py-3 text-left">会社名</th>
                <th className="px-4 py-3 text-left">業種</th>
                <th className="px-4 py-3 text-right">終値</th>
                <th className="px-4 py-3 text-right">前日差</th>
                <th className="px-4 py-3 text-right">保有株数</th>
                <th className="px-4 py-3 text-right">現在損益</th>
                <th className="px-4 py-3 text-right">配当額</th>
                <th className="px-4 py-3 text-right">配当月</th>
                <th className="px-4 py-3 text-left">証券会社</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => (
                <tr
                  key={h.id}
                  className="border-b border-slate-100 dark:border-dark-border last:border-0 hover:bg-slate-50 dark:hover:bg-dark-card/50 transition-colors"
                >
                  {/* コード */}
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-border text-xs font-mono font-bold">
                      {h.code}
                    </span>
                  </td>

                  {/* 会社名 */}
                  <td className="px-4 py-3 font-medium max-w-[180px] truncate">
                    {h.stock?.name_ja || <span className="text-slate-400 text-xs">取得待ち</span>}
                  </td>

                  {/* 業種 */}
                  <td className="px-4 py-3">
                    {h.stock?.sector ? (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dark-border text-xs">
                        {h.stock.sector}
                      </span>
                    ) : '—'}
                  </td>

                  {/* 終値 */}
                  <td className="px-4 py-3 text-right">
                    {h.stock?.price ? yen(h.stock.price) : '—'}
                  </td>

                  {/* 前日差 */}
                  <td className="px-4 py-3 text-right">
                    {h.stock?.price_change != null ? <DiffCell value={h.stock.price_change} /> : '—'}
                  </td>

                  {/* 保有株数 */}
                  <td className="px-4 py-3 text-right">
                    {Number(h.quantity).toLocaleString('ja-JP')} 株
                  </td>

                  {/* 現在損益 */}
                  <td className="px-4 py-3 text-right">
                    {h.stock?.price ? <PnlCell value={h.pnl} /> : '—'}
                  </td>

                  {/* 配当額 */}
                  <td className="px-4 py-3 text-right">
                    {h.stock?.dividend_rate ? `¥${h.stock.dividend_rate}` : '—'}
                  </td>

                  {/* 配当月 */}
                  <td className="px-4 py-3 text-right text-slate-400">
                    {h.stock?.dividend_month || '—'}
                  </td>

                  {/* 証券会社 */}
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {h.broker || '—'}
                  </td>

                  {/* 操作 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(h)}
                        className="text-slate-400 hover:text-accent transition text-xs"
                        title="編集"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => openDelete(h)}
                        className="text-slate-400 hover:text-red-500 transition text-xs"
                        title="削除"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 追加・編集モーダル */}
      <HoldingModal
        open={modal.open}
        onClose={closeModal}
        onSubmit={handleSubmit}
        initial={modal.item}
      />

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={confirm.open}
        message={`「${confirm.name}」を削除しますか？`}
        onConfirm={handleDelete}
        onCancel={closeConfirm}
      />
    </div>
  )
}
