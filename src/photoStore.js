/**
 * photoStore —— 用户自己拍的那张照片，存在哪？
 *
 * 2026-09-16：用户明确了手账的照片来源 —— **不是** 项目里预先画好的商品图，
 * 而是「自己拍照上传后，展开来看就是这种」。所以手账里那张图必须是用户自己的照片。
 *
 * 为什么不直接塞 localStorage：
 *   手机拍的图动辄 3–5MB，而 localStorage 只有 ~5MB，且写满后 storage.js 里的
 *   `catch {}` 会**静默失败** —— 用户会以为存下了，其实第二天打开什么都没了。
 *   所以大图进 IndexedDB（没有 5MB 上限），localStorage 只留一张很小的缩略图。
 *
 * 分工：
 *   · IndexedDB（KeyPhoto DB）  → 原图（压缩到长边 1600 的 WebP），展开详情时读
 *   · localStorage 的 journal   → thumb（长边 180 的 WebP dataURL，约 4–8KB），日历格与列表直接同步渲染
 *
 * 缩略图放 localStorage 是刻意的：日历/列表是同步渲染的，不能为了一个格子去 await 一次 IDB。
 */

const DB_NAME = 'soft-life-photo-v1'
const STORE = 'photos'

/* ------------------------------ IndexedDB ------------------------------ */

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('这个浏览器不支持 IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('打不开相册'))
  })
  return dbPromise
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        let out
        try {
          out = fn(store)
        } catch (err) {
          reject(err)
          return
        }
        t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
  )
}

/** 存一张照片（Blob）。id 由 journal 条目持有。 */
export function putPhoto(id, blob) {
  if (!id || !blob) return Promise.resolve(false)
  return tx('readwrite', (store) => store.put(blob, id))
    .then(() => true)
    .catch(() => false)
}

/** 取一张照片，返回可直接喂给 <img src> 的对象 URL。取不到返回 null。 */
export function getPhotoUrl(id) {
  if (!id) return Promise.resolve(null)
  return tx('readonly', (store) => store.get(id))
    .then((blob) => (blob ? URL.createObjectURL(blob) : null))
    .catch(() => null)
}

export function deletePhoto(id) {
  if (!id) return Promise.resolve(false)
  return tx('readwrite', (store) => store.delete(id))
    .then(() => true)
    .catch(() => false)
}

/** 这本相册用了多少张、多少字节 —— 手账底部的诚实说明会用到 */
export function photoStats() {
  return openDb()
    .then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(STORE, 'readonly')
          const store = t.objectStore(STORE)
          const countReq = store.count()
          let bytes = 0
          const cursorReq = store.openCursor()
          cursorReq.onsuccess = () => {
            const cur = cursorReq.result
            if (cur) {
              bytes += cur.value?.size || 0
              cur.continue()
            }
          }
          t.oncomplete = () => resolve({ count: countReq.result || 0, bytes })
          t.onerror = () => reject(t.error)
        })
    )
    .catch(() => ({ count: 0, bytes: 0 }))
}

/* ------------------------------ 读图与压缩 ------------------------------ */

/**
 * 把 File / Blob 解成尺寸已知的位图。
 * `imageOrientation: 'from-image'` 必须带上 —— 否则手机竖着拍的照片会横过来
 * （EXIF 的旋转信息只有在解码时应用才有效）。
 */
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* 有些浏览器不认这个 option，退回默认解码 */
      try {
        return await createImageBitmap(file)
      } catch {
        /* 落到 <img> 兜底 */
      }
    }
  }
  // 兜底：HEIC 之类解不开的，这里会 reject，交给上层提示用户
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('这张图片的格式读不出来'))
      el.src = url
    })
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function drawTo(bitmap, maxEdge) {
  const sw = bitmap.width || bitmap.naturalWidth
  const sh = bitmap.height || bitmap.naturalHeight
  if (!sw || !sh) throw new Error('这张图片没有尺寸信息')
  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    // WebP 更小；但个别浏览器不认，会回 null —— 那就退回 JPEG，绝不让它变成一张空图
    canvas.toBlob(
      (blob) => {
        if (blob) resolve({ blob, type: 'image/webp' })
        else canvas.toBlob((b) => resolve({ blob: b, type: 'image/jpeg' }), 'image/jpeg', quality)
      },
      'image/webp',
      quality
    )
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * 一张上传的图 → { blob, thumb, width, height }
 *   · blob  长边 1600 的 WebP，进 IndexedDB
 *   · thumb 长边 180 的 WebP dataURL，进 journal（日历格贴的就是它）
 */
export async function preparePhoto(file, { maxEdge = 1600, quality = 0.85, thumbEdge = 180 } = {}) {
  const bitmap = await loadBitmap(file)
  const full = drawTo(bitmap, maxEdge)
  const { blob } = await canvasToBlob(full, quality)
  if (!blob) throw new Error('这张图片处理失败，换一张试试')

  let thumb = null
  try {
    const small = drawTo(bitmap, thumbEdge)
    const { blob: thumbBlob } = await canvasToBlob(small, 0.72)
    if (thumbBlob) thumb = await blobToDataUrl(thumbBlob)
  } catch {
    /* 缩略图失败不致命，展开时还有大图 */
  }

  if (bitmap.close) bitmap.close()
  return { blob, thumb, width: full.width, height: full.height }
}

/** 新照片的 id —— 只在「按下快门那一刻」生成一次，刷新后仍然指得回同一张 */
export function newPhotoId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
