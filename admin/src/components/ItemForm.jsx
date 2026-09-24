/**
 * 新建 / 编辑商品弹窗。
 *
 * 两个刻意的设计：
 *   ① 编辑态只提交**改动过的字段** —— PATCH 的意义就在这，
 *      全量提交会把并发场景下别人刚改的字段一起覆盖掉。
 *   ② 后端的字段级错误（422 的 details）会回填到对应输入框下方，
 *      而不是笼统弹一句「提交失败」。商品表单最烦的就是不知道哪一栏错了。
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import api, { ApiError } from '../api/client.js'
import { TAG_OPTIONS, centsToYuan, yuanToCents } from '../constants.js'

const EMPTY = {
  sku: '',
  name: '',
  nameCn: '',
  priceYuan: '',
  storeId: '',
  category: '',
  tags: [],
  description: '',
  inStock: true,
  isActive: true,
}

/** 后端字段名 → 表单字段名（金额在传输层是分，在界面层是元） */
const FIELD_ALIAS = { priceCents: 'priceYuan' }

function toFormState(item) {
  if (!item) return { ...EMPTY }
  return {
    sku: item.sku,
    name: item.name,
    nameCn: item.nameCn,
    priceYuan: centsToYuan(item.priceCents),
    storeId: item.storeId,
    category: item.category,
    tags: [...item.tags],
    description: item.description ?? '',
    inStock: item.inStock,
    isActive: item.isActive,
  }
}

/** 界面字段 → 接口字段（只保留改动过的） */
function buildPayload(form, original, isEdit) {
  const payload = {}
  const assign = (key, value) => {
    if (!isEdit || value !== original[key]) payload[key] = value
  }

  assign('sku', form.sku.trim())
  assign('name', form.name.trim())
  assign('nameCn', form.nameCn.trim())
  assign('priceCents', yuanToCents(form.priceYuan))
  assign('storeId', form.storeId)
  assign('category', form.category.trim())
  assign('tags', form.tags)
  assign('description', form.description.trim())
  assign('inStock', form.inStock)
  assign('isActive', form.isActive)

  return payload
}

function validate(form) {
  const errors = {}

  if (!form.sku.trim()) errors.sku = '必填'
  else if (!/^[A-Za-z0-9._-]+$/.test(form.sku.trim())) errors.sku = '只能包含字母、数字、点、下划线、连字符'
  else if (form.sku.trim().length > 40) errors.sku = '不能超过 40 个字符'

  if (!form.name.trim()) errors.name = '必填'
  else if (form.name.trim().length > 80) errors.name = '不能超过 80 个字符'

  if (!form.nameCn.trim()) errors.nameCn = '必填'
  else if (form.nameCn.trim().length > 80) errors.nameCn = '不能超过 80 个字符'

  const cents = yuanToCents(form.priceYuan)
  if (form.priceYuan === '') errors.priceYuan = '必填'
  else if (cents === null) errors.priceYuan = '必须是数字'
  else if (cents < 0) errors.priceYuan = '不能为负数'
  else if (cents > 10_000_000) errors.priceYuan = '不能超过 100000 元'

  if (!form.storeId) errors.storeId = '必选'

  if (!form.category.trim()) errors.category = '必填'
  else if (form.category.trim().length > 40) errors.category = '不能超过 40 个字符'

  if (form.description.length > 500) errors.description = '不超过 500 字'

  return errors
}

export default function ItemForm({ open, mode, initial, stores, facets, onClose, onSaved }) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState(() => toFormState(initial))
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [saving, setSaving] = useState(false)

  const firstFieldRef = useRef(null)
  const original = useMemo(() => toFormState(initial), [initial])

  // 每次打开（或换了编辑对象）都重置 —— 否则会残留上一次的输入和报错
  useEffect(() => {
    if (!open) return
    setForm(toFormState(initial))
    setErrors({})
    setBanner(null)
    setSaving(false)
    // 打开后把焦点放到第一个输入框
    const timer = setTimeout(() => firstFieldRef.current?.focus(), 30)
    return () => clearTimeout(timer)
  }, [open, initial])

  // ESC 关闭
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  if (!open) return null

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // 用户一开始改这个字段，就把它下面的红字撤掉
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const toggleTag = (tag) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBanner(null)

    const localErrors = validate(form)
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      setBanner('还有几处需要改一下')
      return
    }

    const payload = buildPayload(form, original, isEdit)

    if (isEdit && Object.keys(payload).length === 0) {
      onClose()
      return
    }

    setSaving(true)
    try {
      const saved = isEdit ? await api.items.update(initial.id, payload) : await api.items.create(payload)
      onSaved(saved, mode)
    } catch (err) {
      setSaving(false)

      if (err instanceof ApiError) {
        // 422：把字段级明细回填到表单
        const serverFieldErrors = err.fieldErrors
        if (Object.keys(serverFieldErrors).length > 0) {
          const mapped = {}
          for (const [field, message] of Object.entries(serverFieldErrors)) {
            mapped[FIELD_ALIAS[field] ?? field] = message
          }
          setErrors(mapped)
        }

        // 409 的 details 里带 field（比如 sku 被占用），也回填过去
        if (err.status === 409 && err.details?.field) {
          setErrors((prev) => ({ ...prev, [FIELD_ALIAS[err.details.field] ?? err.details.field]: err.message }))
        }

        setBanner(err.displayMessage)
      } else {
        setBanner(err?.message ?? '保存失败')
      }
    }
  }

  const categories = facets?.categories ?? []

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
        <header className="modal-head">
          <h2 id="form-title">{isEdit ? `编辑商品 #${initial.id}` : '新建商品'}</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label="关闭">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {banner && (
              <p className="form-banner" role="alert">
                {banner}
              </p>
            )}

            <div className="form-grid">
              <Field label="SKU" error={errors.sku} hint="对外稳定标识，改价改名都不该动它">
                <input
                  ref={firstFieldRef}
                  value={form.sku}
                  disabled={saving}
                  onChange={(e) => setField('sku', e.target.value)}
                  placeholder="M22"
                />
              </Field>

              <Field label="价格（元）" error={errors.priceYuan} hint="内部按「分」存储，避免浮点误差">
                <input
                  value={form.priceYuan}
                  disabled={saving}
                  inputMode="decimal"
                  onChange={(e) => setField('priceYuan', e.target.value)}
                  placeholder="24.00"
                />
              </Field>

              <Field label="中文名" error={errors.nameCn}>
                <input value={form.nameCn} disabled={saving} onChange={(e) => setField('nameCn', e.target.value)} placeholder="冰抹茶拿铁" />
              </Field>

              <Field label="英文名" error={errors.name} hint="同一家店内不能重名">
                <input value={form.name} disabled={saving} onChange={(e) => setField('name', e.target.value)} placeholder="ICED MATCHA LATTE" />
              </Field>

              <Field label="店铺" error={errors.storeId}>
                <select value={form.storeId} disabled={saving} onChange={(e) => setField('storeId', e.target.value)}>
                  <option value="">请选择</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="品类" error={errors.category} hint="可从已有品类里挑，也可以新填一个">
                <input
                  value={form.category}
                  disabled={saving}
                  list="category-options"
                  onChange={(e) => setField('category', e.target.value)}
                  placeholder="奶茶"
                />
                <datalist id="category-options">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>

            <fieldset className="form-fieldset">
              <legend>标签</legend>
              <div className="checkbox-row">
                {TAG_OPTIONS.map((t) => (
                  <label key={t.value} className="checkbox">
                    <input type="checkbox" checked={form.tags.includes(t.value)} disabled={saving} onChange={() => toggleTag(t.value)} />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="描述" error={errors.description} hint={`${form.description.length} / 500`}>
              <textarea
                rows={3}
                value={form.description}
                disabled={saving}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="oat milk + matcha，像周一早晨需要的那口绿。"
              />
            </Field>

            <fieldset className="form-fieldset">
              <legend>状态</legend>
              <div className="checkbox-row">
                <label className="checkbox">
                  <input type="checkbox" checked={form.isActive} disabled={saving} onChange={(e) => setField('isActive', e.target.checked)} />
                  <span>上架（下架后客人看不到，但数据留着）</span>
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={form.inStock} disabled={saving} onChange={(e) => setField('inStock', e.target.checked)} />
                  <span>有货</span>
                </label>
              </div>
            </fieldset>
          </div>

          <footer className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中…' : isEdit ? '保存修改' : '创建商品'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

/** 统一的「标签 + 输入 + 错误 + 提示」外壳，避免每个字段重复写一遍结构 */
function Field({ label, error, hint, children }) {
  return (
    <label className={`field-block${error ? ' has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}
