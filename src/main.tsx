import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from '@/App';

import '@/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// `BASE_URL` is whatever Vite's `base` resolved to: '/' in dev, test and preview,
// '/ab-peers-prototype/' in the Pages build. Deriving the router's basename from it
// keeps route matching on the deploy path without a second value to keep in sync.
createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
