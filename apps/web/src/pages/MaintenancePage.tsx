import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MaintenanceFinancialWorkspace } from '../features/maintenance/MaintenanceFinancialWorkspace';
import { PageChromeExtension } from '../components/PageHeader';
import { MaintenancePage as MaintenanceOperationsPage } from './MaintenancePageBase';
import '../features/maintenance/maintenance-financial.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type Workspace = 'operations' | 'financial';

export function MaintenancePage(props: Props) {
  const [workspace, setWorkspace] = useState<Workspace>('operations');

  const switcher = (
    <nav aria-label="Espacio de mantenimiento" className="maintenance-workspace-switcher">
      <button
        aria-current={workspace === 'operations' ? 'page' : undefined}
        className="maintenance-workspace-switcher__button"
        data-active={workspace === 'operations'}
        onClick={() => setWorkspace('operations')}
        type="button"
      >
        Operaciones
      </button>
      <button
        aria-current={workspace === 'financial' ? 'page' : undefined}
        className="maintenance-workspace-switcher__button"
        data-active={workspace === 'financial'}
        onClick={() => setWorkspace('financial')}
        type="button"
      >
        Finanzas y evidencias
      </button>
    </nav>
  );

  return (
    <div className="maintenance-module-shell">
      <PageChromeExtension tabs={switcher}>
        {workspace === 'operations' ? (
          <MaintenanceOperationsPage {...props} />
        ) : (
          <MaintenanceFinancialWorkspace {...props} />
        )}
      </PageChromeExtension>
    </div>
  );
}
