import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PokerApp } from './PokerApp';
import '../styles/base.css';
import '../styles/card.css';
import '../styles/table.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PokerApp />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  });
}
