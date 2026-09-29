import { supabase } from './supabase'

/**
 * realized_pnl / received_dividends を annual_summary に加算する。
 * DB側のRPC(increment_annual_summary)で原子的に加算するため、
 * 「読んで足して書き戻す」方式特有の加算漏れ・上書きのリスクが無い
 * (2026-09-29: annual_summaryにRLSポリシーが無く、この関数の読み書きが
 * 本人セッションからは常にブロックされ売却時のrealized_pnl記録が無言で
 * 失敗していた不具合もあわせて修正)。
 */
export async function addToAnnualSummary(userId, year, { realized_pnl = 0, received_dividends = 0 }) {
  const { error } = await supabase.rpc('increment_annual_summary', {
    p_user_id:            userId,
    p_year:               year,
    p_realized_pnl:       realized_pnl,
    p_received_dividends: received_dividends,
  })
  if (error) throw error
}
