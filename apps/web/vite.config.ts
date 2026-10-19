import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 部署在 /track-trash/ 子路径，构建时用 VITE_BASE 覆盖
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: 5173,
    // 局域网可访问，方便用手机真机测试
    host: true,
  },
  optimizeDeps: {
    exclude: ['@haola/game-core'],
  },
});
