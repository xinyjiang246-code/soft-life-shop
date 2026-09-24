// 团团的脸部锚点与取色（**自动量出来的，别手改**）
//
// 图片模式下五官是画死在图里的，要让「表情能变」只能在其上盖一层。
// 五个阶段的头在画面里各不相同，所以坐标逐阶段单独量。
//
// 生成：/Users/s/.workbuddy/binaries/python/envs/default/bin/python tools/petFace.py --species dog
//       （要 numpy，只有这个解释器装了；同时输出 预览截图/团团_脸部锚点_复核.png
//         —— 改了素材务必重跑并人眼复核）
//
// 坐标一律是**相对整张图的 0~1 归一化值**。容器宽高比 220:248 与素材 720:812 几乎一致，
// 且 .pet-photo img 是 object-fit: cover，所以直接乘容器尺寸即可，不需要额外换算。
// tilt = 两眼连线的倾角（度）。侧脸图两只眼睛不在一条水平线上，
// 表情元素要按这个角度跟着转，否则会像贴歪的贴纸。
// nose = 鼻子的中心。嘴的位置由 PetFace.jsx 从 nose 推算（鼻子下方、跟着 tilt 转）。
// furL/furR = 各自眼睛周围那一圈的毛色，盖眼睛时用它当底色（左右分开取，别用一个值）。

export const DOG_FACE_ANCHORS = {
  0: {
    eyeL: [0.3510, 0.3216],
    eyeR: [0.5713, 0.3216],
    eyeW: 0.0681, eyeH: 0.0591,
    nose: [0.4586, 0.3875],
    gap: 0.2203, tilt: -0.0,
    furL: '#E8D8C4', furR: '#E7D9C6',
  },
  1: {
    eyeL: [0.3899, 0.3185],
    eyeR: [0.5928, 0.3193],
    eyeW: 0.0590, eyeH: 0.0542,
    nose: [0.4894, 0.3834],
    gap: 0.2029, tilt: 0.2,
    furL: '#E7D7C3', furR: '#E6D8C4',
  },
  2: {
    eyeL: [0.3757, 0.3143],
    eyeR: [0.5748, 0.3155],
    eyeW: 0.0590, eyeH: 0.0517,
    nose: [0.4731, 0.3737],
    gap: 0.1991, tilt: 0.4,
    furL: '#EAD9C2', furR: '#EBDCC7',
  },
  3: {
    eyeL: [0.3707, 0.2740],
    eyeR: [0.5598, 0.2794],
    eyeW: 0.0660, eyeH: 0.0517,
    nose: [0.4614, 0.3695],
    gap: 0.1891, tilt: 1.9,
    furL: '#E4CCAE', furR: '#E3C9AC',
  },
  4: {
    eyeL: [0.3701, 0.2911],
    eyeR: [0.5624, 0.2911],
    eyeW: 0.0646, eyeH: 0.0523,
    nose: [0.4654, 0.3634],
    gap: 0.1923, tilt: -0.0,
    furL: '#E5CBAC', furR: '#E6CEB0',
  },
}

// 从原图里取的平均色（**别改成手写色值**：水彩扫描图的棕不是标准色，差一点就露馅）
export const DOG_FACE_INK = '#896549'        // 轮廓墨色
export const DOG_FACE_EYE = '#563F30'        // 眼珠色

/** 取某阶段的锚点；没有该阶段就退到最近的已知阶段 */
export function dogFaceAnchor(stage = 0) {
  const keys = Object.keys(DOG_FACE_ANCHORS).map(Number)
  if (keys.includes(stage)) return DOG_FACE_ANCHORS[stage]
  return DOG_FACE_ANCHORS[keys.reduce((a, b) => (Math.abs(b - stage) < Math.abs(a - stage) ? b : a), keys[0])]
}
