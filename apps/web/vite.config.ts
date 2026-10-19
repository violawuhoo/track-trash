import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 部署在 /track-trash/ 子路径，构建时用 VITE_BASE 覆盖
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  optimizeDeps: {
    exclude: ['@haola/game-core'],
  },
});
