// 软软的脸部锚点与取色（**自动量出来的，别手改**）
//
// 图片模式下五官是画死在图里的，要让「表情能变」只能在其上盖一层。
// 五个阶段的头在画面里各不相同，所以坐标逐阶段单独量。
//
// 生成：python3 tools/petFace.py
//       （同时输出 预览截图/软软_脸部锚点_复核.png —— 改了素材务必重跑并人眼复核）
//
// 坐标一律是**相对整张图的 0~1 归一化值**。容器宽高比 220:248 与素材 720:812 几乎一致，
// 且 .pet-photo img 是 object-fit: cover，所以直接乘容器尺寸即可，不需要额外换算。
// tilt = 两眼连线的倾角（度）。侧脸图两只眼睛不在一条水平线上，
// 表情元素要按这个角度跟着转，否则会像贴歪的贴纸。
// furL/furR = 各自眼睛周围那一圈的毛色，盖眼睛时用它当底色（左右分开取，别用一个值）。

export const FACE_ANCHORS = {
  0: {
    eyeL: [0.4946, 0.4230],
    eyeR: [0.7308, 0.3854],
    eyeW: 0.0806, eyeH: 0.0394,
    mouth: [0.6319, 0.4591],
    gap: 0.2362, tilt: -10.2,
    furL: '#B4AAA2', furR: '#B8ADA7',
  },
  1: {
    eyeL: [0.5140, 0.3949],
    eyeR: [0.7524, 0.3490],
    eyeW: 0.0563, eyeH: 0.0671,
    mouth: [0.6598, 0.3930],
    gap: 0.2384, tilt: -12.3,
    furL: '#CCC0B8', furR: '#BCB2AA',
  },
  2: {
    eyeL: [0.5120, 0.3948],
    eyeR: [0.7507, 0.3486],
    eyeW: 0.0563, eyeH: 0.0677,
    mouth: [0.6584, 0.3931],
    gap: 0.2387, tilt: -12.3,
    furL: '#CEC0B4', furR: '#B1A49E',
  },
  3: {
    eyeL: [0.4982, 0.3434],
    eyeR: [0.6862, 0.3109],
    eyeW: 0.0451, eyeH: 0.0548,
    mouth: [0.6127, 0.3512],
    gap: 0.1881, tilt: -11.0,
    furL: '#CEC3BA', furR: '#B6ADA2',
  },
  4: {
    eyeL: [0.5426, 0.3387],
    eyeR: [0.7228, 0.3100],
    eyeW: 0.0424, eyeH: 0.0517,
    mouth: [0.6519, 0.3427],
    gap: 0.1802, tilt: -10.2,
    furL: '#C8C0B4', furR: '#BCB1A9',
  },
}

// 从原图里取的平均色（**别改成手写色值**：水彩扫描图的棕不是标准色，差一点就露馅）
export const FACE_INK = '#625044'        // 轮廓墨色
export const FACE_EYE = '#796053'        // 眼珠色

/** 取某阶段的锚点；没有该阶段就退到最近的已知阶段 */
export function faceAnchor(stage = 0) {
  const keys = Object.keys(FACE_ANCHORS).map(Number)
  if (keys.includes(stage)) return FACE_ANCHORS[stage]
  return FACE_ANCHORS[keys.reduce((a, b) => (Math.abs(b - stage) < Math.abs(a - stage) ? b : a), keys[0])]
}
