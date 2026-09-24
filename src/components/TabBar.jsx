import { BookOpen, Home, PawPrint, User } from 'lucide-react'
import { petNameFor } from '../data.js'

/** 底部 tab 栏 —— 首页 / 手账 / 伙伴 / 我的（只在四个一级页显示）。
    「伙伴」tab 的文字跟着物种走：软软（猫）或 团团（狗）。 */
export default function TabBar({ screen, pet, onNavigate }) {
  const TABS = [
    { id: 'home', label: '首页', Icon: Home },
    { id: 'journal', label: '手账', Icon: BookOpen },
    { id: 'pet', label: petNameFor(pet?.species || 'cat'), Icon: PawPrint },
    { id: 'mine', label: '我的', Icon: User },
  ]
  return (
    <nav className="tabbar-pp" aria-label="主导航">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`tabbar-pp-item ${screen === id ? 'is-on' : ''}`}
          aria-current={screen === id ? 'page' : undefined}
          onClick={() => onNavigate(id)}
        >
          <Icon size={19} strokeWidth={screen === id ? 2 : 1.6} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
