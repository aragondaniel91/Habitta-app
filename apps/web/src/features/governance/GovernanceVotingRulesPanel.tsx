import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button, Field, Surface } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import type { GovernanceProposal } from '../../lib/governance';
import { governanceStatusLabels } from '../../lib/governance';
import { canManageGovernance, useCondominiumRoles } from '../../lib/roles';
import './governance-voting-rules-panel.css';

type Props = {
  condominiumId: string;
  session: Session;
};

type DraftValues = Record<string, { quorum: string; threshold: string }>;

export function GovernanceVotingRulesPanel({ condominiumId, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManageGovernance(roles);
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await apiRequest<GovernanceProposal[]>(
        `/v1/condominiums/${condominiumId}/governance-proposals`,
        session,
      );
      setProposals(rows);
      setDraftValues(
        Object.fromEntries(
          rows.map((proposal) => [
            proposal.id,
            {
              quorum: String(proposal.quorum_percentage),
              threshold: String(proposal.approval_threshold_percentage),
            },
          ]),
        ),
      );
      setError('');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar las reglas de votación.',
      );
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (proposal: GovernanceProposal) => {
    const values = draftValues[proposal.id];
    if (!values) return;
    setSavingId(proposal.id);
    setError('');
    setMessage('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/governance-proposals/${proposal.id}/voting-rules`,
        session,
        {
          method: 'PATCH',
          body: JSON.stringify({
            quorumPercentage: Number(values.quorum),
            approvalThresholdPercentage: Number(values.threshold),
            expectedVersion: proposal.version,
          }),
        },
      );
      await load();
      setMessage(`Reglas actualizadas para “${proposal.title}”.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudieron guardar las reglas.',
      );
    } finally {
      setSavingId('');
    }
  };

  if (!proposals.length) return null;

  return (
    <Surface className="governance-voting-rules">
      <div className="governance-voting-rules__header">
        <div>
          <small>Reglas de decisión</small>
          <h2>Quórum y aprobación</h2>
          <p>
            El quórum mide participación. La aprobación requerida mide el porcentaje de votos válidos
            emitidos a favor. Son reglas distintas y se congelan al abrir la votación.
          </p>
        </div>
      </div>

      {error ? <div className="governance-inline-alert">{error}</div> : null}
      {message ? <div className="governance-success-alert">{message}</div> : null}

      <div className="governance-voting-rules__list">
        {proposals.map((proposal) => {
          const editable = manage && proposal.status === 'draft';
          const values = draftValues[proposal.id] ?? {
            quorum: String(proposal.quorum_percentage),
            threshold: String(proposal.approval_threshold_percentage),
          };
          return (
            <article className="governance-voting-rule" key={proposal.id}>
              <div className="governance-voting-rule__title">
                <div>
                  <strong>{proposal.title}</strong>
                  <small>{governanceStatusLabels[proposal.status]}</small>
                </div>
                {!editable ? <span>Reglas bloqueadas</span> : <span>Editable en borrador</span>}
              </div>

              <div className="governance-voting-rule__fields">
                <Field label="Quórum de participación" hint="Mínimo de entidades elegibles que deben votar.">
                  <input
                    className="input"
                    disabled={!editable}
                    max="100"
                    min="0"
                    onChange={(event) =>
                      setDraftValues((current) => ({
                        ...current,
                        [proposal.id]: { ...values, quorum: event.target.value },
                      }))
                    }
                    step="0.01"
                    type="number"
                    value={values.quorum}
                  />
                </Field>
                <Field
                  label="Aprobación requerida"
                  hint="Porcentaje mínimo de votos válidos emitidos a favor."
                >
                  <input
                    className="input"
                    disabled={!editable}
                    max="100"
                    min="0.01"
                    onChange={(event) =>
                      setDraftValues((current) => ({
                        ...current,
                        [proposal.id]: { ...values, threshold: event.target.value },
                      }))
                    }
                    step="0.01"
                    type="number"
                    value={values.threshold}
                  />
                </Field>
              </div>

              {editable ? (
                <Button
                  disabled={savingId === proposal.id}
                  onClick={() => void save(proposal)}
                  size="sm"
                  variant="secondary"
                >
                  {savingId === proposal.id ? 'Guardando…' : 'Guardar reglas'}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
    </Surface>
  );
}
