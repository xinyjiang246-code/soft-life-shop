import { useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'

/**
 * AddressPicker —— 结算页的装饰地址卡（2026-09-22）
 *
 * 用户原话：「这里的地址应该是可编辑的，参考真实外卖 app，就是可以直接编辑地址、
 * 姓名、电话号码这种，然后是可以切换不同地址的。」
 *
 * 所以它是一个三态的小机器：
 *   view —— 收起的一张地址卡（收件人 · 电话 / 地址），点「切换地址」展开
 *   list —— 已存的地址卡列表：点哪张用哪张，右上角可编辑、可删（最后一张不给删）
 *   edit —— 一张卡的表单（收件人 / 电话 / 地址三个输入），editId=null 就是新增
 *
 * 数据在 storage.js（soft-life-addresses-v1）：本组件是**受控的** ——
 * value 是 { list, activeId }，任何改动都通过 onChange 交回父组件落盘，
 * 自己不碰 localStorage（和 ReviewCard 不直接写库是同一个道理）。
 *
 * 红线：
 *   · 诚实 —— 装饰性的。姓名电话都可以是编的，父组件的 hint 会保留「无需真实信息」。
 *   · 不伪装成真外卖 —— 没有定位、没有「 Import 通讯录」、没有收货偏好这种越界的东西。
 */
export default function AddressPicker({ value, onChange }) {
  const list = value.list || []
  const active = list.find((a) => a.id === value.activeId) || list[0] || null
  const [mode, setMode] = useState('view')            // view | list | edit
  const [editId, setEditId] = useState(null)          // null = 在新增一张
  const [draft, setDraft] = useState({ name: '', phone: '', address: '' })
  const [armed, setArmed] = useState('')              // 两段式删除：第一次点是「亮起」，再点才真删

  const setField = (key, v) => setDraft((prev) => ({ ...prev, [key]: v }))

  const openEdit = (a) => {
    setEditId(a ? a.id : null)
    setDraft(a ? { name: a.name, phone: a.phone, address: a.address } : { name: '', phone: '', address: '' })
    setArmed('')
    setMode('edit')
  }

  const commit = () => {
    const card = {
      id: editId || `a${Date.now()}`,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      address: draft.address.trim(),
    }
    if (editId) {
      onChange({ list: list.map((a) => (a.id === editId ? card : a)), activeId: value.activeId })
    } else {
      onChange({ list: [...list, card], activeId: card.id }) // 新增的那张直接拿来用（外卖 App 的手感）
    }
    setMode('view')
  }

  const pick = (id) => {
    onChange({ list, activeId: id })
    setMode('view')
  }

  const remove = (id) => {
    if (armed !== id) { setArmed(id); return }
    const nextList = list.filter((a) => a.id !== id)
    setArmed('')
    if (!nextList.length) { setMode('view'); return } // 最后一张不许删到一无所有
    onChange({ list: nextList, activeId: value.activeId === id ? nextList[0].id : value.activeId })
    setMode('view')
  }

  /* ------------------------------ edit：一张卡的表单 ------------------------------ */
  if (mode === 'edit') {
    return (
      <div className="addr">
        <div className="addr-form">
          <label className="addr-field">
            <span>收件人</span>
            <input
              value={draft.name}
              maxLength={12}
              placeholder="橘子小屋"
              onChange={(e) => setField('name', e.target.value)}
            />
          </label>
          <label className="addr-field">
            <span>电话</span>
            <input
              value={draft.phone}
              maxLength={20}
              inputMode="tel"
              placeholder="可以是编的"
              onChange={(e) => setField('phone', e.target.value)}
            />
          </label>
          <label className="addr-field">
            <span>地址</span>
            <input
              value={draft.address}
              maxLength={40}
              placeholder="慢活小区 8 栋 2 单元"
              onChange={(e) => setField('address', e.target.value)}
            />
          </label>
          <div className="addr-form-actions">
            <button type="button" className="addr-cancel" onClick={() => setMode('view')}>先不存</button>
            <button type="button" className="addr-save" onClick={commit}>存下这张</button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------ list：切换 / 管理 ------------------------------ */
  if (mode === 'list') {
    return (
      <div className="addr">
        <ul className="addr-list">
          {list.map((a) => (
            <li key={a.id} className={`addr-item${a.id === value.activeId ? ' is-on' : ''}`}>
              <button type="button" className="addr-item-main" onClick={() => pick(a.id)}>
                <b>{a.name || '橘子小屋'}</b>
                {a.phone && <small>{a.phone}</small>}
                <span>{a.address || '还没写地址'}</span>
              </button>
              <span className="addr-item-ops">
                <button type="button" aria-label="编辑这张地址" onClick={() => openEdit(a)}><Pencil size={14} strokeWidth={1.6} /></button>
                {list.length > 1 && (
                  <button
                    type="button"
                    className={armed === a.id ? 'is-armed' : ''}
                    aria-label={armed === a.id ? '再点一下删除' : '删除这张地址'}
                    onClick={() => remove(a.id)}
                  >
                    {armed === a.id ? '再点一下' : <Trash2 size={14} strokeWidth={1.6} />}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="addr-add" onClick={() => openEdit(null)}>
          <Plus size={14} strokeWidth={1.8} /> 新增一个地址
        </button>
      </div>
    )
  }

  /* ------------------------------ view：收起的一张卡 ------------------------------ */
  return (
    <div className="addr">
      <div className="addr-card">
        <div className="addr-card-main">
          <p className="addr-who">
            <b>{active?.name || '橘子小屋'}</b>
            {active?.phone && <small>{active.phone}</small>}
          </p>
          <p className="addr-where">{active?.address || '还没写地址'}</p>
        </div>
        <button type="button" className="addr-switch" onClick={() => setMode('list')}>
          切换地址 <ChevronDown size={14} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}
