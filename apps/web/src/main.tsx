import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useGame } from './store/gameStore';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 开发期调试口（生产构建会被 import.meta.env.DEV 剪掉）：
// 给截图脚本 / DevTools 一个合法入口，免得去 hack 内部状态
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__haola = useGame;
}

