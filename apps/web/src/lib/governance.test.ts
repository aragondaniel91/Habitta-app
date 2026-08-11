import { describe, expect, it } from 'vitest';
import { filterGovernanceProposals, isProposalOpen, nextGovernanceActions } from './governance';
import type { GovernanceProposal } from './governance';

const proposal = (values: Partial<GovernanceProposal>): GovernanceProposal => ({
  id: '00000000-0000-4000-8000-000000000001',
  condominium_id: '00000000-0000-4000-8000-000000000002',
  title: 'Renovar fachada',
  summary: 'Propuesta de mejora',
  description: 'Renovación integral de la fachada principal.',
  category: 'improvement',
  status: 'draft',
  voting_basis: 'one_per_unit',
  quorum_percentage: 50,
  budget_amount: null,
  currency_code: null,
  opens_at: null,
  closes_at: '2026-08-10T00:00:00Z',
  version: 1,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  closed_at: null,
  ...values,
});

describe('governance workspace helpers', () => {
  it('filters proposals by text, status and category', () => {
    const rows = [
      proposal({ id: '1', status: 'open' }),
      proposal({ id: '2', title: 'Presupuesto navideño', category: 'budget', status: 'draft' }),
    ];

    expect(
      filterGovernanceProposals(rows, { query: 'navideño', status: 'draft', category: 'budget' }),
    ).toEqual([rows[1]]);
  });

  it('requires status and time window to consider voting open', () => {
    const row = proposal({
      status: 'open',
      opens_at: '2026-08-01T00:00:00Z',
      closes_at: '2026-08-10T00:00:00Z',
    });

    expect(isProposalOpen(row, Date.parse('2026-08-05T00:00:00Z'))).toBe(true);
    expect(isProposalOpen(row, Date.parse('2026-08-11T00:00:00Z'))).toBe(false);
  });

  it('keeps proposal transitions explicit and leaves closed decisions result driven', () => {
    expect(nextGovernanceActions('draft')).toEqual(['open', 'archive']);
    expect(nextGovernanceActions('open')).toEqual(['close']);
    expect(nextGovernanceActions('closed')).toEqual(['archive']);
    expect(nextGovernanceActions('archived')).toEqual([]);
  });
});
