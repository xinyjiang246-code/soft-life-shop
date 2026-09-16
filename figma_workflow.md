# 虚拟外卖模拟器 · Figma 设计工作流（风格可控的 Hybrid 方案）

> 配套文档：`V1_PRD.md`（做什么）· `frontend_design_spec.md`（长什么样·数值真源）· `vibe_coding_guide.md`（怎么写代码）
> 本文件解决：**怎么在 Figma 里把视觉风格锁死，再可控地交给代码**。

---

## 一、为什么不全用 AI 生成

纯 vibe coding 每次 prompt 都会重新"想象"视觉，导致：

- 配色 / 圆角 / 间距在迭代中**漂移**
- 7 个页面之间**对不齐**
- 你很难精确表达"就要这个感觉"

**Figma 的价值**：在写任何代码之前，把视觉语言固化在**一份文件 + 一套 Variables** 里。AI 只负责"实现"，不再负责"定义风格"——风格漂移从源头消失。

**核心原则**：Figma 做"真源"（source of truth），代码做"实现"。

---

## 二、Figma 文件结构（一个文件，四个 Page）

| Page | 内容 |
|------|------|
| `🎨 Design Tokens` | 所有颜色 / 字体 / 圆角 / 间距变量集中展示 + 说明 |
| `🧩 Components` | 按钮、卡片、标签、底部导航等可复用组件 |
| `📱 Screens` | 7 个高保真屏幕 |
| `📐 Handoff` | 给开发/AI 的标注页（或直接用 Dev Mode 替代） |

> 时间紧时 `Components` 可精简，但 `Design Tokens` + `Screens` 必做。

---

## 三、Design Tokens（建进 Figma Variables，不要写死）

把所有数值建成 **Variable**（而非硬编码色值），改一处全局更新。数值**原样复用** `frontend_design_spec.md`，二者就是同一套。

### Color — Primitive（基础色）
| 变量名 | Hex | 用途 |
|--------|-----|------|
| `cream` | `#FBF7F0` | 页面底色 / 卡片底 |
| `apricot` | `#EDB892` | 主色（浅杏橙，非高饱和） |
| `apricot-soft` | `#F6E2D2` | 主色浅版 / hover |
| `matcha` | `#C9D8BE` | 辅助色（淡抹茶） |
| `coral` | `#E89B7D` | 仅用于满减高亮（柔珊瑚） |
| `ink` | `#4A4540` | 正文文字（暖棕黑） |
| `ink-soft` | `#8A8178` | 次要文字 / 占位 |

### Color — Semantic（语义色，绑定到 Primitive）
| 变量名 | 绑定 |
|--------|------|
| `bg` / `surface` | → cream |
| `primary` | → apricot |
| `accent` | → matcha |
| `promo`（满减） | → coral |
| `text` | → ink |
| `text-muted` | → ink-soft |

### Number
- 圆角：`radius-sm 10` / `radius-md 16` / `radius-lg 18` / `radius-pill 999`
- 间距：`space-1 4` / `space-2 8` / `space-3 12` / `space-4 16` / `space-6 24`
- 字号：`fs-caption 12` / `fs-body 14` / `fs-title 16` / `fs-heading 20` / `fs-display 24`

### Typography（建 Text Style）
- 中文：`PingFang SC`；英文 / 数字：`Quicksand`（软萌圆体感来源）
- 样式：`title` / `heading` / `body` / `caption`，全部引用上面的字号与颜色变量

---

## 四、Components（至少做这些，全部绑定 Variables）

| 组件 | 要点 |
|------|------|
| `Button` | primary（apricot 底）/ ghost（描边）/ promo（coral 底，仅满减） |
| `StoreCard` | 店名 + emoji + 满减 Chip + 配送时长 |
| `MenuItem` | emoji + 名称 + 价格 + 加购按钮 |
| `CartRow` | 缩略 + 名称 + 数量步进 + 小计 |
| `Chip` | 天气 / 满减 / 标签，全圆角 |
| `BottomNav` | 首页 / 订单 / 我的，3 项 |
| `Dialog` | 首页情绪引导弹窗（圆角 18、轻阴影） |
| `DeliveryStep` | 配送进度步骤条（接单→备餐→取餐→配送） |

> 关键：**组件内颜色全部用 Semantic 变量**，不要直接填 hex。这样换肤 / 调色只改 Variables。

---

## 五、7 屏设计清单（Screens Page，用 Components 搭，勿手画矩形）

1. **首页情绪引导** — 弹窗文案 + 柔和背景插画占位
2. **店铺列表** — 卡片流 + 顶部虚拟天气条（☀️🌧️⛈️💨）
3. **店铺菜单** — MenuItem 列表 + 店铺头图
4. **购物车** — 满减进度条（接近满减时 Coral 高亮）
5. **下单确认** — 虚拟小屋名输入（橘子小屋 / 云朵小窝）
6. **配送动态** — DeliveryStep + 恶劣天气 UI 变化占位
7. **结局彩蛋** — 自嘲线 / 暖心线两版布局

每屏只用上面建的 Components，保证七屏天然一致。

---

## 六、图标策略

- **菜品图标**：直接用 emoji（🍔🍜🍰🥗）——零成本、天然圆润、截图好看，契合"圆润 emoji 插画"定位。
- **UI 功能图标**：Figma Community 搜 **Lucide** 找现成文件，或装 Lucide Figma 插件；统一描边 1.5、圆角端点，和前端 `lucide-react` 一一对应（`ShoppingCart` / `Gift` / `Sun` / `CloudRain` / `Bike` 等）。
- **天气**：☀️🌧️⛈️💨 直接文本。

---

## 七、Figma → 代码（三条路，按你对控制的渴选）

### 路径 A：Figma → 导出代码插件（控制最强）
- **Locofy** / **Anima**：Figma 直接导出 React + CSS，像素级还原。
- 适合："我画的什么样，网页就什么样"。
- 代价：导出代码需二次整理，但**风格不会漂**。

### 路径 B：Figma Dev Mode → 喂给 AI 工具（最平衡，推荐）
- 在 Figma 开 **Dev Mode**，复制每个组件的精确数值（padding / color / size / radius）。
- 把 **截图 + 这些数值 + `frontend_design_spec.md`** 一起给 Cursor / Lovable / v0。
- AI 只填空实现，不再定义风格 → 漂移被锁死。

### 路径 C：Figma 当参考图（最轻，仍有漂移风险）
- 截图 7 屏，给 AI "照这个做"。
- 适合快速原型，但迭代多了仍可能漂。

**建议**：你本就担心风格，选 **A 或 B**。A 最稳但需学插件；B 最平衡，且能直接复用你已有的 spec doc 当"契约"。

---

## 八、最小可行 Figma 投入（时间紧时）

只做两件事也能大幅控风格：
1. 建 `Design Tokens` 页 + Variables（约 30 分钟）
2. 用 Components 把 7 屏搭出高保真（约 2–3 小时）

跳过完整组件库、跳过复杂交互态，后期再补。

---

## 九、和已有文档的关系（一处改，处处更新）

- `V1_PRD.md` → 决定"做什么"
- `frontend_design_spec.md` → 决定"长什么样"（数值真源）
- **`figma_workflow.md`（本文件）** → 决定"怎么在 Figma 锁死风格 + 怎么交给代码"
- `vibe_coding_guide.md` → 决定"怎么写代码"

**铁律**：把 `frontend_design_spec.md` 的数值**原样**建成 Figma Variables，二者同一套。以后调风格只改 Figma Variables（或 spec doc 同步改），代码侧用 Dev Mode 重新取值即可，不再漂移。
