// Push通知送信API(Vercel serverless function)。GitHub Actionsのバッチから
// CRON_SECRETのBearerトークンで呼ばれる。kabu-signalの/api/push/sendと同じ設計
// (2026-09-19、通知ロジック移行の一環)。
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function initVapid() {
  const subject = process.env.VAPID_SUBJECT
  const pubKey = process.env.VITE_VAPID_PUBLIC_KEY
  const privKey = process.env.VAPID_PRIVATE_KEY
  if (subject && pubKey && privKey) {
    webpush.setVapidDetails(subject, pubKey, privKey)
  }
}

function checkAuth(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  return token === process.env.CRON_SECRET
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  initVapid()
  if (!checkAuth(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { signals } = req.body || {}
  if (!signals || signals.length === 0) {
    res.status(200).json({ ok: true, sent: 0, message: 'no signals' })
    return
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )

  const targetUserIds = [...new Set(signals.filter((s) => s.user_id).map((s) => s.user_id))]
  const needsBroadcast = signals.some((s) => !s.user_id)

  const subsByUser = new Map()
  if (targetUserIds.length > 0) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, subscription, user_id')
      .in('user_id', targetUserIds)
    if (error) {
      res.status(500).json({ error: 'failed to fetch subscriptions' })
      return
    }
    for (const row of data ?? []) {
      if (!row.user_id) continue
      const list = subsByUser.get(row.user_id) ?? []
      list.push(row)
      subsByUser.set(row.user_id, list)
    }
  }

  let broadcastSubs = []
  if (needsBroadcast) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, subscription')
    if (error) {
      res.status(500).json({ error: 'failed to fetch subscriptions' })
      return
    }
    broadcastSubs = data ?? []
  }

  const results = { sent: 0, failed: 0 }

  for (const notif of signals) {
    const payload = JSON.stringify({
      title: notif.title,
      body: notif.body,
      tag: notif.tag,
      url: notif.url,
      data: notif.data,
      icon: '/icon-192.png',
    })

    const targets = notif.user_id ? (subsByUser.get(notif.user_id) ?? []) : broadcastSubs

    for (const sub of targets) {
      try {
        await webpush.sendNotification(sub.subscription, payload)
        results.sent++
      } catch (err) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        results.failed++
      }
    }
  }

  res.status(200).json({ ok: true, ...results })
}
