import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { FeesIcon, SettingsIcon } from '../../components/icons';
import { Button, Field, InfoHint, Select, Skeleton, Surface } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import type { ReceivableUnit } from '../../lib/receivables';
import { canManage, useCondominiumRoles } from '../../lib/roles';
import { unitReferenceLabel } from '../../lib/unit-domain';
import { FinancialIntegrityPanel } from './FinancialIntegrityPanel';
import { OwnershipTransferPanel } from './OwnershipTransferPanel';
import '../../account-statement.css';
import '../../hab186-financial-integrity.css';

type Props = {
  condominiumId: string;
  session: Session;
  units: ReceivableUnit[];
  buildingNameById: Record<string, string>;
  onClose: () => void;
};

type AdministrationView = 'overview' | 'ownership' | 'policy';

type OwnerSnapshot = {
  person_id: string;
  name: string;
  ownership_percentage?: string | number | null;
};

type AccountStatementOwnerSnapshot = {
  owners: OwnerSnapshot[];
};

export function FinancialAdministrationDrawer({
  condominiumId,
  session,
  units,
  buildingNameById,
  onClose,
}: Props) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  const [view, setView] = useState<AdministrationView>('overview');
  const [unitId, setUnitId] = useState('');
  const [currentOwners, setCurrentOwners] = useState<OwnerSnapshot[] | null>(null);
  const [ownersError, setOwnersError] = useState('');
  const selectedUnit = units.find((unit) => unit.id === unitId);
  const activeUnits = units.filter((unit) => unit.status !== 'inactive');

  useEffect(() => {
    if (!unitId) {
      setCurrentOwners(null);
      setOwnersError('');
      return;
    }

    let active = true;
    setCurrentOwners(null);
    setOwnersError('');
    void apiRequest<AccountStatementOwnerSnapshot>(
      `/v1/condominiums/${condominiumId}/units/${unitId}/account-statement`,
      session,
    )
      .then((statement) => {
        if (active) setCurrentOwners(statement.owners);
      })
      .catch((error) => {
        if (!active) return;
        setOwnersError(
          error instanceof Error
            ? error.message
            : 'No se pudo cargar la titularidad actual de la unidad.',
        );
      });

    return () => {
      active = false;
    };
  }, [condominiumId, session, unitId]);

  return (
    <Drawer
      eyebrow="Administración financiera"
      onClose={onClose}
      prefix="receivables"
      title={
        view === 'policy'
          ? 'Política financiera'
          : view === 'ownership'
            ? 'Transferir propiedad'
            : 'Administración financiera'
      }
      wide
    >
      <div className="account-statement-drawer">
        {view === 'policy' ? (
          <>
            <div className="account-statement-section-heading">
              <div>
                <strong>Monedas, tasas y criterio de solvencia</strong>
                <span>
                  Configuración del condominio. Habitta no convierte saldos ni revaloriza historia
                  de forma automática.
                </span>
              </div>
              <Button onClick={() => setView('overview')} size="sm" variant="ghost">
                Volver
              </Button>
            </div>
            <FinancialIntegrityPanel condominiumId={condominiumId} session={session} />
          </>
        ) : view === 'ownership' ? (
          <>
            <div className="account-statement-section-heading">
              <div>
                <strong>Transferencia de propiedad</strong>
                <span>La cuenta, los cargos y el historial permanecen en la unidad.</span>
              </div>
              <Button onClick={() => setView('overview')} size="sm" variant="ghost">
                Volver
              </Button>
            </div>
            <Field label="Unidad">
              <Select onChange={(event) => setUnitId(event.target.value)} value={unitId}>
                <option value="">Selecciona una unidad</option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unitReferenceLabel({
                      code: unit.code,
                      buildingName: unit.building_id
                        ? (buildingNameById[unit.building_id] ?? null)
                        : null,
                    })}
                  </option>
                ))}
              </Select>
            </Field>
            {ownersError ? (
              <div className="receivables-action-feedback" role="status">
                {ownersError}
              </div>
            ) : null}
            {selectedUnit && currentOwners === null && !ownersError ? (
              <Skeleton className="receivables-statement-skeleton" />
            ) : null}
            {selectedUnit && currentOwners ? (
              <OwnershipTransferPanel
                condominiumId={condominiumId}
                currentOwners={currentOwners}
                onTransferred={() => undefined}
                session={session}
                unitId={selectedUnit.id}
                unitLabel={unitReferenceLabel({
                  code: selectedUnit.code,
                  buildingName: selectedUnit.building_id
                    ? (buildingNameById[selectedUnit.building_id] ?? null)
                    : null,
                })}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="account-statement-section-heading">
              <div>
                <strong>Operaciones administrativas</strong>
                <span>
                  Configura las reglas del condominio o registra una transferencia. La consulta de
                  saldos y movimientos vive en Estado de cuenta.
                </span>
              </div>
            </div>

            <div className="financial-integrity-config-grid">
              {manage ? (
                <Surface className="financial-integrity-card">
                  <div>
                    <span className="receivables-kicker">Reglas del condominio</span>
                    <h2>
                      Política de moneda y solvencia
                      <InfoHint label="Más información sobre política de moneda y solvencia">
                        Define moneda contable, monedas aceptadas, conversión desactivada o limitada
                        a tasas aprobadas, fuentes de tasa y criterio para emitir solvencias.
                      </InfoHint>
                    </h2>
                  </div>
                  <div className="account-statement-section-heading">
                    <div>
                      <strong>Sin FX automático</strong>
                      <span>Las tasas se registran como evidencia aprobada e inmutable.</span>
                    </div>
                    <SettingsIcon size={22} />
                  </div>
                  <Button onClick={() => setView('policy')} variant="secondary">
                    Configurar política financiera
                  </Button>
                </Surface>
              ) : (
                <Surface className="financial-integrity-card">
                  <div>
                    <span className="receivables-kicker">Política financiera</span>
                    <h2>
                      Configuración protegida
                      <InfoHint label="Más información sobre configuración protegida">
                        Tu rol puede consultar la cuenta de las unidades habilitadas, pero no
                        modificar monedas, tasas aprobadas ni criterios de solvencia.
                      </InfoHint>
                    </h2>
                  </div>
                  <div className="account-statement-section-heading">
                    <div>
                      <strong>Solo roles de gestión</strong>
                      <span>
                        Los permisos del backend y RLS siguen siendo la frontera efectiva.
                      </span>
                    </div>
                    <FeesIcon size={22} />
                  </div>
                </Surface>
              )}
              {manage ? (
                <Surface className="financial-integrity-card">
                  <div>
                    <span className="receivables-kicker">Propiedad de la unidad</span>
                    <h2>Transferencia con fecha efectiva</h2>
                  </div>
                  <div className="account-statement-section-heading">
                    <div>
                      <strong>Historial financiero preservado</strong>
                      <span>La transferencia no altera cargos, pagos ni saldos de la unidad.</span>
                    </div>
                  </div>
                  <Button onClick={() => setView('ownership')} variant="secondary">
                    Gestionar propiedad
                  </Button>
                </Surface>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
