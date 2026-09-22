import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from 'antd'
import i18n from '@/i18n'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/** 取翻译，缺失时回落到传入的中文默认值（i18n 未初始化也不会炸）。 */
function tt(key: string, fallback: string): string {
  try {
    return i18n.t(key, { defaultValue: fallback })
  } catch {
    return fallback
  }
}

/**
 * 全局错误边界。
 *
 * 为什么必须有：React 18 里未捕获的渲染异常会**卸载整棵组件树**，用户看到的是
 * 纯白页面，没有任何提示——线上表现就是"这个页面打不开"。本项目里最典型的触发源是
 * `GoogleMap` / `Autocomplete`：Maps Key 未配置时会抛 `google is not defined`，
 * 一旦某个路由把它挂在没有条件守卫的位置，整站都会白屏（`GoogleMap.tsx` 里的注释
 * 也记录了同一个事故）。
 *
 * 这里兜住之后，至少能给出"出错了 + 刷新/回首页"，同时把原始堆栈打到 console，
 * 便于排障（后续接 Sentry 只需在 `componentDidCatch` 里加一行上报）。
 *
 * 注意：错误边界**只能捕获子组件的渲染期异常**，捕获不到事件回调、异步请求里的错误，
 * 那些仍需各自 try/catch。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留 componentStack，线上排查靠它定位到具体组件
    console.error('[ErrorBoundary] caught render error:', error, info?.componentStack)
  }

  private goHome = (): void => {
    // 先复位状态再跳转，否则返回首页后如果再次进入出错路由会立刻又显示错误页
    this.setState({ hasError: false, error: undefined })
    window.location.href = '/'
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="app-error" role="alert">
        <div className="app-error__card">
          <div className="app-error__icon" aria-hidden="true">!</div>
          <h1 className="app-error__title">
            {tt('common.errorBoundary.title', '页面出错了')}
          </h1>
          <p className="app-error__desc">
            {tt('common.errorBoundary.desc', '页面渲染时发生异常，已被拦截以免整页空白。')}
          </p>
          {this.state.error?.message ? (
            <div className="app-error__detail">
              <div className="app-error__detail-label">
                {tt('common.errorBoundary.detail', '错误详情')}
              </div>
              <code>{this.state.error.message}</code>
            </div>
          ) : null}
          <div className="app-error__actions">
            <Button type="primary" onClick={() => window.location.reload()}>
              {tt('common.errorBoundary.reload', '刷新页面')}
            </Button>
            <Button onClick={this.goHome}>
              {tt('common.errorBoundary.backHome', '返回首页')}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
