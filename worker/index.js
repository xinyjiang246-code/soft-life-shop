/**
 * soft-life-stats —— 慢活小铺的匿名统计 Worker（Cloudflare Worker + KV）
 *
 * 只记四类数字，没有任何个人信息：
 *   visit  打开次数   order 完成订单数   grams 记下的猫粮克数   photo 贴进手账的照片数
 *
 *   POST /beat        { v: "随机访客id", e: [{ t: "order", v: 1 }] }
 *   GET  /stats?key=  管理端读数（key = 部署时设置的 secret）
 *
 * 「随机访客id」是浏览器本地生成的一次性随机串，只用来把同一天的多次打开
 * 去重成「多少人打开过」，连不上任何账号或设备信息。
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const TYPES = ['visit', 'order', 'grams', 'photo']
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)

export default {
  async fetch(req, env) {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

    if (url.pathname === '/beat' && req.method === 'POST') {
      try {
        const body = await req.json()
        const vid = String(body.v || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40)
        const events = Array.isArray(body.e) ? body.e.slice(0, 20) : []
        const day = dayKey()
        const writes = []
        for (const ev of events) {
          if (!TYPES.includes(ev.t)) continue
          const v = Math.max(0, Math.min(100000, Number(ev.v) || 1))
          writes.push(env.STATS.get(`c:${ev.t}`).then((old) => env.STATS.put(`c:${ev.t}`, String(Number(old || 0) + v))))
          writes.push(env.STATS.get(`d:${day}:${ev.t}`).then((old) => env.STATS.put(`d:${day}:${ev.t}`, String(Number(old || 0) + v))))
        }
        if (vid) writes.push(env.STATS.put(`v:${day}:${vid}`, '1'))
        await Promise.all(writes)
        return new Response('{"ok":true}', { headers: { ...CORS, 'Content-Type': 'application/json' } })
      } catch {
        return new Response('{"ok":false}', { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
    }

    if (url.pathname === '/stats' && req.method === 'GET') {
      if (url.searchParams.get('key') !== env.ADMIN_KEY) {
        return new Response('{"ok":false}', { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
      const totals = {}
      for (const t of TYPES) totals[t] = Number((await env.STATS.get(`c:${t}`)) || 0)
      // 天级序列 + DAU（KV list 默认一页 1000 个 key，日活过千再分页）
      const days = {}
      const dau = {}
      const listed = await env.STATS.list({ prefix: 'd:' })
      for (const { name } of listed.keys) {
        const [, day, t] = name.split(':')
        days[day] = days[day] || {}
        days[day][t] = Number((await env.STATS.get(name)) || 0)
      }
      const visits = await env.STATS.list({ prefix: 'v:' })
      for (const { name } of visits.keys) {
        const day = name.split(':')[1]
        dau[day] = (dau[day] || 0) + 1
      }
      return new Response(JSON.stringify({ ok: true, totals, days, dau, updated: new Date().toISOString() }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response('soft-life-stats', { status: 404, headers: CORS })
  },
}
