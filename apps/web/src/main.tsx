import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './auth.css';
import './password-auth.css';
import './admin-onboarding.css';
import './admin-invitation.css';
import './help-imports.css';
import './brand-palette.css';
import './brand-assets.css';
import './page-header.css';
import './print.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
