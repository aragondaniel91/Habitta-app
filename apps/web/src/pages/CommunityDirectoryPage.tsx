import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { PeoplePanelV3 } from '../features/people/PeoplePanelV3';
import { StructureManagementPage } from './StructureManagementPage';
import { UnitsPage } from './UnitsPage';

type Props = {
  condominiumId: string;
  condominiumName: string;
  mode: 'units' | 'people';
  session: Session;
};

export function CommunityDirectoryPage({ condominiumId, condominiumName, mode, session }: Props) {
  const [structureOpen, setStructureOpen] = useState(false);

  useEffect(() => {
    setStructureOpen(false);
  }, [condominiumId, mode]);

  if (mode === 'people') {
    return (
      <PeoplePanelV3
        condominiumId={condominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  }

  if (structureOpen) {
    return (
      <StructureManagementPage
        condominiumId={condominiumId}
        condominiumName={condominiumName}
        onBackToUnits={() => setStructureOpen(false)}
        session={session}
        showUnitManagement={false}
      />
    );
  }

  return (
    <UnitsPage
      condominiumId={condominiumId}
      condominiumName={condominiumName}
      onConfigureStructure={() => setStructureOpen(true)}
      session={session}
    />
  );
}
