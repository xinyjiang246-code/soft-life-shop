// 慢活小铺 · Service Worker —— 离线缓存（2026-09-29）
//
// 目的：让「添加到主屏幕」的小铺离线也能开、秒开，接近原生 App。
// 策略（刻意从简，宁可离线时旧一版、也不让线上永远卡在旧壳）：
//   ① 预缓存「壳」：入口 HTML、manifest、图标、favicon —— 这些文件名稳定，install 时一次装好。
//   ② 运行时缓存「内容」：带 hash 的 index-*.js / index-*.css / assets 图片
//      —— 文件名每次构建都变（hash），不能写死，靠 stale-while-revalidate 抓下来存。
//      先给缓存里的旧版（秒开），同时后台去拿新版，下次访问自动换上。
//   ③ 导航请求（直接打开 / 刷新）：network-first —— 在线就拿最新壳，拿不到才回退缓存，
//      保证发版后用户不会被旧 HTML 卡住（旧 HTML 会引旧 hash 的 JS，恰好能命中 ② 的缓存）。
//   ④ 字体是 Google Fonts 外链，单独跨域缓存；断网回退 Georgia/Courier（index.html 里已声明）。
//
// ⚠️ 别用「整站预缓存 + skipWaiting 立即接管」那种激进模式：它会跟「发完立刻探版本」
//    的验收流程打架（用户刷新仍拿旧壳，以为没发成功）。

const CACHE_SHELL = 'soft-life-shell-v1'
const CACHE_RUNTIME = 'soft-life-runtime-v1'

// 稳定不变的壳：相对路径，跟 base './' 一致（GitHub Pages 子路径也安全）
const SHELL = [
  './',
  './manifest.webmanifest',
  './favicon.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  // 清掉旧版本的缓存桶，避免越积越多
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_SHELL && k !== CACHE_RUNTIME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // 跨域资源（Google Fonts）单独走 stale-while-revalidate，别污染同源逻辑
  if (url.origin !== self.location.origin) {
    if (url.pathname.includes('fonts.g')) {
      event.respondWith(
        caches.open(CACHE_RUNTIME).then(async (cache) => {
          const hit = await cache.match(req)
          const fetchPromise = fetch(req).then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone())
            return res
          }).catch(() => hit)
          return hit || fetchPromise
        })
      )
    }
    return
  }

  // 同源导航请求（打开页面 / 刷新）：network-first，在线拿最新、离线回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE_SHELL).then((cache) => cache.put('./', copy))
        return res
      }).catch(() => caches.match('./'))
    )
    return
  }

  // 同源静态资源（hash 的 js/css/图片）：stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_RUNTIME).then(async (cache) => {
      const hit = await cache.match(req)
      const fetchPromise = fetch(req).then((res) => {
        if (res && res.status === 200) cache.put(req, res.clone())
        return res
      }).catch(() => hit)
      return hit || fetchPromise
    })
  )
})
