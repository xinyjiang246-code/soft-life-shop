// ============================================================
//  世界菜单 · 菜品锻造炉（Dish Forge）
// ------------------------------------------------------------
//  慢活小铺的菜品分三层：
//    ① 招牌层：13 款内置商品 —— 有手绘 + 实拍两张真图，可以翻面
//    ② 世界层：这里生成的菜 —— AI 用「城市 × 主料 × 手法 × 形态」现编，
//              世界上并不存在，所以不需要照片，统一用手绘卡片（DishArt）呈现
//    ③ 自建层：用户拍照上架（MyShopScreen）
//
//  生成是「确定性」的：同一个 (城市, 批次) 永远得到同一桌菜，
//  所以商品 id 稳定，购物车/刷新都不会错位。
// ============================================================

// 每座城市的「空运来信」图（2026-09-20 补）—— 菜品是 AI 每天现编的，配不了固定照片，
// 所以给「城市」配图：明信片页头、首页入口用它交代「这桌菜从哪来」。
import cityKyoto from './assets/cities/kyoto-city.webp'
import citySeoul from './assets/cities/seoul-city.webp'
import cityBangkok from './assets/cities/bangkok-city.webp'
import cityHanoi from './assets/cities/hanoi-city.webp'
import cityTaipei from './assets/cities/taipei-city.webp'
import cityChaoshan from './assets/cities/chaoshan-city.webp'
import cityIstanbul from './assets/cities/istanbul-city.webp'
import cityLisbon from './assets/cities/lisbon-city.webp'
import cityMexico from './assets/cities/mexico-city.webp'
import cityNaples from './assets/cities/naples-city.webp'

// ---------- 颜色小工具（手绘卡片与页面配色共用） ----------
function toRgb(hex) {
  const s = (hex || '').replace('#', '')
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  if (v.length !== 6) return [168, 185, 143]
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}
function toHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
/** 往白色靠 t（0~1） */
export function tintHex(hex, t) {
  const [r, g, b] = toRgb(hex)
  return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t)
}
/** 往黑色靠 t（0~1） */
export function shadeHex(hex, t) {
  const [r, g, b] = toRgb(hex)
  return toHex(r * (1 - t), g * (1 - t), b * (1 - t))
}

// 菜品形态：决定画法（DishArt）、归类柜台、价格区间
export const KINDS = {
  cup: {
    label: '饮品',
    counterId: 'tea',
    price: [20, 28],
    suffix: [['奶盖', 'MILK CAP'], ['气泡', 'FIZZ'], ['拿铁', 'LATTE'], ['特调', 'SPECIAL']],
  },
  bowl: {
    label: '暖食',
    counterId: 'bento',
    price: [32, 44],
    suffix: [['暖碗', 'WARM BOWL'], ['汤面', 'NOODLE SOUP'], ['炊饭', 'STEAMED RICE'], ['浓汤', 'THICK SOUP']],
  },
  plate: {
    label: '小食',
    counterId: 'bento',
    price: [26, 38],
    suffix: [['拼盘', 'PLATTER'], ['小食', 'SMALL PLATES'], ['凉拌', 'COLD TOSS']],
  },
  cake: {
    label: '甜点',
    counterId: 'dessert',
    price: [22, 32],
    suffix: [['挞', 'TART'], ['布丁', 'PUDDING'], ['奶冻', 'PANNACOTTA'], ['蛋糕', 'CAKE']],
  },
  bread: {
    label: '烘焙',
    counterId: 'dessert',
    price: [18, 26],
    suffix: [['吐司', 'TOAST'], ['面包', 'BREAD'], ['薄饼', 'FLATBREAD']],
  },
}

// 一桌菜单的形态配比（8 道）
export const KIND_ORDER = ['cup', 'cup', 'bowl', 'bowl', 'plate', 'plate', 'cake', 'bread']

// 城市的厨房：一座城市 = 一套主料 + 一套手法 + 一套味道形容
export const WORLD_KITCHENS = [
  {
    id: 'kyoto', city: '京都', cityEn: 'KYOTO', hex: '#A9B98F', image: cityKyoto,
    blurb: '寺门口的风，和一杯还没凉透的茶。',
    drinks: [['抹茶', 'MATCHA'], ['焙茶', 'HOJICHA'], ['黑芝麻', 'BLACK SESAME'], ['玄米', 'GENMAI'], ['柚子', 'YUZU']],
    eats: [['红豆', 'AZUKI'], ['味噌', 'MISO'], ['山椒', 'SANSHO'], ['汤豆腐', 'YU TOFU'], ['柴鱼', 'KATSUO']],
    sweets: [['红豆', 'AZUKI'], ['栗子', 'CHESTNUT'], ['白玉', 'SHIRATAMA'], ['蕨饼', 'WARABIMOCHI']],
    touches: [['炭焙', 'CHARCOAL ROASTED'], ['盐渍', 'SALT CURED'], ['手打', 'HAND WHISKED'], ['蜜渍', 'HONEY CURED'], ['冷萃', 'COLD BREW']],
    senses: ['甜里带一点草地的凉', '像寺门口吹过来的风', '安静得像下午三点', '会让人想坐久一点'],
  },
  {
    id: 'seoul', city: '首尔', cityEn: 'SEOUL', hex: '#D08C7A', image: citySeoul,
    blurb: '深夜塑料凳上的热气，比酒更暖。',
    drinks: [['柚子蜜', 'YUZU HONEY'], ['米酒', 'MAKGEOLLI'], ['五味子', 'OMIJA'], ['玉米须', 'CORN SILK']],
    eats: [['泡菜', 'KIMCHI'], ['年糕', 'RICE CAKE'], ['牛骨', 'OX BONE'], ['紫苏', 'PERILLA'], ['部队', 'ARMY STEW']],
    sweets: [['蜂蜜黄油', 'HONEY BUTTER'], ['红豆', 'RED BEAN'], ['米糕', 'TTEOK']],
    touches: [['现烤', 'FRESHLY BAKED'], ['微辣', 'MILD CHILI'], ['手作', 'HANDMADE'], ['糖渍', 'CANDIED']],
    senses: ['辣完以后心里是暖的', '像路边摊那张塑料凳', '热气腾腾地直往上冒'],
  },
  {
    id: 'bangkok', city: '曼谷', cityEn: 'BANGKOK', hex: '#C9A65C', image: cityBangkok,
    blurb: '酸辣先到，雨水随后就来。',
    drinks: [['泰奶', 'THAI MILK TEA'], ['香茅', 'LEMONGRASS'], ['罗望子', 'TAMARIND'], ['椰青', 'COCONUT WATER']],
    eats: [['冬阴功', 'TOM YUM'], ['打抛', 'HOLY BASIL'], ['青咖喱', 'GREEN CURRY'], ['青木瓜', 'GREEN PAPAYA'], ['南姜', 'GALANGAL']],
    sweets: [['芒果', 'MANGO'], ['椰浆', 'COCONUT'], ['香蕉', 'BANANA']],
    touches: [['酸辣', 'SOUR & SPICY'], ['炭烤', 'CHARCOAL GRILLED'], ['椰香', 'COCONUT KISSED'], ['现舂', 'POUNDED FRESH']],
    senses: ['一口就把人拽回雨季', '酸得清醒，辣得痛快', '像傍晚突然落下的那阵雨'],
  },
  {
    id: 'hanoi', city: '河内', cityEn: 'HANOI', hex: '#9BB0A0', image: cityHanoi,
    blurb: '天还没亮，汤已经熬了四个钟头。',
    drinks: [['滴漏咖啡', 'PHIN COFFEE'], ['炼乳', 'CONDENSED MILK'], ['荷花茶', 'LOTUS TEA'], ['甘蔗', 'SUGARCANE']],
    eats: [['河粉', 'PHO'], ['春卷', 'SPRING ROLL'], ['法棍', 'BANH MI'], ['鱼露', 'FISH SAUCE'], ['香草', 'FRESH HERBS']],
    sweets: [['炼乳', 'CONDENSED MILK'], ['绿豆', 'GREEN BEAN'], ['椰丝', 'SHREDDED COCONUT']],
    touches: [['慢炖', 'SIMMERED SLOW'], ['生滚', 'QUICK BOILED'], ['现卷', 'HAND ROLLED'], ['炭烤', 'CHARCOAL GRILLED']],
    senses: ['清清淡淡却很有底气', '像老城区那条窄巷子', '天没亮就有味道飘出来了'],
  },
  {
    id: 'taipei', city: '台北', cityEn: 'TAIPEI', hex: '#C79BA6', image: cityTaipei,
    blurb: '夜市里挪不动的脚步，和一杯手摇。',
    drinks: [['珍珠', 'BUBBLE'], ['冬瓜', 'DONG GUA'], ['芋圆', 'TARO BALL'], ['青草', 'GRASS JELLY']],
    eats: [['卤肉', 'BRAISED PORK'], ['牛肉面', 'BEEF NOODLE'], ['蚵仔', 'OYSTER'], ['麻油', 'SESAME OIL'], ['担仔', 'DANZAI']],
    sweets: [['凤梨', 'PINEAPPLE'], ['芋泥', 'TARO PASTE'], ['豆花', 'TOFU PUDDING']],
    touches: [['慢卤', 'SLOW BRAISED'], ['手摇', 'HAND SHAKEN'], ['现炸', 'FRESH FRIED'], ['古早', 'OLD SCHOOL']],
    senses: ['甜得不客气但很亲切', '像夜市里挪不动的脚步', '一个人吃也刚刚好'],
  },
  {
    id: 'chaoshan', city: '潮汕', cityEn: 'CHAOSHAN', hex: '#A8B4C0', image: cityChaoshan,
    blurb: '天光刚亮，案板上还在捶肉。',
    drinks: [['单丛', 'DANCONG'], ['老香黄', 'PRESERVED CITRUS'], ['杏仁', 'ALMOND'], ['擂茶', 'LEI CHA']],
    eats: [['牛肉丸', 'BEEF BALL'], ['沙茶', 'SATAY'], ['白粥', 'PLAIN CONGEE'], ['卤味', 'BRAISED'], ['粿条', 'KWAY TEOW']],
    sweets: [['绿豆', 'GREEN BEAN'], ['糖葱', 'SUGAR SCALLION'], ['芋泥', 'TARO PASTE']],
    touches: [['手打', 'HAND BEATEN'], ['清煮', 'CLEAN BOILED'], ['慢卤', 'SLOW BRAISED'], ['现捶', 'FRESH POUNDED']],
    senses: ['清淡里藏着很深的功夫', '像天光刚亮的早市', '越简单越舍不得吃完'],
  },
  {
    id: 'istanbul', city: '伊斯坦布尔', cityEn: 'ISTANBUL', hex: '#B98A6A', image: cityIstanbul,
    blurb: '香料一层一层地叠上来。',
    drinks: [['红茶', 'TURKISH TEA'], ['咖啡', 'TURKISH COFFEE'], ['石榴', 'POMEGRANATE'], ['酸奶', 'AYRAN']],
    eats: [['烤肉', 'KEBAB'], ['茄子', 'EGGPLANT'], ['鹰嘴豆', 'CHICKPEA'], ['番茄', 'TOMATO'], ['羊肉', 'LAMB']],
    sweets: [['开心果', 'PISTACHIO'], ['玫瑰', 'ROSE'], ['蜂蜜', 'HONEY']],
    touches: [['炭火', 'CHARCOAL FIRE'], ['慢炖', 'SLOW STEWED'], ['现切', 'HAND CARVED'], ['糖渍', 'CANDIED']],
    senses: ['香料一层一层叠上来', '像渡轮上吹过来的风', '甜得毫不掩饰'],
  },
  {
    id: 'lisbon', city: '里斯本', cityEn: 'LISBON', hex: '#C0A98C', image: cityLisbon,
    blurb: '咸咸的，带一点海的味道。',
    drinks: [['波特', 'PORT'], ['咖啡', 'BIKA COFFEE'], ['青柠', 'LIME'], ['橙花', 'ORANGE BLOSSOM']],
    eats: [['鳕鱼', 'BACALHAU'], ['沙丁鱼', 'SARDINE'], ['章鱼', 'OCTOPUS'], ['鹰嘴豆', 'CHICKPEA'], ['番茄', 'TOMATO']],
    sweets: [['蛋挞', 'CUSTARD TART'], ['肉桂', 'CINNAMON'], ['杏仁', 'ALMOND']],
    touches: [['盐烤', 'SALT ROASTED'], ['慢煨', 'SLOW SIMMERED'], ['炭炙', 'CHAR SEARED'], ['现烤', 'FRESH BAKED']],
    senses: ['咸咸的，带一点海的味道', '像傍晚山坡上那排黄灯', '吃完会想走到海边去'],
  },
  {
    id: 'mexico', city: '墨西哥城', cityEn: 'MEXICO CITY', hex: '#D0824F', image: cityMexico,
    blurb: '颜色比味道还热闹。',
    drinks: [['巧克力', 'CHOCOLATE'], ['青柠', 'LIME'], ['洛神', 'HIBISCUS'], ['玉米', 'CORN']],
    eats: [['玉米', 'CORN'], ['牛油果', 'AVOCADO'], ['黑豆', 'BLACK BEAN'], ['辣椒', 'CHILI'], ['猪肩', 'PORK SHOULDER']],
    sweets: [['奇亚', 'CHIA'], ['焦糖牛奶', 'DULCE DE LECHE'], ['肉桂', 'CINNAMON']],
    touches: [['烟熏', 'SMOKE DRIED'], ['慢烤', 'SLOW ROASTED'], ['现压', 'HAND PRESSED'], ['微辣', 'MILD CHILI']],
    senses: ['酸辣烟熏一起冲上来', '像午后墙上晒着的影子', '颜色比味道还要热闹'],
  },
  {
    id: 'naples', city: '那不勒斯', cityEn: 'NAPLES', hex: '#C46A5A', image: cityNaples,
    blurb: '简单到只剩三样东西。',
    drinks: [['浓缩', 'ESPRESSO'], ['柠檬', 'LEMON'], ['杏仁', 'ALMOND'], ['血橙', 'BLOOD ORANGE']],
    eats: [['番茄', 'TOMATO'], ['罗勒', 'BASIL'], ['海鲜', 'SEAFOOD'], ['茄子', 'EGGPLANT'], ['玛格丽特', 'MARGHERITA']],
    sweets: [['开心果', 'PISTACHIO'], ['乳清干酪', 'RICOTTA'], ['柠檬', 'LEMON']],
    touches: [['炭烤', 'CHARCOAL BAKED'], ['手擀', 'HAND ROLLED'], ['慢煮', 'SLOW SIMMERED'], ['现刨', 'FRESHLY SHAVED']],
    senses: ['简单到只剩三样东西', '像正午巷子里晾着的衣服', '吃完会想再点一份'],
  },
]

export function getKitchen(id) {
  return WORLD_KITCHENS.find((k) => k.id === id) || WORLD_KITCHENS[0]
}

// 今天默认轮到哪座城市（每天自动换）
export function getTodayKitchen(seed) {
  const s = seed == null ? dateSeedLocal() : seed
  return WORLD_KITCHENS[s % WORLD_KITCHENS.length]
}

function dateSeedLocal() {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

// ---------- 伪随机（保证同一 seed 永远同一结果） ----------
function h32(seed) {
  return Math.abs(Math.imul(seed | 0, 2654435761))
}

const DESC_TEMPLATES = [
  (city, main, sense) => `${city}的${main}，${sense}。`,
  (city, main, sense) => `一份来自${city}街角的${main}，${sense}。`,
  (city, main, sense) => `AI 在${city}的雨里捡到的${main}，${sense}。`,
  (city, main, sense) => `不太正宗的${city}${main}，但${sense}。`,
  (city, main, sense) => `凌晨四点想到的${city}${main}，${sense}。`,
]

// 由「城市 + 形态 + 种子」锻造出一道菜
// 关键：主料 / 手法 / 形态都用 index 做轮转，保证同一桌里不会出现两道一样的组合
function forgeDish(kitchen, kind, seed, index) {
  const meta = KINDS[kind]
  const pool = kind === 'cup' ? kitchen.drinks : kind === 'bowl' || kind === 'plate' ? kitchen.eats : kitchen.sweets

  const main = pool[(h32(seed + 11) + index) % pool.length]
  const touch = kitchen.touches[(h32(seed + 101) + index * 3) % kitchen.touches.length]
  const shape = meta.suffix[(h32(seed + 211) + index) % meta.suffix.length]
  const sense = kitchen.senses[(h32(seed + 307) + index) % kitchen.senses.length]
  const tpl = DESC_TEMPLATES[(h32(seed + 401) + index) % DESC_TEMPLATES.length]

  const [lo, hi] = meta.price
  const price = lo + (h32(seed + 503 + index * 977) % (hi - lo + 1))

  return {
    id: `world-${kitchen.id}-${index}`,
    code: `WORLD ${String(index + 1).padStart(2, '0')}`,
    name: `${touch[1]} ${main[1]} ${shape[1]}`,
    cn: `${touch[0]}${main[0]}${shape[0]}`,
    price,
    counterId: meta.counterId,
    category: `${kitchen.city}系`,
    kind,
    tags: ['world', 'ai'],
    city: kitchen.city,
    cityEn: kitchen.cityEn,
    description: tpl(kitchen.city, main[0], sense),
    // main/shape 喂给 DishArt 画插画细节：主料决定配料颜色，形态后缀决定画法变体
    art: { kind, hex: kitchen.hex, city: kitchen.city, cityEn: kitchen.cityEn, main: main[0], shape: shape[0] },
    isWorld: true,
  }
}

// 锻造一整桌菜单
// 注意：整桌共用一个 base seed，靠 index 做轮转 —— 这样同一桌里不会撞菜品，
// 而不同城市 / 不同批次因为 base 不同，整桌又会完全换一批
export function forgeMenu(kitchenId, batch = 0, count = KIND_ORDER.length) {
  const kitchen = getKitchen(kitchenId)
  const base = h32(hashStrLocal(`${kitchenId}:${batch}:${dateSeedLocal()}`))
  return KIND_ORDER.slice(0, count).map((kind, i) => forgeDish(kitchen, kind, base, i))
}

function hashStrLocal(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}
