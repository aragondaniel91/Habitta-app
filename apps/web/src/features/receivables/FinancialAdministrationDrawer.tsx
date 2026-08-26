import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { FeesIcon, ReportsIcon, SettingsIcon } from '../../components/icons';
import { Button, InfoHint, Surface } from '../../components/ui';
import type { ReceivableUnit } from '../../lib/receivables';
import { canManage, useCondominiumRoles } from '../../lib/roles';
import { AccountStatementDrawer } from './AccountStatementDrawer';
import { FinancialIntegrityPanel } from './FinancialIntegrityPanel';
import '../../account-statement.css';
import '../../hab186-financial-integrity.css';

type Props = {
  condominiumId: string;
  session: Session;
  units: ReceivableUnit[];
  buildingNameById: Record<string, string>;
  onClose: () => void;
};

type AdministrationView = 'overview' | 'statement' | 'policy';

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

  if (view === 'statement') {
    return (
      <AccountStatementDrawer
        buildingNameById={buildingNameById}
        condominiumId={condominiumId}
        onClose={() => setView('overview')}
        session={session}
        units={units}
      />
    );
  }

  return (
    <Drawer
      eyebrow="Administración financiera"
      onClose={onClose}
      prefix="receivables"
      title={view === 'policy' ? 'Política financiera' : 'Estado de cuenta y administración'}
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
        ) : (
          <>
            <div className="account-statement-section-heading">
              <div>
                <strong>¿Qué necesitas administrar?</strong>
                <span>
                  Los saldos permanecen separados por moneda y la cuenta financiera siempre
                  pertenece a la unidad, incluso cuando cambia de propietario.
                </span>
              </div>
            </div>

            <div className="financial-integrity-config-grid">
              <Surface className="financial-integrity-card">
                <div>
                  <span className="receivables-kicker">Cuenta de la unidad</span>
                  <h2>
                    Estado de cuenta, solvencia y propiedad
                    <InfoHint label="Más información sobre estado de cuenta, solvencia y propiedad">
                      Selecciona una unidad para consultar movimientos y saldos por moneda, evaluar
                      o emitir solvencia y, con permisos de gestión, registrar una transferencia de
                      propiedad con fecha efectiva.
                    </InfoHint>
                  </h2>
                </div>
                <div className="account-statement-section-heading">
                  <div>
                    <strong>{units.length} unidades disponibles</strong>
                    <span>La deuda y el historial nunca se trasladan al nuevo propietario.</span>
                  </div>
                  <ReportsIcon size={22} />
                </div>
                <Button onClick={() => setView('statement')}>Consultar unidad</Button>
              </Surface>

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
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
