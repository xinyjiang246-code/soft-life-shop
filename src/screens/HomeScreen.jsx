import { ChevronRight, CloudRain, CloudSun, Globe, Heart, Menu, MoonStar, Plus, Refrigerator, Search, ShoppingBag, Sparkles, Sun, Wand2, X } from 'lucide-react'
import { useMemo, useState, useEffect, useRef } from 'react'
import { CHARITY, counters, dateSeed, getTodayHint, getTodaySpecial, hashSeed, levelForMeals, menuItems, NEIGHBOR_NAME, PET_NAME, petStages, pickNeighborLine } from '../data.js'
import { WORLD_KITCHENS } from '../dishForge.js'
import { loadMood, saveMood } from '../storage.js'
import FlipImage from '../components/FlipImage.jsx'
import DishArt from '../components/DishArt.jsx'
import SoftPet, { moodFromEmoji, neighborArtUrl } from '../components/SoftPet.jsx'
import PetPops, { spawnPops } from '../components/PetPops.jsx'
import { playPatReaction, zoneFromPoint } from '../petTouch.js'
import ShopRow from '../components/ShopRow.jsx'
import matchaLatteDraw from '../assets/products/matcha-latte-draw.webp'
import matchaLatteReal from '../assets/products/matcha-latte-real.webp'
// 「MORE 小角落」四块磁贴的小画：前三块是水彩小图，第一块直接用软软的实时形象
import tileCharity from '../assets/tiles/charity.webp'
import tileArchive from '../assets/tiles/archive.webp'
import tileMyshop from '../assets/tiles/myshop.webp'

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

function AmbienceStrip() {
  const phase = getPhase()
  const weather = getWeather(phase)
  const WIcon = weather.Icon
  return (
    <div className={`home-ambience is-${phase.id} ${weather.id === 'rain' ? 'has-rain' : ''} ${weather.id === 'night' ? 'has-stars' : ''}`} role="status">
      {weather.id === 'rain' && (
        <i className="amb-rain" aria-hidden="true"><span /><span /><span /><span /><span /></i>
      )}
      {weather.id === 'night' && (
        <i className="amb-stars" aria-hidden="true"><span /><span /><span /><span /><span /><span /></i>
      )}
      <p className="amb-greet">
        <b>{phase.greet}，欢迎回来</b>
        <span><WIcon size={14} strokeWidth={1.6} />{weather.label} · {weather.line}</span>
      </p>
    </div>
  )
}

/* ---------- 每日心情仪式：今天想被什么治愈？ ---------- */

const MOODS = [
  { id: 'sweet', label: '甜一点', shops: ['dessert'], line: '那今天，就从一份甜的开始。' },
  { id: 'warm', label: '热乎的', shops: ['bento', 'noodle'], line: '胃暖了，人就松下来了。' },
  { id: 'tea', label: '清爽提神', shops: ['tea'], line: '先让舌头醒过来。' },
  { id: 'dimsum', label: '慢慢吃', shops: ['dimsum'], line: '一盅两件，不赶时间。' },
  { id: 'life', label: '逛逛选物', shops: ['life'], line: '今天想照顾的不是胃。' },
]

function MoodRitual({ mood, onPick }) {
  const cfg = MOODS.find((m) => m.id === mood)
  return (
    <section className="mood-ritual" aria-label="今日心情">
      <div className="mood-ritual-head">
        <Sparkles size={13} strokeWidth={1.7} />
        <span>今天，想被什么治愈？</span>
        <em>DAILY MOOD</em>
      </div>
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
      </div>
      <p className="mood-ritual-line">
        {cfg ? cfg.line : '选一个，小铺按心情帮你把店铺排好序'}
      </p>
    </section>
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
          ? <img className="neighbor-cat" src={art} alt="" />
          : <SoftPet stage={levelForMeals(pet.meals)} mood={moodFromEmoji(line.mood)} colorway={pet.colorway || 'cream'} size={62} />}
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

const CAT_SAY = ['喵～', '咕噜咕噜……', '（蹭了一下你的裤脚）', '（尾巴绕住了你的手腕）', '喵呜——', '（就地翻了个身）']

function HomeCat({ pet }) {
  const level = levelForMeals(pet.meals)
  const [pos, setPos] = useState({ x: 64, dir: -1 })
  const [walking, setWalking] = useState(false)
  const [jumping, setJumping] = useState(false)
  const [bubble, setBubble] = useState(null)
  const [loved, setLoved] = useState(false)
  const timer = useRef(null)
  const bubbleTimer = useRef(null)

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
    setBubble(CAT_SAY[Math.floor(Math.random() * CAT_SAY.length)])
    clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => { setBubble(null); setLoved(false) }, 2100)

    // 摸它也要有身体反应（和宠物页同一套：分部位 + 形变 + 指尖小图）
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const hasPoint = !(e.clientX === 0 && e.clientY === 0)
    const zone = hasPoint ? zoneFromPoint(rect, e.clientX, e.clientY) : 'tummy'
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
    <div className="home-cat" aria-label={`${PET_NAME}在小铺里溜达`}>
      <button className="home-cat-btn" style={{ left: `${pos.x}%` }} onClick={tapCat} aria-label={`摸摸${PET_NAME}`}>
        <span className="home-cat-flip" style={{ transform: `scaleX(${pos.dir})` }}>
          <span className={`home-cat-body ${walking ? 'is-walking' : ''} ${jumping ? 'is-jumping' : ''}`}>
            <span className="home-cat-hit" ref={hitRef}>
              <SoftPet stage={level} mood={loved ? 'love' : 'happy'} colorway={pet.colorway || 'cream'} size={58} />
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
  const stage = petStages[levelForMeals(pet.meals)]
  const todaySpecial = useMemo(() => getTodaySpecial(), [])
  const hint = useMemo(
    () => getTodayHint({ hasCart: cartCount > 0, cartCount, petMeals: pet.meals }),
    [cartCount, pet.meals]
  )
  const [hintOpen, setHintOpen] = useState(true)
  const [kind, setKind] = useState('all')

  // 每日心情（跨天自动作废）
  const today = dateSeed()
  const [mood, setMood] = useState(() => loadMood(today))
  const pickMood = (m) => { setMood(m); saveMood(today, m) }
  const moodCfg = MOODS.find((m) => m.id === mood)

  // 邻居猫今天在哪个角落串门（0 hero / 1 店铺列表 / 2 今日特调）
  const visitSpot = today % 3

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

      <AmbienceStrip />

      <section className="hero pet-host" id="top" aria-label="慢活小铺">
        <div className="hero-copy">
          <p className="hero-issue">THE SOFT HOUR <em>VOL.09</em></p>
          <h1>今天，也要<br />好好吃饭。</h1>
          <p className="hero-quote">慢慢点，慢慢等，<br />慢慢吃完一顿不着急的饭。</p>
          <span className="hero-foot">一间给生活留白的小铺<small>EST. 2026</small></span>
          <i className="hero-stamp" aria-hidden="true">慢</i>
        </div>
        <div className="hero-flip">
          <span className="hero-tape" aria-hidden="true" />
          <FlipImage front={matchaLatteDraw} back={matchaLatteReal} alt="慢活小铺 · 冰抹茶拿铁" />
          <span className="hero-cap" aria-hidden="true">冰抹茶拿铁 <em>NO.01</em></span>
        </div>
        {visitSpot === 0 && <PetVisit pet={pet} onNavigate={onNavigate} />}
      </section>

      <MoodRitual mood={mood} onPick={pickMood} />

      {/* 分类筛选 */}
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

      {/* 店铺列表 —— 外卖软件的主视图 */}
      <section className="shop-list-section pet-host" aria-labelledby="shop-list-heading">
        <div className="shop-list-head">
          <h2 id="shop-list-heading" className="section-title">NEARBY SHOPS <em>{String(shownShops.length).padStart(2, '0')}/{String(counters.length).padStart(2, '0')}</em></h2>
          <span className="shop-list-sub">都在你家 2 公里内 · 全部虚拟</span>
          {visitSpot === 1 && <PetVisit pet={pet} onNavigate={onNavigate} />}
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

      {/* 今日特调：AI 每天自动生成一款 */}
      <section className="daily-special pet-host" aria-label="今日特调">
        <div className="special-head">
          <span className="special-badge"><Sparkles size={12} strokeWidth={1.8} />AI · 今日特调</span>
          <span className="special-day">DAY {String(dateSeed() % 365).padStart(3, '0')}</span>
        </div>
        <div className="special-body">
          <div className="special-art" aria-hidden="true">
            <DishArt
              kind="cup"
              hex={todaySpecial.color}
              city="慢活小铺"
              cityEn="SOFT LIFE"
              code="TODAY"
              label={todaySpecial.cn}
              en={todaySpecial.en}
              compact
            />
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
        <span className="world-entry-flag" style={{ background: worldKitchen?.hex || 'var(--sage)' }} aria-hidden="true">
          <Globe size={18} strokeWidth={1.6} />
        </span>
        <span className="world-entry-copy">
          <b>世界菜单 · 今日空运自{worldKitchen?.city || '远方'}</b>
          <small>{WORLD_KITCHENS.length} 座城市的菜，AI 每天现编一桌，世界上并没有</small>
        </span>
        <Sparkles size={18} strokeWidth={1.35} />
      </button>

      {/* 更多小角落：四张磁贴 */}
      <section className="corner-section" aria-label="更多小角落">
        <div className="section-rule"><span /></div>
        <h2 className="section-title">MORE <em>小角落</em></h2>
        <div className="corner-grid">
          <button className="corner-tile" onClick={() => onNavigate('pet')}>
            <span className="corner-tile-icon pet-entry-avatar" aria-hidden="true">
              <SoftPet stage={levelForMeals(pet.meals)} mood={pet.meals > 0 ? 'happy' : 'sleepy'} colorway={pet.colorway || 'cream'} size={44} />
            </span>
            <b>{PET_NAME}的小屋</b>
            <small>{stage.name} · {pet.meals > 0 ? `已少吃 ${pet.meals} 次外卖` : '每少点一次就长大一点'}</small>
          </button>
          <button className="corner-tile" onClick={() => onNavigate('charity')}>
            <span className="corner-tile-icon is-charity" aria-hidden="true">
              <img className="corner-tile-art" src={tileCharity} alt="" loading="lazy" />
            </span>
            <b>{CHARITY.name}</b>
            <small>{charity.grams > 0 ? `记下 ${charity.grams.toLocaleString()} g · 还没捐` : '点完一餐，按克记一点'}</small>
          </button>
          <button className="corner-tile" onClick={() => onNavigate('archive')}>
            <span className="corner-tile-icon is-archive" aria-hidden="true">
              <img className="corner-tile-art" src={tileArchive} alt="" loading="lazy" />
            </span>
            <b>把这一餐存下来</b>
            <small>拍一张，做慢活食物存档</small>
          </button>
          <button className="corner-tile" onClick={() => onNavigate('myshop')}>
            <span className="corner-tile-icon is-myshop" aria-hidden="true">
              <img className="corner-tile-art" src={tileMyshop} alt="" loading="lazy" />
            </span>
            <b>我的小店</b>
            <small>{customItems.length > 0 ? `已上架 ${customItems.length} 件` : '拍照上架，AI 取名定价'}</small>
          </button>
        </div>
      </section>

      {/* 软软在小铺里溜达：走来走去、偶尔跳一下，点它会蹭你 */}
      <HomeCat pet={pet} />

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
