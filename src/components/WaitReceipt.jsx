import { useState } from 'react'
import { Check, Download, Scissors } from 'lucide-react'
import { saveReceiptImage } from '../receiptImage.js'

/**
 * 等待凭证（2026-09-18）。
 *
 * 这是这个铺子唯一别人抄不走的东西：别家都在假装（假针、假外卖、假里程），
 * 只有「等」是我们让人**真的**花掉的。所以这张纸**只在等满时开**，快进买不到 ——
 * 不是惩罚，是它的全部意义：能买到的，就不叫凭证了。
 *
 * 数据由 EndingScreen 算一次（`data`），DOM 这张纸和存下来的 PNG 用的是同一份 ——
 * 看到什么就存到什么，两边不可能说不一样的话。
 */
export default function WaitReceipt({ data }) {
  const [state, setState] = useState('idle') // idle | saving | saved | failed

  const handleSave = async () => {
    if (state === 'saving') return
    setState('saving')
    try {
      await saveReceiptImage(data)
      setState('saved')
    } catch {
      // 存不下来不该让人白等：告诉他截图也行，别把失败藏起来
      setState('failed')
    }
  }

  return (
    <section className="wait-receipt" aria-label="等待凭证">
      <div className="wr-paper">
        <div className="wr-head">
          <span className="wr-org">慢活小铺 · 等待凭证</span>
          <span className="wr-no">NO. {data.no}</span>
        </div>
        <p className="wr-date">{data.dateLine}</p>

        <p className="wr-big">
          <b>{data.minutes}</b>
          <em>分钟</em>
        </p>
        <p className="wr-note">{data.note}</p>

        <dl className="wr-rows">
          {data.rows.map((row) => (
            <div className="wr-row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="wr-fine">{data.fine}</p>

        {/* 撕口：剪刀在线头、虚线在右边 —— 不要把它压在虚线中间，
            那样得垫一块底色去"切断"虚线，而颗粒纸上那块白会露出来（实测很难看）。 */}
        <div className="wr-cut" aria-hidden="true">
          <Scissors size={13} strokeWidth={1.6} />
          <span />
        </div>

        {/* 重音声部：这一句是「我」的口气，也是这张纸能被转述的那一句 */}
        <p className="wr-accent">{data.accent}</p>
        <p className="wr-quote">{data.quote}</p>

        <span className="print-seal is-sm wr-seal" aria-hidden="true">{data.seal}</span>
      </div>

      <button
        className="wr-save"
        onClick={handleSave}
        disabled={state === 'saving'}
      >
        {state === 'saved' ? <Check size={15} strokeWidth={1.8} /> : <Download size={15} strokeWidth={1.6} />}
        {state === 'saving' ? '正在画这张纸…' : state === 'saved' ? '再存一次' : '存成图片'}
      </button>

      {state === 'saved' && (
        <p className="wr-save-note">存下来了 —— 在浏览器的「下载」里找它。</p>
      )}
      {state === 'failed' && (
        <p className="wr-save-note">这张纸刚才没画出来，截个图也一样。</p>
      )}
    </section>
  )
}
