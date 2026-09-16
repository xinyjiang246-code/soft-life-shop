# 慢活小铺 · 项目长期约定

> 只留「下一个人接着做必须知道」的决策与红线。操作细节见 skill `soft-life-web-dev`，用户原话见各日 `YYYY-MM-DD.md`。

## 一、这是什么 / 为什么做

**核心初衷（用户原话）**：不饿、减肥、已经吃撑的时候，仍想点一次外卖 —— 想花掉那笔钱、**完成下单的仪式**；但食物不该被真消耗（不浪费粮食），钱该流向公益（捐猫粮，按克计）。

**结构 = 真正的外卖 App**（不是商场扫码点餐小程序）：`home` → `counter`（进店才看菜单）→ `cart` → `checkout` → `delivery` → `ending` →（捐猫粮）→ `charity` 档案。
两条独立入口走同一条主流程：`world`（AI 世界菜单）· `rescue`（惜食柜）。
店铺返回用 `from` 参数，`main.jsx` 的 `goBack` 据此分发。

**6 家店（不要再增）**：`tea` 慢活茶饮铺 · `bento` 暖食便当柜 · `dessert` 怀旧甜点柜 · `life` 慢活选物 · `noodle` 深夜面馆·十二点后 · `dimsum` 一盅两件

## 二、菜品与商品图

三层供给：① 招牌 13 款（draw + real 两张真图，可翻面）② 新菜 8 道面点（`assets/dishes/*.webp`，仅实拍）③ 世界层 `dishForge.js`（10 城，每天换）+ 自建层 `MyShopScreen`。

- 生成**必须确定性**：种子只来自 `(城市, 批次, 日期)`，**绝不用 `Date.now()`**，否则购物车里的商品刷新后查不到
- 世界菜单 / 惜食柜商品**不进** `getAllItems()`，只加进 `getItem()` 一层查找
- **商品图一律走 `ItemArt.jsx`**：`prefer="real"`（店铺 / 购物袋）· `prefer="draw"`（hero / 今日特调 / 我的小店）；无图用 `DishArt.jsx` 蜡笔 SVG，**禁止退回 emoji**
- 每款**两张独立图**（不是上下拼接），点图翻面由 `FlipImage.jsx` 实现；一律 WebP（draw q82 / real q80）；**禁止 1MB 级 PNG 进 dist**（白屏）
- ⚠️ 部分 draw 原图自带「灰墙 + 白画框」装裱构图（`matcha-latte` / `journal` / `nourish-bowl` 已裁成画芯，备份 `products_old/*.framed.webp`）；实拍图残留的 AI 装饰文字要裁掉，draw 版的设计文字保留

## 三、公益 · 慢活猫粮计划

`data.js` 末尾 `CHARITY`：`gramsPerYuan:10` / `gramPerCatDay:60` / `defaultRatio:30` / `presets:[10,30,50,100]`；持久化 `soft-life-charity-v1`；`CharityScreen` 是完整档案页。
**规模红线**：用户原话「比例不能太多！因为我们现在比较小」→ 默认 30%，不鼓励全捐。
档案页必须诚实：「这个 App 没有后端…它是一本账，不是一次真实的转账 —— 但我们按真实的方式记账」。

## 四、配送等待页 · 慢活额度（核心机制）

用户原话：「加速没有任何互动就直接点就可以了…太无聊了」+「**如果没有任何代价的话，这个 app 是运行不下去的**」。
**前提：时间是这个小铺里唯一真实的资源** → 给时间定价，**不加小活动**。

- **慢活额度** `soft-life-patience-v1`：每天 10 分钟，快进按 `ceil(剩余秒/60)` 扣，跨天回满；不够则按钮禁用
- **加速 = 催单仪式**（三选一问候 → 骑手回话 → 进结局），**永远不要退回「一键跳过」**
- **等满不扣额度**，还多掉一枚贴纸（正向激励等下去）
- 等待页四件套：骑手来信（按进度显示 `04/07`）· 软软陪等 · 现实小事（可勾选）· 额度面板
- ⚠️ **「不做小游戏」**：劝人慢下来少看屏幕的 App 加消磨时间的游戏是自相矛盾；要做就做「离开屏幕」的反向活动。
  2026-09-16 用户裁决：另一个 agent 那个撞红线的 `RiderGame`（骑手小跑酷）→ **改造后保留**，
  即现在的 `RiderWindow`「骑手骑到哪了」（见第八节）

## 五、首页

**hero = 杂志内页**（旧版「左灰绿渐变块 + 右手绘图」被否，原话「很简单+有点丑」）：米纸底 + 刊头「THE SOFT HOUR」/ 大衬线标题 / 引言 / 「慢」圆章 + 右侧拍立得相纸。改 hero 高度要同步 `.hero-cap`。

**四件套**（原话「主页交互可以做的稍微有意思一点，现在有点无聊」）：氛围条（真实时钟 + 全天一致天气）· 每日心情 5 选 1（`soft-life-mood-v1`，跨天作废，影响店铺置顶）· 软软串门 · 2×2 角落磁贴。

**2×2 角落磁贴**：软软的小屋 / 慢活猫粮计划 / 把这一餐存下来 / 我的小店。四块**统一是水彩图**（`assets/tiles/*.webp`）。**别再往磁贴里塞新入口**；惜食柜与世界菜单各自有独立入口条，不进格子。

**视角红线**：四块统一到「软软的小屋」那只猫的**正面平视、左右对称**（2026-09-15 原话「图中的角度有些不对」）。圆碗只保留最小俯角（否则看不见碗里的饼干）—— 不妥协。

**顶栏两个图标不是装饰**（2026-09-15 用户认定没行为是 bug）：`搜索` → `SearchScreen`（一张就地索引覆盖全部来源）· `心愿单` → `WishlistScreen`（`soft-life-wish-v1`，含义是「**先记着、不急着点**」，不是收藏夹 —— 文案不许催单）。新增商品能力**记得同步进搜索索引**。

## 六、虚拟伙伴「软软」与邻居猫

- **形象 = 猫**（2026-09-14 敲定，兔熊时代结束**别再退回**）：**软软**（你自己的猫，5 阶段成长：奶猫 → 小猫崽 → 少年猫 → 青年猫 → 成年猫）+ **邻居猫**（隔壁那只成年猫，不成长，每天来串门）
- 氛围词一律用「**小饼干**」，**不要写「猫粮」**
- 素材 `assets/pets/a-cream-stage{0-4}.webp` + `neighbor.webp`（都是 220:248）；`SoftPet.jsx` **图片优先、SVG 兜底**（那个 SVG 还是兔熊旧版，**别再往它上面投入**）
- **毛色选择器已退役**：只有一种配色，`PET_COLORWAYS` 收敛为单项、`loadPet()` 把旧存档 `pink/blue` 归一到 `cream`
- 两种版本并存：`petForge.py` 出**带米色方底**版（`#F6F1E8`）→ `tools/petKnockout.py` 再出**真透明底** `*-t.webp`，`petArtUrl()` 优先择透明版。**跑完 petForge 必须顺手跑 petKnockout**
- ⚠️ **两条独立取图出口**：`.pet-photo`（软软 → `petArtUrl()`）与 `.neighbor-cat`（邻居猫 → `neighborArtUrl()`）。取图一律「**用 glob 的 key 去取 value**」—— 直接拿 key 当 `<img src>` 会 404（2026-09-16：邻居猫破图一整天才被发现，因为验收只点了软软那条）。改一条要回头验收另一条
- 带底版自带米色方底 → 贴到偏白背景上**必须套圆角 / 卡片**（首页 `.neighbor-cat` 已修）；透明版不受此限
- 出图链：原图丢 `宠物生图原始/{新形象,邻居猫}/` → `python3 tools/petForge.py`（`--only 邻居猫 --out-name neighbor`）→ 零代码改动。透明底自动合成米色（**别退回 `convert("RGB")`**，会把透明压成黑块）
- 生图 prompt → `宠物形象生图prompt.md`；参考图归档 `宠物生图原始/参考图/`

## 七、惜食柜 · 打折区

**立意（用户原话）**：「这东西在商店里放很久了，别人不要的，我买下来就不算浪费粮食」+「每段时间出一些这种打折菜单」
→ 定位 = **「关门前剩下的几份」，不是促销**。这条决定后面所有文案与配色。

**语气红线**：**不要红色、不要倒计时、不要「仅剩 N 件」、不要「限时秒杀」**（电商语言，破坏小铺调子）。视觉走木色 + 亚麻 + 一点黄油色。
**账本主角是「份数」**：`份被留下`（主格高亮）+ `单带走它们` + `¥ 比原价少花`（第三位、弱化）；落点是「这份饭被你留下了」，不是「你少花了钱」。

**规则**：每天 3 件、折率 30/40/50%（**三件折率必须互不相同** —— 各自独立哈希实测会三件全撞 -50%，像全场大促）· **每件 2 份**（`RESCUE.perItem`：文案写着「卖完就没有」就必须真有限额；拦截在 `addToCart` 层，购物袋「+」同步禁用，柜上按剩余份数**陈述**「柜上还有 N 份」）· 折价品**独立 id**（`rescue-` 前缀 + `originalId`），**原商品价格绝不改写** · 只从**食物类**柜台挑（选物店不参与）· 生成**确定性**（种子只来自 `dateSeed()`）· **记账时机在结局页**（送达才算数，与宠物成长、公益捐赠同一节拍）

持久化 `soft-life-rescue-v1`；UI = 首页 `.rescue-strip` 细入口 → `RescueScreen`（木牌题头 + 木尺 + 货架 + 「这本账」）→ 购物袋原价划掉 + 标签 → 结局 `.rescue-recap`。
**验证关键**：结算合计走**折后价**（三件 ¥26/¥22/¥42 → ¥13/¥15/¥25，合计 ¥53 而非 ¥90）。

## 八、等待页「骑手骑到哪了」+ 食物手账（2026-09-16 完工）

**RiderWindow**（`components/RiderWindow.jsx`，**已取代并删除 `RiderGame.jsx`**）：一扇只读的进度窗 ——
骑手位置 = 真实配送进度，8 个地标按进度亮起，文案只陈述事实（「过桥了，风比刚才大一点」），
底部写「不用一直盯着看 —— 骑手到了会敲门」。**红线：零可交互元素、零 canvas、无计分**
（想给它加「跳一下」之前先回头看第四节）。props：`progress` / `secondsLeft` / `totalSeconds`。

**食物手账**（`components/JournalView.jsx`，挂在 `ArchiveScreen` 的第二个视图）：
- 数据 `soft-life-journal-v1` = `{ days: { 'YYYY-MM-DD': { items: [{id,name}], note, mood } } }`；
  API：`journalKey()` / `loadJournal()` / `saveJournal()` / `logJournalOrder(entries)` / `addJournalItem` / `removeJournalItem` / `setJournalNote`
- **入口不新增**：并进首页「把这一餐存下来」磁贴，顶部「存下这一餐 / 食物手账」两视图切换
  （`ArchiveScreen` 收 `initialView`，结局页「翻翻手账」直接落到手账格）。手账视图把「API 设置」换成**同宽占位**否则标题偏
- 今天那页可编辑（加一笔 / 删一笔 / 写便签 / 选心情，便签 `onBlur` 自动存）；历史按天倒序只读
- **有真实商品 id 的条目贴商品图 + 一枚小圆点**；手写条目用线描「小记」符号 `NoteMark`，
  **不用 emoji**（连着项目那条「禁 emoji」红线）
- **记账时机在结局页**：`main.jsx` 的 `recordJournal(cart)` 生成 `{id,name}` 条目 → `logJournalOrder`，
  `EndingScreen` 挂载时记一次（`journaledRef` 防重复）。**与宠物成长 / 公益捐赠 / 惜食柜同一节拍：送达才算数**
- **语气红线**：不记卡路里、不算账、不做「连续打卡 N 天」；它是「这些天你点过、想过、最后没真吃掉的东西」的落脚处。
  自查脚本要能识别否定句（「不记卡路里，也不打卡」不算命中）

## 九、技术 / 验证约定

- 预览：`python3 -m http.server 8080 --bind 127.0.0.1`（**cwd 必须是 `dist/`**）→ http://127.0.0.1:8080/；**别让用户直接开 `file://` 的 dist/index.html**（base 相对路径导致白屏）。`vite.config.js` 的 `base: './'` 不能动
- **CDP 截图必须关缓存**（`Network.setCacheDisabled` + URL 加 `?t=Date.now()`）；`captureScreenshot` 的 `clip` 用**页面绝对坐标**（`getBoundingClientRect()` 是视口坐标，必须 `+scrollX/+scrollY`）
- 截图脚本在 `~/.workbuddy/skills/soft-life-web-dev/scripts/`；跑前先 `localStorage.clear()`；配送预演要 poll 不要硬 sleep；旧 `flow-*.mjs` 写死输出 `/tmp/shots/`，该目录不存在会 ENOENT 中断
- **购物袋金额只有一处实现**：`data.js` 的 `cartBreakdown(cart)`（entries / byCounter / subtotal / discount / total / count），购物袋页与结算页共用。**新增用到金额的页面一律调它**
- **角标必须与真实内容一致（对账机制）**：`cartCount` 数的是存档对象的键，而惜食柜 / 世界菜单 / 今日特调**每天会变** → 昨天加的东西今天 `getItem` 查不到，页面又用 `filter(Boolean)` 静默丢弃，出过「顶栏角标 3、点进去 0 行」。`main.jsx` 有一条对账 effect（依赖 `[worldItems, rescueShelf, cart, wishes]`）如实清出并 toast。**新增任何「每日会变」的商品来源都要挂到这条 effect 后面**
- **世界菜单的「今日城市」要带日期**：`soft-life-world-v1` 存 `{kitchenId, batch, day}`（早先没有 `day`，手动切过一次就永久锁死）
- 小图素材出图链：`图标生图原始/<name>.png` → `python3 tools/tileForge.py` → `assets/tiles/<name>.webp`（零代码改动）
- ImageGen 要「透明底」时模型常交**画出来的假棋盘格**（浅灰≈215 / 米白≈245）→ 必须泛洪抠，判定阈值低于最暗那档（205/20）；构图按 **alpha 轮廓最大半径**（不是 bbox 对角线）
- `.flip-frame` 必须 `position:relative`（**不能** `absolute; inset:0`）；新加图片容器记得加进 `styles.css` 末尾兜底清单；**CSS 大段新增务必 grep 一次**
- **`SoftPet.jsx` 的 Edit 会静默失败，而且 `Grep` 对它失灵**：改完必须用 python 复核关键字符串
- **CDP 里操作 React 受控输入**：直接赋 `el.value` 会被 React 的 value tracker 当成「值没变」而**吞掉 onChange** →
  必须走原型原生 setter（`Object.getOwnPropertyDescriptor(HTMLInputElement/HTMLTextAreaElement.prototype,'value').set.call(el,v)`）
  再 `dispatchEvent(new Event('input',{bubbles:true}))`。**触发 `onBlur` 也是**：无头下 `el.blur()` 常是空操作，
  React 18 的 `onBlur` 挂在根容器的原生 `focusout` 上 → `el.focus()` + 派发冒泡的 `new FocusEvent('focusout',{bubbles:true})`。
  ⚠️ 这两条失灵时的症状**很像「应用的保存功能坏了」**，别据此改应用代码
- ⚠️ **「build 绿」不等于「接线对」**：esbuild 不查作用域，`onXxx={someCallback}` 里引用一个**从未定义**的函数
  照样构建成功，只在进到那个页面时才炸（2026-09-16：`recordJournal` 未定义，因为写在 `{screen==='ending' && …}` 里被 `&&` 短路，
  首页一直好的、只有结局页白屏）。**加/改回调 prop 后一定 grep 一遍定义**，并**真机走到那个页面**验一次
- ⚠️ **网络中断可能只丢「半个文件」**：一次中断后 `ArchiveScreen` 的 JSX 落了盘、import 和 state 没落盘 →
  `view`/`setView`/`JournalView` 全是 undefined，又是一例「build 绿、进页面才炸」。
  **别因为「文件里有新代码」就判定改动完整**，要逐个标识符核对（import / state / 用到的函数 / 路由 / props）
- 搜中文多关键词优先用 `Grep` 工具（bash `grep` 的 `\|` 交替在 macOS BSD grep 下常失配，会误报「没有」）

## 十、并行开发与规模红线

- ⚠️ **同一工作区可能被多个 agent 同时改**（2026-09-16 用户提醒）：动手前后 `ls -lat src/**` 按时间戳核查归属，确认双方**文件零重叠**；别人动过 `storage.js` / `main.jsx` 这类共用文件后，**必须用最新源码重新 build + 复验自己那几条**。本项目**没有 git**，并行改动没有任何版本保护 —— 多 agent 同时干活前先 `git init` + 提交一次基线
- ⚠️ **并行 agent 可能中途没 token 就停**（2026-09-16）：接手前先摸清半成品边界 —— 数据层做完没有？UI 做完没有？有没有接进路由？别把「已完成」当「未完成」重做一遍
- **规模红线**：用户明说「我们现在还比较小」+ 提过「产品确实多了点」→ **不要再开店或加新菜**；「每段时间出点新东西」的诉求由**惜食柜**承担；**不要再开新页面品类**；公益默认 30%、不鼓励全捐；任何新机制都要先问「它是否让核心那件事更值得回来」，过不了就是负债
