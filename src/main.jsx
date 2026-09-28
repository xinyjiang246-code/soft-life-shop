import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Sparkles } from 'lucide-react'
import './styles.css'
import { flyToBag, rememberPointer } from './flyToBag.js'
// ⚠️ getCounter 必须在这个 import 里：第 ~345 行记订单历史时用它取店名。
//    漏掉它不是「少个名字」—— 是**整个 App 白屏**（ReferenceError 会把 React 整棵树带下去）。
//    症状：等待页点「跟骑手说一句」选任意一句 → 整页空白。2026-09-21 真机上抓到过。
import { RESCUE, buildRescueShelf, cartKeyOf, dailySpecials, dateSeed, getCounter, getItem, getSpecialRun, levelForMeals, parseCartKey, setCustomItems, setRescueItems, setRuntimeItems, setWorldItems, specTextOf, stickerPool, toItemFromSpecial, unitPriceOf } from './data.js'
import { forgeMenu, getKitchen, getTodayKitchen } from './dishForge.js'
import { loadCart, loadCharity, loadCustomItems, loadHouseName, loadOrders, loadPets, loadRescue, loadWishes, loadWorld, logJournalOrder, saveCart, saveCharity, saveCustomItems, saveOrder, savePets, saveRescue, saveWishes, saveWorld } from './storage.js'
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
import MineScreen from './screens/MineScreen.jsx'
import JournalView from './components/JournalView.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import AdminScreen from './screens/AdminScreen.jsx'
import { beat } from './stats.js'
import CharityScreen from './screens/CharityScreen.jsx'
import RescueScreen from './screens/RescueScreen.jsx'
import SearchScreen from './screens/SearchScreen.jsx'
import WishlistScreen from './screens/WishlistScreen.jsx'

function App() {
  const [screen, setScreen] = useState(() => {
    try { return new URLSearchParams(location.search).get('admin') === '1' ? 'admin' : 'home' } catch { return 'home' }
  })
  const [params, setParams] = useState({})
  const [cart, setCart] = useState(() => loadCart())
  const [houseName, setHouseName] = useState(() => loadHouseName())
  const [pets, setPets] = useState(() => loadPets())
  const [customItems, setCustom] = useState(() => loadCustomItems())
  const [world, setWorld] = useState(() => loadWorld())
  const [charity, setCharity] = useState(() => loadCharity())
  const [rescue, setRescue] = useState(() => loadRescue())
  const [wishes, setWishes] = useState(() => loadWishes())
  const [toast, setToast] = useState(null)

  // 当前陪伴的伙伴：从两只独立档案里取「激活的那只」，补上 species 供页面按物种渲染。
  // 页面拿到的永远是单个 pet 对象（带各自的 meals/level/stickers），不用关心另一只。
  const activePet = useMemo(() => ({ ...pets[pets.active], species: pets.active }), [pets])

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

  // 特调商品（2026-09-24 用户「主页这个图片点击的话应该能跳到对应商品页面」）：
  // **12 杯全部登记**，但只有封面上那 4 杯标 onShelf（决定谁出现在茶饮铺菜单里）。
  // 不在架的也登记，是为了让**跨天存下来的购物袋**还能查到它 —— 只登记在架那 4 杯的话，
  // 用户昨天加的那杯今天就会从袋子里消失（cartBreakdown 会丢掉查不到的 id）。
  useEffect(() => {
    const shelf = new Set(getSpecialRun(4).map((s) => s.index))
    setRuntimeItems(dailySpecials.map((s, i) =>
      toItemFromSpecial({ ...s, index: i }, { onShelf: shelf.has(i) })))
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

  // 匿名统计：每次打开记一笔（未部署/已关闭时静默）
  useEffect(() => { beat('visit') }, [])

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
  // specIds：选的规格（没选就是 []，键仍是商品 id 本身，和老数据一个形状）
  const addToCart = useCallback((itemId, specIds = []) => {
    const item = getItem(itemId)
    if (!item) return
    const cap = item.rescue ? RESCUE.perItem : Infinity
    // 柜上剩几份是**按商品**算的 —— 同一碗饭「少一点」「多一点」各加一次只占两份，不是四份
    const held = Object.entries(cart).reduce((n, [key, qty]) => {
      const { itemId: id } = parseCartKey(key)
      return id === itemId ? n + qty : n
    }, 0)
    if (held >= cap) {
      setToast({ key: Date.now(), message: `这一格今天只剩 ${cap} 份了` })
      return
    }
    const key = cartKeyOf(itemId, specIds)
    setCart((prev) => {
      const next = { ...prev, [key]: (prev[key] || 0) + 1 }
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
    // 键可能是 `m13#ice-none…`，得先拆出商品 id 再查在不在
    const goneCart = Object.keys(cart).filter((key) => !getItem(parseCartKey(key).itemId))
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

  // ===== 这一单的快照（2026-09-28「付完袋子要空」）=====
  // 旧逻辑只靠结局页两个按钮（再来一单/看宠物）才清购物袋 —— 用户付完直接走、
  // 刷新、或从别的路径离开，上一单的东西就一直挂在袋子里（角标也跟着骗人）。
  // 现在：支付成功那一刻就把「这一单」快照进 lastOrder、袋子当场清掉（storage 同步清）。
  // 结局页读 lastOrder 记手账/惜食/算总额 —— 它本来就该读「这一单」，而不是 live 袋子。
  // 不走 params：DeliveryScreen → Ending 会整包替换 params，快照会丢。
  //
  // 勾选购买（同日）：快照/清袋只含**勾走的**那部分 —— 购物袋页没勾的行原地留着，
  // 属于「还没决定要买」，不该被这一单顺手带走（用户原话「不买的就继续放在
  // 购物车里面不动，买的就减掉就行」）。
  const [lastOrder, setLastOrder] = useState({})
  const payOrder = useCallback((snapshot) => {
    const bought = snapshot || {}
    setLastOrder(bought)
    setCart((prev) => {
      const keys = Object.keys(bought).filter((k) => k in prev)
      if (!keys.length) return prev
      const next = { ...prev }
      keys.forEach((k) => delete next[k])
      saveCart(next)
      return next
    })
  }, [])

  // 完成一单 → 喂小饼干 + 掉落贴纸 + 可能升级，返回本次成长结果
  // extraSticker：等待页完整等完不跳过时的「路上的纪念」（多掉一枚）
  // 只喂「当前陪伴的那只」—— 猫狗各自成长，别喂错对象。
  const growPet = useCallback((opts = {}) => {
    const { extraSticker = false } = opts
    const species = pets.active
    const pet = pets[species]
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
    setPets((prev) => {
      const p = { ...prev, [species]: next }
      savePets(p)
      return p
    })
    return { leveledUp, newSticker, bonusSticker, meals, level }
  }, [pets])

  // 换毛色（奶油白 —— 现在只有一种配色）
  const setPetColorway = useCallback((colorway) => {
    setPets((prev) => {
      const species = prev.active
      const p = { ...prev, [species]: { ...prev[species], colorway } }
      savePets(p)
      return p
    })
  }, [])

  // 切换当前陪伴哪只（猫 软软 / 狗 团团，09-24）：两只独立成长、都一直在，
  // 切换只改「现在陪的是谁」，另一只的档案原样保留、随时切回。
  const switchPetSpecies = useCallback((species) => {
    setPets((prev) => {
      const nextActive = species === 'dog' ? 'dog' : 'cat'
      if (prev.active === nextActive) return prev
      const p = { ...prev, active: nextActive }
      savePets(p)
      return p
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
    // 统计打点：这一单捐出的猫粮克数（未部署时 beat 自己静默跳过）
    beat('grams', grams)
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
      .map(([key, qty]) => ({ item: getItem(parseCartKey(key).itemId), qty }))
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
      .map(([key, qty]) => {
        const { itemId, specIds } = parseCartKey(key)
        const item = getItem(itemId)
        return item ? { item, itemId, specIds, qty } : null
      })
      .filter(Boolean)
      // 手账里也带上规格 —— 「黑糖珍珠奶茶（去冰 · 半糖）」才像真的点过一杯
      .map(({ item, itemId, specIds, qty }) => {
        const spec = specTextOf(item, specIds)
        const tail = qty > 1 ? ` ×${qty}` : ''
        return { id: itemId, name: spec ? `${item.name}（${spec}）${tail}` : `${item.name}${tail}` }
      })
    if (entries.length === 0) return null
    const first = getItem(entries[0].id)
    beat('order')
    let payName = ''
    try {
      const saved = { alipay: '支付宝', wechat: '微信支付', shop: '小铺零钱' }[localStorage.getItem('soft-life-last-pay')] || ''
      payName = saved
    } catch {}
    // 加料的钱要算进这一单 —— 不然手账里的总额会比实际付的少
    const total = Object.entries(snapshot || {}).reduce((sum, [key, qty]) => {
      const { itemId, specIds } = parseCartKey(key)
      return sum + unitPriceOf(getItem(itemId), specIds) * qty
    }, 0)
    const shop = first ? (getCounter(first.counterId)?.name || '慢活小铺') : '慢活小铺'
    // 手账那笔也带上订单的样子（2026-09-23「手账就是订单」）：店名 + 这一单几样、多少钱。
    // 只陈述这一单本身，不算账 —— 汇总永远不出现在手账里。
    logJournalOrder(entries, { shop, total, pay: payName, count: entries.length })
    saveOrder({
      payment: payName,
      shop,
      total,
      items: entries.map((e) => e.name),
    })
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
          pet={activePet}
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
          focusItemId={params.focus}
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
          // 勾选购买：购物袋页只把勾走的子集送来（checkoutCart）。
          // 没带参数的路径（理论上没有）回落到全袋，保持老行为。
          cart={params.checkoutCart || cart}
          houseName={houseName}
          setHouseName={setHouseName}
          onNavigate={navigate}
          onBack={goBack}
          onPaid={payOrder}
        />
      )}
      {screen === 'delivery' && (
        <DeliveryScreen
          houseName={houseName}
          pet={activePet}
          onNavigate={navigate}
          order={params}
        />
      )}
      {screen === 'ending' && (
        <EndingScreen
          houseName={houseName}
          pet={activePet}
          cart={lastOrder}
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
      {screen === 'pet' && <PetScreen pet={activePet} onColorway={setPetColorway} onSpecies={switchPetSpecies} onBack={goBack} />}
      {screen === 'admin' && <AdminScreen onBack={goBack} />}
      {screen === 'journal' && (
        <div className="shop-page journal-tab">
          <header className="topbar compact">
            <span className="topbar-spacer" />
            <span className="topbar-title serif">食物手账</span>
            <span className="topbar-spacer" />
          </header>
          <JournalView />
        </div>
      )}
      {screen === 'mine' && <MineScreen pet={activePet} charity={charity} customItems={customItems} onNavigate={navigate} />}
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
      {['home', 'journal', 'pet', 'mine'].includes(screen) && (
        <TabBar screen={screen} pet={activePet} onNavigate={navigate} />
      )}
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
