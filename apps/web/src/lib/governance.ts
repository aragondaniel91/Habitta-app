export type GovernanceStatus = 'draft' | 'open' | 'closed' | 'approved' | 'rejected' | 'archived';
export type GovernanceCategory =
  'budget' | 'maintenance' | 'improvement' | 'community' | 'policy' | 'other';
export type GovernanceVotingBasis = 'one_per_owner' | 'one_per_unit';

export type GovernanceProposal = {
  id: string;
  condominium_id: string;
  title: string;
  summary: string | null;
  description: string;
  category: GovernanceCategory;
  status: GovernanceStatus;
  voting_basis: GovernanceVotingBasis;
  quorum_percentage: number | string;
  budget_amount: string | null;
  currency_code: string | null;
  opens_at: string | null;
  closes_at: string;
  version: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type GovernanceOption = {
  id: string;
  proposal_id: string;
  label: string;
  description: string | null;
  sort_order: number;
};

export type GovernanceAttachment = {
  id: string;
  proposal_id: string;
  document_type: 'quote' | 'budget' | 'support' | 'minutes' | 'other';
  file_name: string;
  url: string;
};

export type GovernanceEligibility = {
  basis: GovernanceVotingBasis;
  eligible: boolean;
  units: Array<{ id: string; code: string }>;
  votes: Array<{ id: string; option_id: string; unit_id: string | null; cast_at: string }>;
};

export type GovernanceResults = {
  proposal_id: string;
  status: GovernanceStatus;
  voting_basis: GovernanceVotingBasis;
  eligible_count: number;
  votes_cast: number;
  participation_percentage: number | string;
  quorum_percentage: number | string;
  quorum_met: boolean;
  options: Array<{
    id: string;
    label: string;
    description: string | null;
    sort_order: number;
    votes: number;
    percentage: number | string;
  }>;
};

export const governanceStatusLabels: Record<GovernanceStatus, string> = {
  draft: 'Borrador',
  open: 'Votación abierta',
  closed: 'Votación cerrada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  archived: 'Archivada',
};

export const governanceCategoryLabels: Record<GovernanceCategory, string> = {
  budget: 'Presupuesto',
  maintenance: 'Mantenimiento',
  improvement: 'Mejora',
  community: 'Comunidad',
  policy: 'Normativa',
  other: 'Otra',
};

export const votingBasisLabels: Record<GovernanceVotingBasis, string> = {
  one_per_owner: 'Un voto por propietario',
  one_per_unit: 'Un voto por unidad',
};

export function formatGovernanceDate(value: string | null) {
  if (!value) return 'No definida';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function isProposalOpen(proposal: GovernanceProposal, now = Date.now()) {
  const opensAt = proposal.opens_at
    ? Date.parse(proposal.opens_at)
    : Date.parse(proposal.created_at);
  return proposal.status === 'open' && opensAt <= now && Date.parse(proposal.closes_at) > now;
}

export function filterGovernanceProposals(
  proposals: GovernanceProposal[],
  filters: { query: string; status: string; category: string },
) {
  const query = filters.query.trim().toLocaleLowerCase('es');
  return proposals.filter((proposal) => {
    if (filters.status && proposal.status !== filters.status) return false;
    if (filters.category && proposal.category !== filters.category) return false;
    if (!query) return true;
    return [proposal.title, proposal.summary, proposal.description]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase('es').includes(query));
  });
}

export function nextGovernanceActions(status: GovernanceStatus) {
  if (status === 'draft') return ['open', 'archive'] as const;
  if (status === 'open') return ['close'] as const;
  if (status === 'closed') return ['approve', 'reject', 'archive'] as const;
  if (status === 'approved' || status === 'rejected') return ['archive'] as const;
  return [] as const;
}
