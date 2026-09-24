import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Bike, Check, FastForward, Hand, Home, Package, Scissors, ShoppingBag, Truck, X } from 'lucide-react'
import {
  OFFLINE_TASKS,
  PATIENCE_NOTE,
  petNameFor,
  RIDER_CUSTOM_REPLIES,
  RIDER_EXCHANGES,
  RIDER_LETTERS,
  RIDER_MOMENTS,
  WAIT_MODES,
  hashSeed,
  weatherTypes,
} from '../data.js'
import { DAILY_PATIENCE, loadPatience, loadWaitMode, patienceLeft, savePatience, saveWaitMode } from '../storage.js'
import SoftPet from '../components/SoftPet.jsx'
import PetPops, { spawnPops } from '../components/PetPops.jsx'
import { MOOD_BY_ZONE, patLine, playPatReaction, zoneFromPoint } from '../petTouch.js'
import RiderWindow from '../components/RiderWindow.jsx'
import RiderHop from '../components/RiderHop.jsx'
import FoldRitual from '../components/FoldRitual.jsx'

const STEPS = [
  { key: 'received', label: '接单', icon: ShoppingBag },
  { key: 'preparing', label: '备餐', icon: Package },
  { key: 'picked', label: '取餐', icon: Bike },
  { key: 'delivering', label: '配送中', icon: Truck },
]

// 前 4 步快速「预演」：每步 3 秒，让用户先看到完整流程
const STEP_DURATION = 3000

// 每个陪等方式配一个图标 —— 换方式时抬头一起换，切换立刻看得见
const WAIT_ICONS = { walk: Hand, road: Bike, offline: Scissors }

const RITUAL_TEXT = {
  received: { active: '小铺已收到你的订单', done: '温柔订单已确认' },
  preparing: { active: '正在为你准备这份治愈', done: '已为你准备好' },
  picked: { active: '骑手已取到你的订单', done: '正在向你走来' },
  delivering: { active: '在路上，再一会儿就到了', done: '即将到达' },
}

// 软软陪你等的时候说的话（按时间推进换，不随机：同一次等待里顺序稳定）
const PET_WAIT_LINES = [
  '我陪你等。反正也不急。',
  '你听，外面好像有风。',
  '骑手刚过了一个路口 —— 我猜的。',
  '要不趁这会儿去倒杯水？',
  '快到了吧……我都有点饿了。',
]

function getRitualByWeather(key, weather) {
  if (key === 'delivering') {
    if (weather.key === 'sunny') return { active: '阳光正好，路上不慢' }
    if (weather.key === 'light-rain') return { active: '小雨淅沥，请耐心等候' }
    if (weather.key === 'heavy-rain') return { active: '雨势较大，请多等一会儿' }
    return { active: '风有点大，会晚一点点' }
  }
  return RITUAL_TEXT[key]
}

function formatTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// 送达的「叮 —— 咚」（2026-09-24 用户「类似番茄钟」）：两声很轻的正弦音。
// 手机可能早就扣在桌上了，光震一下不够 —— 听见才算真的到了。
function arrivalChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    [[659.25, 0], [880, 0.18]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + at)
      gain.gain.linearRampToValueAtTime(0.07, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.55)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.6)
    })
    setTimeout(() => ctx.close?.(), 1500)
  } catch { /* 无声环境就算了，震动和摇页还在 */ }
}

export default function DeliveryScreen({ houseName, pet, onNavigate, order }) {
  const petName = petNameFor(pet?.species || 'cat')
  const petSpecies = pet?.species || 'cat'
  const weather = useMemo(() => weatherTypes[Math.floor(Math.random() * weatherTypes.length)], [])

  const baseEta = order?.baseEta || 35
  const etaMinutes = baseEta + weather.etaAdd

  // 这一单真实要等多久（2026-09-24 起 = 预计送达的分钟数，30~50 分钟，像真外卖）。
  // ⚠️ soft-life-wait-override-v1 是**验收脚本专用**的注入通道（verify-review 等守卫
  //    注入 8 秒短等待，好走完「快进/等满」流程）—— 产品代码从不写这个键。
  const waitOverride = useMemo(() => {
    try {
      const n = Number(localStorage.getItem('soft-life-wait-override-v1'))
      return n > 0 && n <= 3600 ? Math.round(n) : null
    } catch { return null }
  }, [])

  const [stepIndex, setStepIndex] = useState(0)
  const [phase, setPhase] = useState('preview') // 'preview' 快速预演 → 'waiting' 真实等待
  const [totalSeconds, setTotalSeconds] = useState(() => waitOverride || Math.min(60, Math.max(1, etaMinutes)) * 60)
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds)
  const [arriving, setArriving] = useState(false) // 等满那一瞬：页面轻摇 + 手机震动
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [exchangeDone, setExchangeDone] = useState(null)
  // 自己写的那一句（2026-09-22 用户要的「加一个自定义」）—— 打开面板就清空上次的
  const [customText, setCustomText] = useState('')
  const [patience, setPatience] = useState(() => loadPatience())
  const [offlineDone, setOfflineDone] = useState(false)
  const [petLine, setPetLine] = useState(null)
  // 摸软软：跟小屋 / 首页同一套（六部位形变 + 部位台词 + 指尖小图）
  const [patZone, setPatZone] = useState('tummy')
  const [patBubble, setPatBubble] = useState(null)
  const [pops, setPops] = useState([])
  const patHitRef = useRef(null)
  const patBubbleTimer = useRef(null)
  const streakRef = useRef(0)     // 同一部位连续摸了几下（里程碑按它算）
  const lastZoneRef = useRef(null)
  // 陪骑手走：路上替他做的那些小决定（不计分，只是陪过）—— 会带进结局页的「路上的纪念」
  const [roadChoices, setRoadChoices] = useState({})
  // 陪等的方式：三选一，随时可换，记住上次挑的那个
  const [waitMode, setWaitMode] = useState(() => loadWaitMode())
  const offlineTask = useMemo(() => OFFLINE_TASKS[Math.floor(Math.random() * OFFLINE_TASKS.length)], [])
  const leaving = useRef(false)

  // 摸它一下：判定落在哪个部位 → 形变 + 指尖小图 + 一句部位台词。
  // 以前这里点一下只是把旁边那句陪等的话换成下一句，猫本身一动不动 ——
  // 等外卖时最想摸的就是它，偏偏它最没反应（2026-09-18 补）。
  const patCat = (e) => {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    // 键盘 / 程序化点击没有真实坐标，按「摸肚子」兜底（同小屋）
    const hasPoint = !(e.clientX === 0 && e.clientY === 0)
    const zone = hasPoint ? zoneFromPoint(rect, e.clientX, e.clientY) : 'tummy'
    const px = hasPoint ? e.clientX - rect.left : rect.width / 2
    const py = hasPoint ? e.clientY - rect.top : rect.height / 2

    const streak = zone === lastZoneRef.current ? streakRef.current + 1 : 1
    lastZoneRef.current = zone
    streakRef.current = streak

    setPatZone(zone)
    playPatReaction(patHitRef.current, zone, 0)
    setPatBubble(patLine(zone, streak))
    clearTimeout(patBubbleTimer.current)
    patBubbleTimer.current = setTimeout(() => setPatBubble(null), 2200)

    const batch = spawnPops(px, py, 4)
    setPops((ps) => [...ps.slice(-8), ...batch])
    setTimeout(() => setPops((ps) => ps.filter((p) => !batch.some((b) => b.id === p.id))), 1400)

    // 旁边那句「陪你等」的话照旧往后走一句 —— 它现在是次要层，主反馈在猫身上
    setPetLine((v) => (v === null ? 0 : (v + 1) % PET_WAIT_LINES.length))
  }

  // 阶段一：快速走完「接单→备餐→取餐→配送中」4 步，展示完整流程
  useEffect(() => {
    if (phase !== 'preview') return
    const timer = setTimeout(() => {
      if (stepIndex < STEPS.length - 1) setStepIndex((idx) => idx + 1)
      else setPhase('waiting')
    }, STEP_DURATION)
    return () => clearTimeout(timer)
  }, [stepIndex, phase])

  // 阶段二：真实倒计时，每秒递减
  useEffect(() => {
    if (phase !== 'waiting' || leaving.current) return
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(tick)
  }, [phase])

  // 等满 → 完整走完这段路（不扣额度，多一份「路上的纪念」）。
  // 送达提醒（2026-09-24 用户「类似番茄钟」）：叮咚一声 + 手机震动 + **整页**左右摇一下，再进结局页
  // —— 期间你可能早就放下手机了，「到了」得听得见、感觉得到。
  useEffect(() => {
    if (phase === 'waiting' && secondsLeft <= 0 && !leaving.current) {
      leaving.current = true
      // 催单卡这时候可能还开着。整页摇会让 .delivery-page 变成包含块，卡片的 fixed
      // 就被收编成「相对整页」—— 卡片会飘出视口。外卖都到了，还聊什么，先关掉。
      setExchangeOpen(false)
      try { navigator.vibrate?.([260, 120, 260]) } catch {}
      arrivalChime()
      setArriving(true)
      const next = { ...patience, used: patience.used, waited: (patience.waited || 0) + 1 }
      savePatience(next)
      setPatience(next)
      // 先让「到了」在屏幕上摇一下，再翻页 —— 900ms
      setTimeout(() => {
        onNavigate('ending', {
          waited: true,
          waitedSeconds: totalSeconds,
          letters: RIDER_LETTERS.length,
          road: roadChoices,
          // 结局页要开「等待凭证」：单子上写的这段路（分钟）+ 今天第几次等满
          eta: etaMinutes,
          waitedCount: next.waited,
        })
      }, 900)
    }
  }, [phase, secondsLeft, patience, onNavigate, totalSeconds, etaMinutes, roadChoices])

  // 调这一单等多久（1-60 分钟）。**拖条 / ＋− / 手输 三条路都走这里**，只此一处改总时长，
  // 免得三条路各算各的、把「已经等过的」算丢。
  // 已经等过的时间不算丢 —— 改的只是「这一单总共多长」；等够了（≤0）自然就到了。
  // 定下来之后（locked）谁也改不动 —— 这是 2026-09-24 用户要的「选定了就不能换了」。
  const setWaitMinutes = (m) => {
    if (locked || leaving.current) return
    const elapsed = totalSeconds - secondsLeft
    const nextTotal = Math.min(3600, Math.max(60, Math.round(m) * 60))
    setTotalSeconds(nextTotal)
    setSecondsLeft(Math.max(0, nextTotal - elapsed))
  }

  const adjustWait = (delta) => setWaitMinutes(totalSeconds / 60 + delta)

  // 手输那一格：非 null = 正在编辑（值是他正在敲的字符串）
  const commitMinutes = () => {
    const n = Number(minuteDraft)
    setMinuteDraft(null)
    if (!Number.isFinite(n) || n <= 0) return // 空着 / 乱敲 → 当没改过，保留原值
    setWaitMinutes(n)
  }

  // 随机一下（2026-09-24 用户「或者随机点，每单送达时间不同」）：
  // 10~55 分钟之间摇一个整数 —— 每家店本来就不一样，摇完这一单就定这个数。
  // 已经等过的时间不算丢：总长换了，剩余 = 新总长 − 已等。
  const [diceRolling, setDiceRolling] = useState(false)
  const randomizeWait = () => {
    if (locked || leaving.current) return
    const elapsed = totalSeconds - secondsLeft
    setDiceRolling(true)
    try { navigator.vibrate?.(12) } catch {}
    let ticks = 0
    const roll = setInterval(() => {
      ticks += 1
      const total = (Math.floor(Math.random() * 46) + 10) * 60
      setTotalSeconds(total)
      setSecondsLeft(Math.max(0, total - elapsed))
      if (ticks >= 5) {
        clearInterval(roll)
        setDiceRolling(false)
      }
    }, 90)
  }

  const progress = phase === 'waiting'
    ? Math.min(1, 1 - secondsLeft / totalSeconds)
    : (stepIndex + 1) / STEPS.length

  const houseLabel = houseName ? `「${houseName}」` : '你家门口'
  const left = patienceLeft(patience)

  // 抬头行：这一块三种方式共用（回答同一个问题 —— 还要多久）
  const elapsedMin = Math.max(0, Math.floor((totalSeconds - secondsLeft) / 60))
  const remainMin = Math.max(0, Math.ceil(secondsLeft / 60))
  const activeMode = WAIT_MODES.find((m) => m.key === waitMode) || WAIT_MODES[0]
  const ActiveIcon = WAIT_ICONS[activeMode.key] || Bike

  // 快进的花费：按「还没等的分钟数」算（不足 1 分钟按 1 分钟）
  const costMinutes = Math.max(1, Math.ceil(secondsLeft / 60))
  const canAfford = left >= costMinutes

  // 这一单的时间定下来了 / 正在手输（2026-09-24 用户：「选好了就点确定锁定」「数字可以手动改」）
  const [locked, setLocked] = useState(false)
  const [minuteDraft, setMinuteDraft] = useState(null)

  // 拉条上那三段：已经骑过去的多长、这一单定多长、（剩下的就是还能拖的余量）
  const pctOf = (sec) => `${Math.max(0, Math.min(100, (sec / 3600) * 100))}%`

  const visibleLetters = RIDER_LETTERS.filter((l) => progress >= l.at)
  const letterCount = visibleLetters.length

  // 跟骑手说一句 → 花额度 → 回话 → 进结局
  const doExchange = (item) => {
    if (!canAfford || leaving.current) return
    // 说完这句就已经在离开的路上了 —— 立刻立旗子，别让「等满」那条路在回话的
    // 1.7 秒里插一脚（两条路各导航一次 = 结局页被推两遍）。
    leaving.current = true
    const next = { ...patience, used: Math.min(DAILY_PATIENCE, patience.used + costMinutes) }
    savePatience(next)
    setPatience(next)
    setExchangeDone(item)
    setExchangeOpen(false)
    setTimeout(() => {
      onNavigate('ending', {
        waited: false,
        skipped: costMinutes,
        letters: letterCount,
        exchange: item.key,
        road: roadChoices,
      })
    }, 1700)
  }

  // 自己写的那一句：规矩和三句预设完全一样（一样花额度、一样有回话）。
  // 回话按文字 hash 挑 —— 同一句话回的是同一句，跟菜单的「同一天同一份」一个脾气。
  const makeCustom = (text) => {
    const t = text.trim().replace(/\s+/g, ' ').slice(0, 30)
    return {
      key: 'custom',
      label: t,
      reply: RIDER_CUSTOM_REPLIES[hashSeed(t) % RIDER_CUSTOM_REPLIES.length],
    }
  }

  const isWaiting = phase === 'waiting'

  return (
    <div
      className={`shop-page delivery-page${isWaiting ? ' is-waiting' : ''}${arriving ? ' is-arriving' : ''}`}
      style={{ filter: weather.filter }}
    >
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回首页" onClick={() => onNavigate('home')}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">配送中</span>
        <button className="icon-button" aria-label="首页" onClick={() => onNavigate('home')}>
          <Home size={21} strokeWidth={1.45} />
        </button>
      </header>

      <section className="delivery-hero" aria-label="配送状态">
        <div className="weather-pill">
          <span className="weather-emoji" aria-hidden="true">{weather.emoji}</span>
          <span>今天 · {weather.label}</span>
        </div>
        <h1>
          {isWaiting ? '骑手正在路上' : '预计 ' + etaMinutes + ' 分钟'}
          <br />送达{houseLabel}
        </h1>
        <p className="delivery-sub">
          {isWaiting
            ? `路上还有 ${formatTime(secondsLeft)} · 小铺的骑手一向慢慢来`
            : '骑手正带着你的温柔订单赶来'}
        </p>
        {/* 这条线在**等待中是可拖的**（拖到哪 = 这一单等多久，1-60 分钟），
            2026-09-24 用户：「选中时间……拖动拉条这种」。
            条上三段：已骑过（深）→ 还要骑（浅）→ 没选的余量（底轨）。
            预演阶段它还是原来那条只读进度条 —— 那时候还没有「等多久」可谈。 */}
        {isWaiting ? (
          <input
            className={`eta-track${locked ? ' is-locked' : ''}`}
            type="range"
            min="1"
            max="60"
            step="1"
            value={Math.round(totalSeconds / 60)}
            disabled={locked}
            onChange={(e) => setWaitMinutes(Number(e.target.value))}
            aria-label={`这一单等多久，现在 ${Math.round(totalSeconds / 60)} 分钟`}
            style={{ '--elapsed': pctOf(totalSeconds - secondsLeft), '--total': pctOf(totalSeconds) }}
          />
        ) : (
          <div className="delivery-progress" aria-label="整体进度">
            <div className="delivery-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        )}

        {/* 这一单等多久（1-60 分钟）—— 2026-09-24 起等待是真实的，长短自己定；🎲 摇一个 */}
        {isWaiting && (
          <div className={`eta-tuner${locked ? ' is-locked' : ''}`} role="group" aria-label="这一单等多久">
            <span className="eta-tuner-label">这一单等多久</span>
            <button className="eta-tuner-btn" onClick={() => adjustWait(-1)} disabled={locked || totalSeconds <= 60} aria-label="少等一分钟">−</button>
            {minuteDraft === null || locked ? (
              <button
                type="button"
                key={totalSeconds}
                className={`eta-tuner-val${diceRolling ? ' is-rolling' : ''}`}
                onClick={() => setMinuteDraft(String(Math.round(totalSeconds / 60)))}
                disabled={locked}
                aria-label={`这一单等 ${Math.round(totalSeconds / 60)} 分钟，点一下手动改`}
                title={locked ? undefined : '点一下直接改分钟数'}
              >
                {Math.round(totalSeconds / 60)} 分
              </button>
            ) : (
              <input
                className="eta-tuner-input"
                type="number"
                min="1"
                max="60"
                inputMode="numeric"
                value={minuteDraft}
                autoFocus
                aria-label="这一单等多久，分钟，1 到 60"
                onChange={(e) => setMinuteDraft(e.target.value)}
                onBlur={commitMinutes}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitMinutes()
                  if (e.key === 'Escape') setMinuteDraft(null)
                }}
              />
            )}
            <button className="eta-tuner-btn" onClick={() => adjustWait(1)} disabled={locked || totalSeconds >= 3600} aria-label="多等一分钟">＋</button>
            <button
              className={`eta-tuner-btn is-dice${diceRolling ? ' is-rolling' : ''}`}
              onClick={randomizeWait}
              disabled={locked || diceRolling}
              aria-label="随机这一单等多久"
              title="随机一下 —— 每一单的送达时间本来就不一样"
            >
              🎲
            </button>
            {/* 定下来（2026-09-24 用户：「这里的时间如果选定了的话就不能换了」）——
                这是**这一单唯一一次机会**：按下去之后 ±/拖条/手输 全锁死，只留时间自己走。 */}
            {locked ? (
              <span className="eta-locked" role="status">时间定了 · 不改了</span>
            ) : (
              <button
                type="button"
                className="eta-lock"
                onClick={() => { setMinuteDraft(null); setLocked(true) }}
              >
                就等这么久
              </button>
            )}
          </div>
        )}
      </section>

      {/* 预演阶段：四步时间线 */}
      {!isWaiting && (
        <section className="delivery-timeline" aria-label="配送进度">
          {STEPS.map((step, idx) => {
            const Icon = step.icon
            const done = idx < stepIndex
            const current = idx === stepIndex
            const ritual = getRitualByWeather(step.key, weather)
            return (
              <div key={step.key} className={`timeline-row ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                <div className="timeline-dot">
                  {done ? <Check size={14} strokeWidth={2.5} /> : <Icon size={16} strokeWidth={1.6} />}
                </div>
                <div className="timeline-line" />
                <div className="timeline-content">
                  <p className="timeline-label">{step.label}</p>
                  <p className="timeline-desc">{current ? ritual.active : done ? ritual.done : '等待中'}</p>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* 等待阶段：这一段你想怎么过 —— 三选一，随时可换（都不计分、都不会输） */}
      {isWaiting && (
        <section className="wait-modes" aria-label="陪等的方式">
          <p className="wait-modes-lead">这一段，你想怎么过</p>
          <div className="wait-mode-list">
            {WAIT_MODES.map((m) => (
              <button
                key={m.key}
                className={`wait-mode${waitMode === m.key ? ' is-on' : ''}`}
                aria-pressed={waitMode === m.key}
                onClick={() => { setWaitMode(m.key); saveWaitMode(m.key) }}
              >
                <b>{m.label}</b>
                <small>{m.hint}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 等待阶段：这一块就是「你选的那个陪等方式」本身。
          ⚠️ 三个方式**互斥**：选中即替换。
             第一版是「常驻的骑手进度窗 + 往下追加一个玩法模块」，
             于是选了「帮他看路」之后，第一屏里根本没有它 —— 要往下滑才看得见
             （2026-09-18 用户原话：「选了没变化」）。
             现在抬头行随模式一起换（图标 + 模式名 + 还有多久），切换立刻可见；
             三个模式的组件只出**主体**，不再各自带一行抬头。 */}
      {isWaiting && (
        <section className="wait-deck" aria-label={activeMode.label}>
          <div className="wd-head">
            <span className="wd-badge">
              <ActiveIcon size={13} strokeWidth={1.7} />
              {activeMode.label}
            </span>
            <span className="wd-time">已骑 {elapsedMin} 分 · 还有约 {remainMin} 分</span>
          </div>

          {waitMode === 'walk' && (
            <RiderWindow
              progress={progress}
              mode={waitMode}
              choices={roadChoices}
              onChoose={(momentKey, optKey) =>
                setRoadChoices((prev) => (prev[momentKey] ? prev : { ...prev, [momentKey]: optKey }))
              }
            />
          )}

          {/* 陪等方式 · 帮他看路（有点手感，但撞了也只是溅一裤腿水） */}
          {waitMode === 'road' && <RiderHop active={isWaiting} />}

          {/* 陪等方式 · 先下线（折完就让你放下手机） */}
          {waitMode === 'offline' && <FoldRitual />}
        </section>
      )}

      {/* 等待阶段：骑手来信（等待不是空转） */}
      {isWaiting && (
        <section className="rider-letters" aria-label="骑手来信">
          <div className="rider-letters-head">
            <span className="rl-badge"><Bike size={13} strokeWidth={1.7} />骑手来信</span>
            <span className="rl-count">{String(letterCount).padStart(2, '0')} / {String(RIDER_LETTERS.length).padStart(2, '0')}</span>
          </div>
          <ul className="rl-list">
            {visibleLetters.map((l, i) => (
              <li key={i} className={i === visibleLetters.length - 1 ? 'is-latest' : ''}>
                <span className="rl-dot" aria-hidden="true" />
                <p>{l.text}</p>
              </li>
            ))}
            {letterCount < RIDER_LETTERS.length && (
              <li className="rl-pending" aria-hidden="true">
                <span className="rl-dot" />
                <p>骑手正在打字…</p>
              </li>
            )}
          </ul>
          {letterCount < RIDER_LETTERS.length && (
            <p className="rl-note">后面的几句话，只有陪他走完才看得到</p>
          )}
        </section>
      )}

      {/* 等待阶段：伙伴陪你等 */}
      {isWaiting && (
        <section className="wait-pet" aria-label={`${petName}陪你等`}>
          <button
            className="wait-pet-btn"
            onClick={patCat}
            data-zone={patZone}
            aria-label={`拍拍${petName}——耳朵、肚子、爪子反应不一样`}
          >
            {/* 单独一层给 WAAPI 做形变：同一个元素上两份 transform 会互相覆盖 */}
            <span className="pet-hit" ref={patHitRef}>
              <SoftPet
                stage={2}
                mood={patBubble ? MOOD_BY_ZONE[patZone] || 'love' : petLine === null ? 'happy' : 'love'}
                colorway="cream"
                species={petSpecies}
                size={64}
              />
            </span>
            <PetPops pops={pops} />
          </button>
          <div className="wait-pet-text">
            <b>{petName}</b>
            {/* 摸它时这一行换成部位台词（2.2s），之后回到陪等的那句 —— 
                不另做气泡：这张卡里没有留白，气泡会溢出到上一张卡上面去 */}
            <p>{patBubble || (petLine === null ? '它跑过来陪你一起等。摸它试试。' : PET_WAIT_LINES[petLine])}</p>
          </div>
        </section>
      )}

      {/* 等待阶段：给现实里的一件小事（不做小游戏 —— 这个 App 不该让人看更久屏幕） */}
      {isWaiting && (
        <button
          className={`wait-task ${offlineDone ? 'is-done' : ''}`}
          onClick={() => setOfflineDone((v) => !v)}
        >
          <span className="wait-task-mark" aria-hidden="true">{offlineDone ? '✓' : '·'}</span>
          <span className="wait-task-copy">
            <b>{offlineDone ? '好，你去了。' : '趁这几分钟，' + offlineTask}</b>
            <small>{offlineDone ? '它还在等你回来 —— 路上还剩一会儿' : '现实里的这几分钟，也可以不刷手机'}</small>
          </span>
        </button>
      )}

      {/* 等待阶段：慢活额度 + 快进 */}
      {isWaiting && (
        <section className="patience-panel" aria-label="慢活额度">
          <div className="patience-head">
            <span>今日慢活额度</span>
            <b>{left} <em>/ {DAILY_PATIENCE} 分钟</em></b>
          </div>
          <div className="patience-bar" aria-hidden="true">
            <i style={{ width: `${(left / DAILY_PATIENCE) * 100}%` }} />
          </div>
          <p className="patience-note">{PATIENCE_NOTE}</p>

          <button
            className="skip-wait-button"
            disabled={!canAfford}
            onClick={() => { setCustomText(''); setExchangeOpen(true) }}
          >
            <FastForward size={18} strokeWidth={1.5} />
            等不及了，跟骑手说一句
          </button>
          <p className="skip-wait-hint">
            {canAfford
              ? `会花掉约 ${costMinutes} 分钟慢活额度（今天还剩 ${left} 分钟）`
              : `今天的慢活额度用完了 —— 陪骑手把这 ${Math.max(1, Math.ceil(secondsLeft / 60))} 分钟走完吧`}
          </p>
        </section>
      )}

      {/* 催单卡：不是跳过，是有来有回。
          ⚠️ 必须 portal 到 body：根元素挂着天气 filter，CSS 里 filter 祖先会让
          position:fixed 退化成相对整页定位 —— 卡片会被排到整页最底部（视口外）。 */}
      {exchangeOpen && createPortal(
        <div className="exchange-backdrop" role="dialog" aria-label="跟骑手说一句" onClick={() => setExchangeOpen(false)}>
          <div className="exchange-card" onClick={(e) => e.stopPropagation()}>
            <button className="exchange-close" aria-label="关闭" onClick={() => setExchangeOpen(false)}>
              <X size={15} strokeWidth={1.8} />
            </button>
            <p className="exchange-eyebrow">RIDER · 还有 {formatTime(secondsLeft)}</p>
            <h3>跟骑手说一句</h3>
            <p className="exchange-lead">说了这句，他会快一点 —— 你要花掉 {costMinutes} 分钟慢活额度。</p>
            <div className="exchange-options">
              {RIDER_EXCHANGES.map((it) => (
                <button key={it.key} className="exchange-option" onClick={() => doExchange(it)}>
                  {it.label}
                </button>
              ))}
              {/* 自己写一句：规矩一样（花同样的额度），只是话由你挑 */}
              <div className="exchange-custom">
                <input
                  className="exchange-input"
                  value={customText}
                  maxLength={30}
                  placeholder="或者，自己写一句…"
                  aria-label="给骑手写一句自己的话"
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customText.trim()) doExchange(makeCustom(customText))
                  }}
                />
                <button
                  className="exchange-send"
                  disabled={!customText.trim() || !canAfford}
                  onClick={() => doExchange(makeCustom(customText))}
                >
                  说这句
                </button>
              </div>
            </div>
            <p className="exchange-foot">不说也行 —— 陪他走完这一段，路上会多留一份纪念。</p>
          </div>
        </div>,
        document.body
      )}

      {/* 骑手回话（同样 portal —— 同一个 filter 坑） */}
      {exchangeDone && createPortal(
        <div className="exchange-reply" role="status">
          <i aria-hidden="true">{exchangeDone.label}</i>
          <p>{exchangeDone.reply}</p>
        </div>,
        document.body
      )}

      {weather.key !== 'sunny' && <div className="rain-overlay" aria-hidden="true" />}
    </div>
  )
}
