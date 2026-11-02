import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { pruneOrphanImages } from './data/db';
import './styles/global.css';

void pruneOrphanImages().catch((e) => console.warn('[images] prune failed', e));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
