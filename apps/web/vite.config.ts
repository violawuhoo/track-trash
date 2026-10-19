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
  },
  optimizeDeps: {
    exclude: ['@haola/game-core'],
  },
}));
