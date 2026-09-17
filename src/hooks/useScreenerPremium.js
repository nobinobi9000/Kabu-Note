import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * japan-stock-screenerの有償相当データ（screener_stock_snapshots上位30銘柄）を取得するフック。
 * profiles.is_screener_premiumがtrueのユーザーのみ、RLS経由で実際にデータが返ってくる
 * （フラグが無いユーザーはDB側のRLSでブロックされ空配列になる。2026-09-17追加、仮運用）。
 *
 * 返り値:
 *   isPremium : boolean（is_screener_premiumの値）
 *   top30     : 配列（isPremiumがfalseの場合は常に空配列）
 *   loading   : boolean
 */
export function useScreenerPremium() {
  const { user } = useAuth()
  const [isPremium, setIsPremium] = useState(false)
  const [top30, setTop30] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_screener_premium')
        .eq('id', user.id)
        .maybeSingle()

      const premium = Boolean(profile?.is_screener_premium)
      if (cancelled) return
      setIsPremium(premium)

      if (!premium) {
        setTop30([])
        setLoading(false)
        return
      }

      const { data: latestRow } = await supabase
        .from('screener_snapshots')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!latestRow) {
        setTop30([])
        setLoading(false)
        return
      }

      const { data: stocks } = await supabase
        .from('screener_stock_snapshots')
        .select('code, name, sector, close_price, jvqm_score, momentum_12m, near_52w_high')
        .eq('snapshot_date', latestRow.snapshot_date)
        .not('jvqm_score', 'is', null)
        .order('jvqm_score', { ascending: false })
        .limit(30)

      if (!cancelled) {
        setTop30(stocks || [])
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user])

  return { isPremium, top30, loading }
}
