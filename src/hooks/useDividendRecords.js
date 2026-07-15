import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useDividendRecords() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchRecords = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('dividend_records')
      .select('*')
      .eq('user_id', user.id)
      .order('ex_date', { ascending: false })
    setRecords(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // 確定済み金額を手動修正（1株あたりの配当額を入力し、保存済み株数から金額を再計算する）
  async function updateAmount(recordId, newRatePerShare) {
    const rec = records.find(r => r.id === recordId)
    if (!rec) return
    const newAmount = Math.round(newRatePerShare * rec.quantity)
    const diff = newAmount - Number(rec.amount)

    await supabase.from('dividend_records')
      .update({ amount: newAmount, manually_adjusted: true })
      .eq('id', recordId)
      .eq('user_id', user.id)

    const { data: summary } = await supabase.from('annual_summary')
      .select('realized_pnl, received_dividends')
      .eq('user_id', user.id).eq('year', rec.payment_year).maybeSingle()
    await supabase.from('annual_summary').upsert({
      user_id:            user.id,
      year:               rec.payment_year,
      realized_pnl:       summary?.realized_pnl || 0,
      received_dividends: (summary?.received_dividends || 0) + diff,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'user_id,year' })

    await fetchRecords()
  }

  return { records, loading, updateAmount, refetch: fetchRecords }
}
