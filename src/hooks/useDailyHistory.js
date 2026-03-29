import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useDailyHistory(range = 30) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const from = new Date()
      from.setDate(from.getDate() - range)

      const { data: rows } = await supabase
        .from('daily_history')
        .select('date, total_market_value, total_pnl_rate')
        .gte('date', from.toISOString().slice(0, 10))
        .order('date', { ascending: true })

      setData(rows || [])
      setLoading(false)
    }
    fetch()
  }, [range])

  return { data, loading }
}
