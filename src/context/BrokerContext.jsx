import { createContext, useContext, useState, useMemo } from 'react'
import { useHoldings } from '../hooks/useHoldings'

const BrokerContext = createContext(null)

export function BrokerProvider({ children }) {
  const { holdings } = useHoldings()
  const [selected, setSelected] = useState('全て')

  // holdingsから証券会社一覧を動的に生成
  const brokers = useMemo(() => {
    const list = [...new Set(holdings.map(h => h.broker).filter(Boolean))]
    return list.sort()
  }, [holdings])

  // フィルター済みholdings
  const filtered = useMemo(() => {
    if (selected === '全て') return holdings
    return holdings.filter(h => h.broker === selected)
  }, [holdings, selected])

  return (
    <BrokerContext.Provider value={{ brokers, selected, setSelected, filtered, holdings }}>
      {children}
    </BrokerContext.Provider>
  )
}

export function useBroker() {
  return useContext(BrokerContext)
}
