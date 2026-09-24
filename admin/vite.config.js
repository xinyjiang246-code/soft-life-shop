import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 只绑本机 —— 这个管理页不该被同网段的人随手打开
    host: '127.0.0.1',
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    // 构建产物由 server 直接托管（server/src/app.js 里的 mountAdmin）
    emptyOutDir: true,
  },
})
