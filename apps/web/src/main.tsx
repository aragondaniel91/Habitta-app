import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './auth.css';
import './dashboard.css';
import './dashboard-mobile.css';
import './community-directory.css';
import './receivables.css';
import './payments.css';
import './reports.css';
import './settings.css';
import './community.css';
import './requests.css';
import './brand-palette.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
