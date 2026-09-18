import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Sparkles } from 'lucide-react'
import './styles.css'
import { flyToBag, rememberPointer } from './flyToBag.js'
import { RESCUE, buildRescueShelf, dateSeed, getItem, getTodaySpecial, levelForMeals, setCustomItems, setRescueItems, setRuntimeItems, setWorldItems, stickerPool, toItemFromSpecial } from './data.js'
import { forgeMenu, getKitchen, getTodayKitchen } from './dishForge.js'
import { loadCart, loadCharity, loadCustomItems, loadHouseName, loadPet, loadRescue, loadWishes, loadWorld, logJournalOrder, saveCart, saveCharity, saveCustomItems, savePet, saveRescue, saveWishes, saveWorld } from './storage.js'
import HomeScreen from './screens/HomeScreen.jsx'
import CounterListScreen from './screens/CounterListScreen.jsx'
import CounterDetailScreen from './screens/CounterDetailScreen.jsx'
import CartScreen from './screens/CartScreen.jsx'
import CheckoutScreen from './screens/CheckoutScreen.jsx'
import DeliveryScreen from './screens/DeliveryScreen.jsx'
import EndingScreen from './screens/EndingScreen.jsx'
import ArchiveScreen from './screens/ArchiveScreen.jsx'
import PetScreen from './screens/PetScreen.jsx'
import MyShopScreen from './screens/MyShopScreen.jsx'
import WorldMenuScreen from './screens/WorldMenuScreen.jsx'
import CharityScreen from './screens/CharityScreen.jsx'
import RescueScreen from './screens/RescueScreen.jsx'
import SearchScreen from './screens/SearchScreen.jsx'
import WishlistScreen from './screens/WishlistScreen.jsx'

function App() {
  const [screen, setScreen] = useState('home')
  const [params, setParams] = useState({})
  const [cart, setCart] = useState(() => loadCart())
  const [houseName, setHouseName] = useState(() => loadHouseName())
  const [pet, setPet] = useState(() => loadPet())
  const [customItems, setCustom] = useState(() => loadCustomItems())
  const [world, setWorld] = useState(() => loadWorld())
  const [charity, setCharity] = useState(() => loadCharity())
  const [rescue, setRescue] = useState(() => loadRescue())
  const [wishes, setWishes] = useState(() => loadWishes())
  const [toast, setToast] = useState(null)

  // 今天轮到哪座城市（用户没手动切过就用日期决定）
  // ⚠️ 手动切过的城市**只在当天算数**：跨天必须回到今天的城市，
  //    否则首页会永远写着「今日空运自京都」，而明信片上的邮戳印的是今天的日期。
  //    存档里的 day 就是干这个用的（旧存档没有 day → 视为过期，回落）。
  const today = dateSeed()
  const worldIsFresh = world.day === today
  const worldKitchenId = (worldIsFresh && world.kitchenId) || getTodayKitchen().id
  const worldBatch = worldIsFresh ? world.batch : 0
  const worldKitchen = useMemo(() => getKitchen(worldKitchenId), [worldKitchenId])
  // 同一 (城市, 批次) 永远得到同一桌菜 —— id 稳定，购物车不会错位
  const worldItems = useMemo(() => forgeMenu(worldKitchenId, worldBatch), [worldKitchenId, worldBatch])

  // 把用户自建商品 + 今日特调注册进运行时商品表，供全局 getItem 查询
  useEffect(() => {
    setCustomItems(customItems)
  }, [customItems])

  // 记住最后一次按下的屏幕坐标：加购动效从那儿起飞。
  // 这样不用给 8 个页面的 onAdd 都加一个「你按在哪儿」的参数。
  useEffect(() => rememberPointer(), [])

  useEffect(() => {
    const special = getTodaySpecial()
    setRuntimeItems([toItemFromSpecial(special)])
  }, [])

  // 世界菜单的商品不进柜台，但必须能被 getItem 查到（购物篮里要用）
  useEffect(() => {
    setWorldItems(worldItems)
  }, [worldItems])

  // 今日惜食柜：只跟日期有关，所以一次 mount 定下来就够（刷新不变）
  const rescueShelf = useMemo(() => buildRescueShelf(), [])

  // 惜食柜的商品同理 —— 不进柜台菜单，但购物袋里要查得到
  useEffect(() => {
    setRescueItems(rescueShelf)
  }, [rescueShelf])

  const cartCount = useMemo(() => Object.values(cart).reduce((sum, qty) => sum + qty, 0), [cart])

  const navigate = useCallback((nextScreen, nextParams = {}, dir = 'fwd') => {
    // ---- 切页转场（2026-09-18）----
    // 先说两条**被实测否掉**的路，别再走回去：
    //  ① 「给页面套一层 transform 做滑入」——`.bottom-bar` 是 position:fixed，
    //     祖先一旦带 transform，它的包含块就从视口变成那个祖先，动画期间底栏会被
    //     钉到内容底部（购物袋/结算页比视口高 → 底栏消失再蹦回来）。
    //  ② View Transitions（startViewTransition）——视觉上完全没问题，固定元素也安全，
    //     但 **Chrome 在转场进行中不让实时内容参与命中测试**：实测转场期间
    //     `elementFromPoint` 一律返回 HTML，真实点击也到不了新页面
    //     （连点两次顶栏返回键都回不去），`::view-transition{pointer-events:none}`
    //     设了也没用（computed 确实是 none，照样拦）。
    //     等于每次切页有 ~260ms 全页点不动 —— 对一个"用手点"的 App 来说不可接受。
    // 所以现在走的是最朴素也最安全的一条：**给屏幕根节点的子元素加一段进场动画**，
    // 只动 opacity + translate，并把 .bottom-bar 排除在外（见 styles.css）。
    // opacity 与「已结束的 translate」都不产生包含块，命中也完全不受影响。
    document.documentElement.dataset.nav = dir
    setParams(nextParams)
    setScreen(nextScreen)
    // 复位滚动要**立刻**：否则新页面一边淡入一边还在滚，看着像卡了一下。
    // ⚠️ CSS 里有 `html { scroll-behavior: smooth }`，写 `scrollTo(0,0)` 仍然会被
    //    它接管成平滑滚动 —— 必须显式 behavior:'instant' 才真的瞬间归位。
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [])

  const goBack = useCallback(() => {
    // 返回一律走 back 方向（转场反着播）
    // 店铺页可能从首页进来，也可能从「全部店铺」进来 —— 按来路回去
    if (screen === 'counter') navigate(params.from === 'counters' ? 'counters' : 'home', {}, 'back')
    else if (screen === 'counters' || screen === 'cart' || screen === 'archive' || screen === 'charity' || screen === 'rescue' || screen === 'search' || screen === 'wishlist') navigate('home', {}, 'back')
    else if (screen === 'checkout') navigate('cart', {}, 'back')
    else navigate('home', {}, 'back')
  }, [screen, navigate, params.from])

  // 加进袋子。惜食柜的东西有份数上限 —— 柜上就剩那么几份，
  // 文案承诺了「卖完就没有了」，那就得真的会卖完（两个入口都走这里，所以拦在这）。
  const addToCart = useCallback((itemId) => {
    const item = getItem(itemId)
    if (!item) return
    const cap = item.rescue ? RESCUE.perItem : Infinity
    if ((cart[itemId] || 0) >= cap) {
      setToast({ key: Date.now(), message: `这一格今天只剩 ${cap} 份了` })
      return
    }
    setCart((prev) => {
      const next = { ...prev, [itemId]: (prev[itemId] || 0) + 1 }
      saveCart(next)
      return next
    })
    // 加购动线：一个小点从按下处飞进顶栏的购物袋，到位后袋子晃一下、角标弹一下。
    // 纯视觉，失败也不影响加购本身 —— 所以不 await、不 try 之外的任何编排。
    flyToBag()
    setToast({ key: Date.now(), message: `已加入购物篮 · ${item.cn}` })
  }, [cart])

  // 对一次账：惜食柜、世界菜单、今日特调都会换，昨天加进袋子/记着的东西
  // 今天可能已经查不到了。不清理的话角标会骗人 ——
  // 实测过：顶栏角标显示 3，点进去 0 行，还写着「购物篮还是空的」。
  // 所以每次运行时商品表定下来后对一次，把查不到的如实请出去，并且说一声。
  useEffect(() => {
    const goneCart = Object.keys(cart).filter((id) => !getItem(id))
    const goneWish = wishes.filter((id) => !getItem(id))
    if (!goneCart.length && !goneWish.length) return

    if (goneCart.length) {
      setCart((prev) => {
        const next = { ...prev }
        goneCart.forEach((id) => delete next[id])
        saveCart(next)
        return next
      })
    }
    if (goneWish.length) {
      setWishes((prev) => {
        const next = prev.filter((id) => !goneWish.includes(id))
        saveWishes(next)
        return next
      })
    }
    const total = goneCart.length + goneWish.length
    setToast({ key: Date.now(), message: `${total} 样已经不在小铺里了 · 明天再来看看` })
  }, [worldItems, rescueShelf, cart, wishes])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  const setCartAndPersist = useCallback((updater) => {
    setCart((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveCart(next)
      return next
    })
  }, [])

  const resetCart = useCallback(() => {
    setCart({})
    saveCart({})
  }, [])

  // 完成一单 → 喂小饼干 + 掉落贴纸 + 可能升级，返回本次成长结果
  // extraSticker：等待页完整等完不跳过时的「路上的纪念」（多掉一枚）
  const growPet = useCallback((opts = {}) => {
    const { extraSticker = false } = opts
    const meals = pet.meals + 1
    const used = new Set(pet.stickers)
    const pickOne = () => {
      const pool = stickerPool.filter((s) => !used.has(s.id))
      if (pool.length === 0) return null
      const pick = pool[Math.floor(Math.random() * pool.length)]
      used.add(pick.id)
      return pick
    }
    const newSticker = pickOne()
    const bonusSticker = extraSticker ? pickOne() : null
    const stickers = [
      ...pet.stickers,
      ...[newSticker, bonusSticker].filter(Boolean).map((s) => s.id),
    ]
    const level = levelForMeals(meals)
    const leveledUp = level > pet.level
    const next = {
      ...pet,
      meals,
      totalOrders: pet.totalOrders + 1,
      stickers,
      level,
    }
    setPet(next)
    savePet(next)
    return { leveledUp, newSticker, bonusSticker, meals, level }
  }, [pet])

  // 换毛色（奶油白 / 樱花粉 / 婴儿蓝）
  const setPetColorway = useCallback((colorway) => {
    setPet((prev) => {
      const next = { ...prev, colorway }
      savePet(next)
      return next
    })
  }, [])

  // 用户上架自建商品
  const publishItem = useCallback((item) => {
    setCustom((prev) => {
      const next = [...prev, item]
      saveCustomItems(next)
      return next
    })
    setToast({ key: Date.now(), message: `已上架 · ${item.cn}` })
  }, [])

  // 世界菜单：换城市 / 换一桌 —— 都顺手记下「这是哪天的选择」
  const switchWorldKitchen = useCallback((id) => {
    setWorld((prev) => {
      const next = { kitchenId: id, batch: 0, day: dateSeed() }
      saveWorld(next)
      return next
    })
  }, [])

  const reshuffleWorld = useCallback(() => {
    setWorld((prev) => {
      const sameDay = prev.day === dateSeed()
      const next = {
        kitchenId: (sameDay && prev.kitchenId) || getTodayKitchen().id,
        batch: (sameDay ? prev.batch : 0) + 1,
        day: dateSeed(),
      }
      saveWorld(next)
      return next
    })
  }, [])

  // 公益：把这一单折算出的猫粮记进档案
  const donateCatFood = useCallback(({ grams, amount, ratio, shop }) => {
    setCharity((prev) => {
      const next = {
        grams: (prev.grams || 0) + grams,
        amount: Math.round(((prev.amount || 0) + amount) * 100) / 100,
        orders: (prev.orders || 0) + 1,
        records: [
          { id: `don-${Date.now()}`, grams, amount, ratio, shop, at: new Date().toISOString() },
          ...(prev.records || []),
        ].slice(0, 60),
      }
      saveCharity(next)
      return next
    })
    // ⚠️ 红线：绝不写「已捐出」—— App 没有后端，钱一直在用户手上，转账发生在 App 之外。
    //    这句只能说「记下」，并且要顺手提醒一句钱还没走。
    setToast({ key: Date.now(), message: `记下 ${grams}g 猫粮 · 钱还在你手上` })
  }, [])

  // 真捐闭环：钱是用户自己转的，App 只负责**记下这一笔**。
  // 这才有「已捐」可言 —— 之前那些都只是「打算捐」。
  const settleCharity = useCallback(({ grams, amount, to }) => {
    setCharity((prev) => {
      const next = {
        ...prev,
        settled: [
          { id: `set-${Date.now()}`, grams, amount, to, at: new Date().toISOString() },
          ...(prev.settled || []),
        ].slice(0, 60),
      }
      saveCharity(next)
      return next
    })
    setToast({ key: Date.now(), message: `记下这次真捐 · ${grams}g · 谢谢你真的去了` })
  }, [])

  // 惜食柜：一单送达后，把「从柜上带走的份数」记进那本账
  // 记的是份数不是钱 —— 钱只是附带的说明（少花多少，不是「省了」）
  const recordRescue = useCallback((snapshot) => {
    const taken = Object.entries(snapshot || {})
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ item: getItem(id), qty }))
      .filter(({ item }) => item && item.rescue)
    if (taken.length === 0) return null

    const servings = taken.reduce((n, { qty }) => n + qty, 0)
    const yuan = taken.reduce((n, { item, qty }) => n + item.saved * qty, 0)
    const record = {
      id: `resc-${Date.now()}`,
      at: new Date().toISOString(),
      servings,
      yuan: Math.round(yuan * 100) / 100,
      items: taken.map(({ item, qty }) => ({
        cn: item.cn,
        name: item.name,
        qty,
        originalPrice: item.originalPrice,
        price: item.price,
        offPct: item.offPct,
      })),
    }
    setRescue((prev) => {
      const next = {
        servings: (prev.servings || 0) + servings,
        yuan: Math.round(((prev.yuan || 0) + yuan) * 100) / 100,
        orders: (prev.orders || 0) + 1,
        records: [record, ...(prev.records || [])].slice(0, 60),
      }
      saveRescue(next)
      return next
    })
    return { servings, yuan: record.yuan }
  }, [])

  // 食物手账：一份饭送到了，才写进「今天那一页」
  // 和宠物成长、公益捐赠、惜食柜记账同一节拍 —— 没送到就不算数。
  // 记的是「名字 + 商品 id」，id 让手账日历能贴出真图，不是空文字。
  const recordJournal = useCallback((snapshot) => {
    const entries = Object.entries(snapshot || {})
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ item: getItem(id), qty }))
      .filter(({ item }) => item)
      .map(({ item, qty }) => ({ id: item.id, name: qty > 1 ? `${item.name} ×${qty}` : item.name }))
    if (entries.length === 0) return null
    logJournalOrder(entries)
    return { count: entries.length }
  }, [])

  const deleteItem = useCallback((id) => {
    setCustom((prev) => {
      const next = prev.filter((i) => i.id !== id)
      saveCustomItems(next)
      return next
    })
    // 顺带从购物车移除
    setCart((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      saveCart(next)
      return next
    })
  }, [])

  // 心愿单：先记着 —— 只存 id，不占购物袋、不参与结算
  const toggleWish = useCallback((itemId) => {
    setWishes((prev) => {
      const has = prev.includes(itemId)
      const next = has ? prev.filter((id) => id !== itemId) : [...prev, itemId]
      saveWishes(next)
      if (!has) {
        const item = getItem(itemId)
        setToast({ key: Date.now(), message: item ? `先记着 · ${item.cn}` : '先记着了' })
      }
      return next
    })
  }, [])

  const dropWish = useCallback((itemId) => {
    setWishes((prev) => {
      const next = prev.filter((id) => id !== itemId)
      saveWishes(next)
      return next
    })
  }, [])

  return (
    <main className="page-shell">
      {screen === 'home' && (
        <HomeScreen
          cartCount={cartCount}
          pet={pet}
          customItems={customItems}
          worldKitchen={worldKitchen}
          charity={charity}
          rescueShelf={rescueShelf}
          wishes={wishes}
          onNavigate={navigate}
          onAdd={addToCart}
        />
      )}
      {screen === 'counters' && (
        <CounterListScreen cartCount={cartCount} onNavigate={navigate} onBack={goBack} />
      )}
      {screen === 'counter' && (
        <CounterDetailScreen
          counterId={params.counterId}
          cartCount={cartCount}
          wishes={wishes}
          onToggleWish={toggleWish}
          onNavigate={navigate}
          onBack={goBack}
          onAdd={addToCart}
        />
      )}
      {screen === 'cart' && (
        <CartScreen cart={cart} setCart={setCartAndPersist} onNavigate={navigate} onBack={goBack} />
      )}
      {screen === 'checkout' && (
        <CheckoutScreen
          cart={cart}
          houseName={houseName}
          setHouseName={setHouseName}
          onNavigate={navigate}
          onBack={goBack}
        />
      )}
      {screen === 'delivery' && (
        <DeliveryScreen
          houseName={houseName}
          onNavigate={navigate}
          order={params}
        />
      )}
      {screen === 'ending' && (
        <EndingScreen
          houseName={houseName}
          pet={pet}
          cart={cart}
          wait={params}
          onGrow={growPet}
          onDonate={donateCatFood}
          onRescue={recordRescue}
          onJournal={recordJournal}
          onNavigate={navigate}
          onReset={resetCart}
        />
      )}
      {screen === 'archive' && <ArchiveScreen onBack={goBack} initialView={params.view} />}
      {screen === 'charity' && <CharityScreen charity={charity} onBack={goBack} onSettle={settleCharity} />}
      {screen === 'rescue' && (
        <RescueScreen
          shelf={rescueShelf}
          rescue={rescue}
          cart={cart}
          cartCount={cartCount}
          onAdd={addToCart}
          onNavigate={navigate}
          onBack={goBack}
        />
      )}
      {screen === 'search' && (
        <SearchScreen cartCount={cartCount} onAdd={addToCart} onNavigate={navigate} onBack={goBack} />
      )}
      {screen === 'wishlist' && (
        <WishlistScreen
          wishes={wishes}
          cartCount={cartCount}
          onAdd={addToCart}
          onRemove={dropWish}
          onNavigate={navigate}
          onBack={goBack}
        />
      )}
      {screen === 'pet' && <PetScreen pet={pet} onColorway={setPetColorway} onBack={goBack} />}
      {screen === 'myshop' && (
        <MyShopScreen
          customItems={customItems}
          onPublish={publishItem}
          onDelete={deleteItem}
          onNavigate={navigate}
          onBack={goBack}
        />
      )}
      {screen === 'world' && (
        <WorldMenuScreen
          kitchenId={worldKitchenId}
          batch={worldBatch}
          items={worldItems}
          cartCount={cartCount}
          onSwitchKitchen={switchWorldKitchen}
          onReshuffle={reshuffleWorld}
          onAdd={addToCart}
          onNavigate={navigate}
          onBack={goBack}
        />
      )}

      {toast && (
        <div className="toast" key={toast.key} role="status" aria-live="polite">
          <Sparkles size={14} strokeWidth={1.6} />
          <span>{toast.message}</span>
        </div>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
