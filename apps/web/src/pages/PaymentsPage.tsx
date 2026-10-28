import type { Session } from '@supabase/supabase-js';
import { useCondominiumRoles, usesResidentDashboard } from '../lib/roles';
import { PaymentsPage as AdminPaymentsPage } from './AdminPaymentsPage';
import { ResidentPaymentsPage } from './ResidentPaymentsPage';

type Props = {
  condominiumId: string;
  condominiumName: string;
  onOpenPerson?: ((personId: string) => void) | undefined;
  onOpenUnit?: ((unitId: string) => void) | undefined;
  session: Session;
};

export function PaymentsPage({ onOpenPerson, onOpenUnit, ...props }: Props) {
  const roles = useCondominiumRoles();
  return usesResidentDashboard(roles) ? (
    <ResidentPaymentsPage {...props} />
  ) : (
    <AdminPaymentsPage onOpenPerson={onOpenPerson} onOpenUnit={onOpenUnit} {...props} />
  );
}
