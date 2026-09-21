import { useEffect, useMemo, useRef, useState } from 'react'
import { Gift, Heart, PawPrint, RotateCcw, Sparkles } from 'lucide-react'
import { CHARITY, LEVEL_MEALS, PET_NAME, RIDER_MOMENTS, dateSeed, getCounter, getItem, gramsForAmount, levelForMeals, parseCartKey, petStages, stickerPool, unitPriceOf } from '../data.js'
import SoftPet from '../components/SoftPet.jsx'
import WaitReceipt from '../components/WaitReceipt.jsx'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const ENDINGS = [
  {
    key: 'warm',
    title: '今天你把自己照顾得很好',
    body: '不必真的吃，也能完整拥有「我在好好生活」的满足感。',
    // 这句英文独立成行：它是小铺的「声音」，走重音声部（斜衬线 800），不跟正文混在一起
    aside: "that's the soft life 🤍",
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
  // 按**加了料之后**的单价算 —— 加的珍珠也是真钱，捐出去的猫粮也该跟着多几克
  const orderTotal = useMemo(
    () => Object.entries(cart).reduce((sum, [key, qty]) => {
      const { itemId, specIds } = parseCartKey(key)
      return sum + unitPriceOf(getItem(itemId), specIds) * qty
    }, 0),
    [cart]
  )
  const orderShop = useMemo(() => {
    const firstKey = Object.keys(cart).find((key) => cart[key] > 0)
    const item = firstKey ? getItem(parseCartKey(firstKey).itemId) : null
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

  // ===== 等待凭证（2026-09-18）=====
  // 这一个铺子唯一别人抄不走的东西是「等」——别家都在假装（假针、假外卖、假里程），
  // 只有这里的时间是让人真的花掉的。所以这张纸**只在等满时开，快进买不到**：
  // 不是惩罚，是它的全部意义 —— 能买到的就不叫凭证。
  // DOM 那张纸和「存成图片」画出来的 PNG 共用这一份数据：看到什么，就存到什么。
  const receipt = useMemo(() => {
    if (!wait?.waited) return null
    const d = new Date()
    const seed = String(dateSeed())
    const n = Math.max(1, Number(wait.waitedCount) || 1)
    const minutes = Number(wait.eta) || 25
    return {
      no: `${seed.slice(0, 4)}-${seed.slice(4, 6)}-${seed.slice(6, 8)}-${String(n).padStart(2, '0')}`,
      dateLine: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEKDAYS[d.getDay()]}`,
      minutes,
      note: '你一秒没跳地等完了',
      rows: [
        { label: '收件', value: houseName ? `「${houseName}」` : '你家门口' },
        { label: '这一单', value: `¥${orderTotal}` },
        { label: '没变成', value: '一份没人吃的外卖' },
        {
          label: '记下的猫粮',
          value: donated ? `${donated.grams.toLocaleString()} g` : skipped ? '这次没记' : '—',
        },
        { label: '今天等满', value: `第 ${n} 次` },
      ],
      // 红线：钱一直在用户手上，App 只记账。这一行就是那张纸上必须有的诚实。
      fine: donated
        ? '钱还在你手上 —— 记下的克数，等你真的去捐。'
        : skipped
          ? '钱还在你手上，你随时可以改主意。'
          : '钱还在你手上 —— 记多少，你自己定。',
      accent: 'the wait was real.',
      quote: `「在一个不会送到的外卖 App 里，我等满了 ${minutes} 分钟。」`,
      seal: '等满',
    }
  }, [wait, houseName, orderTotal, donated, skipped])

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
        {/* 印刷层那枚方章：这一单真的送到了才盖。压在卡片右上角、不占头部那一行的宽度 ——
            早先放在 .ending-header 里，长注释「YOUR ORDER HAS ARRIVED」+ 42px 的章
            会把整行挤过 292px，左边的 END · 01 / 02 被迫折成两行。 */}
        <span className="print-seal is-sm is-corner" aria-hidden="true">已送达</span>

        <header className="ending-header">
          <p className="ending-number">END · {ending.key === 'warm' ? '01' : '02'} / 02</p>
          <p className="eyebrow">{ending.eyebrow}</p>
        </header>

        <div className="ending-divider"><span /></div>

        <h1 className="ending-title">{ending.title}</h1>
        <p className="ending-body">{ending.body}</p>
        {ending.aside && <p className="ending-aside">{ending.aside}</p>}

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
                <p className="road-recap-foot">这一份耐心，会多留一枚贴纸给你 —— 和一张买不到的等待凭证。</p>
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
                {/* 说清「为什么这次没有凭证」：不是罚你，是这张纸只能用等换 */}
                <p className="road-recap-foot">
                  等待凭证只开给等满的那一份 —— 它买不到。下次想留一张，就陪他走完这一趟。
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

        {/* 等待凭证：等满才开的那张纸。放在「路上的纪念」之后 ——
            先讲路上发生了什么，再给凭证，别把票据压在故事前面。 */}
        {receipt && <WaitReceipt data={receipt} />}

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
