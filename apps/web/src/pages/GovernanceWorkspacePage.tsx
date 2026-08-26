import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AssemblyActionItemsWorkspace } from '../features/governance/AssemblyActionItemsWorkspace';
import { AssembliesWorkspace } from '../features/governance/AssembliesWorkspace';
import { PageChromeExtension } from '../components/PageHeader';
import { GovernanceVotingRulesPanel } from '../features/governance/GovernanceVotingRulesPanel';
import { GovernancePage } from './GovernancePage';
import '../features/governance/assemblies-workspace.css';
import '../features/governance/governance-workspace.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type View = 'proposals' | 'assemblies' | 'action-items';

export function GovernanceWorkspacePage(props: Props) {
  const [view, setView] = useState<View>('proposals');

  useEffect(() => {
    setView('proposals');
  }, [props.condominiumId]);

  const switcher = (
    <nav aria-label="Secciones de gobernanza" className="governance-switcher" role="tablist">
      <button
        aria-selected={view === 'proposals'}
        onClick={() => setView('proposals')}
        role="tab"
        type="button"
      >
        Propuestas y votaciones
      </button>
      <button
        aria-selected={view === 'assemblies'}
        onClick={() => setView('assemblies')}
        role="tab"
        type="button"
      >
        Asambleas y actas
      </button>
      <button
        aria-selected={view === 'action-items'}
        onClick={() => setView('action-items')}
        role="tab"
        type="button"
      >
        Acuerdos y seguimiento
      </button>
    </nav>
  );

  return (
    <PageChromeExtension tabs={switcher}>
      {view === 'proposals' ? (
        <>
          <GovernancePage {...props} />
          <GovernanceVotingRulesPanel condominiumId={props.condominiumId} session={props.session} />
        </>
      ) : null}
      {view === 'assemblies' ? <AssembliesWorkspace {...props} /> : null}
      {view === 'action-items' ? <AssemblyActionItemsWorkspace {...props} /> : null}
    </PageChromeExtension>
  );
}
