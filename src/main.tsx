import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { E2EEProvider } from './contexts/E2EEContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <E2EEProvider>
      <App />
    </E2EEProvider>
  </StrictMode>,
);