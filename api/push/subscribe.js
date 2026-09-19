// Push購読をSupabaseに保存するAPI(Vercel serverless function)。
// Kabu-NoteはVite製のSPAでサーバーセッションを持たないため、クライアントが
// 自身のSupabaseアクセストークンをAuthorizationヘッダーで渡し、ここで検証する
// (kabu-signalのNext.js版はCookieベースのセッションを使うが、ここでは使えないため
// この方式にした。2026-09-19、kabu-signalからの通知ロジック移行の一環)。
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const { subscription } = req.body || {}
  if (!subscription?.endpoint) {
    res.status(400).json({ error: 'subscription required' })
    return
  }

  const admin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      subscription,
    },
    { onConflict: 'endpoint' }
  )

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true })
}
