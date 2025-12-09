// src/index.tsx
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Office Add-in ইনিশিয়ালাইজেশন
Office.onReady(() => {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
  }
});