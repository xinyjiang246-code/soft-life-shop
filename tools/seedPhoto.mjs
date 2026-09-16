// 「用户上传的那张照片」这个测试素材，统一从这里取。
//
// ⚠️ 起因（2026-09-17）：原来三个脚本各自用 canvas 画一张合成图（渐变 + 绿椭圆）塞进 input。
//    功能上没问题，但那张图会一路进到**交付图**里 —— 用户看到只会问「这个图是啥」。
//    给人看的图里，素材本身就得一眼认得出是食物。
//
// 现在用项目**自带的真照片**（`src/assets/matcha-archive-example.webp`，一张抹茶拿铁的竖图）：
//   · 一眼认得出是食物 —— 交付图能直接给人看
//   · 竖图 + WebP，和真手机照片同类，走的是同一条 读图 → 压图 → 存 IndexedDB 的路径
//   · 从 `dist/assets/` 里按**前缀**找哈希名，**不硬编码 hash**（hash 每次构建都会变）
//   · 宽高由页面自己量出来返回，断言拿它当期望值 —— 换素材不用改断言
import { readdir } from 'node:fs/promises'

const ASSET_PREFIX = /^matcha-archive-example.*\.webp$/

/** 上传后落在手账里的名字（交付图里会显示） */
export const SEED_NAME = '窗边那杯抹茶拿铁.webp'

/** 在 dist/assets 里找到那张真照片，返回页面可直接 fetch 的相对 URL */
export async function findSeedAsset(assetDir = new URL('../dist/assets/', import.meta.url)) {
  const files = await readdir(assetDir)
  const hit = files.find((f) => ASSET_PREFIX.test(f))
  if (!hit) {
    throw new Error(
      `dist/assets 里找不到 matcha-archive-example（先 \`npm run build\`；当前 ${files.length} 个文件）`,
    )
  }
  return `assets/${hit}`
}

/**
 * 返回一段可直接丢给 `Runtime.evaluate` 的代码：把真照片塞进 file input，并触发 change。
 *
 * 返回 `{ 素材, 名称, 字节, 类型, 宽高 }`。`宽高` 是在页面里量出来的真实尺寸，
 * 断言直接拿它当期望值（别在脚本里硬编码 1200×1200 这种数 —— 换素材会假红）。
 */
export function seedPhotoScript({ assetUrl, inputSelector }) {
  const asset = JSON.stringify(assetUrl)
  const input = JSON.stringify(inputSelector)
  const name = JSON.stringify(SEED_NAME)
  return `(async () => {
    const res = await fetch(${asset})
    if (!res.ok) throw new Error('取不到测试素材 ' + ${asset} + ' → HTTP ' + res.status)
    const blob = await res.blob()
    // 先在页面里量一遍真实尺寸：断言拿它当期望值，素材换了断言不用跟着改
    const probe = new Image()
    const url = URL.createObjectURL(blob)
    probe.src = url
    await new Promise((ok, no) => { probe.onload = ok; probe.onerror = () => no(new Error('素材解不开')) })
    const 宽高 = [probe.naturalWidth, probe.naturalHeight]
    URL.revokeObjectURL(url)
    const file = new File([blob], ${name}, { type: blob.type })
    const el = document.querySelector(${input})
    if (!el) throw new Error('找不到 file input：' + ${input})
    const dt = new DataTransfer()
    dt.items.add(file)
    el.files = dt.files
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { 素材: ${asset}, 名称: file.name, 字节: blob.size, 类型: blob.type, 宽高 }
  })()`
}
