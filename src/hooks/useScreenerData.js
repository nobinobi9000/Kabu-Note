import { useState, useEffect } from 'react'

// raw.githubusercontent.com 経由で取得することで 301 リダイレクト + CORS 問題を回避する
// GitHub Pages URL は 301 → CORS 未対応のリダイレクト先に飛ぶため使用しない
const SCREENER_URL = 'https://raw.githubusercontent.com/nobinobi9000/japan-stock-screener/main/docs/latest.json'
const CACHE_KEY    = 'screener_latest'
const CACHE_DATE_KEY = 'screener_latest_date'

/**
 * 日本株スクリーナーの latest.json を取得するフック。
 * 当日キャッシュ（localStorage）を使い、1日1回だけ実際に fetch する。
 *
 * 返り値:
 *   data    : { date, top3, sector_heatmap } | null
 *   loading : boolean
 *   error   : string | null
 */
export function useScreenerData() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    async function load() {
      // キャッシュ確認（当日のデータがあればそれを使う）
      const cachedDate = localStorage.getItem(CACHE_DATE_KEY)
      const today      = new Date().toISOString().slice(0, 10)

      if (cachedDate === today) {
        const cachedRaw = localStorage.getItem(CACHE_KEY)
        if (cachedRaw) {
          try {
            setData(JSON.parse(cachedRaw))
            setLoading(false)
            return
          } catch {
            // キャッシュ破損 → 再フェッチ
          }
        }
      }

      // 実際に fetch
      try {
        const res = await fetch(SCREENER_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        localStorage.setItem(CACHE_KEY,      JSON.stringify(json))
        localStorage.setItem(CACHE_DATE_KEY, today)
        setData(json)
      } catch (e) {
        // フェッチ失敗時は古いキャッシュがあれば使う
        const staleRaw = localStorage.getItem(CACHE_KEY)
        if (staleRaw) {
          try {
            setData(JSON.parse(staleRaw))
          } catch {
            setError('データの取得に失敗しました')
          }
        } else {
          setError('データの取得に失敗しました')
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return { data, loading, error }
}
