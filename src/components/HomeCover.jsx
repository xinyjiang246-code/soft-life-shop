import { useEffect, useRef, useState } from 'react'

/**
 * HomeCover —— 首页封面：一组实拍（3–4 张）横向翻看
 *
 * 为什么有它（2026-09-21 用户报的）：
 *   上一版封面是 `<FlipImage front={实拍} />` —— 只给正面、不给背面，
 *   于是 FlipImage 退化成静态图。用户原话：「这个主页的怎么不能换了」。
 *   手绘那条路是她否掉的（「蜡笔看起来脏脏的」），所以这一版换的是**实拍换实拍**：
 *   同一杯不再翻面，而是横向翻看几杯。
 *
 * 交互（2026-09-24 改过一次，注意）：
 *   · 手指横扫 = 翻下一张（用**原生滚动 + scroll-snap**，iOS 惯性和吸附都是系统给的，
 *     不自己写 pointer 拖拽 —— 那套在页面纵向滚动里最容易打架）；
 *   · **点一下照片 = 进这一杯的商品页**（用户原话：「主页这个图片点击的话应该是能跳到
 *     对应商品页面的」）。⚠️ 这条**改掉了** 09-21 的「点一下翻下一张」——
 *     现在翻页只剩横扫 / 圆点 / 键盘，改回去之前先想清楚（守卫 verify-home-cover 盯着）；
 *   · 点圆点 = 直接跳过去；键盘 ← → 翻页，Enter / 空格 = 进商品页；
 *   · 🔴 **不自动播放、不循环催促、没有箭头**。它是一叠相纸，不是广告位。
 *
 * ⚠️ 帧高必须由 CSS 给（`.hc-viewport { height: … }`）：
 *   相纸里的每一张都是 `height:100%`，父盒子不给高度就会塌成一条。
 *   `tools/verify-flip-frames.mjs` 管的是 `.flip-frame`，这里是自己的一套类名，
 *   所以另写了断言在 `tools/verify-home-cover.mjs`（帧高 / 一张占满 / 圆点数对）。
 */
export default function HomeCover({ slides = [], label = '首页封面', onOpen }) {
  const n = slides.length
  const viewRef = useRef(null)
  const [index, setIndex] = useState(0)
  // 拖过就不再当点击 —— 否则「滑动最后一点松手」会顺带翻掉下一张
  const dragged = useRef(false)

  // 滚到哪一张 → 点亮哪一颗点。用 rAF 合流，滚动事件一次滑动会来几十个。
  useEffect(() => {
    const el = viewRef.current
    if (!el || n < 2) return undefined
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
        setIndex((prev) => (prev === i ? prev : Math.min(n - 1, Math.max(0, i))))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [n])

  const at = (i) => ((i % n) + n) % n

  // 进当前这一张的商品页。拖过（横扫）不算点 —— 否则滑动最后一点松手会顺带跳走。
  const openCurrent = () => {
    if (dragged.current) return
    const s = slides[index]
    if (s && onOpen) onOpen(s)
  }

  const goTo = (i, smooth = true) => {
    const el = viewRef.current
    if (!el) return
    el.scrollTo({ left: at(i) * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }

  if (!n) return null

  return (
    <div className={`hm-polaroid hc-cover${n > 1 ? '' : ' is-single'}`} data-index={index}>
      <div
        className="hc-viewport"
        ref={viewRef}
        role="group"
        aria-label={label}
        tabIndex={0}
        onPointerDown={(e) => { dragged.current = false; e.currentTarget.dataset.x = String(e.clientX) }}
        onPointerMove={(e) => {
          const x0 = Number(e.currentTarget.dataset.x)
          if (Number.isFinite(x0) && Math.abs(e.clientX - x0) > 8) dragged.current = true
        }}
        onClick={openCurrent}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCurrent() }
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goTo(index + 1) }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goTo(index - 1) }
        }}
      >
        {slides.map((s, i) => (
          <div className="hc-slide" key={s.id || s.cn || i} aria-hidden={i === index ? undefined : 'true'}>
            <img
              src={s.imageReal || s.image}
              alt={s.alt || s.cn || ''}
              draggable="false"
              decoding="async"
              loading={i < 2 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'auto'}
            />
          </div>
        ))}
      </div>

      <i className="hm-seal" aria-hidden="true">慢</i>

      {n > 1 && (
        <div className="hc-bar">
          <span className="hc-name">
            {index === 0 ? '今日特调 · ' : ''}{slides[index].cn}
          </span>
          <span className="hc-dots" role="tablist" aria-label="翻看封面">
            {slides.map((s, i) => (
              <button
                key={s.id || s.cn || i}
                type="button"
                role="tab"
                className={`hc-dot${i === index ? ' is-on' : ''}`}
                aria-selected={i === index}
                aria-label={`第 ${i + 1} 张 · ${s.cn || ''}`}
                onClick={() => goTo(i)}
              />
            ))}
          </span>
          <span className="hc-count">
            {String(index + 1).padStart(2, '0')}/{String(n).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  )
}
