import { supabase } from './supabase'

/** realized_pnl or received_dividends を加算して annual_summary を UPSERT */
export async function addToAnnualSummary(userId, year, { realized_pnl = 0, received_dividends = 0 }) {
  const { data } = await supabase.from('annual_summary')
    .select('realized_pnl, received_dividends')
    .eq('user_id', userId).eq('year', year).maybeSingle()

  await supabase.from('annual_summary').upsert({
    user_id: userId,
    year,
    realized_pnl:          (data?.realized_pnl          || 0) + realized_pnl,
    received_dividends:    (data?.received_dividends     || 0) + received_dividends,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,year' })
}
