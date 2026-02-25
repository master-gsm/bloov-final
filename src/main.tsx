import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registered:', registration);

        if ('sync' in registration) {
          console.log('Background Sync is supported');
        }
      })
      .catch((error) => {
        console.error('ServiceWorker registration failed:', error);
      });
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data.type === 'BACKGROUND_SYNC') {
      console.log('Background sync message received:', event.data.message);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
