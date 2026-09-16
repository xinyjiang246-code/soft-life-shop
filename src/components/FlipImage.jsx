import { useState } from 'react'
import { Repeat } from 'lucide-react'

/**
 * FlipImage —— 一图两面的翻面卡片
 * 正面 = 手绘线稿（默认展示），背面 = 真实照片
 * 交互和 Instagram「上传两张头像、点头像换一张」一样：点一下翻过去，再点一下翻回来。
 *
 * 用法：
 *   <FlipImage front={item.image} back={item.imageReal} alt={item.cn} />
 * 放进任何 position:relative 的容器里（.product-art / .counter-thumb …），会自动铺满。
 */
export default function FlipImage({
  front,
  back,
  alt = '',
  className = '',
  hint = true,
  showTag = true,
  stopPropagation = true,
}) {
  const [flipped, setFlipped] = useState(false)

  // 没有实拍图（例如用户自己拍的照片），退化成普通图片
  if (!back) {
    return (
      <div className={`flip-frame flip-static ${className}`}>
        {front ? (
          <img className="flip-solo" src={front} alt={alt} />
        ) : (
          <span className="flip-emoji" aria-hidden="true">🍽️</span>
        )}
      </div>
    )
  }

  return (
    <div className={`flip-frame ${className}`} data-flipped={flipped ? 'true' : 'false'}>
      <button
        type="button"
        className="flip-toggle"
        aria-pressed={flipped}
        aria-label={`${alt}：点击切换手绘 / 实拍`}
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
          setFlipped((v) => !v)
        }}
      >
        <span className="flip-inner">
          <span className="flip-face flip-front">
            {showTag && <span className="flip-tag">手绘</span>}
            <img src={front} alt={alt} />
          </span>
          <span className="flip-face flip-back">
            {showTag && <span className="flip-tag">实拍</span>}
            <img src={back} alt="" aria-hidden="true" />
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
