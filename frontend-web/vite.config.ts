import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 生产构建：把体积最大的三方依赖拆成独立 chunk，配合路由级 React.lazy，
// 让浏览器能长期缓存不变的部分，并避免首屏一次性下载 antd + 图表等全部代码。
//
// 注意：react 生态必须与其运行时依赖（scheduler / @remix-run/router 等）放在同一个
// chunk。此前把这些依赖落到「其它 node_modules 统一进 vendor」的兜底 chunk，
// 会形成 vendor -> vendor-react -> vendor 的循环 chunk，生产构建下初始化顺序
// 不稳定，页面会报 `Cannot set properties of undefined (setting 'Children')` 白屏。
// 因此这里不再强制兜底分组：未命中的模块交给 Rollup 自行决定，避免人为制造循环。
const CHUNK_GROUPS: Record<string, RegExp[]> = {
  'vendor-react': [
    /node_modules\/(react|react-dom|react-router|react-router-dom|zustand|@tanstack|scheduler|react-is|use-sync-external-store|@remix-run)\//,
  ],
  'vendor-antd': [/node_modules\/(antd|@ant-design|rc-[^/]+|@rc-component)\//],
  'vendor-charts': [/node_modules\/(chart\.js|react-chartjs-2)\//],
  'vendor-i18n': [/node_modules\/(i18next|i18next-browser-languagedetector|react-i18next)\//],
  'vendor-misc': [/node_modules\/(axios|dayjs)\//],
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          for (const [name, patterns] of Object.entries(CHUNK_GROUPS)) {
            if (patterns.some((re) => re.test(id))) return name
          }
          // 未命中分组的依赖交给 Rollup 自动切分（不再统一塞进 vendor 兜底）
          return undefined
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      // 开发环境下聊天 WebSocket 也走 /api 前缀（/api/v1/chat/ws/chat/*），
      // 缺少 ws: true 时 Vite 只代理普通 HTTP，WS 升级请求会被直接断开。
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
      // 上传文件（房源照片、文档、看房视频）由后端 /uploads 静态服务托管
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
