import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, Field } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import type { ExpenseCategory } from '../../lib/expenses';

type Props = {
  condominiumId: string;
  session: Session;
  categories: ExpenseCategory[];
  onChanged: () => void;
};

export function ExpenseCategoryManager({ condominiumId, session, categories, onChanged }: Props) {
  const [editing, setEditing] = useState<ExpenseCategory>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = async (category: ExpenseCategory, body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/expense-categories/${category.id}`,
        session,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      onChanged();
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar la categoría.',
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (category: ExpenseCategory) => {
    setEditing(category);
    setName(category.name);
    setDescription(category.description ?? '');
    setError('');
  };

  const saveEdit = async () => {
    if (!editing || name.trim().length < 2) return;
    if (
      await update(editing, { name: name.trim(), description: description.trim() || undefined })
    ) {
      setEditing(undefined);
    }
  };

  return (
    <section>
      <h3>Categorías</h3>
      <p className="expenses-catalog-note">
        Archiva las categorías que ya no usarás. Los gastos históricos conservan su categoría.
      </p>
      {error ? (
        <div className="expenses-inline-alert" role="alert">
          {error}
        </div>
      ) : null}
      <div className="expenses-chip-list">
        {categories.map((category) => (
          <div className="expenses-catalog-item" key={category.id}>
            <Badge tone={category.is_active ? 'info' : 'neutral'}>{category.name}</Badge>
            <div>
              <Button
                aria-label={`Editar ${category.name}`}
                onClick={() => startEditing(category)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Editar
              </Button>
              <Button
                aria-label={`${category.is_active ? 'Archivar' : 'Reactivar'} ${category.name}`}
                disabled={saving}
                onClick={() => void update(category, { isActive: !category.is_active })}
                size="sm"
                type="button"
                variant="ghost"
              >
                {category.is_active ? 'Archivar' : 'Reactivar'}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {editing ? (
        <div className="expenses-catalog-edit">
          <Field label="Nombre de categoría">
            <input
              className="input"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>
          <Field hint="Opcional" label="Descripción">
            <input
              className="input"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </Field>
          <div>
            <Button
              disabled={saving || name.trim().length < 2}
              onClick={() => void saveEdit()}
              size="sm"
              type="button"
            >
              Guardar categoría
            </Button>
            <Button
              disabled={saving}
              onClick={() => setEditing(undefined)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
