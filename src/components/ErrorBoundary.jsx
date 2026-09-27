import { Component } from 'react'

/**
 * ErrorBoundary —— 兜住渲染异常，别让整个 App 白屏。
 *
 * 为什么要有：全仓没有任何错误边界时，任意组件 throw 会把 React 整棵树带下去，
 * 页面直接空白（本项目被并发会话写坏 main.jsx 白屏过一次，用户点开就是全白）。
 * 这里只兜「渲染/生命周期里的错」，事件回调、异步里的错不归它管。
 *
 * 兜底页故意不像系统报错页：慢活小铺是治愈向的，错误页也要软一点 ——
 * 一句安抚 + 两个动作（重试 / 回首页），不堆技术栈。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // 只在控制台留痕，不上报任何个人信息（本项目统计也是匿名的）
    console.error('[慢活小铺] 渲染出错了：', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false })
  }

  handleHome = () => {
    // 回首页：清掉 ?admin 之类可能踩坏的入口，回到干净起点
    try {
      if (location.search || location.hash) history.replaceState(null, '', location.pathname)
    } catch {}
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="error-boundary">
        <div className="eb-card">
          <p className="eb-emoji" aria-hidden="true">◡̈</p>
          <h1 className="eb-title">这一页走神了</h1>
          <p className="eb-copy">小铺刚刚出了点小状况，没伤到你的订单和手账。点一下就能回来。</p>
          <div className="eb-actions">
            <button type="button" className="eb-btn eb-btn-ghost" onClick={this.handleHome}>回首页</button>
            <button type="button" className="eb-btn eb-btn-solid" onClick={this.handleReset}>再试一次</button>
          </div>
        </div>
      </div>
    )
  }
}
