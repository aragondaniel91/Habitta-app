import type { ComponentProps } from 'react';
import { AccountStatementDrawer } from '../features/receivables/AccountStatementDrawer';
import { ReceivablesDrawerHost as ReceivablesDrawerHostImpl } from './ReceivablesDrawersImpl';

export type { ReceivablesDrawerMode } from './ReceivablesDrawersImpl';

type Props = Omit<ComponentProps<typeof ReceivablesDrawerHostImpl>, 'selectedReceivable'> & {
  selectedReceivable: ComponentProps<typeof ReceivablesDrawerHostImpl>['selectedReceivable'];
};

export function ReceivablesDrawerHost({
  condominiumId,
  session,
  mode,
  units,
  selectedReceivable,
  onClose,
  ...props
}: Props) {
  if (mode === 'statement') {
    return (
      <AccountStatementDrawer
        condominiumId={condominiumId}
        onClose={onClose}
        session={session}
        units={units}
      />
    );
  }

  const implementationProps = {
    ...props,
    condominiumId,
    session,
    mode,
    units,
    onClose,
  };

  return selectedReceivable ? (
    <ReceivablesDrawerHostImpl {...implementationProps} selectedReceivable={selectedReceivable} />
  ) : (
    <ReceivablesDrawerHostImpl {...implementationProps} />
  );
}
