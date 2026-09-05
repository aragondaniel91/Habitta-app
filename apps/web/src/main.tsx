import { StrictMode, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CustomerInvitationExperience } from './components/CustomerInvitationExperience';
import { ResidentInvitationExperience } from './components/ResidentInvitationExperience';
import { getMyCustomerOnboardingInvitation } from './lib/customerInvitation';
import { installClientObservability } from './lib/client-observability';
import { supabase } from './supabase';
import './styles.css';
import './auth.css';
import './password-auth.css';
import './admin-onboarding.css';
import './condominium-profile.css';
import './admin-invitation.css';
import './help-imports.css';
import './brand-palette.css';
import './ux-contract.css';
import './hq-design-system.css';
import './brand-assets.css';
import './page-header.css';
import './resident-payments-history-polish.css';
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

function customerInvitationToken(pathname: string, search: string) {
  if (pathname !== '/app/bienvenida') return '';
  const token = new URLSearchParams(search).get('invitacion') ?? '';
  try {
    return decodeURIComponent(token);
  } catch {
    return '';
  }
}

function CustomerInvitationEntry({ rawToken }: { rawToken: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setResolved(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setResolved(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setResolved(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!resolved) {
    return (
      <main className="admin-invite-shell">
        <section className="admin-invite-panel">
          <div className="admin-invite-loading">
            <span className="onboarding-spinner" />
            <p>Preparando tu invitación…</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <CustomerInvitationExperience
      onAccepted={async () => {
        // The raw token is intentionally not persisted. Once accepted, recover the invitation from
        // the authenticated identity and store only the non-secret plan intent that the existing
        // AdminOnboardingWizard already understands. Postgres still enforces that subscription
        // terms match the invitation, so browser metadata is presentation/handoff state, not
        // commercial authority.
        if (supabase) {
          const invitation = await getMyCustomerOnboardingInvitation();
          if (invitation?.plan_code && invitation.billing_period) {
            await supabase.auth.updateUser({
              data: {
                habitta_plan_intent: invitation.plan_code,
                habitta_billing_period_intent: invitation.billing_period,
                habitta_customer_invitation_id: invitation.id,
              },
            });
          }
        }
        window.location.replace('/');
      }}
      onSignOut={() => void supabase?.auth.signOut()}
      rawToken={rawToken}
      session={session}
    />
  );
}

installClientObservability();

const residentToken = residentInvitationToken(window.location.pathname);
const customerToken = customerInvitationToken(window.location.pathname, window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {residentToken ? (
      <ResidentInvitationExperience rawToken={residentToken} />
    ) : customerToken ? (
      <CustomerInvitationEntry rawToken={customerToken} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
