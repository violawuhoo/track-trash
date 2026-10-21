import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 部署在 /track-trash/ 子路径：
// - 开发服务器用根路径，方便本机 / 局域网访问
// - 构建默认走 /track-trash/，可用 VITE_BASE 覆盖（自定义域名时设为 /）
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: process.env.VITE_BASE || (command === 'build' ? '/track-trash/' : '/'),
  server: {
    port: 5173,
    // 局域网可访问，方便用手机真机测试
    host: true,
    // 开发期把 /api 转给本地 api 服务（apps/api）。端口可用 VITE_API_PROXY_TARGET 覆盖。
    // 生产走 VITE_API_BASE 绝对地址；两者都不配时前端请求会静默失败，离线仍可玩。
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8799',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['@haola/game-core'],
  },
}));
