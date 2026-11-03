import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/theme.css';

// The #__ds example page exists only in the dev build: the build drops this branch and the page's chunk.
const DsPage = import.meta.env.DEV && location.hash === '#__ds' ? lazy(() => import('./ui/DsPage')) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {DsPage ? (
      <Suspense>
        <DsPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
