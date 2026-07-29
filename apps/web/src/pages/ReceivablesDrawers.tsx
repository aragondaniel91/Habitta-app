import type { ComponentProps } from 'react';
import { ReceivablesDrawerHost as ReceivablesDrawerHostImpl } from './ReceivablesDrawersImpl';

export type { ReceivablesDrawerMode } from './ReceivablesDrawersImpl';

type Props = Omit<ComponentProps<typeof ReceivablesDrawerHostImpl>, 'selectedReceivable'> & {
  selectedReceivable: ComponentProps<typeof ReceivablesDrawerHostImpl>['selectedReceivable'];
};

export function ReceivablesDrawerHost({ selectedReceivable, ...props }: Props) {
  return selectedReceivable ? (
    <ReceivablesDrawerHostImpl {...props} selectedReceivable={selectedReceivable} />
  ) : (
    <ReceivablesDrawerHostImpl {...props} />
  );
}
