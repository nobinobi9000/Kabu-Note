import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * brokersマスタ（証券会社）を、ユーザーごとの表示順(profiles.broker_order)・
 * 非表示設定(profiles.hidden_brokers)を反映した状態で取得するフック。
 * 銘柄追加・編集モーダル、証券会社フィルタの選択肢に使う
 * （2026-09-22、証券会社の自由入力を廃止しマスタ化。2026-09-23、個人ごとの並び替え・非表示に対応）。
 *
 * - brokers    : 非表示を除いた、表示順どおりの一覧（通常の選択肢用）
 * - allBrokers : 非表示も含めた全件（個人設定の管理画面用）
 * - hiddenIds  : 非表示にしている brokers.id の Set
 */
export function useBrokers() {
  const { user } = useAuth()
  const [master, setMaster] = useState([])
  const [order, setOrder]   = useState(null) // brokers.idのuuid配列 or null(デフォルト順)
  const [hidden, setHidden] = useState([])   // 非表示にしたbrokers.idの配列
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from('brokers').select('id, name').order('sort_order', { ascending: true }),
      supabase.from('profiles').select('broker_order, hidden_brokers').eq('id', user.id).maybeSingle(),
    ])
    setMaster(b || [])
    setOrder(p?.broker_order || null)
    setHidden(p?.hidden_brokers || [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // ユーザーの並び順があればそれを優先し、未登録の証券会社はデフォルト順のまま末尾に追加する
  const allBrokers = useMemo(() => {
    if (!order || order.length === 0) return master
    const byId = Object.fromEntries(master.map(b => [b.id, b]))
    const ordered    = order.map(id => byId[id]).filter(Boolean)
    const orderedIds = new Set(ordered.map(b => b.id))
    const remaining  = master.filter(b => !orderedIds.has(b.id))
    return [...ordered, ...remaining]
  }, [master, order])

  const hiddenIds = useMemo(() => new Set(hidden), [hidden])
  const brokers = useMemo(
    () => allBrokers.filter(b => !hiddenIds.has(b.id)),
    [allBrokers, hiddenIds]
  )

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

  // 非表示のON/OFFを切り替える（自分の表示のみ。口座を持っていない証券会社を選択肢から隠す用途）
  async function toggleHidden(brokerId) {
    if (!user) return
    const next = hiddenIds.has(brokerId)
      ? hidden.filter(id => id !== brokerId)
      : [...hidden, brokerId]
    setHidden(next)
    await supabase.from('profiles').upsert({
      id:             user.id,
      hidden_brokers: next,
      updated_at:     new Date().toISOString(),
    })
  }

  return { brokers, allBrokers, hiddenIds, loading, saveOrder, toggleHidden }
}
