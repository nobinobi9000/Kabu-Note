import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * 優待レコードを管理するフック。
 *
 * 返り値:
 *   records         : yutai_records 全件
 *   loading         : boolean
 *   addYutai        : (data) => Promise<void>
 *   updateYutai     : (id, data) => Promise<void>
 *   deleteYutai     : (id) => Promise<void>
 *   getYutaiForCode : (code) => records[]
 */
export function useYutai() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('yutai_records')
      .select('*')
      .eq('user_id', user.id)
      .order('month')
    setRecords(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  async function addYutai(data) {
    if (!user) return
    await supabase.from('yutai_records').insert({
      ...data,
      user_id: user.id,
    })
    await fetch()
  }

  async function updateYutai(id, data) {
    await supabase.from('yutai_records').update(data).eq('id', id)
    await fetch()
  }

  async function deleteYutai(id) {
    await supabase.from('yutai_records').delete().eq('id', id)
    await fetch()
  }

  function getYutaiForCode(code) {
    return records.filter(r => r.code === code)
  }

  return { records, loading, addYutai, updateYutai, deleteYutai, getYutaiForCode }
}
