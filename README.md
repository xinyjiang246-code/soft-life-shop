# 慢活小铺 · Soft Life

一份**不会真的送来的外卖**。

你不饿，或者刚吃完，但还是想点一次外卖 —— 想点的其实不是那份食物，是「下单」这个动作本身。
在这里你可以完整地点一次：挑店、加购、结算、催单、等骑手骑过来。食物不会被真的消耗，
也没人给你送；你想花的那点钱，按 **100g 猫粮 / 元** 换算，由你自己转给投喂点或救助小店。

**没有后端、没有账号、没有服务器。** 所有状态都在你自己的浏览器里（localStorage + IndexedDB），
换一台设备就是一家全新的小铺。产品上线时定位就写死了：这是一个**面向陌生人的开放产品**，
走「一个人的仪式」，不做社群、不做排行榜、不做社交。

---

## 三条不妥协的规矩

这个仓库里最值得看的不是代码，是下面三条 —— 它们决定了它和别的「假装点外卖」的东西不一样：

1. **时间是唯一真实的资源。** 每天有 10 分钟「慢活额度」，等一份外卖真的要好几分钟。
   想快进可以，但要按分钟扣额度；而且**快进过的那一单拿不到等待凭证**。
2. **钱是真的要出去的，但不是我们收。** App 只做换算和记账，转账由你自己走。
   所以它**绝不说「我们替你捐了」**，也**绝不会在你真的按下捐赠之前显示任何克数**。
3. **不打卡、不设目标、不做趋势图、不催单。** 它不打算让你「坚持」，只想让你用完就走。

> 这三条是设计红线，不是功能说明。想改这个仓库，请先读它们 ——
> 很多看起来「更合理」的改法（加个进度条、加个「仅剩 3 件」、把等待缩短）
> 正好会把这三条拆掉。

---

## 跑起来

```bash
npm install
npm run dev            # 本地开发，默认 http://localhost:5173
npm run build          # 产物在 dist/
```

`dist/` 是纯静态文件，任何静态托管都能放（Vercel / Cloudflare Pages / GitHub Pages / Netlify）。

⚠️ **别直接双击 `dist/index.html`** —— `file://` 协议下会是白屏，必须从服务端打开：

```bash
cd dist && python3 -m http.server 8080 --bind 127.0.0.1
```

## 结构

```
src/
  screens/       每一屏（home → counter → cart → checkout → delivery → ending → charity）
  components/    ItemArt（商品图）/ FlipImage（翻面）/ WaitReceipt（等待凭证）等
  data.js        6 家店与商品；CHARITY 换算（100g/元）
  storage.js     localStorage 键与容错（写满会静默失败，所以有降级）
  petTouch.js    猫的分部位反应（6 个部位 / 7 个表情，三只猫共用）
  today.js       首页「今天」的聚合层（不新增存储，只读已有的）
  receiptImage.js 把等待凭证画成可下载的 PNG
tools/           回归守卫（verify-*.mjs）与出图脚本
public/          图标（由 tools/makeIcon.py 生成）
```

技术栈：React + Vite，除 `react` / `react-dom` / `lucide-react` 外无依赖，无后端。

## 已知取向（有意为之，不是没做完）

- 不做账号、不做云同步：**换设备就是新的小铺**，这是设定的一部分。
- 商品图分「实拍 / 手绘」两面，翻面切换；生成的随机种子只来自 `(城市, 批次, 日期)`，**不用当前时间** ——
  所以同一个日子打开，看到的永远是同一份菜单。
- 手账里的照片是用户自己拍的，只存在本机 IndexedDB 里；**删条目时会连照片一起删**。

## 许可

尚未选定开源许可证，在选定之前版权归作者所有（All rights reserved）。
如果你希望别人可以复用，需要先加一份 `LICENSE`（MIT / CC BY-NC 等）。

---

### What is this (EN)

A fake food-delivery app that **never delivers anything**. You go through the whole ritual —
pick a shop, fill a cart, check out, wait for the rider — but no food is consumed and no
money changes hands through the app. What you would have spent is converted into cat food
(100 g per ¥) for you to donate yourself. Two things are real: **the waiting** (a daily
10-minute budget, and skipping ahead costs you the receipt) and **the money, which leaves
your own hand** — the app only does the maths.
