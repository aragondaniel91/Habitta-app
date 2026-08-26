import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormGrid } from '../../components/FormLayout';
import { Button, Field, Surface } from '../../components/ui';
import { SettingsIcon } from '../../components/icons';
import { apiRequest } from '../../lib/api';

type Condominium = {
  id: string;
  organization_id: string;
  name: string;
  country_code: string | null;
  city: string | null;
  timezone: string | null;
  primary_currency_code: string | null;
  secondary_currency_code: string | null;
  legal_name: string | null;
  legal_id_type: string | null;
  legal_id_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  state_region: string | null;
  municipality: string | null;
  parish: string | null;
  postal_code: string | null;
};

type Organization = { id: string; name: string };

type ProfileForm = {
  name: string;
  countryCode: string;
  addressLine1: string;
  city: string;
  timezone: string;
  primaryCurrencyCode: string;
  secondaryCurrencyCode: string;
  legalName: string;
  legalIdType: string;
  legalIdNumber: string;
  addressLine2: string;
  stateRegion: string;
  municipality: string;
  parish: string;
  postalCode: string;
};

const formFromCondominium = (condominium: Condominium): ProfileForm => ({
  name: condominium.name,
  countryCode: condominium.country_code ?? 'VE',
  addressLine1: condominium.address_line1 ?? '',
  city: condominium.city ?? '',
  timezone: condominium.timezone ?? 'America/Caracas',
  primaryCurrencyCode: condominium.primary_currency_code ?? 'USD',
  secondaryCurrencyCode: condominium.secondary_currency_code ?? '',
  legalName: condominium.legal_name ?? '',
  legalIdType: condominium.legal_id_type ?? '',
  legalIdNumber: condominium.legal_id_number ?? '',
  addressLine2: condominium.address_line2 ?? '',
  stateRegion: condominium.state_region ?? '',
  municipality: condominium.municipality ?? '',
  parish: condominium.parish ?? '',
  postalCode: condominium.postal_code ?? '',
});

const optional = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? { value: trimmed } : null;
};

export function CondominiumIdentityPanel({
  condominiumId,
  session,
  onRenamed,
}: {
  condominiumId: string;
  session: Session;
  onRenamed?: (name: string) => void;
}) {
  const [condominium, setCondominium] = useState<Condominium | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [drawer, setDrawer] = useState<'condominium' | 'organization' | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await apiRequest<Condominium[]>(`/v1/condominiums/${condominiumId}`, session);
      const row = rows[0];
      if (!row) return;
      setCondominium(row);
      const organizations = await apiRequest<Organization[]>('/v1/organizations', session);
      setOrganization(organizations.find((item) => item.id === row.organization_id) ?? null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar la identidad del condominio.',
      );
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDrawer(null);
    setMessage('');
  }, [condominiumId]);

  const openCondominiumDrawer = () => {
    if (!condominium) return;
    setForm(formFromCondominium(condominium));
    setMessage('');
    setDrawer('condominium');
  };

  const openOrganizationDrawer = () => {
    setOrganizationName(organization?.name ?? '');
    setMessage('');
    setDrawer('organization');
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy('condominium');
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}`, session, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          countryCode: form.countryCode.trim().toUpperCase(),
          addressLine1: form.addressLine1.trim(),
          city: form.city.trim(),
          timezone: form.timezone.trim(),
          primaryCurrencyCode: form.primaryCurrencyCode.trim().toUpperCase(),
          ...(optional(form.secondaryCurrencyCode)
            ? { secondaryCurrencyCode: form.secondaryCurrencyCode.trim().toUpperCase() }
            : {}),
          ...(optional(form.legalName) ? { legalName: form.legalName.trim() } : {}),
          ...(optional(form.legalIdType) ? { legalIdType: form.legalIdType.trim() } : {}),
          ...(optional(form.legalIdNumber) ? { legalIdNumber: form.legalIdNumber.trim() } : {}),
          ...(optional(form.addressLine2) ? { addressLine2: form.addressLine2.trim() } : {}),
          ...(optional(form.stateRegion) ? { stateRegion: form.stateRegion.trim() } : {}),
          ...(optional(form.municipality) ? { municipality: form.municipality.trim() } : {}),
          ...(optional(form.parish) ? { parish: form.parish.trim() } : {}),
          ...(optional(form.postalCode) ? { postalCode: form.postalCode.trim() } : {}),
        }),
      });
      setDrawer(null);
      setMessage('Datos del condominio actualizados.');
      onRenamed?.(form.name.trim());
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron guardar los datos del condominio.',
      );
    } finally {
      setBusy('');
    }
  };

  const saveOrganization = async (event: FormEvent) => {
    event.preventDefault();
    if (!organization) return;
    setBusy('organization');
    setError('');
    try {
      await apiRequest(`/v1/organizations/${organization.id}`, session, {
        method: 'PATCH',
        body: JSON.stringify({ name: organizationName.trim() }),
      });
      setDrawer(null);
      setMessage('Nombre de la organización actualizado.');
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar la organización.',
      );
    } finally {
      setBusy('');
    }
  };

  const update = (key: keyof ProfileForm, value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  return (
    <>
      <Surface className="settings-panel settings-identity-card">
        <div className="settings-section-heading">
          <div>
            <span className="settings-kicker">Identificación</span>
            <h2>Datos del condominio</h2>
            <p>
              Estos datos aparecen en recibos, certificados de solvencia y comunicaciones.
              Corrígelos aquí cuando cambien o si quedó un error en la configuración inicial.
            </p>
          </div>
          <SettingsIcon size={20} />
        </div>

        {error ? (
          <div className="settings-inline-alert" role="alert">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="settings-inline-alert" data-tone="success" role="status">
            {message}
          </div>
        ) : null}

        <dl className="settings-account-details">
          <div>
            <dt>Condominio</dt>
            <dd>{condominium?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Organización</dt>
            <dd>{organization?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Identificación legal</dt>
            <dd>
              {condominium?.legal_id_number
                ? `${condominium.legal_id_type ?? 'ID'} ${condominium.legal_id_number}`
                : 'Sin registrar'}
            </dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>
              {condominium?.address_line1
                ? `${condominium.address_line1}${condominium.city ? `, ${condominium.city}` : ''}`
                : 'Sin registrar'}
            </dd>
          </div>
        </dl>

        <FormActions align="start">
          <Button disabled={!condominium} onClick={openCondominiumDrawer} size="sm">
            Editar datos del condominio
          </Button>
          <Button
            disabled={!organization}
            onClick={openOrganizationDrawer}
            size="sm"
            variant="secondary"
          >
            Renombrar organización
          </Button>
        </FormActions>
      </Surface>

      {drawer === 'condominium' && form ? (
        <Drawer
          eyebrow="Configuración"
          onClose={() => setDrawer(null)}
          prefix="settings"
          title="Editar datos del condominio"
        >
          <form className="settings-form ux-form" onSubmit={(event) => void saveProfile(event)}>
            <p className="settings-drawer-intro">
              El nombre es el que Habitta pide escribir para confirmar una eliminación, y la
              identificación legal es la que se imprime en recibos y solvencias. La estructura de
              torres y unidades no se cambia desde aquí.
            </p>
            <Field label="Nombre del condominio" required>
              <input
                className="input"
                maxLength={120}
                onChange={(event) => update('name', event.target.value)}
                required
                value={form.name}
              />
            </Field>
            <FormGrid>
              <Field hint="Denominación registrada, si es distinta." label="Nombre legal">
                <input
                  className="input"
                  maxLength={160}
                  onChange={(event) => update('legalName', event.target.value)}
                  value={form.legalName}
                />
              </Field>
              <Field hint="Por ejemplo RIF." label="Tipo de identificación">
                <input
                  className="input"
                  maxLength={24}
                  onChange={(event) => update('legalIdType', event.target.value)}
                  value={form.legalIdType}
                />
              </Field>
            </FormGrid>
            <Field hint="Aparece en recibos y certificados." label="Número de identificación">
              <input
                className="input"
                maxLength={40}
                onChange={(event) => update('legalIdNumber', event.target.value)}
                value={form.legalIdNumber}
              />
            </Field>
            <Field label="Dirección" required>
              <input
                className="input"
                maxLength={200}
                onChange={(event) => update('addressLine1', event.target.value)}
                required
                value={form.addressLine1}
              />
            </Field>
            <Field label="Complemento de dirección">
              <input
                className="input"
                maxLength={200}
                onChange={(event) => update('addressLine2', event.target.value)}
                value={form.addressLine2}
              />
            </Field>
            <FormGrid>
              <Field label="Ciudad" required>
                <input
                  className="input"
                  maxLength={120}
                  onChange={(event) => update('city', event.target.value)}
                  required
                  value={form.city}
                />
              </Field>
              <Field label="Estado o región">
                <input
                  className="input"
                  maxLength={120}
                  onChange={(event) => update('stateRegion', event.target.value)}
                  value={form.stateRegion}
                />
              </Field>
            </FormGrid>
            <FormGrid>
              <Field label="Municipio">
                <input
                  className="input"
                  maxLength={120}
                  onChange={(event) => update('municipality', event.target.value)}
                  value={form.municipality}
                />
              </Field>
              <Field label="Parroquia">
                <input
                  className="input"
                  maxLength={120}
                  onChange={(event) => update('parish', event.target.value)}
                  value={form.parish}
                />
              </Field>
            </FormGrid>
            <FormGrid>
              <Field hint="Código ISO de dos letras." label="País" required>
                <input
                  className="input"
                  maxLength={2}
                  onChange={(event) => update('countryCode', event.target.value.toUpperCase())}
                  required
                  value={form.countryCode}
                />
              </Field>
              <Field label="Código postal">
                <input
                  className="input"
                  maxLength={24}
                  onChange={(event) => update('postalCode', event.target.value)}
                  value={form.postalCode}
                />
              </Field>
            </FormGrid>
            <Field hint="Por ejemplo America/Caracas." label="Zona horaria" required>
              <input
                className="input"
                maxLength={64}
                onChange={(event) => update('timezone', event.target.value)}
                required
                value={form.timezone}
              />
            </Field>
            <FormGrid>
              <Field label="Moneda principal" required>
                <input
                  className="input"
                  maxLength={3}
                  onChange={(event) =>
                    update('primaryCurrencyCode', event.target.value.toUpperCase())
                  }
                  required
                  value={form.primaryCurrencyCode}
                />
              </Field>
              <Field hint="Debe ser distinta de la principal." label="Moneda secundaria">
                <input
                  className="input"
                  maxLength={3}
                  onChange={(event) =>
                    update('secondaryCurrencyCode', event.target.value.toUpperCase())
                  }
                  value={form.secondaryCurrencyCode}
                />
              </Field>
            </FormGrid>
            <FormActions sticky>
              <Button onClick={() => setDrawer(null)} type="button" variant="secondary">
                Cancelar
              </Button>
              <Button disabled={busy === 'condominium'} type="submit">
                {busy === 'condominium' ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </FormActions>
          </form>
        </Drawer>
      ) : null}

      {drawer === 'organization' ? (
        <Drawer
          eyebrow="Configuración"
          onClose={() => setDrawer(null)}
          prefix="settings"
          title="Renombrar organización"
        >
          <form
            className="settings-form ux-form"
            onSubmit={(event) => void saveOrganization(event)}
          >
            <p className="settings-drawer-intro">
              La organización agrupa a los condominios que administras. Cambiar su nombre no afecta
              ningún dato financiero.
            </p>
            <Field label="Nombre de la organización" required>
              <input
                className="input"
                maxLength={120}
                onChange={(event) => setOrganizationName(event.target.value)}
                required
                value={organizationName}
              />
            </Field>
            <FormActions sticky>
              <Button onClick={() => setDrawer(null)} type="button" variant="secondary">
                Cancelar
              </Button>
              <Button disabled={busy === 'organization'} type="submit">
                {busy === 'organization' ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </FormActions>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
