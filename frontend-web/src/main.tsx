import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import thTH from 'antd/locale/th_TH'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { QueryClientProvider } from '@tanstack/react-query'
import i18n from './i18n'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { rentTheme } from './theme'
import { queryClient } from './lib/queryCache'
import './index.css'

const antdLocaleMap = { zh: zhCN, en: enUS, th: thTH } as const

const Root = () => {
  const { i18n: i18nInstance } = useTranslation()
  const [lang, setLang] = useState(i18nInstance.language)

  React.useEffect(() => {
    const handler = (l: string) => setLang(l)
    i18nInstance.on('languageChanged', handler)
    return () => i18nInstance.off('languageChanged', handler)
  }, [i18nInstance])

  const currentLang = (['zh', 'en', 'th'].includes(lang) ? lang : 'zh') as 'zh' | 'en' | 'th'

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={rentTheme} locale={antdLocaleMap[currentLang]}>
        <AntApp>
          {/* 全局错误边界：兜住渲染期异常，避免整页白屏（详见组件内注释） */}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <Root />
    </I18nextProvider>
  </React.StrictMode>,
)
