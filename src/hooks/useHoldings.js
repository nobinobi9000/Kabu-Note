import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

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

  return { holdings, loading, error, refetch: fetch, addHolding, updateHolding, deleteHolding }
}
