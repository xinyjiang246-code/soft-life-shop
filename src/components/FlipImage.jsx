import { useState } from 'react'
import { Repeat } from 'lucide-react'

/**
 * FlipImage —— 一图两面的翻面卡片
 * 正面 = 默认展示的那一张，背面 = 翻过去看的那一张
 * 交互和 Instagram「上传两张头像、点头像换一张」一样：点一下翻过去，再点一下翻回来。
 *
 * 两面可以各自是 **图片地址**（front / back）或 **任意 React 节点**（frontNode / backNode）——
 * 后者是给世界菜单用的：AI 现编的菜没有手绘**文件**，那张手绘卡是 DishArt 现画的 SVG，
 * 所以只能当节点塞进来。
 *
 * 用法：
 *   <FlipImage front={item.image} back={item.imageReal} alt={item.cn} />
 *   <FlipImage frontNode={<DishArt … />} back={item.imageReal} frontTag="手绘" backTag="AI 想象" />
 * 放进任何 position:relative 的容器里（.product-art / .counter-thumb …），会自动铺满。
 *
 * ⚠️ 角标文案由调用方给，**不许把 AI 生成的图写成「实拍」**（红线：世界菜是现编的）。
 */
export default function FlipImage({
  front,
  back,
  frontNode = null,
  backNode = null,
  alt = '',
  className = '',
  hint = true,
  showTag = true,
  // 角标文案跟着「传进来的哪张图在前面」走 —— 调用方若把实拍放正面（prefer="real"），
  // 标签必须跟着掉头，否则正面明明是实拍、角标却写着「手绘」。
  frontTag = '手绘',
  backTag = '实拍',
  stopPropagation = true,
}) {
  const [flipped, setFlipped] = useState(false)

  const frontFace = frontNode || (front ? <img src={front} alt={alt} loading="lazy" decoding="async" /> : null)
  const backFace = backNode || (back ? <img src={back} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : null)

  // 没有背面（例如用户自己拍的照片、还没配图的世界菜）→ 退化成普通图片
  if (!backFace) {
    return (
      <div className={`flip-frame flip-static ${className}`}>
        {frontNode || (front ? (
          <img className="flip-solo" src={front} alt={alt} loading="lazy" decoding="async" />
        ) : (
          <span className="flip-emoji" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="7.2" />
              <circle cx="12" cy="12" r="3.4" />
            </svg>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className={`flip-frame ${className}`} data-flipped={flipped ? 'true' : 'false'}>
      <button
        type="button"
        className="flip-toggle"
        aria-pressed={flipped}
        aria-label={`${alt}：点击切换${frontTag} / ${backTag}`}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
          setFlipped((v) => !v)
        }}
      >
        <span className="flip-inner">
          <span className="flip-face flip-front">
            {showTag && <span className="flip-tag">{frontTag}</span>}
            {frontFace}
          </span>
          <span className="flip-face flip-back">
            {showTag && <span className="flip-tag">{backTag}</span>}
            {backFace}
          </span>
        </span>
      </button>
      {hint && (
        <span className="flip-hint" aria-hidden="true">
          <Repeat size={10} strokeWidth={2} />
        </span>
      )}
    </div>
  )
}
