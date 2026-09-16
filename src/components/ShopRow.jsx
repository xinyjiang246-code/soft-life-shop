import { ChevronRight, Store } from 'lucide-react'

/**
 * ShopRow —— 外卖软件式店铺卡
 *
 * 封面 + 店名 + 评分/月售 + 配送时长/距离 + 起送/配送费 + 满减角标。
 * 首页和「全部店铺」页共用，避免两处各写一套。
 */
export default function ShopRow({ shop, itemCount = 0, onOpen }) {
  const cover = shop.heroReal || shop.hero
  return (
    <button className="shop-row" onClick={onOpen}>
      <div className="shop-cover">
        {cover ? (
          <img src={cover} alt={shop.name} loading="lazy" />
        ) : (
          <span className="shop-cover-fallback" aria-hidden="true"><Store size={26} strokeWidth={1.3} /></span>
        )}
        {shop.discount && (
          <span className="shop-cover-badge">{shop.discount.threshold}减{shop.discount.amount}</span>
        )}
      </div>

      <div className="shop-body">
        <h3>{shop.name}</h3>
        <p className="shop-en">{shop.nameEn}</p>

        <div className="shop-stats">
          <span className="shop-rating">★ {shop.rating}</span>
          <span>月售 {shop.monthly}</span>
          <span>{shop.deliveryTime} 分钟</span>
          <span>{shop.distance} km</span>
        </div>

        <div className="shop-tags">
          <span className="shop-chip">起送 ¥{shop.minOrder}</span>
          <span className="shop-chip">配送 {shop.deliveryFee === 0 ? '免' : `¥${shop.deliveryFee}`}</span>
          {itemCount > 0 && <span className="shop-chip shop-chip-ghost">{itemCount} 件在售</span>}
        </div>
      </div>

      <ChevronRight className="shop-arrow" size={18} strokeWidth={1.5} />
    </button>
  )
}
