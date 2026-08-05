import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './auth.css';
import './password-auth.css';
import './admin-onboarding.css';
import './add-condominium.css';
import './team-access.css';
import './admin-invitation.css';
import './dashboard.css';
import './dashboard-mobile.css';
import './community-directory.css';
import './structure-management.css';
import './receivables.css';
import './payments.css';
import './expenses.css';
import './reports.css';
import './settings.css';
import './community.css';
import './governance.css';
import './requests.css';
import './announcements.css';
import './help-imports.css';
import './private-documents.css';
import './brand-palette.css';
import './brand-assets.css';
import './module-context.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
