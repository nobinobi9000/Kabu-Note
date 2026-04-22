import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { addToAnnualSummary } from '../lib/annualSummary'

export function useDividendRecords(holdings = []) {
  const { user } = useAuth()
  const [records, setRecords] = useState([])

  const fetchRecords = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('dividend_records')
      .select('*')
      .eq('user_id', user.id)
    setRecords(data || [])
  }, [user])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // 自動確定: 権利確定月の翌月以降かつ未登録の場合に INSERT
  const autoConfirm = useCallback(async () => {
    if (!user || holdings.length === 0) return
    const today = new Date()
    for (const h of holdings) {
      const divMonth = h.stock?.dividend_month   // "YYYY/MM"
      const divRate  = Number(h.stock?.dividend_rate || 0)
      if (!divMonth || divRate === 0) continue

      const [y, m] = divMonth.split('/').map(Number)
      if (today < new Date(y, m, 1)) continue   // 翌月1日より前はスキップ

      // 既存チェック
      const { data: existing } = await supabase.from('dividend_records')
        .select('id')
        .eq('user_id', user.id).eq('code', h.code)
        .eq('year', y).eq('month', m)
        .maybeSingle()
      if (existing) continue

      const amount = divRate * Number(h.quantity)
      await supabase.from('dividend_records').insert({
        user_id:        user.id,
        code:           h.code,
        year:           y,
        month:          m,
        amount,
        quantity:       Number(h.quantity),
        auto_confirmed: true,
      })
      await addToAnnualSummary(user.id, y, { received_dividends: amount })
    }
    await fetchRecords()
  }, [user, holdings, fetchRecords])

  // 手動確定
  async function manualConfirm(holding) {
    const divMonth = holding.stock?.dividend_month
    if (!divMonth) return
    const [y, m] = divMonth.split('/').map(Number)
    const divRate = Number(holding.stock?.dividend_rate || 0)
    const amount  = divRate * Number(holding.quantity)

    // 既存チェック（すでに確定済みなら何もしない）
    const { data: existing } = await supabase.from('dividend_records')
      .select('id')
      .eq('user_id', user.id).eq('code', holding.code)
      .eq('year', y).eq('month', m)
      .maybeSingle()
    if (existing) return

    const { error } = await supabase.from('dividend_records').insert({
      user_id:        user.id,
      code:           holding.code,
      year:           y,
      month:          m,
      amount,
      quantity:       Number(holding.quantity),
      auto_confirmed: false,
      confirmed_at:   new Date().toISOString(),
    })
    if (error) throw error
    await addToAnnualSummary(user.id, y, { received_dividends: amount })
    await fetchRecords()
  }

  // confirmed かどうか判定するヘルパー
  function isConfirmed(code, dividendMonth) {
    if (!dividendMonth) return false
    const [y, m] = dividendMonth.split('/').map(Number)
    return records.some(r => r.code === code && r.year === y && r.month === m)
  }

  function getRecord(code, dividendMonth) {
    if (!dividendMonth) return null
    const [y, m] = dividendMonth.split('/').map(Number)
    return records.find(r => r.code === code && r.year === y && r.month === m) || null
  }

  return { records, autoConfirm, manualConfirm, isConfirmed, getRecord, refetch: fetchRecords }
}
