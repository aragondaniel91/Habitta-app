import type { Session } from '@supabase/supabase-js';
import { PeoplePanelV3 } from '../features/people/PeoplePanelV3';
import { StructureManagementPage } from './StructureManagementPage';

type Props = {
  condominiumId: string;
  condominiumName: string;
  mode: 'units' | 'people';
  session: Session;
};

export function CommunityDirectoryPage({ condominiumId, condominiumName, mode, session }: Props) {
  if (mode === 'people') {
    return (
      <PeoplePanelV3
        condominiumId={condominiumId}
        condominiumName={condominiumName}
        session={session}
      />
    );
  }

  return (
    <StructureManagementPage
      condominiumId={condominiumId}
      condominiumName={condominiumName}
      session={session}
    />
  );
}
