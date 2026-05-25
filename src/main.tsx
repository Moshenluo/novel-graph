import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log('=== main.tsx 开始执行 ===');
console.log('root 元素:', document.getElementById('root'));

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('找不到 root 元素!');
  throw new Error('找不到 root 元素');
}

console.log('准备创建 React root...');
const root = createRoot(rootElement);

console.log('准备渲染 App...');
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

console.log('=== React 渲染完成 ===');