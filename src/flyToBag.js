// 加购动线（2026-09-18）
//
// 用户要的「交互」里有一条：加购 → 购物袋 这条主动线要连贯。原来加一样东西
// 只有底部一句 toast + 顶栏角标数字悄悄 +1，东西「去哪了」完全没有交代。
//
// 这里做三件事，都在**一个模块**里完成，不改任何页面的组件代码：
//   ① 从按下处飞一个小圆点到顶栏的购物袋（走一条微微上抛的弧，不是直线）
//   ② 到位时袋子晃一下
//   ③ 角标弹一下
//
// 为什么用「记住最后一次按下的位置」而不是给每个页面的 onAdd 传 e.currentTarget：
//   onAdd 有 8 处调用点（店铺页 / 首页特调 / 惜食柜 / 搜索 / 心愿单 / 世界菜单…），
//   一个个改参数既冗长又容易漏。document 上一次性记住坐标，8 处全自动受益。
//
// ⚠️ 坑：验收脚本里是 `el.click()` —— **没有指针坐标**，clientX/Y 都是 0。
//    只监听 pointerdown 的话，自动化测试里起飞点会落在视口左上角，动效看着像 bug。
//    所以 click 阶段再兜一层：坐标是 0 就退回用被点元素的矩形中心。
//    （真机上两者都拿得到，取真实的按下点。）

const noMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let lastPoint = null

/** 在 document 上记账「最后一次按在哪」。返回清理函数，方便 React effect 直接用。 */
export function rememberPointer() {
  if (typeof document === 'undefined') return () => {}

  const centerOf = (el) => {
    const r = el?.getBoundingClientRect?.()
    if (!r || (!r.width && !r.height)) return null
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  const onPointer = (e) => {
    if (e.clientX || e.clientY) lastPoint = { x: e.clientX, y: e.clientY }
  }
  // 兜底：坐标缺失（脚本点击、键盘触发）时用被点元素自己的位置
  const onClick = (e) => {
    if (e.clientX || e.clientY) { lastPoint = { x: e.clientX, y: e.clientY }; return }
    const p = centerOf(e.target)
    if (p) lastPoint = p
  }

  document.addEventListener('pointerdown', onPointer, true)
  document.addEventListener('click', onClick, true)
  return () => {
    document.removeEventListener('pointerdown', onPointer, true)
    document.removeEventListener('click', onClick, true)
  }
}

/** 重放一个 class 上的 CSS 动画（移除 → 强制回流 → 加回） */
function replay(el, cls, ms) {
  if (!el) return
  el.classList.remove(cls)
  void el.offsetWidth // 不读一次 layout，浏览器会把两次 class 变更合并成一次，动画不重播
  el.classList.add(cls)
  setTimeout(() => el.classList.remove(cls), ms)
}

/** 把一次「加购」演出来。纯视觉：找不到袋子、动画被跳过都不影响购物车本身。 */
export function flyToBag() {
  if (typeof document === 'undefined') return
  const bag = document.querySelector('.bag-button')
  const rect = bag?.getBoundingClientRect?.()
  // 没有购物袋入口（比如在购物袋页自己里加数量）就只做数字反馈，不飞
  if (!bag || !rect) return

  // 飞行段完全交给 CSS：这里只负责把落点算出来，不硬编码尺寸（换了视口也对）
  const from = lastPoint || { x: window.innerWidth / 2, y: window.innerHeight * 0.68 }
  const dx = rect.left + rect.width / 2 - from.x
  const dy = rect.top + rect.height / 2 - from.y

  if (noMotion()) { nudgeBag(); return }

  const token = document.createElement('span')
  token.className = 'fly-token'
  token.setAttribute('aria-hidden', 'true')
  token.style.left = `${from.x}px`
  token.style.top = `${from.y}px`
  token.style.setProperty('--fly-x', `${Math.round(dx)}px`)
  token.style.setProperty('--fly-y', `${Math.round(dy)}px`)
  // 上抛的高度跟着距离走：短距离别抛那么高，否则像弹起来
  token.style.setProperty('--fly-arc', `${Math.round(Math.min(34, 14 + Math.abs(dx) * 0.16))}px`)
  document.body.appendChild(token)

  const anim = token.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0 },
      {
        transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.55}px - var(--fly-arc))) scale(.82)`,
        opacity: 1,
        offset: 0.52,
      },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.3)`,
        opacity: 0,
        offset: 1,
      },
    ],
    { duration: 520, easing: 'cubic-bezier(.36,.62,.36,1)', fill: 'forwards' },
  )

  const done = () => { token.remove(); nudgeBag() }
  anim.finished.then(done, done)
}

/** 到位的那一下：袋子晃一下 + 角标弹一下（都在 DOM 上找，不需要 React 参与） */
function nudgeBag() {
  replay(document.querySelector('.bag-button'), 'is-bumped', 460)
  replay(document.querySelector('.bag-button .cart-count'), 'is-popped', 520)
}
