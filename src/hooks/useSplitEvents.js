import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * 検知済みの株式分割・併合イベント(pending)を扱うフック。
 * holdings.quantity/cost_price の調整はユーザーが「適用する」を押した時のみ行う
 * （自動調整はしない）。
 */
export function useSplitEvents() {
  const { user }               = useAuth()
  const [events,  setEvents]   = useState([])
  const [loading, setLoading]  = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('stock_split_events')
      .select('*, holdings(quantity, cost_price)')
      .eq('status', 'pending')
      .order('detected_at', { ascending: true })
    setEvents(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // 適用: holdings.quantity/cost_price を分割比率で調整し、イベントをapplied にする
  async function applySplit(event) {
    const holding = event.holdings
    if (!holding) throw new Error('対応する保有銘柄が見つかりません')

    const ratio       = Number(event.ratio)
    const newQuantity = Number(holding.quantity) * ratio
    const newCostPrice = Number(holding.cost_price) / ratio

    const { error: hErr } = await supabase.from('holdings')
      .update({
        quantity:   newQuantity,
        cost_price: newCostPrice,
        updated_at: new Date().toISOString(),
      })
      .eq('id', event.holding_id)
      .eq('user_id', user.id)
    if (hErr) throw hErr

    const { error: eErr } = await supabase.from('stock_split_events')
      .update({ status: 'applied', resolved_at: new Date().toISOString() })
      .eq('id', event.id)
      .eq('user_id', user.id)
    if (eErr) throw eErr

    await fetch()
  }

  // 無視: holdings は変更せず、イベントを dismissed にする
  async function dismissSplit(event) {
    const { error } = await supabase.from('stock_split_events')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
      .eq('id', event.id)
      .eq('user_id', user.id)
    if (error) throw error
    await fetch()
  }

  return { events, loading, applySplit, dismissSplit }
}
