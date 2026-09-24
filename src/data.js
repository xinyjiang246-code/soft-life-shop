// 每件商品有两张独立的图：-draw = 手绘线稿（正面），-real = 真实照片（背面）
// 点图片翻面，像 Instagram 的两张头像来回切
import matchaLatteDraw from './assets/products/matcha-latte-draw.webp'
import matchaLatteReal from './assets/products/matcha-latte-real.webp'
import icecreamTeaDraw from './assets/products/icecream-tea-draw.webp'
import icecreamTeaReal from './assets/products/icecream-tea-real.webp'
import bubbleTeaDraw from './assets/products/bubble-tea-draw.webp'
import bubbleTeaReal from './assets/products/bubble-tea-real.webp'
import sakuraMilkTeaDraw from './assets/products/sakura-milk-tea-draw.webp'
import sakuraMilkTeaReal from './assets/products/sakura-milk-tea-real.webp'
import seoulBentoDraw from './assets/products/seoul-bento-draw.webp'
import seoulBentoReal from './assets/products/seoul-bento-real.webp'
import nourishBowlDraw from './assets/products/nourish-bowl-draw.webp'
import nourishBowlReal from './assets/products/nourish-bowl-real.webp'
import doubleBentoDraw from './assets/products/double-bento-draw.webp'
import doubleBentoReal from './assets/products/double-bento-real.webp'
import creamCakeDraw from './assets/products/cream-cake-draw.webp'
import creamCakeReal from './assets/products/cream-cake-real.webp'
import shortcakeDraw from './assets/products/shortcake-draw.webp'
import shortcakeReal from './assets/products/shortcake-real.webp'
import dorayakiDraw from './assets/products/dorayaki-draw.webp'
import dorayakiReal from './assets/products/dorayaki-real.webp'
import eyeMaskDraw from './assets/products/eye-mask-draw.webp'
import eyeMaskReal from './assets/products/eye-mask-real.webp'
import journalDraw from './assets/products/journal-draw.webp'
import journalReal from './assets/products/journal-real.webp'
import pilatesMatDraw from './assets/products/pilates-mat-draw.webp'
import pilatesMatReal from './assets/products/pilates-mat-real.webp'
import misoRamen from './assets/dishes/miso-ramen.webp'
import kombuSoba from './assets/dishes/kombu-soba.webp'
import chashuDon from './assets/dishes/chashu-don.webp'
import coldRamen from './assets/dishes/cold-ramen.webp'
import shrimpDumpling from './assets/dishes/shrimp-dumpling.webp'
import custardBun from './assets/dishes/custard-bun.webp'
import shumai from './assets/dishes/shumai.webp'
import eggTart from './assets/dishes/egg-tart.webp'

// 今日特调那 12 杯的图（2026-09-20 补齐，12 杯 × 实拍/油画棒 = 24 张）。
// 12 杯都是**真实存在的饮料**，
// 只是每天轮换 —— 它们不该跟「世界上并不存在」的世界菜单归一类，
// 所以按招牌商品同一套做法配「实拍 + 油画棒」两张。
import specialOsmanthusColdBrewDraw from './assets/specials/osmanthus-cold-brew-draw.webp'
import specialOsmanthusColdBrewReal from './assets/specials/osmanthus-cold-brew-real.webp'
import specialTorchedMilkCapDraw from './assets/specials/torched-milk-cap-draw.webp'
import specialTorchedMilkCapReal from './assets/specials/torched-milk-cap-real.webp'
import specialGrapeSodaAmericanoDraw from './assets/specials/grape-soda-americano-draw.webp'
import specialGrapeSodaAmericanoReal from './assets/specials/grape-soda-americano-real.webp'
import specialJasmineMilkGreenDraw from './assets/specials/jasmine-milk-green-draw.webp'
import specialJasmineMilkGreenReal from './assets/specials/jasmine-milk-green-real.webp'
import specialMochiBrownSugarDraw from './assets/specials/mochi-brown-sugar-draw.webp'
import specialMochiBrownSugarReal from './assets/specials/mochi-brown-sugar-real.webp'
import specialPeachOolongFizzDraw from './assets/specials/peach-oolong-fizz-draw.webp'
import specialPeachOolongFizzReal from './assets/specials/peach-oolong-fizz-real.webp'
import specialTangerineRedBeanDraw from './assets/specials/tangerine-red-bean-draw.webp'
import specialTangerineRedBeanReal from './assets/specials/tangerine-red-bean-real.webp'
import specialCoconutAshLatteDraw from './assets/specials/coconut-ash-latte-draw.webp'
import specialCoconutAshLatteReal from './assets/specials/coconut-ash-latte-real.webp'
import specialSaltedYolkCapDraw from './assets/specials/salted-yolk-cap-draw.webp'
import specialSaltedYolkCapReal from './assets/specials/salted-yolk-cap-real.webp'
import specialPlumGreenTeaDraw from './assets/specials/plum-green-tea-draw.webp'
import specialPlumGreenTeaReal from './assets/specials/plum-green-tea-real.webp'
import specialThickCocoaMilkDraw from './assets/specials/thick-cocoa-milk-draw.webp'
import specialThickCocoaMilkReal from './assets/specials/thick-cocoa-milk-real.webp'
import specialSakuraSaltSodaDraw from './assets/specials/sakura-salt-soda-draw.webp'
import specialSakuraSaltSodaReal from './assets/specials/sakura-salt-soda-real.webp'

// ===== 店铺（原「柜台」）=====
// 结构对齐真外卖软件：店名 / 评分 / 月售 / 起送价 / 配送费 / 配送时长 / 距离 /
// 营业时间 / 店内公告 / 满减。前端按「店铺列表 → 进店 → 店内菜单」呈现。
export const counters = [
  {
    id: 'tea',
    name: '慢活茶饮铺',
    nameEn: 'SLOW LIFE TEA',
    tagline: '一杯热的，慢慢喝',
    color: 'sage',
    accent: '#B8C6AC',
    bg: '#EEF1EB',
    discount: { threshold: 20, amount: 8 },
    deliveryTime: 30,
    distance: 0.8,
    tags: ['满20-8'],
    hero: matchaLatteDraw,
    heroReal: matchaLatteReal,
    rating: 4.9,
    monthly: 1287,
    minOrder: 20,
    deliveryFee: 0,
    hours: '10:00 - 22:00',
    notice: '今日现泡：冰抹茶拿铁，燕麦奶版本限定 30 杯。',
  },
  {
    id: 'bento',
    name: '暖食便当柜',
    nameEn: 'BENTO & WARM BOWLS',
    tagline: '今天也好好吃饭',
    color: 'clay',
    accent: '#C28A70',
    bg: '#F5E8E2',
    discount: { threshold: 30, amount: 18 },
    deliveryTime: 38,
    distance: 1.4,
    tags: ['满30-18'],
    hero: seoulBentoDraw,
    heroReal: seoulBentoReal,
    rating: 4.8,
    monthly: 986,
    minOrder: 30,
    deliveryFee: 3,
    hours: '11:00 - 21:00',
    notice: '米饭每天现焖两锅，卖完就收摊。',
  },
  {
    id: 'dessert',
    name: '怀旧甜点柜',
    nameEn: 'VINTAGE DESSERTS',
    tagline: '甜的，治愈一整天',
    color: 'cream',
    accent: '#9F7F5F',
    bg: '#F7F1E6',
    discount: { threshold: 20, amount: 15 },
    deliveryTime: 32,
    distance: 1.1,
    tags: ['满20-15'],
    hero: creamCakeDraw,
    heroReal: creamCakeReal,
    rating: 4.9,
    monthly: 734,
    minOrder: 20,
    deliveryFee: 2,
    hours: '12:00 - 23:00',
    notice: '奶油每天早晨现打，裱花只有老板一个人会做。',
  },
  {
    id: 'life',
    name: '慢活选物',
    nameEn: 'SOFT LIFE GOODS',
    tagline: '照顾自己，不分早晚',
    color: 'ivory',
    accent: '#8D867C',
    bg: '#FBFAF6',
    discount: null,
    deliveryTime: 28,
    distance: 0.6,
    tags: ['无满减'],
    hero: eyeMaskDraw,
    heroReal: eyeMaskReal,
    rating: 4.7,
    monthly: 212,
    minOrder: 0,
    deliveryFee: 5,
    hours: '09:00 - 22:00',
    notice: '不卖吃的，只卖一点让自己舒服的东西。',
  },
  {
    id: 'noodle',
    name: '深夜面馆 · 十二点后',
    nameEn: 'MIDNIGHT NOODLE BAR',
    tagline: '汤一直煨着，饿了就来',
    color: 'clay',
    accent: '#B07A52',
    bg: '#F4E9DC',
    discount: { threshold: 40, amount: 12 },
    deliveryTime: 40,
    distance: 2.1,
    tags: ['满40-12'],
    hero: misoRamen,
    heroReal: misoRamen,
    rating: 4.8,
    monthly: 1562,
    minOrder: 25,
    deliveryFee: 2,
    hours: '17:00 - 02:00',
    notice: '豚骨汤要熬八小时，所以我们只在傍晚开门。',
  },
  {
    id: 'dimsum',
    name: '一盅两件',
    nameEn: 'DIM SUM FOR TWO',
    tagline: '现蒸现卖，出笼即走',
    color: 'cream',
    accent: '#C9A05C',
    bg: '#F7F0E2',
    discount: { threshold: 35, amount: 10 },
    deliveryTime: 35,
    distance: 1.7,
    tags: ['满35-10'],
    hero: shrimpDumpling,
    heroReal: shrimpDumpling,
    rating: 4.9,
    monthly: 1103,
    minOrder: 35,
    deliveryFee: 3,
    hours: '07:00 - 14:00',
    notice: '早茶只做到午市，蒸笼过了两点就凉了。',
  },
]

export const menuItems = [
  // 茶饮暖饮铺
  {
    id: 'm1',
    code: 'PRODUCT 01',
    name: 'ICED MATCHA LATTE',
    cn: '冰抹茶拿铁',
    price: 24,
    counterId: 'tea',
    category: 'Matcha',
    tags: ['signature'],
    image: matchaLatteDraw,
    imageReal: matchaLatteReal,
    description: 'oat milk + matcha，像周一早晨需要的那口绿。',
  },
  {
    id: 'm2',
    code: 'PRODUCT 02',
    name: 'ICE CREAM BLACK TEA',
    cn: '冰淇淋红茶',
    price: 19,
    counterId: 'tea',
    category: '奶茶',
    tags: ['signature'],
    image: icecreamTeaDraw,
    imageReal: icecreamTeaReal,
    description: '一大勺香草冰淇淋，慢慢融进红茶里。',
  },
  {
    id: 'm3',
    code: 'PRODUCT 03',
    name: 'SAKURA MILK TEA',
    cn: '樱花奶绿',
    price: 22,
    counterId: 'tea',
    category: '奶茶',
    tags: ['new'],
    image: sakuraMilkTeaDraw,
    imageReal: sakuraMilkTeaReal,
    description: '一点点粉，一点点春天。',
  },
  {
    id: 'm13',
    code: 'PRODUCT 13',
    name: 'BROWN SUGAR BUBBLE TEA',
    cn: '黑糖珍珠奶茶',
    price: 24,
    counterId: 'tea',
    category: '奶茶',
    tags: ['hot'],
    image: bubbleTeaDraw,
    imageReal: bubbleTeaReal,
    description: '黑糖挂壁，珍珠软糯，罪恶但快乐。',
  },
  // 便当暖食柜
  {
    id: 'm4',
    code: 'PRODUCT 04',
    name: 'SEOUL BENTO BOX',
    cn: '韩式铝制便当',
    price: 36,
    counterId: 'bento',
    category: '便当',
    tags: ['hot'],
    image: seoulBentoDraw,
    imageReal: seoulBentoReal,
    description: '分格搭配，像小时候春游带的饭盒。',
  },
  {
    id: 'm5',
    code: 'PRODUCT 05',
    name: 'NOURISH BOWL',
    cn: '中式营养碗',
    price: 32,
    counterId: 'bento',
    category: '暖食碗',
    tags: [],
    image: nourishBowlDraw,
    imageReal: nourishBowlReal,
    description: '米饭、青菜、蛋白质，简单但够用。',
  },
  {
    id: 'm6',
    code: 'PRODUCT 06',
    name: 'DOUBLE BENTO',
    cn: '双层便当组合',
    price: 42,
    counterId: 'bento',
    category: '便当',
    tags: ['combo'],
    image: doubleBentoDraw,
    imageReal: doubleBentoReal,
    description: '上层饭团，下层配菜，打开有两层惊喜。',
  },
  // 怀旧甜点柜
  {
    id: 'm7',
    code: 'PRODUCT 07',
    name: 'VINTAGE CREAM CAKE',
    cn: '复古奶油蛋糕',
    price: 28,
    counterId: 'dessert',
    category: '蛋糕',
    tags: ['signature'],
    image: creamCakeDraw,
    imageReal: creamCakeReal,
    description: '裱花边、小樱桃，像奶奶生日那天的蛋糕。',
  },
  {
    id: 'm8',
    code: 'PRODUCT 08',
    name: 'DECORATED SHORTCAKE',
    cn: '裱花奶油蛋糕',
    price: 32,
    counterId: 'dessert',
    category: '蛋糕',
    tags: [],
    image: shortcakeDraw,
    imageReal: shortcakeReal,
    description: '奶油厚一点，今天值得。',
  },
  {
    id: 'm9',
    code: 'PRODUCT 09',
    name: 'DORAYAKI',
    cn: '铜锣烧',
    price: 16,
    counterId: 'dessert',
    category: '小点',
    tags: [],
    image: dorayakiDraw,
    imageReal: dorayakiReal,
    description: '红豆馅温热，配茶刚好。',
  },
  // 生活美学角
  {
    id: 'm10',
    code: 'PRODUCT 10',
    name: 'LINEN EYE MASK',
    cn: '亚麻眼罩',
    price: 38,
    counterId: 'life',
    category: '居家',
    tags: [],
    image: eyeMaskDraw,
    imageReal: eyeMaskReal,
    description: '午睡前戴上，世界安静一点。',
  },
  {
    id: 'm11',
    code: 'PRODUCT 11',
    name: 'GRATITUDE JOURNAL',
    cn: '感恩手账',
    price: 45,
    counterId: 'life',
    category: '手账',
    tags: ['new'],
    image: journalDraw,
    imageReal: journalReal,
    description: '写三句话，比冥想还快。',
  },
  {
    id: 'm12',
    code: 'PRODUCT 12',
    name: 'PILATES MAT',
    cn: 'Pilates 小垫',
    price: 88,
    counterId: 'life',
    category: '运动',
    tags: [],
    image: pilatesMatDraw,
    imageReal: pilatesMatReal,
    description: '铺开 5 分钟，身体记得你照顾过它。',
  },
  // 深夜面馆 · 十二点后（只有实拍图，不做翻面）
  {
    id: 'm14',
    code: 'NOODLE 01',
    name: 'MISO TONKOTSU RAMEN',
    cn: '味噌豚骨拉面',
    price: 38,
    counterId: 'noodle',
    category: '拉面',
    tags: ['signature'],
    image: misoRamen,
    monthly: 862,
    praise: 98,
    description: '汤熬了八小时，叉烧两片，溏心蛋半颗。',
  },
  {
    id: 'm15',
    code: 'NOODLE 02',
    name: 'KOMBU SOBA',
    cn: '昆布清汤素面',
    price: 32,
    counterId: 'noodle',
    category: '汤面',
    tags: [],
    image: kombuSoba,
    monthly: 431,
    praise: 97,
    description: '清的，什么都没加，胃会记得这种温柔。',
  },
  {
    id: 'm16',
    code: 'NOODLE 03',
    name: 'CHASHU DON',
    cn: '溏心蛋叉烧丼',
    price: 36,
    counterId: 'noodle',
    category: '饭',
    tags: ['hot'],
    image: chashuDon,
    monthly: 694,
    praise: 98,
    description: '四片叉烧盖满饭，蛋黄戳破拌进去。',
  },
  {
    id: 'm17',
    code: 'NOODLE 04',
    name: 'COLD RAMEN',
    cn: '冰镇中华冷面',
    price: 30,
    counterId: 'noodle',
    category: '冷面',
    tags: ['new'],
    image: coldRamen,
    monthly: 288,
    praise: 96,
    description: '冰块在汤里，夏天才有的那一碗。',
  },
  // 一盅两件（早茶点心）
  {
    id: 'm18',
    code: 'DIM SUM 01',
    name: 'SHRIMP HAR GOW',
    cn: '虾饺皇',
    price: 28,
    counterId: 'dimsum',
    category: '蒸点',
    tags: ['signature'],
    image: shrimpDumpling,
    monthly: 1032,
    praise: 99,
    description: '一笼四只，皮薄到能看见虾的粉色。',
  },
  {
    id: 'm19',
    code: 'DIM SUM 02',
    name: 'CUSTARD LAVA BUN',
    cn: '流沙包',
    price: 22,
    counterId: 'dimsum',
    category: '蒸点',
    tags: ['hot'],
    image: custardBun,
    monthly: 878,
    praise: 98,
    description: '掰开会流，烫嘴也要先咬一口。',
  },
  {
    id: 'm20',
    code: 'DIM SUM 03',
    name: 'SIU MAI',
    cn: '干蒸烧卖',
    price: 26,
    counterId: 'dimsum',
    category: '蒸点',
    tags: [],
    image: shumai,
    monthly: 756,
    praise: 97,
    description: '顶上一点蟹籽，一口一个刚好。',
  },
  {
    id: 'm21',
    code: 'DIM SUM 04',
    name: 'EGG TART',
    cn: '酥皮蛋挞',
    price: 18,
    counterId: 'dimsum',
    category: '烘点',
    tags: [],
    image: eggTart,
    monthly: 1204,
    praise: 99,
    description: '酥皮掉渣，蛋面烤出焦糖斑点。',
  },
]

/* ===== 规格：去冰 / 少糖 / 多加饭 / 加菜 =====
   2026-09-22 用户提的方向（原话）：「奶茶可以选择去冰 少冰 少糖等等，
   饭可以多加少加 也可以加菜之类」。三条边界是她当场挑的，别自己挪：
     ① **在列表行里展开** —— 不弹半屏、不跳详情页（弹窗会打断「逛」这件事）；
     ② **加料 / 加量加价，冰量甜度不加钱**（加珍珠 +¥2 这种才动价格）。
        ⚠️ 也**不许写「少糖更健康」「少糖更省」** 之类的话 —— 反说教是这产品的底线；
     ③ **按品类给**：茶饮 / 饭面有，甜点只有甜度；**生活用品、点心没有**。
        不是每件东西都能选，硬给反而假（也别给世界菜 / 惜食柜 / 我的小店那些）。
   **不选也能加** —— 没选就按默认做（正常冰 / 标准糖 / 正常份 / 不加料），
   不强制选完才能加入购物袋（不卡人、不催人）。 */
export const SPECS = {
  // 茶饮：冰量 + 甜度 + 加料（加料可多选）
  tea: [
    {
      id: 'ice', label: '冰量', pick: 'one', def: 'ice-normal',
      options: [
        { id: 'ice-normal', label: '正常冰' },
        { id: 'ice-less', label: '少冰' },
        { id: 'ice-none', label: '去冰' },
        { id: 'ice-warm', label: '常温' },
      ],
    },
    {
      id: 'sugar', label: '甜度', pick: 'one', def: 'sugar-std',
      options: [
        { id: 'sugar-std', label: '标准糖' },
        { id: 'sugar-less', label: '少糖' },
        { id: 'sugar-half', label: '半糖' },
        { id: 'sugar-none', label: '无糖' },
      ],
    },
    {
      id: 'add', label: '加料', pick: 'many',
      // 2026-09-22 用户要「参考霸王茶姬 / 喜茶」→ 换成大牌奶茶店真在卖的小料，
      // 价格也往真实靠（奶盖 / 芝士贵一点，寒天 / 脆波波便宜）。叫法别自己编。
      options: [
        { id: 'add-pearl', label: '黑糖珍珠', delta: 2 },
        { id: 'add-kanten', label: '寒天晶球', delta: 3 },
        { id: 'add-popping', label: '脆波波', delta: 3 },
        { id: 'add-teajelly', label: '桂花茶冻', delta: 3 },
        { id: 'add-cheese', label: '芝士奶盖', delta: 5 },
        { id: 'add-taro', label: '香芋泥', delta: 4 },
      ],
    },
  ],
  // 饭：饭量 + 加菜
  rice: [
    {
      id: 'rice', label: '米饭', pick: 'one', def: 'rice-normal',
      options: [
        { id: 'rice-normal', label: '正常' },
        { id: 'rice-less', label: '少一点' },
        { id: 'rice-more', label: '多一点', delta: 2 },
      ],
    },
    {
      id: 'add', label: '加菜', pick: 'many',
      options: [
        { id: 'add-egg', label: '溏心蛋', delta: 4 },
        { id: 'add-kimchi', label: '泡菜', delta: 3 },
        { id: 'add-seaweed', label: '海带丝', delta: 2 },
        { id: 'add-meat', label: '多一份肉', delta: 6 },
      ],
    },
  ],
  // 面：面量 + 加菜（加菜比饭的少两样，别整套照抄）
  noodle: [
    {
      id: 'noodle', label: '面量', pick: 'one', def: 'noodle-normal',
      options: [
        { id: 'noodle-normal', label: '正常' },
        { id: 'noodle-less', label: '少一点' },
        { id: 'noodle-more', label: '多一点', delta: 2 },
      ],
    },
    {
      id: 'add', label: '加菜', pick: 'many',
      options: [
        { id: 'add-egg', label: '溏心蛋', delta: 4 },
        { id: 'add-chashu', label: '叉烧', delta: 6 },
        { id: 'add-corn', label: '玉米', delta: 2 },
      ],
    },
  ],
  // 甜点：只有甜度（不加料 —— 蛋糕上加珍珠是笑话）
  sweet: [
    {
      id: 'sugar', label: '甜度', pick: 'one', def: 'sugar-std',
      options: [
        { id: 'sugar-std', label: '标准糖' },
        { id: 'sugar-less', label: '少糖' },
        { id: 'sugar-half', label: '半糖' },
      ],
    },
  ],
}

/** 只有柜台里这几件常驻商品能选规格（外加特调 —— 2026-09-24 起有 12 杯，id 形如 `special-<i>`）。
    ⚠️ 世界菜 / 惜食柜 / 我的小店的手拍商品一律没有 —— 它们不是「店里的菜单」。
    ⚠️ 特调用**前缀**认、不写进这个 Set：`dailySpecials` 定义在本文件更靠后的位置，
       在这里引用它会踩 TDZ（模块加载即崩，整站白屏）。 */
const WITH_SPECS = new Set(menuItems.map((m) => m.id))

export function specsFor(item) {
  if (!item) return []
  if (!WITH_SPECS.has(item.id) && !/^special-\d+$/.test(item.id)) return []
  if (item.counterId === 'tea') return SPECS.tea
  if (item.counterId === 'dessert') return SPECS.sweet
  if (item.counterId === 'bento') return SPECS.rice
  // 面店那四件里，「溏心蛋叉烧丼」是饭（category === '饭'），其余是面
  if (item.counterId === 'noodle') return item.category === '饭' ? SPECS.rice : SPECS.noodle
  return []
}

/** 购物袋的键：没选（或全默认）就是商品 id 本身 —— 老数据照旧能读，不用迁移。
    选了才拼成 `m13#ice-none.sugar-half.add-pearl`（排序过，同一份规格只会有一行）。 */
export function cartKeyOf(itemId, specIds = []) {
  // ⚠️ **默认值要从键里剥掉** —— 否则「点了但全是默认」的那杯键会变成
  // `m13#ice-normal.sugar-std`，跟老数据里那杯 `m13` 在购物袋里分成两行
  // （同一样东西显示两次，加过的老用户会以为自己手抖加了两杯）。
  const defaults = new Set(specsFor(getItem(itemId)).filter((g) => g.pick === 'one' && g.def).map((g) => g.def))
  const picked = Array.from(new Set(specIds.filter((id) => id && !defaults.has(id)))).sort()
  return picked.length ? `${itemId}#${picked.join('.')}` : itemId
}

export function parseCartKey(key) {
  const [itemId, specPart] = String(key).split('#')
  return { itemId, specIds: specPart ? specPart.split('.') : [] }
}

/** 「少冰 · 半糖 · 加珍珠」—— 购物袋 / 结算 / 凭证上都用这句，别各处自己拼。
    默认值不显示（说「正常冰 · 标准糖」是废话），加料前加个「加」字才读得顺。 */
export function specTextOf(item, specIds = []) {
  const groups = specsFor(item)
  if (!groups.length || !specIds.length) return ''
  const set = new Set(specIds)
  const out = []
  groups.forEach((g) => {
    if (g.pick === 'one') {
      const hit = g.options.find((o) => set.has(o.id))
      if (hit && hit.id !== g.def) out.push(hit.label)
    } else {
      g.options.filter((o) => set.has(o.id)).forEach((o) => out.push(`加${o.label}`))
    }
  })
  return out.join(' · ')
}

/** 单价 = 原价 + 加料 / 加量的钱（冰量甜度不花钱，所以它们没有 delta）。 */
export function unitPriceOf(item, specIds = []) {
  const set = new Set(specIds)
  let extra = 0
  specsFor(item).forEach((g) => {
    g.options.forEach((o) => { if (set.has(o.id) && o.delta) extra += o.delta })
  })
  return (item?.price || 0) + extra
}

export const promoDrops = [
  { label: '复古贴纸', icon: 'sticker', text: '今日掉落：一枚复古贴纸 ✨' },
  { label: '治愈小物', icon: 'gift', text: '今日掉落：一只亚麻杯垫 ✨' },
  { label: 'Soft Moment', icon: 'sparkles', text: '今日掉落：一句温柔提醒 ✨' },
]

export const weatherTypes = [
  { key: 'sunny', label: '晴天', emoji: '☀️', etaAdd: 0, filter: 'none' },
  { key: 'light-rain', label: '小雨', emoji: '🌧️', etaAdd: 5, filter: 'brightness(0.96) saturate(0.92)' },
  { key: 'heavy-rain', label: '暴雨', emoji: '⛈️', etaAdd: 10, filter: 'brightness(0.88) saturate(0.82)' },
  { key: 'windy', label: '大风', emoji: '💨', etaAdd: 10, filter: 'brightness(0.92) saturate(0.88)' },
]

// ===== 配送等待 · 骑手来信 =====
// 等待不是空转 —— 骑手会一路发来几句话，按进度分批出现，最后一条是「到楼下了」。
// 想快进就看不到后面的信：这是快进唯一「失去」的东西，比扣奖励更诚实。
export const RIDER_LETTERS = [
  { at: 0.02, text: '刚出店门。你这份不重，我拿得稳，骑慢点也不会凉。' },
  { at: 0.16, text: '过一个路口，红灯有点久，正好让我歇口气。' },
  { at: 0.32, text: '路边有只橘猫趴在电动车上打盹，不怕人。' },
  { at: 0.48, text: '路过一家花店，老板在门口浇水，风一吹全是香的。' },
  { at: 0.64, text: '风把我的外套吹鼓了，像揣着个气球。' },
  { at: 0.80, text: '快到你家小区了。门卫大爷还在听收音机，跟上回一样。' },
  { at: 0.95, text: '到你楼下了。不用下来接，我认得门牌。' },
]

// ===== 配送等待 · 陪骑手走（2026-09-17 用户拍板：要一点真操作，但不要计分）=====
// 这是「B 陪骑手走」：路上会遇上几件事，你可以搭把手 / 替他选一下。
// 三条硬限制，改这里之前先看清楚：
//   ① 不计分、不会输、没有倒计时 —— 它不是游戏，是一段有人在的路上
//   ② 不理他也完全可以：他照样到，不扣任何东西（这个 App 不该逼人盯着屏幕）
//   ③ 每次只有一件事在等你，答完就收回，不刷屏
// 选了什么会带进结局页的「路上的纪念」—— 陪伴要有回响，但不能有奖励。
export const RIDER_MOMENTS = [
  {
    key: 'puddle',
    at: 0.20,
    ask: '前面路口积了一小滩水',
    hint: '他低着头看手机支架，好像没注意',
    options: [
      { key: 'warn', label: '提个醒' },
      { key: 'quiet', label: '不用，他自己看得见' },
    ],
    replies: {
      warn: '他减速绕开了，回头朝这边点了一下头。',
      quiet: '他自己看见了，稳稳地压过去，水花都没溅起来。',
    },
  },
  {
    key: 'fork',
    at: 0.42,
    ask: '前面是个岔路口',
    hint: '大路红灯多，小路近但颠',
    options: [
      { key: 'main', label: '走大路，稳一点' },
      { key: 'short', label: '走小路，快一点' },
    ],
    replies: {
      main: '大路红灯是多，不过树荫好 —— 值。',
      short: '小路近是近，颠得手心发麻，但确实快了一会儿。',
    },
  },
  {
    key: 'give',
    at: 0.62,
    ask: '他在红灯前停下来擦汗',
    hint: '车筐里好像还能塞点什么',
    options: [
      { key: 'water', label: '递一瓶水' },
      { key: 'candy', label: '给他一颗糖' },
    ],
    replies: {
      water: '他接过去，说这天骑车，水比什么都金贵。',
      candy: '他笑了：这个我爱吃 —— 揣兜里等红灯的时候吃。',
    },
  },
  {
    key: 'song',
    at: 0.80,
    ask: '他发来一句：来首歌吧',
    hint: '这一段路还有一会儿',
    options: [
      { key: 'slow', label: '慢一点的' },
      { key: 'old', label: '一首老歌' },
      { key: 'quiet', label: '安静一点的' },
    ],
    replies: {
      slow: '他跟着哼了一路，到楼下才想起来停。',
      old: '这首他会唱 —— 声音混在风里，断断续续的。',
      quiet: '两个人都不说话，只剩风声，也挺好。',
    },
  },
]

// ===== 配送等待 · 陪等的方式（2026-09-17 用户：三种都想要，UI 要能切换）=====
// 等的那段时间怎么过，由用户自己选，随时可换。三种都守同一条底线：
//   **不计分、不会输、不点也完全没事** —— 骑手照样到，什么都不扣。
// 区别只在「你用这段时间做什么」：
//   walk    陪他走：路上一件件事，你替他拿主意（有来有回）
//   road    帮他看路：路面上的小状况，点一下提个醒（有点手感，但不是跑酷计分）
//   offline 先下线：折一个装汤的小盒子，折完就让你放下手机
// ⚠️ hint 必须 ≤10 个字：三个标签等宽（flex:1 → 约 114px），再长就会折成两行，
//    三个标签的副标题一高一矮，整排看起来像没对齐（2026-09-18 用户：「视觉糙」）。
//    有断言盯着这条：verify-wait-modes 会量每个 hint 的行盒数，必须都是 1。
export const WAIT_MODES = [
  { key: 'walk', label: '陪他走', hint: '路上遇事，替他选一下' },
  { key: 'road', label: '帮他看路', hint: '点一下，提醒他躲开' },
  { key: 'offline', label: '先下线', hint: '折个盒子，放下手机' },
]

// 点「快进」不是跳过，而是先跟骑手说一句话 —— 有来有回，再加速。
export const RIDER_EXCHANGES = [
  { key: 'water', label: '递一瓶水', reply: '谢谢。那我慢慢骑，稳稳给你送到。' },
  { key: 'care',  label: '说句「路上小心」', reply: '收到。你也不急，我这就来。' },
  { key: 'hurry', label: '轻轻催一下', reply: '好，我尽量快 —— 汤可能会晃一点。' },
]

// 自己写的那一句 → 骑手怎么回。按文字的 hash 挑，同一句话回的是同一句（和菜单同一套确定性）。
// 2026-09-22 用户要的「加一个自定义」—— 只有回话是人写的，规矩不变：一样花慢活额度。
export const RIDER_CUSTOM_REPLIES = [
  '收到，这话我揣兜里了 —— 稳稳给你送到。',
  '哈，好。那我骑快一点点，汤尽量不晃。',
  '行，就冲你这句话，红绿灯都少等两个。',
]

// ===== 配送等待 · 等待本身的时间 =====
// 等多久 = 这家店的 deliveryTime + 天气加成 —— 真实的一单 30~50 分钟，跟真外卖一个量级
//（2026-09-24 用户「参考外卖一般时间 35 分钟左右，自己也可以调 1-60 分钟」）。
// 等待页有调节器：想慢慢等完就照预计来，今天只想等一小会儿就调短 —— 自己说了算。
// 骑手来信按路程比例出现（RIDER_LETTERS 的 at 是 0~1），等多久都成立。
export const PATIENCE_NOTE = '时间是这个铺子里唯一真实的东西 —— 想快一点，就从今天的时间里借。'

// 等待时给现实里的一件小事（不做小游戏：这个 App 不该让人看更久的屏幕）
export const OFFLINE_TASKS = [
  '去给自己倒一杯水',
  '站起来伸个懒腰',
  '看一眼窗外，找找今天的天色',
  '把桌上的东西摆回原位',
  '深呼吸三次，不用急',
]

// 虚拟伙伴「软软」成长阶段：每完成一单（=现实少点一次外卖）喂一块小饼干
// 形象：2026-09-14 用户最终敲定的小猫（原来那只兔熊已退休，不要再退回去）。
// 素材在 src/assets/pets/{画风}-{毛色}-stage{n}.webp，由 tools/petForge.py 生成。
export const PET_NAME = '软软'

export const PET_SPECIES = '小猫'

// 小狗「团团」（2026-09-23 用户「参考小猫形象做一只小狗，让用户自己选猫还是狗」）
// 素材在 src/assets/pets/d-cream-stage{n}.webp，锚点在 src/dogFace.js，与猫完全隔离。
export const DOG_NAME = '团团'
export const DOG_SPECIES = '小狗'

/** 按物种取名字 / 物种标签 / 成长阶段 / 台词池（cat 默认，dog 走狗的一套） */
export function petNameFor(species) { return species === 'dog' ? DOG_NAME : PET_NAME }
export function petSpeciesLabel(species) { return species === 'dog' ? DOG_SPECIES : PET_SPECIES }
export function petStagesFor(species) { return species === 'dog' ? dogStages : petStages }
export function petLinesFor(species) { return species === 'dog' ? dogLinesByStage : petLinesByStage }

// 毛色可选。用户敲定的这只猫只有一种配色，所以这里只留一项；
// 保留数组结构是为了以后真加第二只猫时不用改 UI（只有 length > 1 时才渲染选择器）。
export const PET_COLORWAYS = [
  { key: 'cream', name: '奶白三花', hex: '#F6EDE0', accent: '#EBC9A8' },
]

export const petStages = [
  { level: 0, name: '奶猫', emoji: '🐾', desc: '刚睁眼没多久，缩成一团圆圆的，走两步就要坐下' },
  { level: 1, name: '小猫崽', emoji: '🐾', desc: '开始跟在你脚边转，尾巴竖得像个小问号' },
  { level: 2, name: '少年猫', emoji: '🐱', desc: '身子拉长了一点，学会蹲在窗台看楼下的车' },
  { level: 3, name: '青年猫', emoji: '🐱', desc: '前腿长开了，跳上柜台毫不费力' },
  { level: 4, name: '成年猫', emoji: '🐈', desc: '稳稳坐在小铺里，像这里本来就该有它' },
]

// 小狗「团团」的成长阶段（与 petStages 同构，5 个阶段对应 d-cream-stage0~4）
export const dogStages = [
  { level: 0, name: '小奶狗', emoji: '🐾', desc: '刚出生没多久，团成一团圆圆的，眼睛还是半睁的' },
  { level: 1, name: '奶狗崽', emoji: '🐾', desc: '能自己坐稳了，一对小垂耳第一次垂下来' },
  { level: 2, name: '幼犬', emoji: '🐶', desc: '圆滚滚的，垂耳垂到脸颊两侧，走路摇摇摆摆' },
  { level: 3, name: '少年犬', emoji: '🐶', desc: '身子拉长了一点，垂耳长到脸颊以下，机灵又温柔' },
  { level: 4, name: '成年犬', emoji: '🐕', desc: '毛更蓬松，稳稳坐在你脚边，像这里本来就该有它' },
]

// 邻居猫：住在隔壁的那只大猫（用户敲定的另一只猫咪形象），每天来小铺串门。
// 它不参与成长，只有一张形象图 src/assets/pets/neighbor.webp。
export const NEIGHBOR_NAME = '邻居猫'

// 每升一级所需的小饼干数（meals 达到该值即达对应 level）
export const LEVEL_MEALS = [0, 1, 3, 6, 10]

export function levelForMeals(meals) {
  let lvl = 0
  for (let i = 0; i < LEVEL_MEALS.length; i++) {
    if (meals >= LEVEL_MEALS[i]) lvl = i
  }
  return lvl
}

// 送达掉落的贴纸池
export const stickerPool = [
  { id: 'sakura', emoji: '🌸', name: '樱花' },
  { id: 'milktea', emoji: '🧋', name: '奶茶' },
  { id: 'cake', emoji: '🍰', name: '蛋糕' },
  { id: 'bento', emoji: '🍱', name: '便当' },
  { id: 'journal', emoji: '📔', name: '手账' },
  { id: 'leaf', emoji: '🌿', name: '绿植' },
  { id: 'candle', emoji: '🕯️', name: '香薰' },
  { id: 'yoga', emoji: '🧘', name: '瑜伽' },
]

// ===== 今日特调：每天自动换一款虚拟饮品 =====
export const dailySpecials = [
  {
    cn: '桂花乌龙冷萃', en: 'OSMANTHUS COLD BREW', price: 26,
    desc: '桂花落在冷萃上，秋天提前到了。', color: '#E8C87A', emoji: '🌼',
    image: specialOsmanthusColdBrewDraw, imageReal: specialOsmanthusColdBrewReal,
  },
  {
    cn: '烤奶盖厚乳', en: 'TORCHED MILK CAP', price: 25,
    desc: '奶盖被烤出焦糖色，趁热喝掉。', color: '#D9A86C', emoji: '🔥',
    image: specialTorchedMilkCapDraw, imageReal: specialTorchedMilkCapReal,
  },
  {
    cn: '青提气泡美式', en: 'GRAPE SODA AMERICANO', price: 23,
    desc: '气泡把困意顶出去，青提负责好喝。', color: '#A9C46C', emoji: '🍇',
    image: specialGrapeSodaAmericanoDraw, imageReal: specialGrapeSodaAmericanoReal,
  },
  {
    cn: '茉莉奶绿', en: 'JASMINE MILK GREEN', price: 22,
    desc: '花香先飘过来，然后才是奶。', color: '#C8D6A8', emoji: '🌿',
    image: specialJasmineMilkGreenDraw, imageReal: specialJasmineMilkGreenReal,
  },
  {
    cn: '黑糖麻薯奶茶', en: 'MOCHI BROWN SUGAR', price: 27,
    desc: '麻薯软到要用吸管追着吃。', color: '#B98A5E', emoji: '🧋',
    image: specialMochiBrownSugarDraw, imageReal: specialMochiBrownSugarReal,
  },
  {
    cn: '白桃乌龙气泡', en: 'PEACH OOLONG FIZZ', price: 24,
    desc: '桃子的香，乌龙的回甘，气泡的凉。', color: '#F0B8A8', emoji: '🍑',
    image: specialPeachOolongFizzDraw, imageReal: specialPeachOolongFizzReal,
  },
  {
    cn: '陈皮红豆沙', en: 'TANGERINE RED BEAN', price: 21,
    desc: '小时候奶奶煮的那个味道。', color: '#A85D4E', emoji: '🫘',
    image: specialTangerineRedBeanDraw, imageReal: specialTangerineRedBeanReal,
  },
  {
    cn: '椰子灰拿铁', en: 'COCONUT ASH LATTE', price: 26,
    desc: '灰得很高级，喝着很温柔。', color: '#A8A29A', emoji: '🥥',
    image: specialCoconutAshLatteDraw, imageReal: specialCoconutAshLatteReal,
  },
  {
    cn: '咸蛋黄奶盖', en: 'SALTED YOLK CAP', price: 28,
    desc: '咸甜打架，最后握手言和。', color: '#E4B860', emoji: '🌕',
    image: specialSaltedYolkCapDraw, imageReal: specialSaltedYolkCapReal,
  },
  {
    cn: '梅子绿茶', en: 'PLUM GREEN TEA', price: 20,
    desc: '酸得让人清醒，适合下午三点。', color: '#B8C46C', emoji: '🫒',
    image: specialPlumGreenTeaDraw, imageReal: specialPlumGreenTeaReal,
  },
  {
    cn: '厚可可鲜奶', en: 'THICK COCOA MILK', price: 25,
    desc: '苦和甜各退一步，刚刚好。', color: '#8A5A44', emoji: '🍫',
    image: specialThickCocoaMilkDraw, imageReal: specialThickCocoaMilkReal,
  },
  {
    cn: '樱花盐渍气泡', en: 'SAKURA SALT SODA', price: 24,
    desc: '粉色的气泡往上跑，看着就开心。', color: '#F0C0C8', emoji: '🌸',
    image: specialSakuraSaltSodaDraw, imageReal: specialSakuraSaltSodaReal,
  },
]

/** 今天轮到第几杯（`dailySpecials` 的下标）。
    2026-09-24 起特调是**能点进去买的商品**，id 用这个下标（`special-<i>`）——
    所以「今天加的那杯」明天仍然是同一件东西，不会因为轮换而在购物袋里失踪。 */
export function getTodaySpecialIndex() {
  return dateSeed() % dailySpecials.length
}

/** 今天的特调。带 `index`，调用方靠它取商品 id。 */
export function getTodaySpecial() {
  const i = getTodaySpecialIndex()
  return { ...dailySpecials[i], index: i }
}

/**
 * 今日特调往后数 count 杯 —— 首页封面那叠相纸用它（2026-09-21）。
 * 第 0 杯**就是** `getTodaySpecial()`，所以封面第一张和首页「今天的特调是「X」」
 * 永远是同一杯，不会打架。
 * ⚠️ 种子仍然只来自 `dateSeed()`（日期），别换成 Math.random —— 同一天刷新两次
 * 换一批图，用户会以为「今天的特调变了」。
 */
export function getSpecialRun(count = 4) {
  const n = dailySpecials.length
  const start = dateSeed() % n
  return Array.from({ length: Math.max(1, Math.min(count, n)) }, (_, k) => {
    const i = (start + k) % n
    // ⚠️ `index` 是**数组下标**，不是「今天第几杯」—— 后者每天都在滚，拿它做 id 会串。
    return { ...dailySpecials[i], index: i }
  })
}

// ===== 反向 AI 推送：主动给用户一句话 =====
// 基于「时间 + 购物车 + 宠物状态」组合生成，而不是纯随机
export function getTodayHint({ hasCart = false, cartCount = 0, petMeals = 0, isFirstVisit = false, hour = new Date().getHours() }) {
  // 优先级：初见 > 购物车 > 时段 > 宠物进步 > 兜底
  // 「初见」排最前：第一次来的人最需要的不是问候，是**知道这里在干什么** ——
  // 下面所有话都建立在他已经懂的前提上（2026-09-19 用户点的「修陌生人第一次的入口」）。
  if (isFirstVisit) {
    return { tone: 'intro', text: '先说清楚：这里的外卖不会真的送来。点一单试试，你会知道它换来了什么。' }
  }
  if (hasCart && cartCount > 0) {
    return { tone: 'cart', text: `购物篮里还有 ${cartCount} 样东西，要现在下单吗？` }
  }
  if (hour >= 5 && hour < 11) {
    return { tone: 'morning', text: '早上好，今天想先来点热的还是凉的？' }
  }
  if (hour >= 11 && hour < 14) {
    return { tone: 'noon', text: '到饭点了，要不要点份便当照顾一下自己？' }
  }
  if (hour >= 14 && hour < 18) {
    return { tone: 'afternoon', text: '下午有点长，来一杯刚好撑过去。' }
  }
  if (hour >= 18 && hour < 23) {
    return { tone: 'evening', text: '今天辛苦了，想吃点甜的还是喝点暖的？' }
  }
  if (petMeals > 0 && petMeals % 3 === 0) {
    return { tone: 'pet', text: `你已经少点了 ${petMeals} 次外卖，软软记得的。` }
  }
  return { tone: 'night', text: '这么晚还没睡，要不要先给自己倒杯水？' }
}

export function getCounter(id) {
  return counters.find((c) => c.id === id)
}

// ===== 用户自建商品：运行时容器 =====
// 像真外卖平台一样，商品是动态的：内置 12 项 + 用户自己上架的 N 项
let customItems = []

export function setCustomItems(items) {
  customItems = Array.isArray(items) ? items : []
}

export function getCustomItems() {
  return customItems
}

// ===== 运行时商品（今日特调等动态内容）=====
let runtimeItems = []

export function setRuntimeItems(items) {
  runtimeItems = Array.isArray(items) ? items : []
}

// ===== 世界菜单商品（AI 现编，不挂进柜台，只在世界菜单页出现）=====
// 但仍然要能被 getItem 查到，否则加进购物篮后就找不回来了
let worldItems = []

export function setWorldItems(items) {
  worldItems = Array.isArray(items) ? items : []
}

export function getWorldItems() {
  return worldItems
}

// ===== 惜食柜商品（今天没卖完的那几份，折价上柜）=====
// 和世界菜单一样：不挂进任何柜台菜单，但必须能被 getItem 查到，
// 否则加进购物袋后刷新就找不回来了。
let rescueItems = []

export function setRescueItems(items) {
  rescueItems = Array.isArray(items) ? items : []
}

export function getRescueShelf() {
  return rescueItems
}

export function getAllItems() {
  return [...menuItems, ...runtimeItems, ...customItems]
}

/**
 * 特调 → 商品（2026-09-24 用户：「主页这个图片点击的话应该是能跳到对应商品页面的」）。
 * 12 杯全部是能点进去买的商品，和柜台里的常驻商品同一套（有规格、能加购）。
 *
 * 🔴 id 用**它在 `dailySpecials` 里的下标**：`special-<i>`。
 *    别用「今天第几杯」当 id —— 那个每天都在滚，同一杯今天叫 0、明天叫 3，
 *    用户昨天加进袋子的那杯就查不到了（cartBreakdown 会把查不到的 id 丢掉）。
 *
 * `onShelf` = 这一杯今天在不在封面上（决定它出不出现在茶饮铺菜单里）。
 * 不在架的也照样登记进 runtimeItems —— 只为让**跨天存下来的购物袋**还能查到它。
 */
export function toItemFromSpecial(special, { onShelf = false } = {}) {
  const index = typeof special.index === 'number'
    ? special.index
    : Math.max(0, dailySpecials.indexOf(special))
  return {
    id: `special-${index}`,
    code: `SPECIAL ${String(index + 1).padStart(2, '0')}`,
    name: special.en,
    cn: special.cn,
    price: special.price,
    counterId: 'tea',
    category: 'AI 特调',
    tags: ['ai'],
    kind: 'special',
    onShelf,
    emoji: special.emoji,
    description: special.desc,
    // 有真图的走翻面卡（和 13 款招牌商品同一套：实拍 ↔ 油画棒）；
    // 还没配图的继续用手绘卡兜底 —— ItemArt 会按「有没有 image/imageReal」自己选。
    image: special.image,
    imageReal: special.imageReal,
    art: { kind: 'cup', hex: special.color, city: '慢活小铺', cityEn: 'SOFT LIFE' },
  }
}

/** 某家店的菜单。⚠️ 特调只在**今天在架**那几杯里出现 ——
    12 杯都登记在 runtimeItems 里（为了购物袋跨天不丢），但一次只上 4 杯；
    不过滤的话茶饮铺菜单会一下冒出 12 杯特调，「今日」就没有意义了。 */
export function getItemsByCounter(counterId) {
  return getAllItems().filter((item) =>
    item.counterId === counterId && (item.kind !== 'special' || item.onShelf))
}

// 注意：惜食柜商品单独在 rescueItems 里查 —— 不能并进 getAllItems()，
// 否则 getItemsByCounter 会把折价品混进店内正常菜单，等于全场打折。
export function getItem(id) {
  // 老购物袋里的 `special-today`（2026-09-24 之前特调只有一件，用的是这个 id）——
  // 映射到「今天那一杯」的新 id，老单子不会变成查不到然后被默默丢掉。
  const real = id === 'special-today' ? `special-${getTodaySpecialIndex()}` : id
  return getAllItems().find((item) => item.id === real)
    || worldItems.find((item) => item.id === real)
    || rescueItems.find((item) => item.id === real)
}

/**
 * 把购物袋折成「明细 + 金额」—— 购物袋页和结算页共用这一份。
 * 早先两页各算各的：购物袋显示「小计 ¥48 优惠 -¥8 合计 ¥40」，
 * 结算页只剩「2 件商品」，金额全丢了；而且 totalsByCounter 的 qty 只在
 * 首次赋值、后面不累加。放在这里就不会再漂。
 *
 * 查不到的 id 会在这里被丢掉 —— 惜食柜每天换 3 件、世界菜单每天换城市、
 * 今日特调每天换，昨天加的东西今天确实可能不在了（main.jsx 会顺手对账清理）。
 */
export function cartBreakdown(cart) {
  // 键可能是 `m13`（没选规格，老数据也是这个形状）或 `m13#ice-none.sugar-half`
  const entries = Object.entries(cart || {})
    .filter(([, qty]) => Number(qty) > 0)
    .map(([key, qty]) => {
      const { itemId, specIds } = parseCartKey(key)
      const item = getItem(itemId)
      if (!item) return null
      return {
        key,
        itemId,
        item,
        specIds,
        specText: specTextOf(item, specIds),
        unitPrice: unitPriceOf(item, specIds),
        qty: Number(qty),
      }
    })
    .filter(Boolean)

  const byCounter = {}
  entries.forEach(({ item, qty, unitPrice }) => {
    if (!byCounter[item.counterId]) {
      byCounter[item.counterId] = { counter: getCounter(item.counterId), subtotal: 0, qty: 0 }
    }
    // 用**加了料之后**的单价算，不然加料的钱会在小计里凭空消失
    byCounter[item.counterId].subtotal += unitPrice * qty
    byCounter[item.counterId].qty += qty
  })

  let subtotal = 0
  let discount = 0
  Object.values(byCounter).forEach(({ counter, subtotal: s }) => {
    subtotal += s
    if (counter?.discount && s >= counter.discount.threshold) discount += counter.discount.amount
  })

  return {
    entries,
    byCounter,
    subtotal,
    discount,
    total: Math.max(0, subtotal - discount),
    count: entries.reduce((n, { qty }) => n + qty, 0),
  }
}

// ===== AI 商品生成器（占位式：按主色系推断商品名/描述/定价/柜台） =====
// 用户只上传一张照片，AI 帮他想好剩下的一切
export const aiProductBrain = {
  green: {
    counterIds: ['tea', 'bento'],
    names: [
      { en: 'MATCHA CLOUD', cn: '抹茶云朵', price: 26, desc: '抹茶和奶盖搅在一起，像把春天喝进嘴里。' },
      { en: 'GREEN GRAPE JASMINE', cn: '青提茉莉', price: 23, desc: '青提的酸，茉莉的香，刚好一口清醒。' },
      { en: 'PANDAN LATTE', cn: '斑斓拿铁', price: 25, desc: '东南亚的绿，配椰乳最合适。' },
      { en: 'GARDEN BOWL', cn: '田园绿碗', price: 33, desc: '两样青菜一个蛋，简单但完整。' },
    ],
  },
  warm: {
    counterIds: ['tea', 'dessert', 'bento'],
    names: [
      { en: 'BROWN SUGAR LATTE', cn: '黑糖厚奶', price: 24, desc: '黑糖挂壁，喝之前先摇三下。' },
      { en: 'HAZELNUT MILK TEA', cn: '榛果奶茶', price: 22, desc: '坚果的香，刚好压住秋天的凉。' },
      { en: 'CARAMEL PUDDING', cn: '焦糖布丁', price: 26, desc: '勺子敲开焦糖壳的那一下，最治愈。' },
      { en: 'MILK TOAST', cn: '厚切奶酥吐司', price: 20, desc: '烤到金黄，趁热吃掉。' },
    ],
  },
  peach: {
    counterIds: ['tea', 'dessert'],
    names: [
      { en: 'PEACH OOLONG', cn: '蜜桃乌龙', price: 22, desc: '果香先到，茶香后到。' },
      { en: 'STRAWBERRY CREAM', cn: '草莓奶油杯', price: 28, desc: '草莓和奶油层层叠叠，像小时候的生日。' },
      { en: 'ROSE LYCHEE TEA', cn: '玫瑰荔枝茶', price: 24, desc: '花香和果甜，适合送给今天的自己。' },
      { en: 'PINK GRAPEFRUIT SODA', cn: '粉柚气泡', price: 21, desc: '气泡在杯子里排队往上跑。' },
    ],
  },
  dark: {
    counterIds: ['tea', 'dessert'],
    names: [
      { en: 'ROASTED OOLONG', cn: '炭焙乌龙', price: 20, desc: '焙火气重一点，适合安静地喝。' },
      { en: 'BLACK SESAME LATTE', cn: '黑芝麻拿铁', price: 25, desc: '香得有点旧时光。' },
      { en: 'COCOA PUDDING', cn: '可可奶冻', price: 24, desc: '微苦，所以能一直吃下去。' },
      { en: 'ESPRESSO BROWNIE', cn: '浓缩布朗尼', price: 27, desc: '一小块，足够撑过下午。' },
    ],
  },
  neutral: {
    counterIds: ['tea', 'dessert', 'bento', 'life'],
    names: [
      { en: 'OAT LATTE', cn: '燕麦拿铁', price: 23, desc: '燕麦奶把咖啡变得柔和一点。' },
      { en: 'SOY MILK PUDDING', cn: '豆乳布丁', price: 22, desc: '豆香淡淡的，不腻。' },
      { en: 'SEASONAL PLATE', cn: '当季小食盘', price: 30, desc: '今天有什么就吃什么，交给季节。' },
      { en: 'SEA SALT CREAM', cn: '海盐奶盖', price: 24, desc: '咸和甜打了一架，甜赢了。' },
    ],
  },
}

// 根据主色系 + 种子，生成一个完整商品草案
export function generateProductDraft(palette, seed) {
  const family = colorFamilyOf(palette.dominant)
  const brain = aiProductBrain[family]
  const pick = brain.names[seed % brain.names.length]
  const counterId = brain.counterIds[seed % brain.counterIds.length]
  return {
    en: pick.en,
    cn: pick.cn,
    price: pick.price + ((seed % 3) - 1), // 轻微浮动
    desc: pick.desc,
    counterId,
    category: family === 'green' ? '绿意系' : family === 'warm' ? '暖调系' : family === 'peach' ? '果香系' : family === 'dark' ? '深色系' : '日常系',
    family,
  }
}

function colorFamilyOf(hex) {
  const h = (hex || '').replace('#', '')
  if (h.length !== 6) return 'neutral'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  const lum = r * 0.299 + g * 0.587 + b * 0.114

  if (sat < 0.14) return 'neutral'
  if (lum < 95) return 'dark'
  if (g >= r && g >= b) return 'green'
  if (r > b && r - g > 45) return 'warm'      // 橘/棕/焦糖
  if (r > g && b > g) return 'peach'            // 粉/紫
  if (r > g && r > b) return 'warm'
  return 'neutral'
}

// ===== AI 内容生成预设库（占位式 AI） =====
// 即使未接真 API，这些预设让产品看起来"有思考能力"
// 每次抽卡基于"日期 hash + 图片 id"保证稳定但不重复

// 心情标签：每次抽 3 个
export const moodTags = [
  '#窗边发呆', '#雨天配热茶', '#凌晨两点的冰箱', '#空调房里犯困',
  '#夏末的奶油', '#周二下午', '#地铁末班车', '#加班的甜',
  '#第一口凉意', '#配书', '#配电影', '#配发呆',
  '#山间小路', '#便利店玻璃门', '#第一场雪', '#初春的杏色',
  '#奶奶家客厅', '#阳台吊椅', '#回学校的那个夏天', '#城中村拐角',
  '#不太想说话', '#想家', '#想见你', '#想睡午觉',
  '#需要一口甜', '#需要一口热', '#需要一点糖', '#需要一点阳光',
  '#一个人也挺好', '#给加班的自己', '#给周一的我', '#给身体一个奖赏',
]

// 一段小记：30 字左右，每次抽 1 条
export const foodNotes = [
  '这杯配上窗外的雨，刚刚好。',
  '香草冰淇淋慢慢融进红茶里，像在写日记。',
  '不用想点什么的日子，已经很珍贵。',
  '黑糖挂壁的样子，比味道更治愈。',
  '樱花味的东西总是春天的形状。',
  '便当打开的两层，是一种小型冒险。',
  '裱花边和小樱桃，是奶奶生日那天的蛋糕。',
  '铜锣烧配茶，刚好是两个人的份量。',
  '让米饭、青菜、蛋白质各就各位。',
  '甜一点没关系，今天你值得。',
  '热的比冰的更适合今天的风。',
  '其实没什么特别想点的，又什么都很想点。',
  '一杯奶茶的重量，足够撑过一下午。',
  '一个人吃饭的仪式感，从摆盘开始。',
  '比起点外卖，更像点一份陪伴。',
  '咖啡因让人清醒，奶油让人放松。',
  '窗边的光让我想起了第一口凉意。',
  '今天不需要被任何人照顾，自己来。',
  '便利店的关东煮声，是另一种下雨。',
  '下午三点的那一口，是当天最甜的闹钟。',
  '山间小路走到尽头，就是一杯热茶。',
  '城中村拐角的小店，老板从不问我要点什么。',
  '便当里最喜欢的是意料之外的配菜。',
  '这杯是给自己的下午茶，请勿打扰。',
  '再普通的食物，被好好拍一下也变成主角。',
  '奶油厚一点，今天值得。',
  '红豆馅温热，配茶刚好。',
  '打开两层便当的瞬间，今天有了形状。',
  '上层的饭团，下层的配菜，像生活的两面。',
  '一杯抹茶，是周一早晨需要的那口绿。',
]

// 软软今日心情 + 台词（按宠物阶段 + 心情）
// 每条 = { mood: emoji, line: 台词 }
// mood 的 emoji 必须在 SoftPet.jsx 的 MOOD_MAP 里有映射，否则只会退回默认表情。
export const petLinesByStage = [
  // 阶段 0：奶猫
  [
    { mood: '💤', line: '（缩成一小团，只露出一个耳朵尖）' },
    { mood: '☁️', line: '眼睛刚睁开，外面有点太亮了。' },
    { mood: '🌙', line: '（打了个哈欠，又睡过去了）' },
    { mood: '💭', line: '我好像闻到小饼干的味道了。' },
    { mood: '✨', line: '（试着站起来，晃了两下又坐下了）' },
  ],
  // 阶段 1：小猫崽
  [
    { mood: '👀', line: '呀，我能自己走稳了，你看。' },
    { mood: '🥛', line: '我想先喝一口温温的牛奶。' },
    { mood: '💭', line: '尾巴为什么老是要自己动啊。' },
    { mood: '🥹', line: '门口有风，我有点怕，但又想看看。' },
    { mood: '✨', line: '今天的你，看起来没那么累。' },
  ],
  // 阶段 2：少年猫
  [
    { mood: '😺', line: '你点的那杯闻起来好像在叫我。' },
    { mood: '🛋️', line: '在窗台上晒了一下午，背上都暖了。' },
    { mood: '🥢', line: '主人今天少点了一次外卖，我就有小饼干了。' },
    { mood: '🪟', line: '想看你今天又自己做了点什么。' },
    { mood: '💤', line: '刚打了个盹，梦见自己跳上了最高的柜子。' },
  ],
  // 阶段 3：青年猫
  [
    { mood: '😼', line: '你最近少点外卖的次数，我偷偷数过了。' },
    { mood: '📖', line: '陪你读书的下午，比任何零食都香。' },
    { mood: '🌿', line: '今天的风，适合开窗发一会儿呆。' },
    { mood: '😺', line: '我跳上柜台毫不费力，要不要再看一遍？' },
    { mood: '🌙', line: '今晚月亮很圆，我在窗台等你回来。' },
  ],
  // 阶段 4：成年猫
  [
    { mood: '😽', line: '你把我养得圆滚滚的，谢谢你。' },
    { mood: '🎀', line: '这个柜台的位置，我坐得刚刚好。' },
    { mood: '🍵', line: '等你把今天的茶喝完，我们就一起午睡。' },
    { mood: '🛋️', line: '沙发上的位置我占了，你坐我旁边就好。' },
    { mood: '🪟', line: '窗外的麻雀我也认识两只，要不要我介绍？' },
  ],
]

// 邻居猫的台词（它不成长，所以只有一池；每天来串门时按日期稳定抽一句）
export const NEIGHBOR_LINES = [
  { mood: '👀', line: '（它蹲在门口，看了你一会儿才进来）' },
  { mood: '💭', line: '我家那位今天又不在，借你的窗台用一下。' },
  { mood: '😽', line: '你家的猫说，它过得挺好的。' },
  { mood: '✨', line: '路过闻到香味就上来了，不用管我。' },
  { mood: '🛋️', line: '（在垫子边转了两圈，很自然地趴下了）' },
  { mood: '🥹', line: '我每天这个点都来，你知道的吧？' },
]

export function pickNeighborLine() {
  return NEIGHBOR_LINES[hashSeed(`${dateSeed()}:neighbor`) % NEIGHBOR_LINES.length]
}

export function pickPetLine(level) {
  const list = petLinesByStage[Math.min(level, petLinesByStage.length - 1)]
  return list[Math.floor(Math.random() * list.length)]
}

// 小狗「团团」今日心情 + 台词（与 petLinesByStage 同构；mood emoji 要在 SoftPet 的 MOOD_MAP 里有映射）
export const dogLinesByStage = [
  // 阶段 0：小奶狗
  [
    { mood: '💤', line: '（团成一团，只露出半个小脑袋）' },
    { mood: '☁️', line: '眼睛半睁，世界还看不太清楚。' },
    { mood: '🌙', line: '（打了个小哈欠，又缩回去了）' },
    { mood: '💭', line: '我好像闻到肉骨头的味道了。' },
    { mood: '✨', line: '（试着往前挪了挪，又趴下了）' },
  ],
  // 阶段 1：奶狗崽
  [
    { mood: '👀', line: '我能坐稳了，你看我。' },
    { mood: '🥛', line: '想先喝一点温温的奶。' },
    { mood: '💭', line: '耳朵为什么自己会垂下来啊。' },
    { mood: '🥹', line: '你不在的时候，我就守着门口。' },
    { mood: '✨', line: '今天的你，看起来没那么累。' },
  ],
  // 阶段 2：幼犬
  [
    { mood: '👀', line: '你点的东西闻起来好香，是给我的吗？' },
    { mood: '🛋️', line: '在你脚边趴了一下午，暖烘烘的。' },
    { mood: '🥢', line: '你今天又少点了一次外卖，我又有小饼干了。' },
    { mood: '🪟', line: '想跟你一起出去走走，不赶时间。' },
    { mood: '💤', line: '刚打了个盹，梦见追一只蝴蝶。' },
  ],
  // 阶段 3：少年犬
  [
    { mood: '✨', line: '你少点外卖的次数，我偷偷数过了。' },
    { mood: '📖', line: '陪你读书的下午，比任何零食都香。' },
    { mood: '🌿', line: '今天的风适合出去跑一圈，就一圈。' },
    { mood: '👀', line: '要不要再看我追一下自己的尾巴？' },
    { mood: '🌙', line: '今晚月亮很圆，我在门口等你回来。' },
  ],
  // 阶段 4：成年犬
  [
    { mood: '🥹', line: '你把我养得圆滚滚的，谢谢你。' },
    { mood: '🎀', line: '门口的这块垫子，我趴得刚刚好。' },
    { mood: '🍵', line: '等你的茶喝完，我们就去散个步。' },
    { mood: '🛋️', line: '沙发的位置我占了，你坐我旁边就好。' },
    { mood: '🪟', line: '楼下的麻雀我也认识两只，要不要我介绍？' },
  ],
]

// 用日期 hash 抽卡（保证每天不同）
export function dateSeed() {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

export function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function pickN(arr, seed, n) {
  const picked = []
  const used = new Set()
  let s = seed
  while (picked.length < n && picked.length < arr.length) {
    s = (s * 1103515245 + 12345) | 0
    const idx = Math.abs(s) % arr.length
    if (!used.has(idx)) {
      used.add(idx)
      picked.push(arr[idx])
    }
  }
  return picked
}

export function pickOne(arr, seed) {
  return arr[hashSeed(String(seed)) % arr.length]
}

// ===== 公益：慢活猫粮计划 =====
// 换算比例：¥1 = 0.1g（2026-09-22 用户定，原话「这个比例太高了」——
//   之前 ¥1=100g，一单就跳「43.5 只猫一天的口粮」，太夸张；再早的 10g 也嫌多。
//   现在不按市价折算了，数字要小得诚实 —— 一单的猫粮就是「一小把」）。
// 默认档位只占 30%，不鼓励一次全捐 —— 慢一点，但每一克都记着。
// ⚠️ 措辞红线：这里一律说「记下 / 记」，不说「捐」。
//    App 没有后端，钱一直在用户手上 —— 记下的是一笔打算，不是一次转账。
//    （唯一例外是「还没捐」「等你真的去捐」这类**提醒钱还没走**的说法。）
export const CHARITY = {
  name: '慢活猫粮计划',
  short: '猫粮',
  gramsPerYuan: 0.1,     // ¥1 = 0.1g（2026-09-22 用户定）
  gramPerCatDay: 60,     // 一只成年猫一天约 60g
  defaultRatio: 30,      // 默认记订单金额的 30%
  presets: [10, 30, 50, 100],
  note: '我们还很小，默认只按 30% 记 —— 不鼓励一次全记。慢一点，但每一克都记着。',
}

// 订单金额 → 如果全捐，能换成多少克猫粮
// 保留一位小数：¥1=0.1g 的世界里克数都是小数，Math.round 会把 2.6g 抹成 3g
export function gramsForAmount(amount) {
  return Math.round((Number(amount) || 0) * CHARITY.gramsPerYuan * 10) / 10
}

// 克数 → 「几只猫一天的口粮」这句话。
// 克数小（不到一只猫一天的量）的时候不说「0.0 只猫」，改说「还不到一只猫一天的口粮」。
export function catDaysText(grams) {
  const days = (Number(grams) || 0) / CHARITY.gramPerCatDay
  if (days >= 1) return `约 ${days.toFixed(1)} 只猫一天的口粮`
  if (days > 0) return '还不到一只猫一天的口粮'
  return ''
}

// ===== 惜食柜：今天没卖完的，被你带走就不算浪费 =====
// 不是「限时秒杀」—— 是关门前货架上那几份没赶上被点走的东西。
// 每天由日期决定上柜哪几件、折多少，和今日特调同一套确定性：
// 种子只来自日期，所以同一天刷新多少次，柜子里的东西和价格都不会变
// （id 稳定 → 加进购物袋后刷新仍然查得到）。
export const RESCUE = {
  name: '惜食柜',
  nameEn: 'THE KEPT SHELF',
  perDay: 3,
  // 折掉百分之多少：30 = 七折，40 = 六折，50 = 五折
  tiers: [30, 40, 50],
  // 只上架「会坏」的食物。选物铺的眼罩/手账/小垫不上柜 —— 它们不会过期
  foodCounters: ['tea', 'bento', 'dessert', 'noodle', 'dimsum'],
  // 每件在柜上就剩这么几份。文案说了「卖完就没有了」，那就真的得有卖完的时候 ——
  // 早先没有任何上限，同一件连点 5 次能拿到 5 份一模一样的便当，
  // 那「份数」这个账本主角就假了（也根本不是「别人不要的那几份」）。
  perItem: 2,
  limitNote: '每天 3 件 · 每件只剩 2 份，卖完就没有了，明天会换一批',
  // 小铺在柜子上留的一句话（按日期换）
  lines: [
    '它们不是不好，只是今天没赶上被人点走。',
    '关门前总会剩几份，扔掉太可惜了。',
    '这一格的东西今天卖完就没了，明天会有新的。',
    '做多了，就摆出来 —— 总比丢掉好。',
  ],
  // 诚实交代：这里没有真的食物，所以也没有真的浪费被拦下
  note: '这个柜子里没有真的食物。但你在现实里少点一次外卖 —— 家里那份真正会坏掉的东西，就真的被你留下了。',
}

// 今日惜食柜：确定性挑 3 件食物，各自定一个折率
export function buildRescueShelf() {
  const day = dateSeed()
  const pool = menuItems.filter((i) => RESCUE.foodCounters.includes(i.counterId))
  // 折率按序号轮转（起始档由日期决定），保证同一天三件折率各不相同 ——
  // 早先给每件单独 hash，结果三件撞成同一个 50%，看着像全场五折，不像货架
  const offset = hashSeed(`${day}:rescue-tier`) % RESCUE.tiers.length
  return pickN(pool, hashSeed(`${day}:rescue`), RESCUE.perDay).map((item, idx) => {
    const offPct = RESCUE.tiers[(offset + idx) % RESCUE.tiers.length]
    const price = Math.max(1, Math.round((item.price * (100 - offPct)) / 100))
    return {
      ...item,
      // 独立 id：原商品的价格不能被改写，店里卖的还得是原价
      id: `rescue-${item.id}`,
      originalId: item.id,
      code: 'RESCUE SHELF',
      rescue: true,
      offPct,
      originalPrice: item.price,
      price,
      saved: item.price - price,
      tags: ['rescue'],
    }
  })
}

// 小铺今天在柜子上留的那句话
export function rescueLine() {
  return RESCUE.lines[hashSeed(`${dateSeed()}:rescue-line`) % RESCUE.lines.length]
}
