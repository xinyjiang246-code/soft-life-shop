// 颜色工具：主色提取 + 颜色命名 + 距离计算
// 被 ArchiveScreen（食物存档）与 MyShopScreen（我的小店）共用

// Canvas 提取主色：缩到 48x48 后做桶聚类
// 关键：优先统计「彩色且亮度适中」的像素，避免白色餐盘/浅色桌面吃掉主色
export async function extractPalette(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const size = 48
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data

        const colorBuckets = {}   // 只装彩色像素（首选）
        const allBuckets = {}     // 全部像素（兜底）
        let colorCount = 0
        let total = 0

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const sat = max === 0 ? 0 : (max - min) / max
          const lum = r * 0.299 + g * 0.587 + b * 0.114

          const key = `${Math.round(r / 40) * 40},${Math.round(g / 40) * 40},${Math.round(b / 40) * 40}`
          total++

          if (!allBuckets[key]) allBuckets[key] = { r: 0, g: 0, b: 0, n: 0 }
          allBuckets[key].r += r; allBuckets[key].g += g; allBuckets[key].b += b; allBuckets[key].n++

          if (sat > 0.15 && lum > 35 && lum < 232) {
            colorCount++
            if (!colorBuckets[key]) colorBuckets[key] = { r: 0, g: 0, b: 0, n: 0 }
            colorBuckets[key].r += r; colorBuckets[key].g += g; colorBuckets[key].b += b; colorBuckets[key].n++
          }
        }

        const useColor = colorCount / total > 0.06 && Object.keys(colorBuckets).length > 0
        const source = useColor ? colorBuckets : allBuckets

        const sorted = Object.values(source)
          .sort((a, b) => b.n - a.n)
          .slice(0, 6)
          .map(b => ({ hex: rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n), n: b.n }))

        const swatches = []
        for (const s of sorted) {
          if (!swatches.some(existing => hexDistance(existing, s.hex) < 40)) swatches.push(s.hex)
          if (swatches.length >= 4) break
        }
        while (swatches.length < 4) swatches.push(swatches[swatches.length - 1] || '#E4C6A8')

        const dominant = swatches[0]
        resolve({ swatches, dominant, mood: moodForColor(dominant), colorful: useColor })
      } catch (e) {
        resolve(FALLBACK_PALETTE)
      }
    }
    img.onerror = () => resolve(FALLBACK_PALETTE)
    img.src = dataUrl
  })
}

export const FALLBACK_PALETTE = {
  swatches: ['#E4C6A8', '#B8C6AC', '#E8D4D0', '#F6F1E8'],
  dominant: '#E4C6A8',
  mood: '温柔米色',
  colorful: false,
}

export function hexDistance(a, b) {
  const d = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
  const x = d(a), y = d(b)
  return Math.sqrt((x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2)
}

export function rgbToHex(r, g, b) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

export function hexToRgb(hex) {
  const h = (hex || '#E4C6A8').replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  }
}

export function moodForColor(hex) {
  const { r, g, b } = hexToRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  const lum = r * 0.299 + g * 0.587 + b * 0.114

  if (sat < 0.12) {
    if (lum > 210) return '干净米白'
    if (lum < 90) return '沉稳深棕'
    return '温柔灰调'
  }
  if (g > r && g > b) return lum < 120 ? '森林绿意' : '治愈绿意'
  if (r > g && r > b) {
    if (b > g) return '柔粉午后'
    if (r - g > 60) return '暖橘焦糖'
    return '温暖杏色'
  }
  if (b > r && b > g) return lum > 170 ? '雾蓝午后' : '静谧深蓝'
  return '温柔米色'
}
