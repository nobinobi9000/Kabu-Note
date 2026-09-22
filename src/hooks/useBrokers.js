import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * brokersマスタ（証券会社）を、ユーザーごとの表示順(profiles.broker_order)を
 * 反映した状態で取得するフック。
 * 銘柄追加・編集モーダル、証券会社フィルタの選択肢に使う
 * （2026-09-22、証券会社の自由入力を廃止しマスタ化。2026-09-23、個人ごとの並び替えに対応）。
 */
export function useBrokers() {
  const { user } = useAuth()
  const [master, setMaster] = useState([])
  const [order, setOrder]   = useState(null) // brokers.idのuuid配列 or null(デフォルト順)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from('brokers').select('id, name').order('sort_order', { ascending: true }),
      supabase.from('profiles').select('broker_order').eq('id', user.id).maybeSingle(),
    ])
    setMaster(b || [])
    setOrder(p?.broker_order || null)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // ユーザーの並び順があればそれを優先し、未登録の証券会社はデフォルト順のまま末尾に追加する
  const brokers = useMemo(() => {
    if (!order || order.length === 0) return master
    const byId = Object.fromEntries(master.map(b => [b.id, b]))
    const ordered   = order.map(id => byId[id]).filter(Boolean)
    const orderedIds = new Set(ordered.map(b => b.id))
    const remaining = master.filter(b => !orderedIds.has(b.id))
    return [...ordered, ...remaining]
  }, [master, order])

  // 並び順を保存する（自分の表示順のみ。brokersマスタ自体・他ユーザーには影響しない）
  async function saveOrder(orderedIds) {
    if (!user) return
    setOrder(orderedIds)
    await supabase.from('profiles').upsert({
      id:           user.id,
      broker_order: orderedIds,
      updated_at:   new Date().toISOString(),
    })
  }

  return { brokers, loading, saveOrder }
}
