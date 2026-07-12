import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useWatchlist() {
  const { user }                  = useAuth()
  const [watchlist, setWatchlist] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const { data: w, error: wErr } = await supabase
        .from('watchlist')
        .select('*')
        .order('created_at', { ascending: true })
      if (wErr) throw wErr

      // 株価マスタ取得（ウォッチ対象コードのみ）
      const codes = [...new Set((w || []).map(r => r.code))]
      let stockMap = {}
      if (codes.length > 0) {
        const { data: s } = await supabase
          .from('stocks')
          .select('*')
          .in('code', codes)
        ;(s || []).forEach(r => { stockMap[r.code] = r })
      }

      const merged = (w || []).map(r => ({ ...r, stock: stockMap[r.code] || null }))
      setWatchlist(merged)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // 追加（スクリーナー由来の name/sector も受け付ける）
  async function addToWatchlist({ code, name, sector, note }) {
    const { error } = await supabase.from('watchlist').upsert({
      user_id: user.id,
      code:    String(code).trim(),
      name:    name || null,
      sector:  sector || null,
      note:    note?.trim() || null,
    }, { onConflict: 'user_id,code', ignoreDuplicates: true })
    if (error) throw error
    await fetch()
  }

  // メモ更新
  async function updateWatchlistNote(id, note) {
    const { error } = await supabase.from('watchlist')
      .update({ note: note?.trim() || null })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    await fetch()
  }

  // 削除
  async function removeFromWatchlist(id) {
    const { error } = await supabase.from('watchlist')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    await fetch()
  }

  const watchedCodes = new Set(watchlist.map(w => w.code))

  return {
    watchlist, loading, error, refetch: fetch,
    addToWatchlist, updateWatchlistNote, removeFromWatchlist,
    watchedCodes,
  }
}
