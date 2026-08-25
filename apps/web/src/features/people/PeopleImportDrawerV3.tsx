import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { CsvImportWizard } from '../imports/CsvImportWizard';
import './people-v3-controller.css';

export function PeopleImportDrawerV3({
  condominiumId,
  session,
  onClose,
  onImported,
}: {
  condominiumId: string;
  session: Session;
  onClose: () => void;
  onImported: (message: string) => Promise<void> | void;
}) {
  return (
    <Drawer
      description="Primero previsualiza y valida. Habitta no confirma filas hasta que revises el resultado."
      eyebrow="Carga masiva"
      onClose={onClose}
      prefix="people-v3"
      presentation="workspace"
      title="Importar personas por CSV"
      wide
    >
      <div className="ux-form people-v3-import">
        <CsvImportWizard
          condominiumId={condominiumId}
          kind="people"
          onImported={() => {
            void onImported('Importación de personas completada.');
          }}
          session={session}
        />
      </div>
    </Drawer>
  );
}
