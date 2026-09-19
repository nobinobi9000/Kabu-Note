import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Push API の applicationServerKey は仕様上 BufferSource(Uint8Array)を要求する。
// 文字列のままだとSafari/WebKit(iOSのPWA含む)でsubscribe()がエラーも出さずに
// 失敗することがある(kabu-signalで2026-09-10に判明した不具合と同じ対策)。
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications() {
  const [pushEnabled, setPushEnabled] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => setPushEnabled(!!sub))
        .catch(() => setPushEnabled(false))
        .finally(() => setChecking(false))
    } else {
      setChecking(false)
    }
  }, [])

  const enablePush = useCallback(async () => {
    if (!('Notification' in window)) {
      alert('このブラウザは通知に対応していません')
      return
    }
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        alert('通知が許可されませんでした。iOSの場合は設定アプリ→Kabu Note→通知から許可してください。')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
      }

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ subscription: sub }),
      })
      if (!res.ok) {
        throw new Error(`購読の保存に失敗しました(status ${res.status})`)
      }

      setPushEnabled(true)
    } catch (e) {
      console.error('enablePush failed:', e)
      alert('通知の有効化に失敗しました。時間をおいて再度お試しください。')
      setPushEnabled(false)
    }
  }, [])

  return { pushEnabled, checking, enablePush }
}
