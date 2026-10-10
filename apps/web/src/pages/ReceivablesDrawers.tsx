import type { ComponentProps } from 'react';
import { ChargeConceptManagerDrawer } from '../features/receivables/ChargeConceptManagerDrawer';
import { AccountStatementDrawer } from '../features/receivables/AccountStatementDrawer';
import { FinancialAdministrationDrawer } from '../features/receivables/FinancialAdministrationDrawer';
import { canManage, useCondominiumRoles } from '../lib/roles';
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
  const manage = canManage(useCondominiumRoles());

  if (mode === 'statement') {
    return (
      <AccountStatementDrawer
        buildingNameById={props.buildingNameById}
        condominiumId={condominiumId}
        onClose={onClose}
        session={session}
        units={units}
      />
    );
  }

  if (mode === 'administration') {
    if (!manage) return null;
    return (
      <FinancialAdministrationDrawer
        buildingNameById={props.buildingNameById}
        condominiumId={condominiumId}
        onClose={onClose}
        session={session}
        units={units}
      />
    );
  }

  if (mode === 'concept') {
    if (!manage) return null;
    return (
      <ChargeConceptManagerDrawer
        concepts={props.concepts}
        condominiumId={condominiumId}
        onClose={onClose}
        onRefresh={props.onRefresh}
        session={session}
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
