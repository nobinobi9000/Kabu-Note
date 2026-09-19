// Kabu Note Service Worker
// Web Push通知 + オフラインキャッシュ（kabu-signalの実装を移植、2026-09-19）

// バージョンを上げるとブラウザがsw.js自体の変更を検知し、
// install→activateで旧キャッシュを破棄して新しいJSを配信し直す。
const CACHE_NAME = 'kabu-note-v1'
const PRECACHE_URLS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // cache.addAll()は1件でも404/ネットワークエラーだと全体がrejectし、
      // installイベント自体が失敗する(kabu-signalで2026-09-10に実際に発生した不具合)。
      // 個々のURLで失敗しても他は続行し、install自体は必ず成功させる。
      Promise.all(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('[sw] precache失敗:', url, err))
        )
      )
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(response => {
        if (response.ok && response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        }
        return response
      })
    })
  )
})

// Push通知の受信・表示
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? '📈 Kabu Note'
  const options = {
    body:      data.body ?? '',
    icon:      '/icon-192.png',
    badge:     '/icon-192.png',
    tag:       data.tag ?? 'kabu-note',
    renotify:  true,
    data:      { url: data.url ?? '/dashboard', signal: data.data },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 通知クリック時：該当ページを開く
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const url = event.notification.data?.url ?? '/dashboard'
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
