export default function ConfirmDialog({ open, message, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-xs bg-white dark:bg-dark-card border border-slate-200 dark:border-dark-border rounded-xl shadow-xl p-6 space-y-4">
        <p className="text-sm text-center">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-dark-border text-sm hover:bg-slate-50 dark:hover:bg-dark-bg transition"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  )
}
