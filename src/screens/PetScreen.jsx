import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, PawPrint, RefreshCw } from 'lucide-react'
import { LEVEL_MEALS, PET_COLORWAYS, PET_NAME, PET_SPECIES, dateSeed, hashSeed, levelForMeals, petStages, petLinesByStage, stickerPool } from '../data.js'
import SoftPet, { moodFromEmoji } from '../components/SoftPet.jsx'

// 拍拍台词：模拟真实撸猫的反应（里程碑 3/8/15/25 有专属反应）
const PAT_LINES = ['呼噜呼噜……', '蹭了一下你的手心。', '耳朵转过来了——很受用。', '尾巴慢慢竖起来了。', '（把头往你手底下压了压）']
const PAT_MILESTONES = { 3: '呼噜呼噜——它开始踩奶了。', 8: '翻出肚皮了，这是最高信任。', 15: '眯上眼睛了……别停。', 25: '（睡着了，尾巴还在轻轻晃）' }

export default function PetScreen({ pet, onColorway, onBack }) {
  const level = levelForMeals(pet.meals)
  const stage = petStages[level]
  const colorway = pet.colorway || 'cream'
  const nextThreshold = LEVEL_MEALS[level + 1]
  const prevThreshold = LEVEL_MEALS[level]
  const progress = nextThreshold
    ? Math.min(100, Math.round(((pet.meals - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
    : 100

  // 软软今日心情：每天首次进入抽一句；点「换一句」循环切换
  const seed = hashSeed(String(dateSeed()) + 'pet-line')
  const linesForStage = petLinesByStage[Math.min(level, petLinesByStage.length - 1)]
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

  // ---- 拍拍：点猫模拟真实撸猫（压扁回弹 + 爱心 + 呼噜台词）----
  const [patTick, setPatTick] = useState(0)
  const [patHearts, setPatHearts] = useState([])
  const [patBubble, setPatBubble] = useState(null)
  const bubbleTimer = useRef(null)
  const patCat = () => {
    const n = patTick + 1
    setPatTick(n)
    const heart = { id: Math.random(), dx: Math.random() * 48 - 24 }
    setPatHearts((hs) => [...hs.slice(-4), heart])
    setTimeout(() => setPatHearts((hs) => hs.filter((h) => h.id !== heart.id)), 1300)
    setPatBubble(PAT_MILESTONES[n] || PAT_LINES[Math.floor(Math.random() * PAT_LINES.length)])
    clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setPatBubble(null), 2200)
  }

  return (
    <div className="shop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">{PET_NAME}的小屋</span>
        <span className="topbar-spacer" />
      </header>

      <section className="pet-hero" aria-label={`${PET_NAME}的成长`}>
        <div className={`pet-avatar-wrap pet-tone-${colorway}`}>
          <div className="pet-avatar-glow" aria-hidden="true" />
          <button className="pet-pat-btn" onClick={patCat} aria-label={`拍拍${PET_NAME}`}>
            {/* key 变化让压扁回弹动画每次都能重放 */}
            <div className="pet-pat-squish" key={patTick}>
              <SoftPet stage={level} mood={patBubble ? 'love' : mood} colorway={colorway} size={150} />
            </div>
            {patHearts.map((h) => (
              <i key={h.id} className="pat-heart" style={{ ['--dx']: `${h.dx}px` }} aria-hidden="true">♥</i>
            ))}
          </button>
          {patBubble && <span className="pet-pat-bubble" role="status">{patBubble}</span>}
        </div>
        <p className="eyebrow">SOFT LIFE COMPANION</p>
        <h1>{PET_NAME} · {stage.name}</h1>
        <p className="pet-stage-desc">{stage.desc}</p>

        {/* 毛色选择器：只有一种毛色时不渲染（现在是「奶白三花」一种） */}
        {PET_COLORWAYS.length > 1 && (
          <div className="pet-color-row" role="group" aria-label={`${PET_NAME}的毛色`}>
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
              ? `再喂 ${nextThreshold - pet.meals} 块小饼干，就能长成「${petStages[level + 1].name}」`
              : `${PET_NAME}已经长到最大啦，谢谢你的陪伴`}
          </p>
        </div>
      </section>

      {/* AI 模块：软软今日心情 */}
      <section className="pet-says-card" aria-label="软软今日心情">
        <div className="pet-says-head">
          <PawPrint size={14} strokeWidth={1.6} />
          <span className="pet-says-eyebrow">软软说 · TODAY</span>
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
        {PET_NAME}也会长大一点点。这就是你们的约定。
      </p>

      {/* 成长阶段一览：奶猫 → 小猫崽 → 少年猫 → 青年猫 → 成年猫 */}
      <section className="pet-ladder" aria-label="成长阶段一览">
        <div className="section-rule"><span /></div>
        <h2 className="section-title">GROWTH <em>{level + 1}/{petStages.length}</em></h2>
        <div className="pet-ladder-row">
          {petStages.map((st, i) => {
            const reached = i <= level
            return (
              <div key={st.name} className={`pet-ladder-cell ${i === level ? 'is-current' : ''} ${reached ? 'is-reached' : 'is-locked'}`}>
                <div className="pet-ladder-art">
                  <SoftPet
                    stage={i}
                    mood={i === level ? mood : 'happy'}
                    colorway={colorway}
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
