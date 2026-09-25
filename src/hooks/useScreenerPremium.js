import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * japan-stock-screenerの有償相当データ（screener_stock_snapshots上位30銘柄）を取得するフック。
 * account_entitlements.planがbasic/premiumのユーザーのみ、RLS経由で実際にデータが返ってくる
 * （それ以外はDB側のRLSでブロックされ空配列になる）。
 * 2026-09-25: 仮フラグ profiles.is_screener_premium から account_entitlements に一本化。
 *
 * 返り値:
 *   isPremium : boolean（プランがbasic/premiumか）
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
      const { data: entitlement } = await supabase
        .from('account_entitlements')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle()

      const premium = entitlement?.plan === 'basic' || entitlement?.plan === 'premium'
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
