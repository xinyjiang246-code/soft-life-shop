import { ChevronRight, CloudRain, CloudSun, Globe, Heart, Menu, MoonStar, Plane, Plus, Refrigerator, Search, ShoppingBag, Sparkles, Sun, Wand2, X } from 'lucide-react'
import { useMemo, useState, useEffect, useRef } from 'react'
import { CHARITY, counters, dateSeed, getSpecialRun, getTodayHint, getTodaySpecial, hashSeed, levelForMeals, menuItems, NEIGHBOR_NAME, petNameFor, pickNeighborLine, toItemFromSpecial } from '../data.js'
import { WORLD_KITCHENS } from '../dishForge.js'
import { hasVisited, loadMood, markVisited, saveMood } from '../storage.js'
import HomeCover from '../components/HomeCover.jsx'
import ItemArt from '../components/ItemArt.jsx'
import SoftPet, { moodFromEmoji, neighborArtUrl } from '../components/SoftPet.jsx'
import PetPops, { spawnPops } from '../components/PetPops.jsx'
import { MOOD_BY_ZONE, patLine, playPatReaction, zoneFromPoint } from '../petTouch.js'
import { getTodaySnapshot, todayDoneLines, todayOfferLines } from '../today.js'
import ShopRow from '../components/ShopRow.jsx'
import Onboarding from '../components/Onboarding.jsx'
// 封面图：全站第一眼看到的东西 —— 现在是一叠实拍（见下面的 HomeCover）
// 「MORE 小角落」四块磁贴的小画：前三块是水彩小图，第一块直接用软软的实时形象

// 分类筛选用的短标签
const KIND_LABEL = {
  tea: '茶饮',
  bento: '便当',
  dessert: '甜点',
  life: '选物',
  noodle: '面食',
  dimsum: '点心',
}

/* ---------- 时段 × 天气：首页氛围条 ---------- */

function getPhase() {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return { id: 'morning', greet: '早安', line: '新的一天，慢慢来' }
  if (h >= 11 && h < 14) return { id: 'noon', greet: '午安', line: '正午的阳光刚好落在桌上' }
  if (h >= 14 && h < 18) return { id: 'afternoon', greet: '下午好', line: '一段留白的下午时光' }
  if (h >= 18 && h < 23) return { id: 'evening', greet: '晚上好', line: '今晚把自己交给一顿好饭' }
  return { id: 'late', greet: '夜深了', line: '这么晚还醒着，辛苦啦' }
}

const WEATHERS = [
  { id: 'sunny', label: '晴', line: '阳光正好，适合慢慢逛', Icon: Sun },
  { id: 'cloudy', label: '多云', line: '云朵路过的小镇', Icon: CloudSun },
  { id: 'rain', label: '小雨', line: '有小雨，等餐正好听雨', Icon: CloudRain },
]

// 天气按「天种子」全天一致（和配送页每次随机的天气互不干扰）
function getWeather(phase) {
  if (phase.id === 'late' || phase.id === 'evening') {
    return { id: 'night', label: '星夜', line: '今晚有星星', Icon: MoonStar }
  }
  return WEATHERS[hashSeed(`${dateSeed()}:wx`) % WEATHERS.length]
}

/* ---------- 每日心情仪式：今天想被什么治愈？ ---------- */

const MOODS = [
  { id: 'sweet', label: '甜一点', shops: ['dessert'], line: '那今天，就从一份甜的开始。' },
  { id: 'warm', label: '热乎的', shops: ['bento', 'noodle'], line: '胃暖了，人就松下来了。' },
  { id: 'tea', label: '清爽提神', shops: ['tea'], line: '先让舌头醒过来。' },
  { id: 'dimsum', label: '慢慢吃', shops: ['dimsum'], line: '一盅两件，不赶时间。' },
  { id: 'life', label: '逛逛选物', shops: ['life'], line: '今天想照顾的不是胃。' },
]

function MoodRitual({ mood, onPick, worldCity, onGoWorld }) {
  const cfg = MOODS.find((m) => m.id === mood)
  return (
    <div className="mood-ritual is-compact" aria-label="今日心情">
      <span className="mr-label"><Sparkles size={12} strokeWidth={1.7} aria-hidden="true" />想被什么治愈？</span>
      <div className="mood-ritual-row" role="group">
        {MOODS.map((m) => (
          <button
            key={m.id}
            className={`mood-chip ${mood === m.id ? 'is-active' : ''}`}
            aria-pressed={mood === m.id}
            onClick={() => onPick(mood === m.id ? null : m.id)}
          >
            {m.label}
          </button>
        ))}
        {/* 世界菜单 chip（09-24 用户「放在甜一点旁边」）：排尾的老成员，但长着
            邮戳的血统 —— 齿孔虚线边 + 小飞机，读得出「我 不是心情，是另一个入口」。
            它顶替了原来浮在右下角的悬浮邮戳（同屏不出现两个入口）。 */}
        <button
          className="mood-chip is-world"
          aria-label={`世界菜单 · 今日空运自${worldCity || '远方'}`}
          onClick={onGoWorld}
        >
          <Plane size={12} strokeWidth={1.7} aria-hidden="true" />
          空运 · {worldCity || '远方'}
        </button>
      </div>
      {cfg && <p className="mood-ritual-line">{cfg.line}</p>}
    </div>
  )
}

/* ---------- 邻居猫串门：每天换个角落，点它说话 ---------- */
// 串门的是隔壁那只大猫（不成长，只有一张图）；你自己的猫「软软」在小屋里养。

function PetVisit({ pet, onNavigate }) {
  const [open, setOpen] = useState(false)
  const line = useMemo(() => pickNeighborLine(), [])
  const art = neighborArtUrl()
  return (
    <div className={`pet-visit ${open ? 'is-open' : ''}`}>
      <button className="pet-visit-btn" aria-label={`和${NEIGHBOR_NAME}打个招呼`} onClick={() => setOpen((o) => !o)}>
        {art
          ? <img className="neighbor-cat" src={art} alt="" loading="lazy" decoding="async" />
          : <SoftPet stage={levelForMeals(pet.meals)} mood={moodFromEmoji(line.mood)} colorway={pet.colorway || 'cream'} species={pet.species || 'cat'} size={62} />}
      </button>
      {open && (
        <div className="pet-visit-bubble" role="status">
          <i aria-hidden="true">{line.mood}</i>
          <p>{line.line}</p>
          <span
            role="button"
            tabIndex={0}
            onClick={() => onNavigate('pet')}
            onKeyDown={(e) => e.key === 'Enter' && onNavigate('pet')}
          >
            去小屋看看 →
          </span>
        </div>
      )}
    </div>
  )
}

function TopBar({ count, wishCount, onOpenMenu, onNavigate }) {
  return (
    <header className="topbar">
      <button className="icon-button menu-button" aria-label="打开全部店铺" onClick={onOpenMenu}>
        <Menu size={27} strokeWidth={1.4} />
      </button>
      <a className="brand" href="#top" onClick={(e) => { e.preventDefault(); onNavigate('home') }}>
        Soft Life
      </a>
      <nav className="nav-actions" aria-label="快捷操作">
        <button className="icon-button" aria-label="搜索" onClick={() => onNavigate('search')}>
          <Search size={22} strokeWidth={1.45} />
        </button>
        <button
          className="icon-button cart-button"
          aria-label={wishCount > 0 ? `心愿单，已记着 ${wishCount} 样` : '心愿单'}
          onClick={() => onNavigate('wishlist')}
        >
          <Heart size={22} strokeWidth={1.45} />
          {wishCount > 0 && <span className="cart-count wish-count">{wishCount}</span>}
        </button>
        <button className="icon-button cart-button bag-button" aria-label={`购物袋，${count} 件商品`} onClick={() => onNavigate('cart')}>
          <ShoppingBag size={21} strokeWidth={1.45} />
          {count > 0 && <span className="cart-count">{count}</span>}
        </button>
      </nav>
    </header>
  )
}

/* ---- 主页溜达猫：在页面底部走来走去、偶尔跳一下，点了会蹭你 ---- */

function HomeCat({ pet }) {
  const level = levelForMeals(pet.meals)
  const name = petNameFor(pet.species || 'cat')
  const species = pet.species || 'cat'
  const [pos, setPos] = useState({ x: 64, dir: -1 })
  const [walking, setWalking] = useState(false)
  const [jumping, setJumping] = useState(false)
  const [bubble, setBubble] = useState(null)
  const [loved, setLoved] = useState(false)
  const [zone, setZone] = useState('tummy')
  const timer = useRef(null)
  const bubbleTimer = useRef(null)
  const streakRef = useRef(0)     // 同一部位连续摸了几下（里程碑按它算，同宠物页）
  const lastZoneRef = useRef(null)

  // 随机作息：散步 → 发呆 → 偶尔原地跳。prefers-reduced-motion 时只坐着
  useEffect(() => {
    let alive = true
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const act = () => {
      if (!alive) return
      const roll = Math.random()
      if (roll < 0.62) {
        // 走有距离的一段路：目标至少离当前位置 28%，才像在跑
        setPos((p) => {
          let target = p.x + (Math.random() < 0.5 ? -1 : 1) * (28 + Math.random() * 46)
          target = Math.max(6, Math.min(84, target))
          return { x: target, dir: target >= p.x ? 1 : -1 }
        })
        setWalking(true)
        timer.current = setTimeout(() => {
          if (!alive) return
          setWalking(false)
          timer.current = setTimeout(act, 900 + Math.random() * 2200)
        }, 1300 + Math.random() * 1200)
      } else if (roll < 0.88) {
        setJumping(true)
        timer.current = setTimeout(() => {
          if (!alive) return
          setJumping(false)
          timer.current = setTimeout(act, 1000 + Math.random() * 2200)
        }, 760)
      } else {
        timer.current = setTimeout(act, 1200 + Math.random() * 1800)
      }
    }
    timer.current = setTimeout(act, 1200)
    return () => { alive = false; clearTimeout(timer.current) }
  }, [])

  const [pops, setPops] = useState([])
  const hitRef = useRef(null)
  const tapCat = (e) => {
    setLoved(true)
    clearTimeout(bubbleTimer.current)

    // 摸它也要有身体反应（和宠物页同一套：分部位 + 形变 + 指尖小图）
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const hasPoint = !(e.clientX === 0 && e.clientY === 0)
    const zone = hasPoint ? zoneFromPoint(rect, e.clientX, e.clientY) : 'tummy'
    // 摸哪儿说哪儿：台词也走部位（以前是随机 CAT_SAY，跟摸哪儿无关，
    // 在这个尺寸上就成了「摸哪儿都一样」的主因之一）
    const streak = zone === lastZoneRef.current ? streakRef.current + 1 : 1
    lastZoneRef.current = zone
    streakRef.current = streak
    setZone(zone)
    setBubble(patLine(zone, streak))
    bubbleTimer.current = setTimeout(() => { setBubble(null); setLoved(false) }, 2100)

    playPatReaction(hitRef.current, zone, 0)
    const batch = spawnPops(
      hasPoint ? e.clientX - rect.left : rect.width / 2,
      hasPoint ? e.clientY - rect.top : rect.height / 2,
      3,
    )
    setPops((ps) => [...ps.slice(-6), ...batch])
    setTimeout(() => setPops((ps) => ps.filter((p) => !batch.some((b) => b.id === p.id))), 1400)
  }

  return (
    <div className="home-cat" aria-label={`${name}在小铺里溜达`}>
      <button
        className="home-cat-btn"
        style={{ left: `${pos.x}%` }}
        onClick={tapCat}
        data-zone={zone}
        aria-label={`摸摸${name}——耳朵、肚子、爪子反应不一样`}
      >
        <span className="home-cat-flip" style={{ transform: `scaleX(${pos.dir})` }}>
          <span className={`home-cat-body ${walking ? 'is-walking' : ''} ${jumping ? 'is-jumping' : ''}`}>
            <span className="home-cat-hit" ref={hitRef}>
              <SoftPet
                stage={level}
                mood={loved ? MOOD_BY_ZONE[zone] || 'love' : 'happy'}
                colorway={pet.colorway || 'cream'}
                species={species}
                size={58}
              />
            </span>
          </span>
        </span>
        <PetPops pops={pops} />
      </button>
      {bubble && <span className="home-cat-bubble" role="status">{bubble}</span>}
    </div>
  )
}

export default function HomeScreen({
  cartCount,
  pet,
  customItems = [],
  worldKitchen,
  charity,
  rescueShelf = [],
  wishes = [],
  onNavigate,
  onAdd,
}) {
  const todaySpecial = useMemo(() => getTodaySpecial(), [])
  // 今日特调的商品对象（和茶饮铺菜单、购物袋里的是同一个）—— 图从这儿出，
  // 不再各页各画一份，避免「首页是手绘、菜单是实拍」这种对不上
  const todayItem = useMemo(() => toItemFromSpecial(getTodaySpecial()), [])
  // 这台设备上从没来过 —— 只用来区分首次/回访的问候语，以及那句「这里是干什么的」。
  // 一进首页就落标记，所以它只会在「第一次那一次」为真。
  const [isFirstVisit] = useState(() => !hasVisited())
  useEffect(() => {
    if (isFirstVisit) markVisited()
  }, [isFirstVisit])
  const hint = useMemo(
    () => getTodayHint({ hasCart: cartCount > 0, cartCount, petMeals: pet.meals, isFirstVisit }),
    [cartCount, pet.meals, isFirstVisit]
  )
  const [hintOpen, setHintOpen] = useState(() => {
    try { return Number(localStorage.getItem('soft-life-hint-views') || 0) < 3 } catch { return true }
  })
  // 记访问次数：第 4 次起气泡不再打扰（引导卡已经讲过了）
  useEffect(() => {
    try { localStorage.setItem('soft-life-hint-views', String(Number(localStorage.getItem('soft-life-hint-views') || 0) + 1)) } catch {}
  }, [])
  const [obOpen, setObOpen] = useState(() => { try { return !localStorage.getItem('soft-life-onboarded-v1') } catch { return false } })
  const [kind, setKind] = useState('all')

  // 每日心情（跨天自动作废）
  const today = dateSeed()
  const [mood, setMood] = useState(() => loadMood(today))
  const pickMood = (m) => { setMood(m); saveMood(today, m) }
  const moodCfg = MOODS.find((m) => m.id === mood)

  // 邻居猫今天在哪个角落串门（0 hero / 1 店铺列表 / 2 今日特调）
  const visitSpot = today % 3

  // 「封面自成一屏」：把店铺区推到毛玻璃底部导航**以下**，第一屏只有一张完整封面。
  // 为什么用 JS 量、不在 CSS 里写死 padding：底部导航的位置跟安全区 / 浏览器工具栏有关，
  // 写死一个数在别的机型上就会让「NEARBY SHOPS」透过毛玻璃显出一道影子（实测差 10px 就会透）。
  // 量的是「分隔线底 → 底部导航顶」这段空白 —— 它跟本段的 padding 互不依赖，不会来回抖。
  // 「封面自成一屏」的间距写在 CSS 里（`.home-page .shop-list-section` 的 padding-top）。
  // ⚠️ 别改成 JS 量高度：首帧字体还没落地，心情 chip 会挤成两行、大标题多一行，
  // 整段高出 70px，量出来的间距会是 0（2026-09-21 试过，白折腾一轮）。

  // 每家店的在售件数（含用户自己上架的）
  const shopCounts = useMemo(() => {
    const map = {}
    for (const shop of counters) {
      map[shop.id] = menuItems.filter((i) => i.counterId === shop.id).length
        + customItems.filter((i) => i.counterId === shop.id).length
    }
    return map
  }, [customItems])

  const kinds = useMemo(
    () => [{ id: 'all', label: '全部' }, ...counters.map((c) => ({ id: c.id, label: KIND_LABEL[c.id] || c.name }))],
    []
  )
  const shownShops = kind === 'all' ? counters : counters.filter((c) => c.id === kind)
  // 选了心情 → 匹配的店排前面（sort 稳定，其余保持原顺序）
  const orderedShops = kind === 'all' && moodCfg
    ? [...shownShops].sort((a, b) =>
        (moodCfg.shops.includes(b.id) ? 1 : 0) - (moodCfg.shops.includes(a.id) ? 1 : 0))
    : shownShops
  const forYouIds = kind === 'all' && moodCfg ? moodCfg.shops : []

  return (
    <div className="shop-page home-page">
      <TopBar count={cartCount} wishCount={wishes.length} onNavigate={onNavigate} onOpenMenu={() => onNavigate('counters')} />

      {/* 第一次来：三屏引导（看完/跳过都记账，不再弹） */}
      {obOpen && <Onboarding onDone={() => setObOpen(false)} />}

      {/* 反向 AI 推送：主动冒出来的小气泡 */}
      {hintOpen && (
        <div className="hint-bubble" role="status">
          <span className="hint-spark" aria-hidden="true"><Wand2 size={14} strokeWidth={1.6} /></span>
          <p>{hint.text}</p>
          <button className="hint-close" aria-label="收起提示" onClick={() => setHintOpen(false)}>
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      )}

      {/* 封面区块：报头 + 封面图 + 心情 + 收尾线。高度在 CSS 里跟视口绑定，
          所以不管什么机型，第一屏都只有这一整屏内容，店铺列表从折线以下才开始 ——  */}
      <div className="hm-cover">
      {/* —— 报头 · 方案 B「封面 · 图先」（2026-09-21 用户选定）
             顺序刻意是：刊头一行 → 整张封面图 → 中文大标题 → 问候。
             先看见「今天长什么样」，再读到「今天要干什么」—— 打开链接第一眼是一张图，
             而不是一张功能清单。⚠️ 别再改回「标题在左、小图在右」的双栏，
             那一版第一屏塞了四个模块，用户原话「像一个功能副页」。 —— */}
      {(() => {
        const phase = getPhase()
        const weather = getWeather(phase)
        const WIcon = weather.Icon
        // 封面那叠相纸：第 0 张就是今天的特调，后面三张是接下来几天要出场的
        const coverSpecials = getSpecialRun(4)
        const dateStr = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
        return (
          <section className={`hm-mast pet-host is-${phase.id}`} id="top" aria-label="慢活小铺">
            <p className="hm-issue">
              <b>THE SOFT HOUR</b><em>VOL.09</em>
              <span className="hm-date">{dateStr} · {weather.label}</span>
            </p>
            {/* 封面：一叠实拍（今日特调 + 接下来三杯），横扫翻看。
                2026-09-21 用户原话：「我不要蜡笔 但是其他的可以的，蜡笔看起来脏脏的」
                → 封面不再放油画棒那张；紧接着她说「这个主页的怎么不能换了」——
                上一版只给 FlipImage 传了正面、没有背面，退化成静态图，翻面手感一起丢了。
                这一版换成 HomeCover：实拍换实拍，横扫 / 点一下 / 点圆点都能翻。
                ⚠️ 别把 matchaLatteDraw 或「手绘 / 实拍」角标塞回封面。
                油画棒版仍用在菜单 / 购物袋的翻面背面（那边是「作品 ↔ 实物」对照，她没有否掉）。 */}
            {/* 点封面 = 进这一杯的商品页（2026-09-24 用户要求）。
                特调全在慢活茶饮铺，`focus` 让店铺页滚到那一行并把规格展开。 */}
            <HomeCover
              slides={coverSpecials}
              label="今天的几杯特调"
              onOpen={(s) => onNavigate('counter', { counterId: 'tea', focus: `special-${s.index}` })}
            />
            <div className="hm-copy">
              <h1>今天，也要<br />好好吃饭。</h1>
              <p className="hm-greet">
                <WIcon size={13} strokeWidth={1.7} aria-hidden="true" />
                {isFirstVisit ? `${phase.greet}，第一次来` : `${phase.greet}，欢迎回来`} —— {weather.line}。
              </p>
            </div>
            {visitSpot === 0 && <PetVisit pet={pet} onNavigate={onNavigate} />}
          </section>
        )
      })()}

      <MoodRitual mood={mood} onPick={pickMood} worldCity={worldKitchen?.city || ''} onGoWorld={() => onNavigate('world')} />

      {/* 封面到此为止：一条细分隔线收尾，顺便告诉第一次来的人下面还有东西 */}
      <p className="hm-pagehint">往下滑 · 这 {counters.length} 家店，是我替你挑的</p>
      </div>
      {/* —— /封面区块 —— */}

      {/* 店铺列表 —— 外卖软件的主视图 */}
      <section className="shop-list-section pet-host" aria-labelledby="shop-list-heading">
        <div className="shop-list-head">
          <h2 id="shop-list-heading" className="section-title">NEARBY SHOPS <em>{String(shownShops.length).padStart(2, '0')}/{String(counters.length).padStart(2, '0')}</em></h2>
          <span className="shop-list-sub">都在你家附近 · 全部虚拟</span>
          {visitSpot === 1 && <PetVisit pet={pet} onNavigate={onNavigate} />}
        </div>

        {/* 分类筛选：沉到店铺列表标题下面 —— 它本来就是这份列表的筛选器。
            留在心情下面会变成「两排 chip 挤在首屏」，正是「像功能副页」的一个来源 */}
        <div className="shop-kinds" role="tablist" aria-label="按分类看店">
          {kinds.map((k) => (
            <button
              key={k.id}
              role="tab"
              aria-selected={kind === k.id}
              className={`kind-chip ${kind === k.id ? 'is-active' : ''}`}
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="shop-list">
          {orderedShops.map((shop) => (
            <div key={shop.id} className="shop-row-wrap">
              {forYouIds.includes(shop.id) && <span className="for-you-chip">为你而选</span>}
              <ShopRow
                shop={shop}
                itemCount={shopCounts[shop.id] || 0}
                onOpen={() => onNavigate('counter', { counterId: shop.id, from: 'home' })}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 惜食柜入口 —— 今天没卖完的那几份，单独一条 */}
      {rescueShelf.length > 0 && (
        <button className="rescue-strip" onClick={() => onNavigate('rescue')}>
          <span className="rescue-strip-icon" aria-hidden="true">
            <Refrigerator size={20} strokeWidth={1.5} />
          </span>
          <span className="rescue-strip-copy">
            <b>惜食柜 <em>{rescueShelf.length} 件</em></b>
            <small>今天没卖完的，带走就不浪费</small>
          </span>
          <span className="rescue-strip-thumbs" aria-hidden="true">
            {rescueShelf.map((i) => (
              <img key={i.id} src={i.imageReal || i.image} alt="" loading="lazy" />
            ))}
          </span>
          <ChevronRight className="rescue-strip-arrow" size={17} strokeWidth={1.6} aria-hidden="true" />
        </button>
      )}

      {/* 今天的小花样：特调 + 世界菜单，归进同一个「附加内容」分区，
          和上面的「正经点饭」主流程在视觉上分开 —— 新用户能分清主次 */}
      <div className="section-rule extra-rule"><span /></div>
      <h2 className="section-title extra-title">TODAY'S EXTRA <em>今天的小花样</em></h2>
      {(() => {
        const snap = getTodaySnapshot({ rescueCount: rescueShelf.length, worldCity: worldKitchen?.city || '' })
        const lines = snap.hasToday ? todayDoneLines(snap) : todayOfferLines(snap)
        return lines.length > 0 ? (
          <div className="hm-snap">
            <p className="hm-snap-label">TODAY · {snap.label}</p>
            {lines.map((t) => <p key={t} className="amb-today-line">{t}</p>)}
          </div>
        ) : null
      })()}

      {/* 今日特调：AI 每天自动生成一款 */}
      <section className="daily-special pet-host" aria-label="今日特调">
        <div className="special-head">
          <span className="special-badge"><Sparkles size={12} strokeWidth={1.8} />AI · 今日特调</span>
          <span className="special-day">DAY {String(dateSeed() % 365).padStart(3, '0')}</span>
        </div>
        <div className="special-body">
          {/* 走统一出口 ItemArt：配了图的这杯给「实拍 ↔ 油画棒」翻面卡，
              还没配图的会自动退回原来那张手绘卡，不用在这里分情况。
              hint：96px 的图以前没有翻面提示，真机上谁也不知道能点（09-22 反馈） */}
          <div className="special-art">
            <ItemArt item={todayItem} size="sm" prefer="real" hint />
          </div>
          <div className="special-info">
            <h3>{todaySpecial.cn}</h3>
            <p className="special-en">{todaySpecial.en}</p>
            <p className="special-desc">{todaySpecial.desc}</p>
          </div>
        </div>
        <div className="special-foot">
          <span className="special-price">¥{todaySpecial.price}</span>
          <button className="special-add" onClick={() => onAdd('special-today')}>
            <Plus size={17} strokeWidth={1.5} />点这一杯
          </button>
        </div>
        <p className="special-note">每天 0 点由 AI 更换 · 只有今天有</p>
        {visitSpot === 2 && <PetVisit pet={pet} onNavigate={onNavigate} />}
      </section>

      {/* 世界菜单入口（今天飞哪座城） */}
      <button className="world-entry" onClick={() => onNavigate('world')}>
        {/* 换成今天那座城市的「空运来信」图（拿不到图时退回原来的小地球） */}
        <span
          className="world-entry-flag"
          style={{ '--world-flag-hex': worldKitchen?.hex || 'var(--sage)' }}
          aria-hidden="true"
        >
          {worldKitchen?.image
            ? <img src={worldKitchen.image} alt="" loading="lazy" />
            : <Globe size={18} strokeWidth={1.6} />}
        </span>
        <span className="world-entry-copy">
          <b>世界菜单 · 今日空运自{worldKitchen?.city || '远方'}</b>
          <small>{WORLD_KITCHENS.length} 座城市的菜，AI 每天现编一桌，世界上并没有</small>
        </span>
        <Sparkles size={18} strokeWidth={1.35} />
      </button>

      {/* 软软在小铺里溜达：走来走去、偶尔跳一下，点它会蹭你 */}
      <HomeCat pet={pet} />

      {/* 陌生人走到最底部该看到的：这铺子是谁开的、为什么会这样。
          站内一直没有一处交代「我」是谁 —— 而一个让你去喂猫的东西，
          连谁做的都不说，可疑度会翻倍（2026-09-19 用户点的「交代铺子是谁开的」）。 */}
      <section className="about-shop" aria-labelledby="about-shop-heading">
        <span className="about-label" id="about-shop-heading">ABOUT · 关于小铺</span>
        <p>
          这个铺子是一个人开的。起因是某个夜里，我不饿，却一遍遍打开外卖软件 ——
          后来才想明白：那会儿想要的不是那顿饭，是「点一次」这件事本身。
        </p>
        <p>
          所以这里的外卖不会真的送来。你省下了一顿真外卖，也省下了那笔钱；
          小铺只把它换算成猫粮记下来 —— 钱一直在你手上，等你哪天路过一个投喂点，自己送出去。
        </p>
      </section>

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
