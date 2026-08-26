import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { FormActions, FormGrid } from '../../components/FormLayout';
import { Badge, Button, EmptyState, Field, Select } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import { conceptCategoryLabels } from '../../lib/receivables';
import type { ChargeConcept } from '../../lib/receivables';

type Props = {
  condominiumId: string;
  session: Session;
  concepts: ChargeConcept[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
};

type View = 'catalog' | 'create' | 'edit';

const amountValue = (value: string | number | undefined) =>
  value == null ? '' : String(value);

export function ChargeConceptManagerDrawer({
  condominiumId,
  session,
  concepts,
  onClose,
  onRefresh,
}: Props) {
  const [view, setView] = useState<View>('create');
  const [selectedConceptId, setSelectedConceptId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const selectedConcept = concepts.find((concept) => concept.id === selectedConceptId);
  const editing = view === 'edit' && Boolean(selectedConcept);

  const openCreate = () => {
    setMessage('');
    setSelectedConceptId('');
    setView('create');
  };

  const openEdit = (concept: ChargeConcept) => {
    setMessage('');
    setSelectedConceptId(concept.id);
    setView('edit');
  };

  const backToCatalog = () => {
    setMessage('');
    setSelectedConceptId('');
    setView('catalog');
  };

  const submitConcept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const defaultAmount = String(values.get('defaultAmount') ?? '').trim();
    const defaultCurrencyCode = String(values.get('defaultCurrencyCode') ?? '').trim();
    const description = String(values.get('description') ?? '').trim();
    const payload = {
      code: String(values.get('code') ?? '').trim(),
      name: String(values.get('name') ?? '').trim(),
      category: String(values.get('category') ?? ''),
      description,
      ...(defaultCurrencyCode ? { defaultCurrencyCode } : {}),
      ...(defaultAmount ? { defaultAmount } : {}),
      isActive: String(values.get('isActive') ?? 'true') === 'true',
    };

    setLoading(true);
    setMessage('');
    try {
      if (editing && selectedConcept) {
        await apiRequest(
          `/v1/condominiums/${condominiumId}/charge-concepts/${selectedConcept.id}`,
          session,
          { method: 'PATCH', body: JSON.stringify(payload) },
        );
      } else {
        await apiRequest(`/v1/condominiums/${condominiumId}/charge-concepts`, session, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await onRefresh();
      setSelectedConceptId('');
      setView('catalog');
      setMessage(editing ? 'Concepto actualizado.' : 'Concepto creado.');
    } catch (error) {
      const baseMessage =
        error instanceof Error ? error.message : 'No se pudo guardar el concepto de cobro.';
      setMessage(
        editing
          ? `${baseMessage} Si el concepto ya tiene historial financiero, su código, nombre y categoría no pueden cambiar; los valores predeterminados sí pueden actualizarse para cargos futuros.`
          : baseMessage,
      );
    } finally {
      setLoading(false);
    }
  };

  if (view === 'catalog') {
    return (
      <Drawer
        eyebrow="Catálogo financiero"
        onClose={onClose}
        prefix="receivables"
        title="Conceptos de cobro"
      >
        {message ? (
          <div className="receivables-action-feedback" role="status">
            {message}
          </div>
        ) : null}
        <p className="receivables-drawer-intro">
          Define cómo se clasifican las cuotas. Los conceptos con historial conservan su identidad
          para que estados de cuenta y cargos publicados no cambien retroactivamente.
        </p>
        <FormActions align="start">
          <Button onClick={openCreate}>Nuevo concepto</Button>
        </FormActions>
        {concepts.length ? (
          <div className="receivables-statement-list" aria-label="Conceptos de cobro">
            {concepts.map((concept) => (
              <article key={concept.id}>
                <div>
                  <strong>{concept.name}</strong>
                  <span>
                    {concept.code} · {conceptCategoryLabels[concept.category] ?? concept.category}
                  </span>
                  <small>
                    Predeterminado: {amountValue(concept.default_amount) || 'sin monto'} ·{' '}
                    {concept.default_currency_code || 'sin moneda'}
                  </small>
                </div>
                <div>
                  <Badge tone={concept.is_active === false ? 'neutral' : 'success'}>
                    {concept.is_active === false ? 'Inactivo' : 'Activo'}
                  </Badge>
                  <Button onClick={() => openEdit(concept)} size="sm" variant="secondary">
                    Editar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            actionLabel="Crear concepto"
            description="Crea el primer concepto para clasificar cuotas, lotes y planes recurrentes."
            onAction={openCreate}
            title="Todavía no hay conceptos"
          />
        )}
      </Drawer>
    );
  }

  const concept = editing ? selectedConcept : undefined;

  return (
    <Drawer
      eyebrow={editing ? 'Configuración financiera' : 'Nuevo registro'}
      onClose={onClose}
      prefix="receivables"
      title={editing ? 'Editar concepto de cobro' : 'Crear concepto de cobro'}
    >
      {message ? (
        <div className="receivables-action-feedback" role="status">
          {message}
        </div>
      ) : null}
      <p className="receivables-drawer-intro">
        {editing
          ? 'Los cambios de descripción, monto sugerido y moneda sugerida aplican hacia adelante. Si ya existe historial financiero, Habitta protege código, nombre y categoría.'
          : 'Los conceptos ayudan a clasificar cuotas y preparar operaciones financieras de forma consistente.'}
      </p>
      <form
        className="receivables-form ux-form"
        key={concept?.id ?? 'new-concept'}
        onSubmit={(event) => void submitConcept(event)}
      >
        <FormGrid>
          <Field
            label="Código"
            hint={editing ? 'Se protege cuando ya existe historial.' : undefined}
          >
            <input
              className="input"
              defaultValue={concept?.code ?? ''}
              maxLength={32}
              name="code"
              placeholder="MANT"
              required
            />
          </Field>
          <Field
            label="Categoría"
            hint={editing ? 'Se protege cuando ya existe historial.' : undefined}
          >
            <Select defaultValue={concept?.category ?? 'regular_dues'} name="category">
              {Object.entries(conceptCategoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Field
          label="Nombre"
          hint={editing ? 'Se protege cuando ya existe historial.' : undefined}
        >
          <input
            className="input"
            defaultValue={concept?.name ?? ''}
            name="name"
            placeholder="Cuota de mantenimiento"
            required
          />
        </Field>
        <Field label="Descripción" hint="Puede ajustarse sin reescribir cargos publicados.">
          <textarea
            defaultValue={concept?.description ?? ''}
            name="description"
            placeholder="Uso interno y alcance del concepto"
          />
        </Field>
        <FormGrid>
          <Field
            label="Moneda sugerida"
            hint={
              editing
                ? 'Solo afecta operaciones futuras. Vacío conserva el valor actual.'
                : 'Solo se usa como valor predeterminado.'
            }
          >
            <Select
              defaultValue={concept?.default_currency_code ?? ''}
              name="defaultCurrencyCode"
            >
              <option value="">Sin valor predeterminado</option>
              <option value="USD">USD</option>
              <option value="VES">VES</option>
            </Select>
          </Field>
          <Field
            label="Monto sugerido"
            hint={
              editing
                ? 'Solo afecta operaciones futuras. Vacío conserva el valor actual.'
                : 'Opcional; no crea deuda por sí solo.'
            }
          >
            <input
              className="input"
              defaultValue={amountValue(concept?.default_amount)}
              inputMode="decimal"
              name="defaultAmount"
              pattern="^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$"
              placeholder="Opcional"
            />
          </Field>
        </FormGrid>
        <Field
          label="Estado"
          hint={
            editing
              ? 'Un concepto usado por un plan recurrente activo no puede desactivarse.'
              : undefined
          }
        >
          <Select
            defaultValue={concept?.is_active === false ? 'false' : 'true'}
            name="isActive"
          >
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </Select>
        </Field>
        <FormActions>
          <Button onClick={backToCatalog} type="button" variant="secondary">
            {editing ? 'Volver al catálogo' : 'Ver conceptos existentes'}
          </Button>
          <Button disabled={loading} type="submit">
            {loading ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear concepto'}
          </Button>
        </FormActions>
      </form>
    </Drawer>
  );
}
