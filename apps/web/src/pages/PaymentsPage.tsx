import type { Session } from '@supabase/supabase-js';
import { useCondominiumRoles, usesResidentDashboard } from '../lib/roles';
import { PaymentsPage as AdminPaymentsPage } from './AdminPaymentsPage';
import { ResidentPaymentsPage } from './ResidentPaymentsPage';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

export function PaymentsPage(props: Props) {
  const roles = useCondominiumRoles();
  return usesResidentDashboard(roles) ? (
    <ResidentPaymentsPage {...props} />
  ) : (
    <AdminPaymentsPage {...props} />
  );
}
