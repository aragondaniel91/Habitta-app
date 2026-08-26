import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Organization } from '../components/AppShell';
import { CondominiumProfileFields } from '../components/CondominiumProfileFields';
import { ArrowRightIcon, CheckCircleIcon, HomeIcon } from '../components/icons';
import { Button, Field, Surface } from '../components/ui';
import {
  createEmptyAdminOnboardingInput,
  submitAdminOnboarding,
  validateAdminOnboarding,
  type AdminOnboardingErrors,
  type AdminOnboardingInput,
} from '../lib/adminOnboarding';
import '../add-condominium.css';

type Props = {
  organizations: Organization[];
  onCancel: () => void;
  onCreated: (condominiumId: string) => Promise<void>;
};

export function AddCondominiumPage({ organizations, onCancel, onCreated }: Props) {
  const [input, setInput] = useState<AdminOnboardingInput>(() =>
    createEmptyAdminOnboardingInput(organizations[0]?.id ?? ''),
  );
  const [errors, setErrors] = useState<AdminOnboardingErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdCondominiumId, setCreatedCondominiumId] = useState('');

  const update = (key: keyof AdminOnboardingInput, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateAdminOnboarding(input, true);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submitAdminOnboarding(input, true);
      const condominiumId = result?.condominium?.id ?? '';
      if (!condominiumId) {
        throw new Error('El condominio se creó, pero no pudimos identificarlo para abrirlo.');
      }
      setCreatedCondominiumId(condominiumId);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'No pudimos crear el nuevo condominio.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (createdCondominiumId) {
    return (
      <Surface className="add-condominium-card add-condominium-success">
        <span className="admin-onboarding-success">
          <CheckCircleIcon size={32} />
        </span>
        <div>
          <span className="access-kicker">Condominio agregado</span>
          <h2>{input.condominiumName.trim()} ya forma parte de tu organización.</h2>
          <p>
            Su identidad, estructura, datos y permisos permanecen separados de las demás
            comunidades.
          </p>
        </div>
        <Button onClick={() => void onCreated(createdCondominiumId)} type="button">
          Abrir el nuevo condominio <ArrowRightIcon size={18} />
        </Button>
      </Surface>
    );
  }

  return (
    <Surface className="add-condominium-card">
      <div className="add-condominium-heading">
        <span className="admin-onboarding-success">
          <HomeIcon size={27} />
        </span>
        <div>
          <span className="access-kicker">Expande tu administración</span>
          <h2>Agregar otro condominio</h2>
          <p>Registra su identidad legal y estructura real antes de cargar unidades o personas.</p>
        </div>
      </div>

      <form className="admin-onboarding-form ux-form" onSubmit={submit}>
        <Field error={errors.organizationId} label="Organización administradora">
          <select
            className="select"
            onChange={(event) => update('organizationId', event.target.value)}
            value={input.organizationId}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </Field>

        <CondominiumProfileFields autoFocusName errors={errors} input={input} onChange={update} />

        {submitError ? (
          <p className="access-message" data-tone="error" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="onboarding-card__actions">
          <Button disabled={submitting} onClick={onCancel} type="button" variant="ghost">
            Cancelar
          </Button>
          <Button disabled={submitting} type="submit">
            {submitting ? 'Creando condominio…' : 'Crear condominio'}
            {!submitting ? <ArrowRightIcon size={18} /> : null}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
