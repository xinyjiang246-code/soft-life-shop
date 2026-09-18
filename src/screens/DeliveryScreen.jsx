import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Bike, Check, FastForward, Hand, Home, Package, Scissors, ShoppingBag, Truck, X } from 'lucide-react'
import {
  OFFLINE_TASKS,
  PATIENCE_NOTE,
  PET_NAME,
  RIDER_EXCHANGES,
  RIDER_LETTERS,
  RIDER_MOMENTS,
  WAIT_MODES,
  WAIT_SECONDS,
  weatherTypes,
} from '../data.js'
import { DAILY_PATIENCE, loadPatience, loadWaitMode, patienceLeft, savePatience, saveWaitMode } from '../storage.js'
import SoftPet from '../components/SoftPet.jsx'
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

export default function DeliveryScreen({ houseName, onNavigate, order }) {
  const weather = useMemo(() => weatherTypes[Math.floor(Math.random() * weatherTypes.length)], [])

  const baseEta = order?.baseEta || 25
  const etaMinutes = baseEta + weather.etaAdd

  const [stepIndex, setStepIndex] = useState(0)
  const [phase, setPhase] = useState('preview') // 'preview' 快速预演 → 'waiting' 真实等待
  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [exchangeDone, setExchangeDone] = useState(null)
  const [patience, setPatience] = useState(() => loadPatience())
  const [offlineDone, setOfflineDone] = useState(false)
  const [petLine, setPetLine] = useState(null)
  // 陪骑手走：路上替他做的那些小决定（不计分，只是陪过）—— 会带进结局页的「路上的纪念」
  const [roadChoices, setRoadChoices] = useState({})
  // 陪等的方式：三选一，随时可换，记住上次挑的那个
  const [waitMode, setWaitMode] = useState(() => loadWaitMode())
  const offlineTask = useMemo(() => OFFLINE_TASKS[Math.floor(Math.random() * OFFLINE_TASKS.length)], [])
  const leaving = useRef(false)

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

  // 等满 → 完整走完这段路（不扣额度，多一份「路上的纪念」）
  useEffect(() => {
    if (phase === 'waiting' && secondsLeft <= 0 && !leaving.current) {
      leaving.current = true
      const next = { ...patience, used: patience.used, waited: (patience.waited || 0) + 1 }
      savePatience(next)
      setPatience(next)
      onNavigate('ending', {
        waited: true,
        waitedSeconds: WAIT_SECONDS,
        letters: RIDER_LETTERS.length,
        road: roadChoices,
      })
    }
  }, [phase, secondsLeft, patience, onNavigate])

  const progress = phase === 'waiting'
    ? Math.min(1, 1 - secondsLeft / WAIT_SECONDS)
    : (stepIndex + 1) / STEPS.length

  const houseLabel = houseName ? `「${houseName}」` : '你家门口'
  const left = patienceLeft(patience)

  // 抬头行：这一块三种方式共用（回答同一个问题 —— 还要多久）
  const elapsedMin = Math.max(0, Math.floor((WAIT_SECONDS - secondsLeft) / 60))
  const remainMin = Math.max(0, Math.ceil(secondsLeft / 60))
  const activeMode = WAIT_MODES.find((m) => m.key === waitMode) || WAIT_MODES[0]
  const ActiveIcon = WAIT_ICONS[activeMode.key] || Bike

  // 快进的花费：按「还没等的分钟数」算（不足 1 分钟按 1 分钟）
  const costMinutes = Math.max(1, Math.ceil(secondsLeft / 60))
  const canAfford = left >= costMinutes

  const visibleLetters = RIDER_LETTERS.filter((l) => progress >= l.at)
  const letterCount = visibleLetters.length

  // 跟骑手说一句 → 花额度 → 回话 → 进结局
  const doExchange = (item) => {
    if (!canAfford || leaving.current) return
    const next = { ...patience, used: Math.min(DAILY_PATIENCE, patience.used + costMinutes) }
    savePatience(next)
    setPatience(next)
    setExchangeDone(item)
    setExchangeOpen(false)
    setTimeout(() => {
      leaving.current = true
      onNavigate('ending', {
        waited: false,
        skipped: costMinutes,
        letters: letterCount,
        exchange: item.key,
        road: roadChoices,
      })
    }, 1700)
  }

  const isWaiting = phase === 'waiting'

  return (
    <div className={`shop-page delivery-page${isWaiting ? ' is-waiting' : ''}`} style={{ filter: weather.filter }}>
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
        <div className="delivery-progress" aria-label="整体进度">
          <div className="delivery-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
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

      {/* 等待阶段：这两分钟你想怎么过 —— 三选一，随时可换（都不计分、都不会输） */}
      {isWaiting && (
        <section className="wait-modes" aria-label="陪等的方式">
          <p className="wait-modes-lead">这两分钟，你想怎么过</p>
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

      {/* 等待阶段：软软陪你等 */}
      {isWaiting && (
        <section className="wait-pet" aria-label={`${PET_NAME}陪你等`}>
          <button className="wait-pet-btn" onClick={() => setPetLine((v) => (v === null ? 0 : (v + 1) % PET_WAIT_LINES.length))}>
            <SoftPet stage={2} mood={petLine === null ? 'happy' : 'love'} colorway="cream" size={64} />
          </button>
          <div className="wait-pet-text">
            <b>{PET_NAME}</b>
            <p>{petLine === null ? '它跑过来陪你一起等。点它试试。' : PET_WAIT_LINES[petLine]}</p>
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
            onClick={() => setExchangeOpen(true)}
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
