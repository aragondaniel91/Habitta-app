import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ResidentInvitationExperience } from './components/ResidentInvitationExperience';
import { installClientObservability } from './lib/client-observability';
import './styles.css';
import './auth.css';
import './password-auth.css';
import './admin-onboarding.css';
import './condominium-profile.css';
import './admin-invitation.css';
import './help-imports.css';
import './brand-palette.css';
import './brand-assets.css';
import './page-header.css';
import './print.css';

function residentInvitationToken(pathname: string) {
  const prefix = '/invite/';
  if (!pathname.startsWith(prefix)) return '';
  try {
    return decodeURIComponent(pathname.slice(prefix.length).split('/')[0] ?? '');
  } catch {
    return '';
  }
}

installClientObservability();

const invitationToken = residentInvitationToken(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {invitationToken ? <ResidentInvitationExperience rawToken={invitationToken} /> : <App />}
  </StrictMode>,
);
