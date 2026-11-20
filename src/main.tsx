import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/print.css';
import { AuthProvider } from './app/auth';
import { router } from './app/router';
import { I18nProvider } from './lib/i18n';
import { applyTheme, initialTheme } from './lib/theme';
import { installErrorReporting, registerServiceWorker } from './lib/ops';

applyTheme(initialTheme());
installErrorReporting();
registerServiceWorker();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
