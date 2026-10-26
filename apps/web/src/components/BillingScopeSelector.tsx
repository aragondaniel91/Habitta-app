import { Badge, Button, Surface } from './ui';
import '../billing-scope-selector.css';
import type { ChargeScope } from '../lib/unit-domain';

type Props = {
  configured: ChargeScope;
  draft: ChargeScope;
  unitCount: number;
  authorized: boolean;
  saving: boolean;
  error: string | null;
  onChange: (next: ChargeScope) => void;
  onSave: () => void;
};

export function BillingScopeSelector({
  configured,
  draft,
  unitCount,
  authorized,
  saving,
  error,
  onChange,
  onSave,
}: Props) {
  const locked = unitCount > 0;
  return (
    <Surface className="structure-billing" data-testid="structure-billing-mode">
      <div className="structure-billing__heading">
        <div>
          <span className="structure-billing__eyebrow">Configuración de cobro</span>
          <h2>¿A quién se le generan las cuotas?</h2>
          <p>
            Elige qué representa una cuenta facturable. La estructura física es independiente de
            quién recibe los cargos.
          </p>
        </div>
        {locked ? <Badge tone="neutral">Configuración fijada</Badge> : null}
      </div>
      {!locked && authorized ? (
        <>
          <div className="structure-billing__options" aria-label="Nivel de cobro">
            {[
              {
                value: 'unit' as const,
                title: 'Por apartamento o unidad',
                description:
                  'Cada apartamento, local o unidad tiene su propia cuenta y sus cuotas.',
              },
              {
                value: 'building' as const,
                title: 'Por edificio completo',
                description:
                  'Cada edificio tiene una sola cuenta. Su junta es un contacto, no un propietario.',
              },
            ].map((option) => (
              <button
                aria-pressed={draft === option.value}
                className="structure-billing__choice"
                data-selected={draft === option.value || undefined}
                disabled={saving}
                key={option.value}
                onClick={() => onChange(option.value)}
                type="button"
              >
                <span aria-hidden="true" className="structure-billing__indicator" />
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
          <div className="structure-billing__footer">
            <p>Puedes cambiar esta elección antes de registrar la primera unidad facturable.</p>
            <Button disabled={saving || draft === configured} onClick={onSave} size="sm">
              {saving ? 'Guardando…' : 'Guardar modalidad'}
            </Button>
          </div>
          {error ? (
            <div className="structure-message" data-tone="error" role="alert">
              {error}
            </div>
          ) : null}
        </>
      ) : (
        <div className="structure-billing__locked" role="note">
          <strong>
            {configured === 'building'
              ? 'Cobro por edificio completo'
              : 'Cobro por apartamento o unidad'}
          </strong>
          <span>
            {locked
              ? 'Ya existen unidades facturables. Esta decisión queda fijada para proteger las cuotas, pagos e historial.'
              : 'Solo un administrador autorizado puede seleccionar la modalidad de cobro.'}
          </span>
        </div>
      )}
    </Surface>
  );
}
