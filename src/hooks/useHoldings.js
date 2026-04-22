import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { addToAnnualSummary } from '../lib/annualSummary'

export function useHoldings() {
  const { user }                  = useAuth()
  const [holdings, setHoldings]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      // 保有銘柄取得
      const { data: h, error: hErr } = await supabase
        .from('holdings')
        .select('*')
        .order('created_at', { ascending: true })
      if (hErr) throw hErr

      // 株価マスタ取得（保有コードのみ）
      const codes = [...new Set((h || []).map(r => r.code))]
      let stockMap = {}
      if (codes.length > 0) {
        const { data: s } = await supabase
          .from('stocks')
          .select('*')
          .in('code', codes)
        ;(s || []).forEach(r => { stockMap[r.code] = r })
      }

      // 結合 & 損益計算
      const merged = (h || []).map(r => {
        const stock     = stockMap[r.code] || null
        const price     = stock?.price ?? 0
        const mktVal    = price * r.quantity
        const costVal   = r.cost_price * r.quantity
        const pnl       = mktVal - costVal
        const pnlRate   = costVal > 0 ? (pnl / costVal) * 100 : 0
        return { ...r, stock, mktVal, costVal, pnl, pnlRate }
      })
      setHoldings(merged)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // 追加
  async function addHolding({ code, quantity, cost_price, broker }) {
    const { error } = await supabase.from('holdings').insert({
      user_id:    user.id,
      code:       String(code).trim(),
      quantity:   Number(quantity),
      cost_price: Number(cost_price),
      broker:     broker?.trim() || null,
    })
    if (error) throw error
    await fetch()
  }

  // 更新
  async function updateHolding(id, { quantity, cost_price, broker }) {
    const { error } = await supabase.from('holdings')
      .update({
        quantity:   Number(quantity),
        cost_price: Number(cost_price),
        broker:     broker?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    await fetch()
  }

  // 削除
  async function deleteHolding(id) {
    const { error } = await supabase.from('holdings')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    await fetch()
  }

  // 売却
  async function sellHolding(id, { sellQuantity, sellPrice, date, addToCash }) {
    const holding = holdings.find(h => h.id === id)
    if (!holding) throw new Error('銘柄が見つかりません')

    const realizedPnl = (Number(sellPrice) - Number(holding.cost_price)) * Number(sellQuantity)

    // 1. transactions に記録
    const { error: txErr } = await supabase.from('transactions').insert({
      user_id:      user.id,
      code:         holding.code,
      type:         'sell',
      date,
      quantity:     Number(sellQuantity),
      price:        Number(sellPrice),
      cost_price:   Number(holding.cost_price),
      realized_pnl: realizedPnl,
      add_to_cash:  addToCash,
    })
    if (txErr) throw txErr

    // 2. holdings を更新（部分売却 or 全量売却）
    if (Number(sellQuantity) < Number(holding.quantity)) {
      const { error: hErr } = await supabase.from('holdings')
        .update({ quantity: Number(holding.quantity) - Number(sellQuantity), updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', user.id)
      if (hErr) throw hErr
    } else {
      const { error: hErr } = await supabase.from('holdings')
        .delete().eq('id', id).eq('user_id', user.id)
      if (hErr) throw hErr
    }

    // 3. 現金残高を更新（addToCash の場合）
    if (addToCash) {
      const proceeds = Number(sellPrice) * Number(sellQuantity)
      const { data: profile } = await supabase.from('profiles')
        .select('cash_balance').eq('id', user.id).maybeSingle()
      await supabase.from('profiles').upsert({
        id:            user.id,
        cash_balance:  (profile?.cash_balance || 0) + proceeds,
        updated_at:    new Date().toISOString(),
      })
    }

    // 4. annual_summary を更新
    const year = new Date(date).getFullYear()
    await addToAnnualSummary(user.id, year, { realized_pnl: realizedPnl })

    await fetch()
  }

  return { holdings, loading, error, refetch: fetch, addHolding, updateHolding, deleteHolding, sellHolding }
}
