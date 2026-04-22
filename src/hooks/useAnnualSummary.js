import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useAnnualSummary() {
  const { user } = useAuth()
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const currentYear = new Date().getFullYear()
    const { data } = await supabase
      .from('annual_summary')
      .select('*')
      .eq('user_id', user.id)
      .in('year', [currentYear - 1, currentYear])
      .order('year', { ascending: false })
    setSummaries(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  return { summaries, loading, refetch: fetch }
}
