import { useState } from 'react'
import { useWatchlist } from '../hooks/useWatchlist'
import WatchlistModal from '../components/WatchlistModal'
import ConfirmDialog from '../components/ConfirmDialog'
import { yen, diff } from '../lib/format'

function DiffCell({ value }) {
  const pos = Number(value) >= 0
  return (
    <span className={`text-sm ${pos ? 'text-emerald-500' : 'text-red-500'}`}>
      {diff(value)}
    </span>
  )
}

export default function Watchlist() {
  const { watchlist, loading, error, addToWatchlist, updateWatchlistNote, removeFromWatchlist } = useWatchlist()

  const [modal,   setModal]   = useState({ open: false, item: null })
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })

  function openAdd()      { setModal({ open: true, item: null }) }
  function openEdit(item) { setModal({ open: true, item }) }
  function closeModal()   { setModal({ open: false, item: null }) }

  function openDelete(item) {
    setConfirm({ open: true, id: item.id, name: item.stock?.name_ja || item.code })
  }
  function closeConfirm() { setConfirm({ open: false, id: null, name: '' }) }

  async function handleSubmit(data) {
    if (modal.item) {
      await updateWatchlistNote(modal.item.id, data.note)
    } else {
      await addToWatchlist(data)
    }
  }

  async function handleDelete() {
    await removeFromWatchlist(confirm.id)
    closeConfirm()
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">ウォッチリスト</h2>
          <p className="text-xs text-slate-400 mt-0.5">{watchlist.length} 件（未購入の監視銘柄）</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-dark-bg text-sm font-semibold rounded-lg hover:opacity-90 transition"
        >
          <span className="text-lg leading-none">+</span> 銘柄を追加
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-500 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent rounded-full animate-spin border-t-transparent" />
        </div>
      ) : watchlist.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">⭐</p>
          <p className="font-medium">ウォッチリストは空です</p>
          <p className="text-sm mt-1">「銘柄を追加」から気になる銘柄を登録してください</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dark-border">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 dark:border-dark-border text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">コード</th>
                <th className="px-4 py-3 text-left">会社名</th>
                <th className="px-4 py-3 text-left">業種</th>
                <th className="px-4 py-3 text-right">終値</th>
                <th className="px-4 py-3 text-right">前日差</th>
                <th className="px-4 py-3 text-left">メモ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {watchlist.map(w => (
                <tr
                  key={w.id}
                  className="border-b border-slate-100 dark:border-dark-border last:border-0 hover:bg-slate-50 dark:hover:bg-dark-card/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-dark-border text-xs font-mono font-bold">
                      {w.code}
                    </span>
                  </td>

                  <td className="px-4 py-3 font-medium max-w-[180px] truncate">
                    {w.stock?.name_ja || w.name || <span className="text-slate-400 text-xs">取得待ち</span>}
                  </td>

                  <td className="px-4 py-3">
                    {(w.stock?.sector || w.sector) ? (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dark-border text-xs">
                        {w.stock?.sector || w.sector}
                      </span>
                    ) : '—'}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {w.stock?.price ? yen(w.stock.price) : '—'}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {w.stock?.price_change != null ? <DiffCell value={w.stock.price_change} /> : '—'}
                  </td>

                  <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                    {w.note || '—'}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(w)}
                        className="text-slate-400 hover:text-accent transition text-xs"
                        title="メモを編集"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => openDelete(w)}
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

      <WatchlistModal
        open={modal.open}
        onClose={closeModal}
        onSubmit={handleSubmit}
        initial={modal.item}
      />

      <ConfirmDialog
        open={confirm.open}
        message={`「${confirm.name}」をウォッチリストから削除しますか？`}
        onConfirm={handleDelete}
        onCancel={closeConfirm}
      />
    </div>
  )
}
