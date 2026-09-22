import { useBrokers, groupBrokersByCategory } from '../hooks/useBrokers'

/**
 * 証券会社での絞り込み用セレクト。デフォルトは「全て」(value='')。
 * ページごとにローカルなstateを渡してもらう（ページ間で選択状態は共有しない）。
 */
export default function BrokerFilterSelect({ value, onChange, className = '' }) {
  const { brokers } = useBrokers()
  const brokerGroups = groupBrokersByCategory(brokers)

  if (brokers.length === 0) return null

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
    >
      <option value="">全て</option>
      {brokerGroups.map(g => (
        <optgroup key={g.category} label={g.category}>
          {g.items.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
