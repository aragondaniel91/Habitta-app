import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Dialog, DialogBody, DialogFooter } from '../../components/Dialog';
import { Badge, Button, Field } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import type { ExpenseCategory } from '../../lib/expenses';

type Props = {
  condominiumId: string;
  session: Session;
  categories: ExpenseCategory[];
  expenseCounts?: Record<string, number>;
  onChanged: () => void | Promise<void>;
  onOpenDirectory: () => void;
};

const categoryCode = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function ExpenseCategoryManager({
  condominiumId,
  session,
  categories,
  expenseCounts,
  onChanged,
  onOpenDirectory,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => {
    setCreating(false);
    setEditing(null);
    setName('');
    setDescription('');
  };

  const startCreate = () => {
    resetForm();
    setCreating(true);
    setError('');
  };

  const startEditing = (category: ExpenseCategory) => {
    setCreating(false);
    setEditing(category);
    setName(category.name);
    setDescription(category.description ?? '');
    setError('');
  };

  const request = async (path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(path, session, { method, body: JSON.stringify(body) });
      await onChanged();
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar la categoría.',
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('El nombre de la categoría debe tener al menos 2 caracteres.');
      return;
    }
    const body = { name: trimmedName, description: description.trim() || undefined };
    const saved = editing
      ? await request(
          `/v1/condominiums/${condominiumId}/expense-categories/${editing.id}`,
          'PATCH',
          body,
        )
      : await request(`/v1/condominiums/${condominiumId}/expense-categories`, 'POST', {
          ...body,
          code: categoryCode(trimmedName),
        });
    if (saved) resetForm();
  };

  const setArchived = async () => {
    if (!archiveTarget) return;
    const category = archiveTarget;
    const saved = await request(
      `/v1/condominiums/${condominiumId}/expense-categories/${category.id}`,
      'PATCH',
      { isActive: !category.is_active },
    );
    if (saved) setArchiveTarget(null);
  };

  return (
    <section aria-label="Gestión de categorías" className="expenses-category-manager">
      <div className="expenses-category-manager__header">
        <div>
          <p>
            Organiza los gastos sin alterar el historial. Las categorías archivadas se conservan en
            los gastos existentes.
          </p>
        </div>
        <Button onClick={startCreate} size="sm" type="button">
          Nueva categoría
        </Button>
      </div>

      <div className="expenses-category-manager__directory-link">
        <span>¿Necesitas gestionar un proveedor?</span>
        <Button onClick={onOpenDirectory} size="sm" type="button" variant="ghost">
          Abrir Directorio de proveedores
        </Button>
      </div>

      {error ? (
        <div aria-live="assertive" className="expenses-inline-alert" role="alert">
          {error}
        </div>
      ) : null}

      {creating || editing ? (
        <form
          aria-label={editing ? `Editar ${editing.name}` : 'Nueva categoría'}
          className="expenses-category-editor ux-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="expenses-category-editor__heading">
            <strong>{editing ? 'Editar categoría' : 'Nueva categoría'}</strong>
            <Button disabled={saving} onClick={resetForm} size="sm" type="button" variant="ghost">
              Cancelar
            </Button>
          </div>
          <div className="expenses-category-editor__fields">
            <Field label="Nombre" required>
              <input
                autoFocus
                className="input"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nueva categoría"
                value={name}
              />
            </Field>
            <Field hint="Opcional" label="Descripción">
              <input
                className="input"
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </Field>
          </div>
          <div className="expenses-category-editor__actions">
            <Button disabled={saving} type="submit">
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </div>
        </form>
      ) : null}

      {categories.length ? (
        <div className="expenses-category-list" role="list">
          {categories.map((category) => {
            const count = expenseCounts?.[category.id];
            return (
              <article className="expenses-category-row" key={category.id} role="listitem">
                <div className="expenses-category-row__main">
                  <strong>{category.name}</strong>
                  {category.description ? <span>{category.description}</span> : null}
                </div>
                <div className="expenses-category-row__meta">
                  <Badge tone={category.is_active ? 'success' : 'neutral'}>
                    {category.is_active ? 'Activa' : 'Archivada'}
                  </Badge>
                  {typeof count === 'number' ? (
                    <small>
                      {count === 1 ? '1 gasto vinculado' : `${count} gastos vinculados`}
                    </small>
                  ) : null}
                </div>
                <div
                  aria-label={`Acciones para ${category.name}`}
                  className="expenses-category-row__actions"
                >
                  <Button
                    onClick={() => startEditing(category)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Editar
                  </Button>
                  <Button
                    disabled={saving}
                    onClick={() => setArchiveTarget(category)}
                    size="sm"
                    type="button"
                    variant={category.is_active ? 'danger' : 'secondary'}
                  >
                    {category.is_active ? 'Archivar' : 'Restaurar'}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="expenses-category-empty" role="status">
          <strong>Aún no hay categorías</strong>
          <span>Crea una categoría para clasificar los nuevos gastos.</span>
        </div>
      )}

      {archiveTarget ? (
        <Dialog
          closeDisabled={saving}
          description={
            archiveTarget.is_active
              ? 'La categoría dejará de estar disponible para gastos nuevos. Los gastos históricos no cambian.'
              : 'La categoría volverá a estar disponible para gastos nuevos.'
          }
          onClose={() => !saving && setArchiveTarget(null)}
          requireExplicitConfirm
          size="sm"
          title={archiveTarget.is_active ? '¿Archivar categoría?' : '¿Restaurar categoría?'}
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
                  ? 'Archivar categoría'
                  : 'Restaurar categoría'}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </section>
  );
}
