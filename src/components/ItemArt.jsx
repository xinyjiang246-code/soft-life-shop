import FlipImage from './FlipImage.jsx'
import DishArt from './DishArt.jsx'

/**
 * ItemArt —— 商品图的统一出口
 *
 * 商品图有四种可能：
 *   ① 内置招牌：手绘 + 实拍两张真图 → 翻面卡（prefer 决定先露哪一张）
 *   ② 只有一张实拍图（世界菜单里的实拍菜）→ 直接铺满，不翻面
 *   ③ AI 世界菜单：没有实物照片，但有 art 描述 → 现画一张手绘卡
 *   ④ 兜底：老式 emoji 占位（正常路径不会走到）
 *
 * 所有页面（首页 / 店铺 / 购物袋 / 世界菜单）都走这里，避免各写一套。
 *
 * prefer 用法：
 *   - 'draw'（默认）：先露手绘。适合「我的小店 / 档案」这类展示自己作品的地方。
 *   - 'real'：先露实拍。外卖软件里第一眼必须是真食物 —— 店铺封面、店内菜单、购物袋都用它。
 */
export default function ItemArt({ item, size = 'lg', prefer = 'draw' }) {
  if (!item) return null
  const big = size === 'lg'

  // ① 手绘 + 实拍两张 → 可翻面
  //    prefer='real' 时正面给实拍（外卖店铺/菜单用这个：先让人看见真的食物），
  //    手绘退到背面，点一下仍能翻过去。
  if (item.image && item.imageReal && item.imageReal !== item.image) {
    const draw = item.image
    const real = item.imageReal
    const [front, back] = prefer === 'real' ? [real, draw] : [draw, real]
    return <FlipImage front={front} back={back} alt={item.cn} showTag={big} hint={big} />
  }

  // ② 只有一张实拍图 → 静态铺满
  if (item.image) {
    return (
      <div className="real-only">
        <img src={item.image} alt={item.cn} loading="lazy" />
      </div>
    )
  }

  // ③ AI 手绘卡
  if (item.art) {
    return (
      <DishArt
        kind={item.art.kind}
        hex={item.art.hex}
        city={item.art.city}
        cityEn={item.art.cityEn}
        main={item.art.main}
        shape={item.art.shape}
        code={item.code}
        label={item.cn}
        en={item.name}
        compact={!big}
      />
    )
  }

  return (
    <div className={`product-art-placeholder placeholder-${item.counterId}`}>
      <span className="placeholder-emoji" aria-hidden="true">{item.emoji || '🍽️'}</span>
      {big && <span className="placeholder-name">{item.cn}</span>}
    </div>
  )
}
