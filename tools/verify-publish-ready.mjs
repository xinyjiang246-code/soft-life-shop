#!/usr/bin/env node
/**
 * verify-publish-ready.mjs —— 「出门前」那几件的守卫。
 *
 * 为什么要有它：安全区 / dvh / 图标 / 相对路径这几件**在电脑上全都看不出来**，
 * 坏了也只是手机上差一点，人不会察觉。而它们各自有个「半边生效」的坑：
 *   - 只写 env(safe-area-inset-*) 不写 viewport-fit=cover → env() 恒为 0，等于没写；
 *   - 图标写成 /favicon.png（绝对路径）→ 本地好、放到 GitHub Pages 的 /<repo>/ 下 404；
 *   - CSS 里塞回 100vh → iOS Safari 多出一截假滚动。
 * 这三条都在这里断死。
 *
 * 用法：node tools/verify-publish-ready.mjs            （读 dist/，先 npm run build）
 *      node tools/verify-publish-ready.mjs --dir published-site
 * 不需要浏览器，秒级。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dirIdx = argv.indexOf('--dir');
const DIST = resolve(ROOT, dirIdx >= 0 ? argv[dirIdx + 1] : 'dist');

let failed = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { failed++; console.log(`  ❌ ${m}`); };

function section(name) { console.log(`\n[${name}]`); }

// ---------------------------------------------------------------- 前置
section('0 前置：产物存在');
if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`  ❌ 找不到 ${DIST}/index.html —— 先 npm run build`);
  process.exit(1);
}
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// 先证明读到的确实是我们的产物（防「路径错了但断言全过」的假绿）
if (!html.includes('慢活小铺')) {
  console.error('  ❌ index.html 里读不到「慢活小铺」—— 读到的可能不是本项目产物');
  process.exit(1);
}
const cssName = readdirSync(join(DIST, 'assets')).find((f) => f.endsWith('.css'));
if (!cssName) { console.error('  ❌ assets/ 下没有 .css'); process.exit(1); }
const css = readFileSync(join(DIST, 'assets', cssName), 'utf8');
if (!css.includes('.bottom-bar')) {
  console.error('  ❌ CSS 里读不到 .bottom-bar —— 可能读错了文件');
  process.exit(1);
}
ok(`产物就位（css ${(statSync(join(DIST, 'assets', cssName)).size / 1024).toFixed(0)}KB）`);

// ---------------------------------------------------- 1 安全区两半都写了
section('1 安全区：viewport 与 CSS 必须同时存在');
if (html.includes('viewport-fit=cover')) ok('viewport 带 viewport-fit=cover');
else bad('viewport 缺 viewport-fit=cover → env(safe-area-inset-*) 恒为 0，CSS 那几处 calc 全白写');

if (/env\(safe-area-inset-bottom/.test(css)) ok('CSS 里有 env(safe-area-inset-bottom)');
else bad('CSS 里没有 env(safe-area-inset-bottom)');

if (/env\(safe-area-inset-top/.test(css)) ok('CSS 里有 env(safe-area-inset-top)');
else bad('CSS 里没有 env(safe-area-inset-top)（顶栏会钻到刘海底下）');

// ------------------------------------------------- 2 底栏真的吃到了变量
section('2 底栏与页面留白：必须真的用上 --safe-b');
const barBlock = css.match(/\.bottom-bar\{[^}]*\}/);
if (!barBlock) bad('找不到 .bottom-bar 规则');
else if (barBlock[0].includes('var(--safe-b')) ok('.bottom-bar 的 padding 用了 var(--safe-b)');
else bad('.bottom-bar 没吃 --safe-b（home indicator 会压住按钮）');

const shopBlock = css.match(/\.shop-page\{[^}]*\}/);
if (!shopBlock) bad('找不到 .shop-page 规则');
else if (shopBlock[0].includes('var(--safe-b')) ok('.shop-page 的 padding-bottom 同步加了 --safe-b');
else bad('.shop-page 没同步加 --safe-b（底栏顶高后最后一行会被盖住）');

// ------------------------------------------------------------- 3 dvh
section('3 高度：必须用 dvh，别退回 100vh');
// ⚠️ 断言的是「压缩后的产物」，不是源码。压缩器会把同属性的前一行删掉，
// 所以「100vh 兜底 + 100dvh 修正」两行写在源码里也没用 —— 产物里只剩最后一行。
// 真正要防的是有人把 dvh 改回 100vh（iOS Safari 上会多出一截假滚动）。
for (const sel of ['.page-shell', '.shop-page']) {
  const block = css.match(new RegExp(`\\${sel.slice(0, 1)}${sel.slice(1)}\\{[^}]*\\}`))?.[0] || '';
  if (!block) { bad(`找不到 ${sel} 规则`); continue; }
  const height = block.match(/min-height:([^;]+)/)?.[1] || '';
  if (!height) bad(`${sel} 没有 min-height`);
  else if (height.includes('dvh')) ok(`${sel} 用 dvh（min-height:${height}）`);
  else bad(`${sel} 的 min-height 是 ${height} —— 必须是 dvh，100vh 在 iOS 上会多出假滚动`);
}
if (/min-height:100vh/.test(css)) bad('产物里仍有 min-height:100vh');
else ok('产物里没有 min-height:100vh');

// ------------------------------------------------- 4 图标 / manifest
section('4 图标与主屏入口');
const need = ['favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
              'icon-maskable-512.png', 'manifest.webmanifest'];
for (const f of need) {
  if (existsSync(join(DIST, f))) ok(`${f} 在产物里`);
  else bad(`产物里缺 ${f} —— 跑一下 tools/makeIcon.py`);
}
for (const [label, re] of [
  ['rel="icon"', /rel="icon"/],
  ['apple-touch-icon', /rel="apple-touch-icon"/],
  ['manifest', /rel="manifest"/],
]) {
  if (re.test(html)) ok(`index.html 声明了 ${label}`);
  else bad(`index.html 少了 ${label} 声明`);
}
try {
  const mf = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'));
  if (Array.isArray(mf.icons) && mf.icons.length >= 3) ok(`manifest 合法，icons ${mf.icons.length} 个`);
  else bad('manifest 里 icons 少于 3 个');
  if (mf.display === 'standalone') ok('manifest display=standalone（加到主屏幕会当独立应用打开）');
} catch (e) {
  bad(`manifest 不是合法 JSON：${e.message}`);
}

// ------------------------------------------- 5 必须全是相对路径
section('5 相对路径：base 是 ./，不能出现 / 开头的资源');
const abs = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
if (abs.length === 0) ok('index.html 里没有以 / 开头的 href/src');
else bad(`出现绝对路径（放 /<repo>/ 子路径下会 404）：${abs.join(', ')}`);

// ------------------------------------------- 6 线上产物不能带本地地址
section('6 本地地址泄漏');
const leaks = [...css.matchAll(/127\.0\.0\.1|localhost:\d+/g)].map((m) => m[0]);
if (leaks.length === 0) ok('CSS 里没有 127.0.0.1 / localhost');
else bad(`CSS 里混进了本地地址：${[...new Set(leaks)].join(', ')}`);

// ------------------------------------------------------------- 汇总
console.log('');
if (failed === 0) {
  console.log('✅ verify-publish-ready：全部通过');
  process.exit(0);
} else {
  console.log(`❌ verify-publish-ready：${failed} 条不通过`);
  process.exit(1);
}
