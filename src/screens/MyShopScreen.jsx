import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, ImagePlus, Plus, Sparkles, Store, Trash2, X } from 'lucide-react'
import { counters, dateSeed, generateProductDraft, hashSeed } from '../data.js'
import { extractPalette } from '../colorUtils.js'

export default function MyShopScreen({ customItems, onPublish, onDelete, onNavigate, onBack }) {
  const [draft, setDraft] = useState(null)      // 正在编辑的商品草案
  const [analyzing, setAnalyzing] = useState(false)
  const [image, setImage] = useState(null)
  const inputRef = useRef(null)

  const chooseImage = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      setImage(dataUrl)
      runAiDraft(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  // AI 自动补全：用户只给一张照片，AI 想好名字/描述/价格/柜台
  const runAiDraft = async (dataUrl) => {
    setAnalyzing(true)
    setDraft(null)
    const id = Date.now()
    const seed = hashSeed(String(id) + dateSeed())
    const [palette] = await Promise.all([
      extractPalette(dataUrl),
      new Promise((r) => setTimeout(r, 1100 + Math.random() * 600)),
    ])
    const suggestion = generateProductDraft(palette, seed)

    setDraft({
      id: `custom-${id}`,
      code: `MY PRODUCT ${String(customItems.length + 1).padStart(2, '0')}`,
      image: dataUrl,
      name: suggestion.en,
      cn: suggestion.cn,
      price: suggestion.price,
      description: suggestion.desc,
      counterId: suggestion.counterId,
      category: suggestion.category,
      tags: ['mine'],
      palette,
      aiFilled: true,
      createdAt: new Date().toISOString(),
    })
    setAnalyzing(false)
  }

  const publish = () => {
    if (!draft) return
    onPublish(draft)
    setDraft(null)
    setImage(null)
  }

  const cancelDraft = () => {
    setDraft(null)
    setImage(null)
    setAnalyzing(false)
  }

  const updateDraft = (patch) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <div className="shop-page myshop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">我的小店</span>
        <button className="icon-button" aria-label="上架新品" onClick={() => inputRef.current?.click()}>
          <Plus size={22} strokeWidth={1.45} />
        </button>
      </header>

      <section className="myshop-intro">
        <p className="eyebrow">MY LITTLE COUNTER</p>
        <h1>你的小铺，<br />由你上架。</h1>
        <p>拍一张照片，AI 会自动想好商品名、描述和定价。你只需要点头。</p>
      </section>

      {/* AI 分析中 */}
      {analyzing && (
        <div className="archive-analyzing">
          <div className="analyzing-head">
            <Sparkles size={15} className="analyzing-icon" />
            <span>AI 正在为这张照片想一个商品</span>
            <span className="analyzing-dots"><i /><i /><i /></span>
          </div>
          <p className="analyzing-step">分析主色 → 判断品类 → 生成命名与定价…</p>
          <div className="analyzing-skeleton">
            <div className="skeleton-line" style={{ width: '48%' }} />
            <div className="skeleton-line" style={{ width: '72%' }} />
          </div>
        </div>
      )}

      {/* 草案编辑卡 */}
      {draft && !analyzing && (
        <section className="draft-card" aria-label="新商品草案">
          <div className="draft-badge"><Sparkles size={13} />AI 已自动填好，可改</div>
          <div className="draft-photo">
            <img src={draft.image} alt={draft.cn} />
            <button className="draft-rephoto" onClick={() => inputRef.current?.click()}>
              <ImagePlus size={15} />换图
            </button>
          </div>

          <div className="draft-palette">
            {draft.palette.swatches.map((c, i) => (
              <span key={i} className="draft-swatch" style={{ background: c }} title={c} />
            ))}
            <span className="draft-palette-caption">
              主色 {draft.palette.dominant} · {draft.palette.mood}
            </span>
          </div>

          <label className="draft-field">
            <span>商品名（中文）</span>
            <input value={draft.cn} onChange={(e) => updateDraft({ cn: e.target.value })} placeholder="比如：抹茶云朵" />
          </label>

          <label className="draft-field">
            <span>英文名</span>
            <input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value.toUpperCase() })} placeholder="MATCHA CLOUD" />
          </label>

          <div className="draft-row">
            <label className="draft-field">
              <span>价格 ¥</span>
              <input type="number" min="1" value={draft.price} onChange={(e) => updateDraft({ price: Number(e.target.value) })} />
            </label>
            <label className="draft-field">
              <span>归类到柜台</span>
              <select value={draft.counterId} onChange={(e) => updateDraft({ counterId: e.target.value })}>
                {counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>

          <label className="draft-field">
            <span>一句话描述</span>
            <textarea rows={2} value={draft.description} onChange={(e) => updateDraft({ description: e.target.value })} />
          </label>

          <div className="draft-actions">
            <button className="secondary-action" onClick={cancelDraft}>取消</button>
            <button className="primary-action" onClick={publish} disabled={!draft.cn.trim()}>
              <Check size={17} />上架到小铺
            </button>
          </div>
        </section>
      )}

      {/* 已上架列表 */}
      <section className="myshop-list" aria-label="已上架商品">
        <div className="section-rule"><span /></div>
        <h2 className="section-title">
          MY PRODUCTS <em>{String(customItems.length).padStart(2, '0')}</em>
        </h2>

        {customItems.length === 0 ? (
          <div className="myshop-empty">
            <Store size={26} strokeWidth={1.3} />
            <p>还没有上架任何东西。</p>
            <button className="primary-action" onClick={() => inputRef.current?.click()}>
              <Camera size={17} />拍一张，上架第一个
            </button>
          </div>
        ) : (
          <div className="myshop-grid">
            {customItems.map((item) => (
              <article key={item.id} className="myshop-card">
                <div className="myshop-thumb"><img src={item.image} alt={item.cn} loading="lazy" decoding="async" /></div>
                <div className="myshop-info">
                  <p className="myshop-code">{item.code}</p>
                  <h3>{item.cn}</h3>
                  <p className="myshop-en">{item.name}</p>
                  <p className="myshop-counter">{counters.find((c) => c.id === item.counterId)?.name}</p>
                  <div className="myshop-foot">
                    <span>¥{item.price}</span>
                    <button className="myshop-del" aria-label={`删除 ${item.cn}`} onClick={() => onDelete(item.id)}>
                      <Trash2 size={15} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="myshop-note">
        自建商品保存在这台设备上（localStorage），会立刻出现在对应柜台的菜单里，
        也能像内置商品一样加入购物篮、下单、配送。
      </p>

      <input ref={inputRef} className="file-input" type="file" accept="image/*" capture="environment" onChange={chooseImage} />
    </div>
  )
}
