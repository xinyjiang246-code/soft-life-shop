import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { STATS_ADMIN_KEY, STATS_ENDPOINT, statsConfigured } from '../stats.js'

/**
 * AdminScreen —— 「后台」：读匿名统计的大盘
 *
 * 入口（不占导航）：地址栏加 ?admin=1 打开。
 * 数据 = Worker GET /stats（四类数字 + 每日序列 + DAU），无任何个人信息。
 */

const TYPE_LABEL = { visit: '打开', order: '完成订单', grams: '记下猫粮(g)', photo: '贴进手账' }
const LAST_N_DAYS = 14

export default function AdminScreen({ onBack }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!statsConfigured()) { setErr('还没配置：先部署 worker，再改 src/stats.js 里的 ENDPOINT 和 KEY。'); return }
    setLoading(true); setErr('')
    try {
      const r = await fetch(`${STATS_ENDPOINT}/stats?key=${encodeURIComponent(STATS_ADMIN_KEY)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
    } catch (e) {
      setErr(`读不到统计：${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 最近 N 天序列
  const days = data?.days || {}
  const dau = data?.dau || {}
  const series = Array.from({ length: LAST_N_DAYS }, (_, i) => {
    const d = new Date(Date.now() - (LAST_N_DAYS - 1 - i) * 86400000)
    const key = d.toISOString().slice(0, 10)
    return { key, label: `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`, ...(days[key] || {}), dau: dau[key] || 0 }
  })
  const maxOrder = Math.max(1, ...series.map((s) => s.order || 0))

  return (
    <div className="shop-page admin-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}><ArrowLeft size={25} strokeWidth={1.4} /></button>
        <span className="topbar-title serif">小铺后台</span>
        <button className="icon-button" aria-label="刷新" onClick={load}><RefreshCw size={20} strokeWidth={1.45} className={loading ? 'spin' : ''} /></button>
      </header>

      <p className="ad-note">这里只有四类匿名数字：多少人打开、下过几单、记了几克猫粮、贴过几张照片。没有任何个人信息。</p>

      {err && <p className="ad-err">{err}</p>}

      {data && (
        <>
          <div className="ad-totals">
            {Object.entries(TYPE_LABEL).map(([t, label]) => (
              <div key={t} className="hard-pp ad-total">
                <b>{(data.totals?.[t] || 0).toLocaleString()}</b>
                <small>{label}</small>
              </div>
            ))}
          </div>

          <p className="ad-sec">最近 {LAST_N_DAYS} 天 · 完成订单</p>
          <div className="ad-chart hard-pp">
            {series.map((s) => (
              <div key={s.key} className="ad-bar-col" title={`${s.key}：打开 ${s.visit || 0} / 订单 ${s.order || 0} / ${s.dau} 人`}>
                <i style={{ height: `${Math.round(((s.order || 0) / maxOrder) * 72) + 2}px` }} />
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          <p className="ad-sec">最近 14 天 · 每日打开人数（去重）</p>
          <ul className="ad-days hard-pp">
            {series.slice().reverse().map((s) => (
              <li key={s.key}>
                <span>{s.label}</span>
                <b>{s.dau} 人</b>
                <small>{s.order || 0} 单 · {s.grams || 0} g · {s.photo || 0} 张</small>
              </li>
            ))}
          </ul>

          <p className="ad-foot">更新于 {data.updated ? new Date(data.updated).toLocaleString('zh-CN') : '—'}</p>
        </>
      )}
    </div>
  )
}
