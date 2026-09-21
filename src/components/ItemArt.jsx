import FlipImage from './FlipImage.jsx'
import DishArt from './DishArt.jsx'

/**
 * ItemArt —— 商品图的统一出口
 *
 * 商品图有六种可能：
 *   ① 内置招牌：手绘 + 实拍两张真图 → 翻面卡（prefer 决定先露哪一张）
 *   ①b AI 世界菜单（已配想象图）：手绘卡（DishArt 现画的 SVG）+ AI 想象图 → 也翻面
 *   ② 只有一张图（世界菜单早期版本 / 用户自己拍的）→ 直接铺满，不翻面
 *   ③ AI 世界菜单（还没配图的城市）：只有 art 描述 → 现画一张手绘卡
 *   ④ 兜底：老式占位（正常路径不会走到）
 *
 * 所有页面（首页 / 店铺 / 购物袋 / 世界菜单）都走这里，避免各写一套。
 *
 * prefer 用法：
 *   - 'draw'（默认）：先露手绘。适合「我的小店 / 档案」这类展示自己作品的地方。
 *   - 'real'：先露真实那一面。外卖软件里第一眼必须是真食物 —— 店铺封面、店内菜单、
 *     购物袋都用它。注意世界菜的「真」那一面是 **AI 想象图**，角标文案要跟着说实话。
 *
 * ⚠️ 红线：世界菜的图是 AI 现编的，**角标绝不能写「实拍」** ——
 *    所以这里按 item.isWorld 换成「AI 想象」。
 */
export default function ItemArt({ item, size = 'lg', prefer = 'draw' }) {
  if (!item) return null
  const big = size === 'lg'

  // 手绘卡是一个**组件**（SVG），不是图片文件 —— 世界菜都是现画的
  const drawDish = item.art ? (
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
  ) : null

  // ① 手绘 + 实拍两张 → 可翻面
  //    prefer='real' 时正面给实拍（外卖店铺/菜单用这个：先让人看见真的食物），
  //    手绘退到背面，点一下仍能翻过去。
  if (item.image && item.imageReal && item.imageReal !== item.image) {
    const draw = item.image
    const real = item.imageReal
    const realFirst = prefer === 'real'
    const [front, back] = realFirst ? [real, draw] : [draw, real]
    return (
      <FlipImage
        front={front}
        back={back}
        alt={item.cn}
        showTag={big}
        hint={big}
        frontTag={realFirst ? '实拍' : '手绘'}
        backTag={realFirst ? '手绘' : '实拍'}
      />
    )
  }

  // ①b AI 世界菜单：手绘卡 + AI 想象图 → 也翻面
  //     手绘那张是 DishArt 现画的 SVG，只能当 React 节点传给 FlipImage。
  //     角标说实话：AI 现编的菜没有实物照片。
  if (item.art && item.imageReal) {
    const draw = drawDish
    const photo = <img src={item.imageReal} alt={item.cn} loading="lazy" />
    const realFirst = prefer === 'real'
    const photoTag = 'AI 想象'
    return (
      <FlipImage
        frontNode={realFirst ? photo : draw}
        backNode={realFirst ? draw : photo}
        alt={item.cn}
        showTag={big}
        hint={big}
        frontTag={realFirst ? photoTag : '手绘'}
        backTag={realFirst ? '手绘' : photoTag}
      />
    )
  }

  // ② 只有一张实拍图 → 静态铺满
  if (item.image) {
    return (
      <div className="real-only">
        <img src={item.image} alt={item.cn} loading="lazy" />
      </div>
    )
  }

  // ③ 只有手绘卡（这一年的城市还没配图）
  if (item.art) return drawDish

  return (
    <div className={`product-art-placeholder placeholder-${item.counterId}`}>
      <span className="placeholder-emoji" aria-hidden="true">{item.emoji || '🍽️'}</span>
      {big && <span className="placeholder-name">{item.cn}</span>}
    </div>
  )
}
