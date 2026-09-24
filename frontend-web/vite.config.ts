import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 生产构建：把体积最大的三方依赖拆成独立 chunk，配合路由级 React.lazy，
// 让浏览器能长期缓存不变的部分，并避免首屏一次性下载 antd + 图表等全部代码。
const CHUNK_GROUPS: Record<string, RegExp[]> = {
  'vendor-react': [/node_modules\/(react|react-dom|react-router|react-router-dom|zustand|@tanstack)\//],
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
          // 剩余 node_modules 统一进 vendor 兜底，避免碎片化 chunk
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // 上传文件（房源照片、文档、看房视频）由后端 /uploads 静态服务托管
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
