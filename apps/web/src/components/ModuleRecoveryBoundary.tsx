import { Component, type ReactNode } from 'react';
import { Button } from './ui';
import { InlineNotice } from './WorkspaceUi';
import './module-recovery.css';

type Props = {
  children: ReactNode;
  onBack: () => void;
};

type State = { failed: boolean };

/** A failed lazy import must not tear down the authenticated AppShell.
 * Navigating away remounts this boundary via the route key.
 */
export class ModuleRecoveryBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="module-recovery">
        <InlineNotice tone="error" title="No se pudo abrir este módulo">
          Hubo un problema al cargar esta sección. Tu información no se ha modificado.
        </InlineNotice>
        <div className="module-recovery__actions">
          <Button onClick={this.props.onBack} variant="secondary">
            Volver a Unidades
          </Button>
          <Button onClick={() => window.location.reload()}>Reintentar carga</Button>
        </div>
      </div>
    );
  }
}
