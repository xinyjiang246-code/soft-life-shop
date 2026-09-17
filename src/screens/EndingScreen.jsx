import { useEffect, useMemo, useRef, useState } from 'react'
import { Gift, Heart, PawPrint, RotateCcw, Sparkles } from 'lucide-react'
import { CHARITY, LEVEL_MEALS, PET_NAME, RIDER_MOMENTS, getCounter, getItem, gramsForAmount, levelForMeals, petStages, stickerPool } from '../data.js'
import SoftPet from '../components/SoftPet.jsx'

const ENDINGS = [
  {
    key: 'warm',
    title: '今天你把自己照顾得很好',
    body: '不必真的吃，也能完整拥有「我在好好生活」的满足感。\nthat\'s the soft life 🤍',
    eyebrow: 'YOUR ORDER HAS ARRIVED',
  },
  {
    key: 'self-aware',
    title: '其实你今天根本不饿',
    body: '但你已经完整经历了挑选、凑单、等待的快乐。\n这份快乐不占卡路里，圆满结束 ✨',
    eyebrow: 'A QUIET CHECK-IN',
  },
]

export default function EndingScreen({ houseName, pet, cart = {}, wait, onGrow, onDonate, onRescue, onJournal, onNavigate, onReset }) {
  const ending = useMemo(() => ENDINGS[Math.floor(Math.random() * ENDINGS.length)], [])
  const [surprise, setSurprise] = useState(null) // 点击「拆开惊喜」后的成长结果
  const [rescued, setRescued] = useState(null)   // 这一单从惜食柜带走了几份
  const [journaled, setJournaled] = useState(null) // 这一单写进食物手账了几样

  // 送达 = 真的留下了。挂载时就记账，不等到用户点「拆开惊喜」——
  // 否则他中途离开，这一份就不算了。ref 防止重复记账。
  const rescuedRef = useRef(false)
  useEffect(() => {
    if (rescuedRef.current) return
    rescuedRef.current = true
    const result = onRescue?.(cart)
    if (result) setRescued(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 同一时机，把这一单写进今天的食物手账（同样挂载时记一次，不重复）
  const journaledRef = useRef(false)
  useEffect(() => {
    if (journaledRef.current) return
    journaledRef.current = true
    const result = onJournal?.(cart)
    if (result) setJournaled(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===== 公益捐赠：这一单的钱可以不变成一份没人吃的外卖 =====
  const orderTotal = useMemo(
    () => Object.entries(cart).reduce((sum, [id, qty]) => sum + (getItem(id)?.price || 0) * qty, 0),
    [cart]
  )
  const orderShop = useMemo(() => {
    const firstId = Object.keys(cart).find((id) => cart[id] > 0)
    const item = firstId ? getItem(firstId) : null
    return item ? (getCounter(item.counterId)?.name || '慢活小铺') : '慢活小铺'
  }, [cart])
  const maxGrams = gramsForAmount(orderTotal)
  const [ratio, setRatio] = useState(CHARITY.defaultRatio)
  const [donated, setDonated] = useState(null)  // { grams, ratio }
  const [skipped, setSkipped] = useState(false)
  const grams = Math.round((maxGrams * ratio) / 100)

  const currentLevel = levelForMeals(pet.meals)
  const stage = petStages[currentLevel]
  const nextStage = petStages[currentLevel + 1]        // 已满级时为 undefined
  const nextThreshold = LEVEL_MEALS[currentLevel + 1]  // 已满级时为 undefined
  const progressToNext = nextThreshold
    ? Math.min(100, Math.round(((pet.meals - LEVEL_MEALS[currentLevel]) / (nextThreshold - LEVEL_MEALS[currentLevel])) * 100))
    : 100

  const handleOpenSurprise = () => {
    // 等满不跳过 → 路上多留一份纪念（额外一枚贴纸）
    const result = onGrow({ extraSticker: !!wait?.waited })
    setSurprise(result)
  }

  const handleDonate = () => {
    if (grams <= 0) return
    onDonate?.({
      grams,
      amount: Math.round((orderTotal * ratio) / 100 * 100) / 100,
      ratio,
      shop: orderShop,
    })
    setDonated({ grams, ratio })
  }

  const handleAgain = () => {
    onReset()
    onNavigate('home')
  }

  const handleViewPet = () => {
    onReset()
    onNavigate('pet')
  }

  return (
    <div className="shop-page center-content">
      <article className="ending-card" aria-label="订单结局">
        <header className="ending-header">
          <p className="ending-number">END · {ending.key === 'warm' ? '01' : '02'} / 02</p>
          <p className="eyebrow">{ending.eyebrow}</p>
        </header>

        <div className="ending-divider"><span /></div>

        <h1 className="ending-title">{ending.title}</h1>
        <p className="ending-body">{ending.body}</p>

        {houseName && (
          <p className="ending-house">
            <span>已送达</span>
            <strong>「{houseName}」</strong>
          </p>
        )}

        {/* 这一单里有没有从惜食柜带走的东西 —— 正着说「留下了什么」，不是「省了多少」 */}
        {rescued && (
          <section className="rescue-recap" aria-label="惜食柜">
            <p className="rescue-recap-eyebrow">🧺 惜食柜</p>
            <p className="rescue-recap-title">
              这单带走了 <strong>{rescued.servings}</strong> 份本来要剩在柜上的东西
            </p>
            <p className="rescue-recap-body">
              它们不是不好，只是今天没赶上被点走。这一份被你留下了。
            </p>
          </section>
        )}

        {/* 这一单也写进了食物手账 —— 首页「把这一餐存下来」那张磁贴翻得到 */}
        {journaled && (
          <section className="journal-recap" aria-label="食物手账">
            <p className="journal-recap-eyebrow">食物手账</p>
            <p className="journal-recap-body">
              这一单的 <strong>{journaled.count}</strong> 样，已经写进今天那一页了。
            </p>
            <button
              className="journal-recap-link"
              onClick={() => onNavigate('archive', { view: 'journal' })}
            >翻翻手账</button>
          </section>
        )}

        {/* 路上的这一段：等满 / 提前打了招呼 */}
        {wait && (wait.waited || wait.skipped) && (
          <section className={`road-recap ${wait.waited ? 'is-waited' : 'is-skipped'}`} aria-label="路上的纪念">
            {wait.waited ? (
              <>
                <p className="road-recap-eyebrow">📮 路上的纪念</p>
                <p className="road-recap-title">你陪骑手走完了这一段</p>
                <p className="road-recap-body">
                  {wait.letters} 句话，一句没落下。最后一条是「到你楼下了，不用下来接，我认得门牌。」
                </p>
                <p className="road-recap-foot">这一份耐心，会多留一枚贴纸给你。</p>
              </>
            ) : (
              <>
                <p className="road-recap-eyebrow">🚲 你提前跟骑手打了招呼</p>
                <p className="road-recap-title">
                  花了 {wait.skipped} 分钟慢活额度，路上收到 {wait.letters} 句话
                </p>
                <p className="road-recap-body">
                  不赶时间的话，下次可以听完 —— 他会讲讲路过的猫和花店。
                </p>
              </>
            )}
            {/* 陪骑手走：你替他做的几个小决定 —— 只记事，不给奖励（陪伴不是任务） */}
            {wait.road && Object.keys(wait.road).length > 0 && (
              <div className="road-with" aria-label="路上你搭的几次手">
                <p className="road-with-title">路上你搭的 {Object.keys(wait.road).length} 次手</p>
                <ul className="road-with-list">
                  {RIDER_MOMENTS.filter((m) => wait.road[m.key]).map((m) => {
                    const opt = m.options.find((o) => o.key === wait.road[m.key])
                    return (
                      <li key={m.key}>
                        <b>{opt?.label}</b>
                        <span>{m.ask}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="road-with-foot">他不认识你，但这一路不算一个人骑。</p>
              </div>
            )}
          </section>
        )}

        <div className="ending-divider"><span /></div>

        {/* 惊喜揭晓区 */}
        {!surprise ? (
          <div className="ending-actions">
            <button className="surprise-button" onClick={handleOpenSurprise}>
              <Gift size={18} strokeWidth={1.35} />
              拆开你的专属惊喜
            </button>
            <button className="ghost-button" onClick={handleAgain}>
              <RotateCcw size={16} strokeWidth={1.5} />
              再来一单
            </button>
          </div>
        ) : (
          <section className="surprise-card" aria-label="专属惊喜">
            <div className="surprise-glow" aria-hidden="true" />
            <div className="surprise-pet">
              <SoftPet
                stage={surprise.level}
                mood={surprise.leveledUp ? 'sparkle' : 'love'}
                colorway={pet.colorway || 'cream'}
                size={168}
              />
            </div>

            <p className="surprise-eyebrow">SOFT LIFE COMPANION</p>

            {surprise.leveledUp ? (
              <>
                <h2 className="surprise-title">{PET_NAME} 升级啦！</h2>
                <p className="surprise-body">
                  它从「{petStages[surprise.level - 1].name}」长成了「{petStages[surprise.level].name}」。
                  你每在这里多点一单、在现实里少点一次外卖，它就长大一点点。
                </p>
              </>
            ) : (
              <>
                <h2 className="surprise-title">你喂了{PET_NAME}一块小饼干</h2>
                <p className="surprise-body">
                  这一单代替了一次真实外卖，{PET_NAME}悄悄长大了一点。
                  累计少点了 <strong>{surprise.meals}</strong> 次外卖。
                </p>
              </>
            )}

            {/* 掉落贴纸 */}
            {surprise.newSticker && (
              <div className="sticker-drop">
                <span className="sticker-drop-emoji" aria-hidden="true">{surprise.newSticker.emoji}</span>
                <p className="sticker-drop-text">
                  🎁 掉落一枚新贴纸 <strong>{surprise.newSticker.name}</strong>，已收进贴纸册
                </p>
              </div>
            )}

            {/* 等满不跳过的额外一份「路上的纪念」 */}
            {surprise.bonusSticker && (
              <div className="sticker-drop is-bonus">
                <span className="sticker-drop-emoji" aria-hidden="true">{surprise.bonusSticker.emoji}</span>
                <p className="sticker-drop-text">
                  📮 路上的纪念 · 额外掉落 <strong>{surprise.bonusSticker.name}</strong>
                </p>
              </div>
            )}

            {/* 成长进度条 */}
            <div className="pet-progress">
              <div className="pet-progress-head">
                <span>{stage.name}</span>
                <span>{nextStage ? nextStage.name : '已满级 🎉'}</span>
              </div>
              <div className="pet-progress-bar">
                <div
                  className="pet-progress-fill"
                  style={{ width: `${progressToNext}%` }}
                />
              </div>
              <p className="pet-progress-hint">
                {nextThreshold
                  ? `再喂 ${nextThreshold - surprise.meals} 块小饼干，${PET_NAME}就能长成「${nextStage.name}」`
                  : `${PET_NAME}已经长到最大啦，谢谢你的陪伴`}
              </p>
            </div>

            {/* 公益：这笔钱可以不浪费 */}
            {orderTotal > 0 && (
              <section className="donate-card" aria-label={CHARITY.name}>
                <div className="donate-head">
                  <span className="donate-icon" aria-hidden="true"><Heart size={16} strokeWidth={1.6} /></span>
                  <div className="donate-head-copy">
                    <b>{CHARITY.name}</b>
                    <small>这笔钱，可以不必变成一份没人吃的外卖</small>
                  </div>
                </div>

                {donated ? (
                  <>
                    <p className="donate-done">
                      记下 <b>{donated.grams}g</b> 猫粮
                    </p>
                    <p className="donate-done-sub">
                      按这一单的 {donated.ratio}% 折算 · 已记进档案，等你真的去捐
                    </p>
                    <button className="donate-link" onClick={() => onNavigate('charity')}>
                      看看公益档案
                    </button>
                  </>
                ) : skipped ? (
                  <>
                    <p className="donate-done is-skip">这次没记</p>
                    <p className="donate-done-sub">钱还在你手上，你随时可以改主意。</p>
                  </>
                ) : (
                  <>
                    <p className="donate-amount">
                      这一单 <b>¥{orderTotal}</b> · 全都记下是 <b>{maxGrams.toLocaleString()}g</b> 猫粮
                    </p>

                    <div className="donate-presets" role="group" aria-label="记下的比例">
                      {CHARITY.presets.map((p) => (
                        <button
                          key={p}
                          className={`donate-preset ${ratio === p ? 'is-active' : ''}`}
                          onClick={() => setRatio(p)}
                        >
                          {p === 100 ? '全记下' : `${p}%`}
                        </button>
                      ))}
                    </div>

                    <input
                      className="donate-slider"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={ratio}
                      aria-label="记下的比例"
                      onChange={(e) => setRatio(Number(e.target.value))}
                    />

                    <div className="donate-preview">
                      <span>记下 <b>{grams}g</b> 猫粮</span>
                      <span className="donate-preview-sub">
                        约 {(grams / CHARITY.gramPerCatDay).toFixed(1)} 只猫一天的口粮
                      </span>
                    </div>

                    <div className="donate-actions">
                      <button className="ghost-button" onClick={() => setSkipped(true)}>这次不捐</button>
                      <button className="primary-button" onClick={handleDonate} disabled={grams <= 0}>
                        记下 {grams}g
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            <div className="surprise-actions">
              <button className="primary-button" onClick={handleViewPet}>
                <PawPrint size={17} strokeWidth={1.4} />
                去看{PET_NAME}
              </button>
              <button className="ghost-button" onClick={handleAgain}>
                <RotateCcw size={16} strokeWidth={1.5} />
                再来一单
              </button>
            </div>
          </section>
        )}
      </article>

      <footer className="ending-footer">
        慢一点，也是一种很好的生活。
      </footer>
    </div>
  )
}
