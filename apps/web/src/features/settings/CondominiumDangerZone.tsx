import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SettingsIcon } from '../../components/icons';
import { Badge, Button, Field, Surface } from '../../components/ui';
import {
  deleteCondominium,
  getCondominiumDeletionCapability,
  retryCondominiumStorageCleanup,
} from './condominium-deletion';
import type { CondominiumDeletionCapability } from './condominium-deletion';
import './danger-zone.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

export function CondominiumDangerZone({ condominiumId, condominiumName, session }: Props) {
  const [capability, setCapability] = useState<CondominiumDeletionCapability | null>(null);
  const [armed, setArmed] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [databaseDeleted, setDatabaseDeleted] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCapability(null);
    setArmed(false);
    setConfirmation('');
    setError('');
    setDatabaseDeleted(false);
    setCleanupPending(false);
    void getCondominiumDeletionCapability(condominiumId, condominiumName, session)
      .then((value) => {
        if (!cancelled) setCapability(value);
      })
      .catch(() => {
        if (!cancelled) {
          setCapability({
            canDelete: false,
            organizationId: null,
            expectedConfirmation: `ELIMINAR ${condominiumName}`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [condominiumId, condominiumName, session]);

  const expected = capability?.expectedConfirmation ?? `ELIMINAR ${condominiumName}`;
  const confirmationMatches = confirmation === expected;

  const removeResidence = async () => {
    if (!capability?.canDelete || !confirmationMatches || deleting) return;
    if (
      !window.confirm(
        `Esta acción eliminará permanentemente ${condominiumName} y todos sus datos. Tu cuenta de Habitta se conservará. ¿Continuar?`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setError('');
    try {
      const result = await deleteCondominium(condominiumId, confirmation, session);
      setDatabaseDeleted(true);
      if (result.storageCleanup === 'pending' && result.cleanupJobId) {
        try {
          await retryCondominiumStorageCleanup(result.cleanupJobId, session);
          window.location.assign('/app');
          return;
        } catch {
          setCleanupPending(true);
          return;
        }
      }
      window.location.assign('/app');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo eliminar la residencia.',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Surface className="settings-panel danger-zone">
      <div className="settings-section-heading danger-zone__heading">
        <div>
          <span className="settings-kicker">Zona de peligro</span>
          <h2>Eliminar residencia</h2>
          <p>
            Borra este condominio y sus datos para comenzar de cero. Tu correo, sesión y cuenta de
            Habitta no se eliminan.
          </p>
        </div>
        <Badge tone="warning">Irreversible</Badge>
      </div>

      <div className="danger-zone__warning">
        <span aria-hidden="true">
          <SettingsIcon size={20} />
        </span>
        <div>
          <strong>Se eliminará todo lo que pertenece a {condominiumName}</strong>
          <p>
            Unidades, personas, cuotas, pagos, recibos, tesorería, gastos, presupuestos,
            mantenimiento, documentos, solicitudes, anuncios, votaciones, auditoría y archivos
            privados asociados a esta residencia.
          </p>
        </div>
      </div>

      {!capability ? <p className="danger-zone__muted">Verificando autorización…</p> : null}

      {capability && !capability.canDelete ? (
        <p className="danger-zone__muted">
          Solo el propietario de la organización puede eliminar una residencia completa. Los
          administradores del condominio no tienen este permiso.
        </p>
      ) : null}

      {capability?.canDelete && !armed ? (
        <Button onClick={() => setArmed(true)} size="sm" variant="danger">
          Quiero eliminar esta residencia
        </Button>
      ) : null}

      {capability?.canDelete && armed && !databaseDeleted ? (
        <div className="danger-zone__confirm">
          <Field
            hint="La frase debe coincidir exactamente. Esto evita eliminaciones accidentales."
            label={`Escribe: ${expected}`}
          >
            <input
              autoComplete="off"
              className="input"
              onChange={(event) => setConfirmation(event.target.value)}
              spellCheck={false}
              value={confirmation}
            />
          </Field>
          <div className="danger-zone__actions">
            <Button
              disabled={deleting}
              onClick={() => {
                setArmed(false);
                setConfirmation('');
                setError('');
              }}
              size="sm"
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button
              disabled={!confirmationMatches || deleting}
              onClick={() => void removeResidence()}
              size="sm"
              variant="danger"
            >
              {deleting ? 'Eliminando…' : 'Eliminar residencia permanentemente'}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="danger-zone__error" role="alert">
          {error}
        </div>
      ) : null}

      {databaseDeleted && cleanupPending ? (
        <div className="danger-zone__cleanup" role="status">
          <strong>La residencia ya fue eliminada.</strong>
          <p>
            Quedó pendiente una limpieza técnica de archivos privados. Puedes continuar y crear la
            residencia de nuevo; el registro de limpieza quedó retenido para reintento seguro.
          </p>
          <Button onClick={() => window.location.assign('/app')} size="sm">
            Continuar y empezar de cero
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}
