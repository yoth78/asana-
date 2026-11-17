import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './styles/layout.css';
import './styles/pages.css';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';

/* Apply dark theme by default */
document.documentElement.setAttribute('data-theme', 'dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
