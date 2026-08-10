import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useDialogBehavior } from '../../components/Drawer';
import { Button } from '../../components/ui';
import type { AppRoute } from '../../navigation';
import { CsvImportWizard } from '../imports/CsvImportWizard';
import { IMPORT_DEFINITIONS } from '../imports/csv';
import { MODULE_HELP, type ImportKind } from './module-help';

type Props = {
  condominiumId: string;
  initialView: 'guide' | 'import';
  onClose: () => void;
  open: boolean;
  route: AppRoute;
  session: Session;
};

export function ModuleHelpDrawer({
  condominiumId,
  initialView,
  onClose,
  open,
  route,
  session,
}: Props) {
  const content = MODULE_HELP[route.key];
  const importKinds = content.importKinds ?? [];
  const panel = useRef<HTMLElement>(null);
  useDialogBehavior(panel, onClose);
  const [view, setView] = useState<'guide' | 'import'>(initialView);
  const [selectedKind, setSelectedKind] = useState<ImportKind | null>(importKinds[0] ?? null);

  useEffect(() => {
    if (!open) return;
    const routeImportKinds = MODULE_HELP[route.key].importKinds ?? [];
    setView(initialView === 'import' && routeImportKinds.length ? 'import' : 'guide');
    setSelectedKind(routeImportKinds[0] ?? null);
  }, [initialView, open, route.key]);

  if (!open) return null;

  return (
    <div className="module-help-layer" role="presentation">
      <button
        aria-label="Cerrar ayuda"
        className="module-help-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label={`Ayuda de ${route.label}`}
        aria-modal="true"
        className="module-help-drawer"
        ref={panel}
        role="dialog"
        tabIndex={-1}
      >
        <header className="module-help-header">
          <div>
            <span>Centro de ayuda</span>
            <h2>{route.title}</h2>
          </div>
          <Button aria-label="Cerrar ayuda" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </header>

        {importKinds.length ? (
          <div className="module-help-tabs" role="tablist">
            <button
              aria-selected={view === 'guide'}
              data-active={view === 'guide' || undefined}
              onClick={() => setView('guide')}
              role="tab"
              type="button"
            >
              Cómo funciona
            </button>
            <button
              aria-selected={view === 'import'}
              data-active={view === 'import' || undefined}
              onClick={() => setView('import')}
              role="tab"
              type="button"
            >
              Importar datos
            </button>
          </div>
        ) : null}

        <div className="module-help-body">
          {view === 'guide' ? (
            <div className="module-help-guide">
              <section className="module-help-purpose">
                <span className="help-kicker">Para qué sirve</span>
                <p>{content.purpose}</p>
              </section>

              <section>
                <h3>Qué puedes hacer</h3>
                <ul>
                  {content.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3>Cómo comenzar</h3>
                <ol>
                  {content.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>

              <section>
                <h3>Recomendaciones</h3>
                <ul>
                  {content.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </section>

              <section className="module-help-permissions">
                <h3>Permisos</h3>
                <p>{content.permissions}</p>
              </section>

              {importKinds.length ? (
                <Button onClick={() => setView('import')} variant="secondary">
                  Importar información a este módulo
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="module-help-imports">
              {importKinds.length > 1 ? (
                <div className="module-help-import-picker">
                  {importKinds.map((kind) => (
                    <button
                      data-active={selectedKind === kind || undefined}
                      key={kind}
                      onClick={() => setSelectedKind(kind)}
                      type="button"
                    >
                      <strong>{IMPORT_DEFINITIONS[kind].title}</strong>
                      <span>{IMPORT_DEFINITIONS[kind].description}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedKind ? (
                <CsvImportWizard
                  condominiumId={condominiumId}
                  key={`${route.key}-${selectedKind}`}
                  kind={selectedKind}
                  session={session}
                />
              ) : (
                <p>Este módulo no tiene importaciones disponibles.</p>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
