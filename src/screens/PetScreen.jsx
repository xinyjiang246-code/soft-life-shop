import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, PawPrint, RefreshCw } from 'lucide-react'
import { LEVEL_MEALS, PET_COLORWAYS, dateSeed, hashSeed, levelForMeals, petLinesFor, petNameFor, petStagesFor, stickerPool } from '../data.js'
import SoftPet, { moodFromEmoji } from '../components/SoftPet.jsx'
import PetPops, { spawnPops } from '../components/PetPops.jsx'
import { FACE_HOLD, HEAT_WINDOW, expressionFor, patLine, playPatReaction, zoneFromPoint } from '../petTouch.js'

// 里程碑表与「这一下该说什么」都在 petTouch.js —— 三只猫（小屋 / 首页 / 陪你等）共用一份

export default function PetScreen({ pet, onColorway, onSpecies, onBack }) {
  const species = pet.species || 'cat'
  const name = petNameFor(species)
  const stages = petStagesFor(species)
  const level = levelForMeals(pet.meals)
  const stage = stages[level]
  const colorway = pet.colorway || 'cream'
  const nextThreshold = LEVEL_MEALS[level + 1]
  const prevThreshold = LEVEL_MEALS[level]
  const progress = nextThreshold
    ? Math.min(100, Math.round(((pet.meals - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
    : 100

  // 伙伴今日心情：每天首次进入抽一句；点「换一句」循环切换
  const seed = hashSeed(String(dateSeed()) + 'pet-line')
  const linesForStage = petLinesFor(species)[Math.min(level, petLinesFor(species).length - 1)]
  const [lineIdx, setLineIdx] = useState(() => seed % linesForStage.length)

  // 宠物升级后话池变了，索引可能越界，取模兜底
  const safeIdx = lineIdx % linesForStage.length
  const todayLine = linesForStage[safeIdx]
  const mood = moodFromEmoji(todayLine.mood)

  const [swapping, setSwapping] = useState(false)
  const refreshLine = () => {
    setSwapping(true)
    setLineIdx((i) => (i + 1) % linesForStage.length)
    setTimeout(() => setSwapping(false), 420)
  }

  // 形象画风 A/B 对比开关已在 2026-09-14 用户敲定猫咪形象后移除。
  // 现在只有一套素材（a-cream-stage*），petArtUrl 会自动兜底，不会露出旧 SVG。

  // ---- 拍拍：点猫的不同部位 → 身体做不同动作 + 从指尖冒小图 + 一句台词 ----
  // 为什么分部位：软软是一张平面图，图里的耳朵/尾巴动不了，
  //   所以靠「形变 + 支点」来表达身体反应（见 src/petTouch.js 顶部说明）。
  const [patTick, setPatTick] = useState(0)
  const [pops, setPops] = useState([])
  const [patBubble, setPatBubble] = useState(null)
  const [patZone, setPatZone] = useState('tummy')
  const [faceExpr, setFaceExpr] = useState(null)      // 脸上的表情（见 components/PetFace.jsx）
  const hitRef = useRef(null)
  const heatRef = useRef(0)
  const lastPatRef = useRef(0)
  const streakRef = useRef(0)      // 同一部位连续摸了几下（里程碑按它算）
  const lastZoneRef = useRef(null)
  const heatTimer = useRef(null)
  const bubbleTimer = useRef(null)
  const faceTimer = useRef(null)

  const patCat = (e) => {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    // 键盘/程序化 click 没有真实坐标（clientX/Y = 0），按「摸肚子」兜底，
    // 免得整块判定偏到左上角去。
    const hasPoint = !(e.clientX === 0 && e.clientY === 0)
    const zone = hasPoint ? zoneFromPoint(rect, e.clientX, e.clientY) : 'tummy'
    const px = hasPoint ? e.clientX - rect.left : rect.width / 2
    const py = hasPoint ? e.clientY - rect.top : rect.height / 2

    // 连击：1.5 秒内接着点，幅度越来越大
    const now = Date.now()
    const heat = now - lastPatRef.current < HEAT_WINDOW ? heatRef.current + 1 : 0
    heatRef.current = heat
    lastPatRef.current = now
    clearTimeout(heatTimer.current)
    heatTimer.current = setTimeout(() => { heatRef.current = 0 }, HEAT_WINDOW)

    // 里程碑按「同一部位连续摸」计数；换部位就从头算。
    // 按累计点击数算的话，摸到第 3 下不管摸哪儿都说同一句，把部位台词顶掉。
    const streak = zone === lastZoneRef.current ? streakRef.current + 1 : 1
    lastZoneRef.current = zone
    streakRef.current = streak

    playPatReaction(hitRef.current, zone, heat)

    const n = patTick + 1
    setPatTick(n)
    setPatZone(zone)
    // 表情：点哪儿换哪种脸，连击到后面变爱心眼 / 星星眼
    setFaceExpr(expressionFor(zone, heat))
    clearTimeout(faceTimer.current)
    faceTimer.current = setTimeout(() => setFaceExpr(null), FACE_HOLD)
    const batch = spawnPops(px, py, heat >= 3 ? 6 : 4)
    setPops((ps) => [...ps.slice(-8), ...batch])
    setTimeout(() => setPops((ps) => ps.filter((p) => !batch.some((b) => b.id === p.id))), 1400)

    setPatBubble(patLine(zone, streak))
    clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setPatBubble(null), 2200)
  }

  return (
    <div className="shop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">{name}的小屋</span>
        <span className="topbar-spacer" />
      </header>

      <section className="pet-hero" aria-label={`${name}的成长`}>
        <div className={`pet-avatar-wrap pet-tone-${colorway}`}>
          <div className="pet-avatar-glow" aria-hidden="true" />
          {/* 三层各管一件事，千万别合并：.pet-idle 呼吸（无限循环）·
              .pet-hit 点它的身体反应（JS 播放，会随手 cancel）· 底下才是软软本身 */}
          <button
            className="pet-pat-btn"
            onClick={patCat}
            data-zone={patZone}
            data-pats={patTick}
            data-face={faceExpr || ''}
            aria-label={`拍拍${name}——耳朵、肚子、爪子反应不一样`}
            title={`拍拍${name}`}
          >
            <span className="pet-idle">
              <span className="pet-hit" ref={hitRef}>
                <SoftPet
                  stage={level}
                  mood={mood}
                  colorway={colorway}
                  size={150}
                  species={species}
                  faces
                  face={faceExpr}
                  faceTick={patTick}
                />
              </span>
            </span>
            <PetPops pops={pops} />
          </button>
          {patBubble && <span className="pet-pat-bubble" role="status">{patBubble}</span>}
        </div>
        <p className="eyebrow">SOFT LIFE COMPANION</p>
        <h1>{name} · {stage.name}</h1>
        <p className="pet-stage-desc">{stage.desc}</p>
        <p className="pet-pat-hint">摸摸它 —— 点耳朵、肚子、爪子，表情和动作都不一样</p>

        {/* 伙伴切换（09-24 用户「两个都要在，可以切换用哪个」）：猫 软软 / 狗 团团
            两只独立成长、都一直在；切换只改「当前陪伴哪只」，另一只档案原样保留。 */}
        <div className="pet-species-toggle" role="group" aria-label="选择伙伴">
          {[
            { key: 'cat', label: '猫', name: petNameFor('cat') },
            { key: 'dog', label: '狗', name: petNameFor('dog') },
          ].map((sp) => (
            <button
              key={sp.key}
              className={`pet-species-btn ${species === sp.key ? 'is-active' : ''}`}
              aria-pressed={species === sp.key}
              onClick={() => onSpecies && onSpecies(sp.key)}
            >
              <span className="pet-species-emoji" aria-hidden="true">{sp.key === 'cat' ? '🐱' : '🐶'}</span>
              <span>{sp.label} · {sp.name}</span>
            </button>
          ))}
        </div>

        {/* 毛色选择器：只有一种毛色时不渲染（现在是「奶白三花」一种） */}
        {PET_COLORWAYS.length > 1 && (
          <div className="pet-color-row" role="group" aria-label={`${name}的毛色`}>
            {PET_COLORWAYS.map((c) => (
              <button
                key={c.key}
                className={`pet-color-swatch ${colorway === c.key ? 'is-active' : ''}`}
                aria-label={`换成${c.name}`}
                aria-pressed={colorway === c.key}
                onClick={() => onColorway && onColorway(c.key)}
              >
                <span className="pet-color-dot" style={{ background: c.hex, borderColor: c.accent }} />
                <span className="pet-color-name">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="pet-progress">
          <div className="pet-progress-bar">
            <div className="pet-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="pet-progress-hint">
            {nextThreshold
              ? `再喂 ${nextThreshold - pet.meals} 块小饼干，就能长成「${stages[level + 1].name}」`
              : `${name}已经长到最大啦，谢谢你的陪伴`}
          </p>
        </div>
      </section>

      {/* AI 模块：伙伴今日心情 */}
      <section className="pet-says-card" aria-label={`${name}今日心情`}>
        <div className="pet-says-head">
          <PawPrint size={14} strokeWidth={1.6} />
          <span className="pet-says-eyebrow">{name}说 · TODAY</span>
          <span className="pet-says-mood">{todayLine.mood}</span>
        </div>
        <p className={`pet-says-line ${swapping ? 'is-swapping' : ''}`}>{todayLine.line}</p>
        <div className="pet-says-foot">
          <span>由本地 AI 模板生成 · 每天一句</span>
          <button className="pet-says-refresh" onClick={refreshLine} disabled={swapping}>
            <RefreshCw size={13} className={swapping ? 'spin' : ''} />换一句
          </button>
        </div>
      </section>

      <section className="pet-stats" aria-label="成长统计">
        <div className="pet-stat">
          <span className="pet-stat-num">{pet.meals}</span>
          <span className="pet-stat-label">块小饼干</span>
        </div>
        <div className="pet-stat-divider" />
        <div className="pet-stat">
          <span className="pet-stat-num">{pet.totalOrders}</span>
          <span className="pet-stat-label">次虚拟下单</span>
        </div>
        <div className="pet-stat-divider" />
        <div className="pet-stat">
          <span className="pet-stat-num">{pet.stickers.length}/{stickerPool.length}</span>
          <span className="pet-stat-label">枚贴纸</span>
        </div>
      </section>

      <p className="pet-encourage">
        你每在这里多点一单，就在现实里少点一次外卖，
        {name}也会长大一点点。这就是你们的约定。
      </p>

      {/* 成长阶段一览：奶猫 → 小猫崽 → 少年猫 → 青年猫 → 成年猫 */}
      <section className="pet-ladder" aria-label="成长阶段一览">
        <div className="section-rule"><span /></div>
        <h2 className="section-title">GROWTH <em>{level + 1}/{stages.length}</em></h2>
        <div className="pet-ladder-row">
          {stages.map((st, i) => {
            const reached = i <= level
            return (
              <div key={st.name} className={`pet-ladder-cell ${i === level ? 'is-current' : ''} ${reached ? 'is-reached' : 'is-locked'}`}>
                <div className="pet-ladder-art">
                  <SoftPet
                    stage={i}
                    mood={i === level ? mood : 'happy'}
                    colorway={colorway}
                    species={species}
                    size={62}
                    className={reached ? '' : 'is-faded'}
                  />
                </div>
                <span className="pet-ladder-name">{st.name}</span>
                <span className="pet-ladder-need">{LEVEL_MEALS[i]} 块</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="sticker-book" aria-label="贴纸册">
        <div className="section-rule"><span /></div>
        <h2 className="section-title">STICKER BOOK <em>{pet.stickers.length}/{stickerPool.length}</em></h2>
        <div className="sticker-grid">
          {stickerPool.map((s) => {
            const owned = pet.stickers.includes(s.id)
            return (
              <div key={s.id} className={`sticker-cell ${owned ? 'owned' : 'locked'}`}>
                <span className="sticker-emoji" aria-hidden="true">{owned ? s.emoji : '·'}</span>
                <span className="sticker-name">{owned ? s.name : '未收集'}</span>
              </div>
            )
          })}
        </div>
      </section>

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
