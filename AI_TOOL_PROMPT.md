# 慢活小铺 · Soft Life — AI 编程工具可直接粘贴的 Prompt

> **用法**：打开 Lovable / Bolt.new / v0，把下面的「PROMPT 正文」整段复制粘贴进对话框（建议搭配 `references/13-慢活小铺_UI_mockup_电商无手版.png` 等参考图一起上传）。工具会自动生成可预览、可部署的网页原型。
> 这份 prompt 是**自包含**的——AI 工具不需要读本项目其他文件也能跑。
> 推荐先用它出 7 页空壳 + 假数据，确认气质对后再逐屏迭代（见 `vibe_coding_guide.md` 八步法）。

---

## PROMPT 正文（从下面开始复制）

```
Build a mobile-first web app called "慢活小铺 · Soft Life" (Soft Life Shop) — a fictional, zero-purchase "healing lifestyle shop" where users browse and virtually order aesthetic food & slow-life items. The vibe is 2000s East Asian retro healing × white-girl "soft life" aesthetic, but ELEVATED and MATURE (Kinfolk / Cereal magazine editorial / a quiet lifestyle boutique), NOT childish, NOT overly pink, NO kawaii faces.

=== TECH ===
React + Vite + Tailwind CSS (or your default stack). Mobile-first (max-width ~430px centered on desktop). Client-side only, NO backend, NO accounts. Use localStorage for cart & virtual house name. Use lucide-react for UI icons. Use a fake menu data array (no API).

=== DESIGN TOKENS (CSS variables) ===
Colors:
--bg-base: #F6F1E8;   /* oatmeal beige, add a barely-visible paper+linen grain overlay (opacity ≤3%) */
--surface: #FCFBF7;   /* ivory */
--primary: #E4C6A8;   /* oatmeal apricot */
--matcha:  #B8C6AC;   /* sage green — signature color for tea / life-aesthetic corner / success states */
--primary-soft: #EDE2D3;
--cream-cake: #EDE4D3;
--clay: #C28A70;      /* terracotta — life-aesthetic / warm-food accent */
--butter: #E8D8A8;    /* muted gold accent, sparingly */
--soft-pink: #EAC5C8; /* ONLY tiny accent on ritual cards, never large areas */
--caramel: #9F7F5F;  /* borders / old-UI frames */
--text-main: #4A4540;
--text-sub: #8D867C;
--divider: #E8E1D4;

Typography:
- Chinese: "PingFang SC", "Microsoft YaHei", sans-serif
- English brand / product NAMES: elegant SERIF — "Cormorant Garamond", "Playfair Display", or "Canela" (via Google Fonts). e.g. brand "Soft Life", product "VINTAGE CAKE".
- English body / numbers: "Quicksand" or "Nunito", rounded but grown-up.
- Product codes in small-caps mix: "PRODUCT 01".
- Body 15–16px, line-height 1.6. Brand/large titles 28–32px.

Shape & depth:
- Product cards: 8–12px radius, NO heavy shadow (use 0 2px 10px rgba(74,69,64,0.05)).
- Buttons: 12px radius. Pills/tags: full round (999px).
- Generous whitespace; optional caramel thin old-window border as accent.

=== LAYOUT / PAGES (7 screens, with routing) ===

1) HOME (mood + product grid)
- Top nav: hamburger (left) + centered serif brand "Soft Life" + search / wishlist-heart / cart icons (right), thin restrained line icons.
- Full-width HERO banner: ONLY food & drink STILL LIFE, NO hands/arms/body — a matcha latte, an iced americano bottle, a slice of vintage cream cake, a linen journal, flatlay on oatmeal linen. Soft natural light, film grain.
- Below: a "PRODUCTS 10/10" heading (small-caps mix), then a TWO-COLUMN product grid. Each card: square food still-life image (NO hands) + "PRODUCT 01" code + serif product name (e.g. VINTAGE CAKE) + price (¥) + a circular plus button on the right.

2) COUNTER LIST (from hamburger menu)
- Vertical scroll of 4 counter cards. Each: a small food still-life thumbnail (NO hands) + counter name + a pill tag (e.g. "满20-15" in clay, or "独立小店" in sage) + small meta "⏱ 25分钟 · 📍 1.2km". 4 sections subtly tinted: tea=sage, bento=clay, dessert=cream-cake, life-aesthetic=ivory. Tap → enters counter.

3) COUNTER DETAIL / MENU
- Top: back arrow + centered serif counter name + cart icon.
- Full-width hero still life of that counter's items (NO hands).
- Horizontal category tabs (e.g. 全部 / Matcha / 咖啡 / 奶茶) with sage underline on active.
- Two-column product grid (same card style as home). Life-aesthetic counter categories: 香薰 / 手账 / 运动 / 居家.

4) AESTHETIC CART (My Aesthetic Cart)
- List of added items: square food still-life thumb (NO hands) + serif name + price + Minus/Plus stepper + subtotal.
- A thin sage progress bar: "再凑 ¥X 享 满20-15".
- A surprise drop card (clay/oatmeal bg + Sparkles icon): "今日掉落：复古贴纸 ✨" (randomly appears, no action needed).
- Bottom fixed bar: total + primary checkout button.

5) CHECKOUT / VIRTUAL ADDRESS
- Only one field: "虚拟小屋名称" (e.g. placeholder "橘子小屋"). Plus decorative address text (e.g. "云端 3 巷 7 号"), NO validation. Small note: "无需真实信息" in text-sub.

6) DELIVERY / MAKING
- Vertical 4-step timeline: 接单 → 备餐 → 取餐 → 配送中. Completed steps = sage filled dot + check; current = pulsing dot; future = text-sub.
- Weather icon (sun/light-rain) + ETA "预计 30 分钟". (Use a RANDOM virtual weather on each order; bad weather adds time + a subtle gray overlay.)

7) ENDING (soft-life easter egg)
- Centered card: still-life illustration of a vintage cream cake + a small flower branch (NO hands). Serif copy: "今天你把自己照顾得很好，that's the soft life 🤍" (or a self-aware line: "其实你今天根本不饿——但你已完整拥有了挑选它的快乐 ✨"). Button "再来一单".

=== FEATURES (fake data, client-side) ===
- Fake menu: 4 counters, ~3 items each (12 total). Items: 茶饮暖饮铺 (matcha拿铁/冰美式/樱花奶绿), 便当暖食柜 (铝制分格便当/韩式便当盒/中式营养碗), 怀旧甜点柜 (复古奶油蛋糕/裱花蛋糕/铜锣烧), 生活美学角 (香薰蜡烛/感恩手账/pilates小垫). Each item: id, name(中), nameEn, price¥, counter, image(use a calm food still-life placeholder / emoji-free illustration).
- Cart: add/qty/remove, subtotal, automatic 满减 (some counters 满20-15 / 满30-18), persisted in localStorage.
- Random drop: on cart/checkout, randomly show the sticker drop card.
- Virtual weather: random per order, affects ETA + UI overlay.
- (V1.5 placeholder) Photo upload: a "拍一张" entry in a future "我的" tab that opens camera/album, stores locally only — you may stub this with a button + note for now.

=== STRICT "DO NOT" ===
NO high-saturation orange/red. NO hard shadows. NO realistic photos. NO information crowding / Taobao-style shelves. NO cold SaaS/tech look. NO large soft-pink areas. NO kawaii / cartoon faces / smiling food. NO hands/arms/body parts in any hero or product image. Keep it calm, muted, editorial, generous whitespace.

=== FIRST OUTPUT ===
Generate the 7 empty screens + routing + global CSS tokens + fake menu data, runnable, with placeholder still-life images (use neutral food illustration placeholders or a muted solid color block with the item name — NOT photos, NOT emoji faces). Then I will iterate screen by screen.
```

---

## 附：如果你想一次只出一页（更稳）

把上面 PROMPT 正文末尾的「FIRST OUTPUT」改成对应页面，例如只做首页：
```
Generate ONLY the HOME screen (screen 1 above) with the full design tokens, using fake menu data, runnable and mobile-first. I'll ask for the other screens next.
```

## 附：参考图（建议一并上传给工具）
- `references/13-慢活小铺_UI_mockup_电商无手版.png` — 首页风格锚点
- `references/15-柜台详情页.png` — 柜台/菜单页
- `references/16-美学购物篮页.png` — 购物篮页
- `references/17-配送结局页.png` — 配送/结局页
- `references/11-白女生活美学_moodboard_成熟版.png` — 整体氛围
