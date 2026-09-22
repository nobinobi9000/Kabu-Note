import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * brokersマスタ（証券会社）を取得するフック。
 * 銘柄追加・編集モーダルの選択肢に使う（2026-09-22、証券会社の自由入力を廃止しマスタ化）。
 */
export function useBrokers() {
  const [brokers, setBrokers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('brokers')
        .select('id, name')
        .order('sort_order', { ascending: true })
      if (!cancelled) {
        setBrokers(data || [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { brokers, loading }
}
