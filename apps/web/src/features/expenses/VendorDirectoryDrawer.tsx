import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Dialog, DialogBody, DialogFooter } from '../../components/Dialog';
import { Drawer } from '../../components/Drawer';
import { PeopleIcon } from '../../components/icons';
import { Badge, Button, EmptyState, Field } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import {
  emptyVendorInput,
  serializeVendorInput,
  validateVendorInput,
  vendorToInput,
} from '../../lib/expenses';
import type { ExpenseVendor, VendorInput } from '../../lib/expenses';

type Props = {
  condominiumId: string;
  session: Session;
  vendors: ExpenseVendor[];
  onClose: () => void;
  onChanged: () => Promise<void>;
};

export function VendorDirectoryDrawer({
  condominiumId,
  session,
  vendors,
  onClose,
  onChanged,
}: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ExpenseVendor | null>(null);
  const [form, setForm] = useState<VendorInput>(emptyVendorInput);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ExpenseVendor | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    if (!normalized) return vendors;
    return vendors.filter((vendor) =>
      [vendor.name, vendor.tax_identifier, vendor.email, vendor.phone]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es').includes(normalized)),
    );
  }, [query, vendors]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyVendorInput());
    setError('');
  };
  const startEdit = (vendor: ExpenseVendor) => {
    setEditing(vendor);
    setForm(vendorToInput(vendor));
    setError('');
  };
  const update = <K extends keyof VendorInput>(key: K, value: VendorInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateVendorInput(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/vendors${editing ? `/${editing.id}` : ''}`,
        session,
        { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(serializeVendorInput(form)) },
      );
      await onChanged();
      startCreate();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar el proveedor.',
      );
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async () => {
    if (!archiveTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/vendors/${archiveTarget.id}`, session, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !archiveTarget.is_active }),
      });
      await onChanged();
      setArchiveTarget(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar el proveedor.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Drawer
        eyebrow="Directorio operativo"
        onClose={onClose}
        prefix="expenses"
        title="Proveedores"
        wide
      >
        <div className="vendor-directory">
          <div className="vendor-directory__intro">
            <div>
              <strong>Datos de contacto para gastos</strong>
              <p>
                Solo se guardan datos de perfil compatibles con el esquema. No incluye credenciales
                bancarias.
              </p>
            </div>
            <Button onClick={startCreate} size="sm" type="button">
              Nuevo proveedor
            </Button>
          </div>

          {error ? (
            <div className="expenses-inline-alert" role="alert">
              {error}
            </div>
          ) : null}

          <form
            aria-label={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
            className="vendor-directory__form ux-form"
            onSubmit={(event) => void save(event)}
          >
            <div className="vendor-directory__form-heading">
              <div>
                <h3>{editing ? 'Editar proveedor' : 'Registrar proveedor'}</h3>
                <p>Los campos opcionales pueden corregirse o vaciarse más adelante.</p>
              </div>
              {editing ? (
                <Button onClick={startCreate} size="sm" type="button" variant="ghost">
                  Cancelar edición
                </Button>
              ) : null}
            </div>
            <Field label="Nombre comercial o razón social">
              <input
                autoFocus
                className="input"
                maxLength={160}
                onChange={(event) => update('name', event.target.value)}
                required
                value={form.name}
              />
            </Field>
            <div className="vendor-directory__field-grid">
              <Field hint="Opcional" label="Identificación fiscal (RIF, NIT o RUC)">
                <input
                  className="input"
                  maxLength={80}
                  onChange={(event) => update('taxIdentifier', event.target.value)}
                  value={form.taxIdentifier}
                />
              </Field>
              <Field hint="Opcional" label="Teléfono">
                <input
                  className="input"
                  inputMode="tel"
                  maxLength={40}
                  onChange={(event) => update('phone', event.target.value)}
                  type="tel"
                  value={form.phone}
                />
              </Field>
            </div>
            <Field hint="Opcional" label="Correo electrónico">
              <input
                className="input"
                maxLength={254}
                onChange={(event) => update('email', event.target.value)}
                type="email"
                value={form.email}
              />
            </Field>
            <Field hint="Opcional · información interna, sin datos bancarios" label="Notas">
              <textarea
                className="textarea"
                maxLength={1000}
                onChange={(event) => update('notes', event.target.value)}
                rows={3}
                value={form.notes}
              />
            </Field>
            <div className="vendor-directory__form-actions">
              <Button disabled={saving} type="submit">
                {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar proveedor'}
              </Button>
            </div>
          </form>

          <section aria-label="Lista de proveedores" className="vendor-directory__list">
            <div className="vendor-directory__list-heading">
              <h3>Directorio</h3>
              <span>{vendors.filter((vendor) => vendor.is_active).length} activos</span>
            </div>
            <input
              aria-label="Buscar proveedores"
              className="input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, RIF, correo o teléfono"
              value={query}
            />
            {filtered.length ? (
              <div className="vendor-directory__cards">
                {filtered.map((vendor) => (
                  <article className="vendor-directory__card" key={vendor.id}>
                    <div>
                      <div className="vendor-directory__card-title">
                        <strong>{vendor.name}</strong>
                        <Badge tone={vendor.is_active ? 'success' : 'neutral'}>
                          {vendor.is_active ? 'Activo' : 'Archivado'}
                        </Badge>
                      </div>
                      <p>
                        {[vendor.tax_identifier, vendor.phone, vendor.email]
                          .filter(Boolean)
                          .join(' · ') || 'Sin datos de contacto adicionales'}
                      </p>
                      {vendor.notes ? <small>{vendor.notes}</small> : null}
                    </div>
                    <div className="vendor-directory__card-actions">
                      <Button
                        onClick={() => startEdit(vendor)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Editar
                      </Button>
                      <Button
                        onClick={() => setArchiveTarget(vendor)}
                        size="sm"
                        type="button"
                        variant={vendor.is_active ? 'danger' : 'secondary'}
                      >
                        {vendor.is_active ? 'Archivar' : 'Reactivar'}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                description="Prueba otro término o registra un proveedor."
                icon={<PeopleIcon size={26} />}
                title="No hay proveedores que coincidan"
              />
            )}
          </section>
        </div>
      </Drawer>

      {archiveTarget ? (
        <Dialog
          closeDisabled={saving}
          description={
            archiveTarget.is_active
              ? 'El proveedor dejará de estar disponible para nuevos gastos. Los gastos históricos seguirán vinculados y no se eliminarán.'
              : 'El proveedor volverá a estar disponible para nuevos gastos.'
          }
          onClose={() => !saving && setArchiveTarget(null)}
          requireExplicitConfirm={archiveTarget.is_active}
          title={archiveTarget.is_active ? '¿Archivar proveedor?' : '¿Reactivar proveedor?'}
        >
          <DialogBody>
            <strong>{archiveTarget.name}</strong>
          </DialogBody>
          <DialogFooter>
            <Button
              data-confirm-dialog-action="cancel"
              disabled={saving}
              onClick={() => setArchiveTarget(null)}
              type="button"
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button
              data-confirm-dialog-action="confirm"
              disabled={saving}
              onClick={() => void setArchived()}
              type="button"
              variant={archiveTarget.is_active ? 'danger' : 'primary'}
            >
              {saving
                ? 'Guardando…'
                : archiveTarget.is_active
                  ? 'Archivar proveedor'
                  : 'Reactivar proveedor'}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  );
}
