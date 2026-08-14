import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, PeopleIcon, SettingsIcon } from '../components/icons';
import { Badge, Button, EmptyState, Field, Skeleton, Surface } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import {
  ADMINISTRATIVE_ROLE_OPTIONS,
  administrativeRoleLabel,
  createAdminInvitation,
  loadTeamAccess,
  manageTeamMember,
  revokeAdminInvitation,
  type AdminInvitation,
  type AdminInvitationDelivery,
  type AdministrativeRole,
  type TeamMember,
} from '../lib/teamAccess';
import '../team-access.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type TeamData = {
  members: TeamMember[];
  invitations: AdminInvitation[];
};

function dateInputValue(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function invitationTone(status: AdminInvitation['status']) {
  if (status === 'accepted') return 'success' as const;
  if (status === 'pending') return 'info' as const;
  return 'warning' as const;
}

function invitationStatus(status: AdminInvitation['status']) {
  const labels: Record<AdminInvitation['status'], string> = {
    pending: 'Pendiente',
    accepted: 'Aceptada',
    expired: 'Vencida',
    revoked: 'Revocada',
  };
  return labels[status];
}

export function invitationDeliveryFailureMessage(delivery: AdminInvitationDelivery) {
  const errorCode = delivery.errorCode ?? 'unknown';
  let explanation = 'El proveedor rechazó o no pudo procesar la solicitud.';

  if (errorCode.includes('token_missing')) {
    explanation = 'El Worker no recibió el Send Mail Token de ZeptoMail.';
  } else if (errorCode.includes('sandbox_email_invalid')) {
    explanation = 'El correo sandbox configurado en Cloudflare no es válido.';
  } else if (errorCode.includes('from_email_invalid')) {
    explanation = 'La dirección remitente configurada en Cloudflare no es válida.';
  } else if (errorCode.startsWith('zeptomail_401')) {
    explanation =
      'ZeptoMail rechazó la autenticación. El token puede ser inválido, estar vencido o pertenecer a otro Agent.';
  } else if (errorCode.startsWith('zeptomail_403')) {
    explanation =
      'El Agent o la cuenta de ZeptoMail no tienen autorización para enviar con este dominio.';
  } else if (errorCode.startsWith('zeptomail_400')) {
    explanation =
      'ZeptoMail rechazó los datos del mensaje. Revisa la asociación entre el Agent y mihabitta.com.';
  } else if (errorCode.startsWith('zeptomail_429')) {
    explanation = 'ZeptoMail aplicó un límite temporal o no hay crédito disponible.';
  } else if (errorCode.includes('timeout')) {
    explanation = 'ZeptoMail no respondió antes del tiempo máximo de espera.';
  } else if (errorCode.includes('network_error')) {
    explanation = 'El Worker no pudo conectarse con la API de ZeptoMail.';
  }

  const requestReference = delivery.providerId
    ? ` Referencia del proveedor: ${delivery.providerId}.`
    : '';
  return `${explanation} Código técnico: ${errorCode}.${requestReference}`;
}

export function TeamAccessPage({ condominiumId, condominiumName, session }: Props) {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdministrativeRole>('assistant');
  const [expirationDate, setExpirationDate] = useState(() => dateInputValue(7));
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState('');
  const [memberBusyId, setMemberBusyId] = useState('');
  const [memberRoles, setMemberRoles] = useState<Record<string, AdministrativeRole>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deliveryWarning, setDeliveryWarning] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextData = await loadTeamAccess(condominiumId);
      setData(nextData);
      setMemberRoles(
        Object.fromEntries(
          nextData.members.map((member) => [member.user_id, member.role]),
        ) as Record<string, AdministrativeRole>,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el equipo del condominio.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCreatedLink('');
    setCreatedEmail('');
    setMessage('');
    setDeliveryWarning('');
  }, [condominiumId]);

  const pendingInvitations = useMemo(
    () => data?.invitations.filter((invitation) => invitation.status === 'pending').length ?? 0,
    [data?.invitations],
  );
  const activeMembers = useMemo(
    () => data?.members.filter((member) => member.status === 'active').length ?? 0,
    [data?.members],
  );
  const suspendedMembers = useMemo(
    () => data?.members.filter((member) => member.status === 'suspended').length ?? 0,
    [data?.members],
  );

  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setError('Introduce el correo del administrador que deseas invitar.');
      return;
    }

    setCreating(true);
    setError('');
    setMessage('');
    setDeliveryWarning('');
    setCreatedLink('');
    try {
      const expiration = new Date(`${expirationDate}T23:59:59`);
      const result = await createAdminInvitation({
        session,
        condominiumId,
        email,
        role,
        expiresAt: expiration.toISOString(),
      });
      setCreatedLink(result.invitationUrl);
      setCreatedEmail(result.invitation.email);
      if (result.emailDelivery.status === 'sent') {
        setMessage(
          result.emailDelivery.recipient === result.invitation.email
            ? 'Invitación creada y enviada automáticamente por correo.'
            : 'Invitación creada y enviada al correo de pruebas configurado para este ambiente.',
        );
      } else if (result.emailDelivery.status === 'failed') {
        setDeliveryWarning(invitationDeliveryFailureMessage(result.emailDelivery));
      } else {
        setDeliveryWarning(
          'La invitación se creó, pero el envío automático está desactivado. Usa el enlace seguro de respaldo.',
        );
      }
      setEmail('');
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la invitación.',
      );
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setMessage('Enlace copiado al portapapeles.');
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.');
    }
  };

  const openEmail = () => {
    if (!createdLink || !createdEmail) return;
    const subject = encodeURIComponent(`Invitación a ${condominiumName} en Habitta`);
    const body = encodeURIComponent(
      `Has sido invitado a administrar ${condominiumName} en Habitta.\n\nAbre este enlace seguro para aceptar la invitación:\n${createdLink}\n\nEl enlace vence en la fecha indicada por la administración.`,
    );
    window.location.href = `mailto:${encodeURIComponent(createdEmail)}?subject=${subject}&body=${body}`;
  };

  const revoke = async (invitationId: string) => {
    setRevokingId(invitationId);
    setError('');
    setMessage('');
    setDeliveryWarning('');
    try {
      await revokeAdminInvitation(invitationId);
      setMessage('Invitación revocada correctamente.');
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo revocar la invitación.',
      );
    } finally {
      setRevokingId('');
    }
  };

  const runMemberAction = async (
    member: TeamMember,
    action: 'change_role' | 'suspend' | 'reactivate' | 'remove',
  ) => {
    if (
      action === 'suspend' &&
      !window.confirm(
        `¿Suspender temporalmente el acceso de ${member.full_name ?? member.email}? Podrás reactivarlo después.`,
      )
    ) {
      return;
    }
    if (
      action === 'remove' &&
      !window.confirm(
        `¿Quitar a ${member.full_name ?? member.email} del equipo de ${condominiumName}? Su cuenta e historial se conservarán.`,
      )
    ) {
      return;
    }

    setMemberBusyId(member.user_id);
    setError('');
    setMessage('');
    setDeliveryWarning('');
    try {
      const selectedRole = memberRoles[member.user_id] ?? member.role;
      await manageTeamMember({
        condominiumId,
        userId: member.user_id,
        action,
        role: action === 'change_role' || action === 'reactivate' ? selectedRole : undefined,
      });

      const successMessages = {
        change_role: 'Rol actualizado correctamente.',
        suspend: 'Acceso suspendido. El usuario ya no puede operar este condominio.',
        reactivate: 'Acceso reactivado correctamente.',
        remove: 'Acceso retirado. La cuenta global y el historial se conservaron.',
      };
      setMessage(successMessages[action]);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar el acceso de este miembro.',
      );
    } finally {
      setMemberBusyId('');
    }
  };

  if (loading && !data) {
    return (
      <div className="team-access-page" aria-label="Cargando equipo y accesos">
        <Skeleton className="skeleton--title" />
        <Skeleton className="settings-panel-skeleton" />
      </div>
    );
  }

  if (!data) {
    return (
      <Surface className="team-access-load-error">
        <EmptyState
          actionLabel="Intentar nuevamente"
          description={error || 'No se pudo abrir la administración del equipo.'}
          icon={<PeopleIcon size={28} />}
          onAction={() => void load()}
          title="Equipo y accesos no disponible"
        />
      </Surface>
    );
  }

  return (
    <div className="team-access-page">
      <PageHeader
        actions={
          <div className="team-access-metrics">
            <span>
              <strong>{activeMembers}</strong> activos
            </span>
            {suspendedMembers ? (
              <span>
                <strong>{suspendedMembers}</strong> suspendidos
              </span>
            ) : null}
            <span>
              <strong>{pendingInvitations}</strong> pendientes
            </span>
          </div>
        }
        description={`${condominiumName} · invita, asigna roles y controla el acceso administrativo.`}
        eyebrow="Seguridad y colaboración"
        title="Equipo y accesos"
      />

      {error ? <div className="settings-inline-alert">{error}</div> : null}
      {deliveryWarning ? (
        <div className="settings-inline-alert" role="alert">
          <strong>La invitación se creó, pero el correo no pudo enviarse.</strong> {deliveryWarning}{' '}
          Usa el enlace seguro de respaldo mientras corregimos la integración.
        </div>
      ) : null}
      {message ? (
        <div className="settings-success-alert">
          <CheckCircleIcon size={17} /> {message}
        </div>
      ) : null}

      {createdLink ? (
        <Surface className="team-invitation-link-card">
          <div>
            <span className="settings-kicker">Enlace seguro de respaldo</span>
            <h3>Invitación para {createdEmail}</h3>
            <p>
              Habitta almacena únicamente el hash del token. Conserva este enlace hasta confirmar
              que el invitado recibió el correo.
            </p>
          </div>
          <input aria-label="Enlace de invitación" className="input" readOnly value={createdLink} />
          <div>
            <Button onClick={() => void copyLink()} type="button">
              Copiar enlace
            </Button>
            <Button onClick={openEmail} type="button" variant="secondary">
              Abrir en mi correo
            </Button>
          </div>
        </Surface>
      ) : null}

      <section className="team-access-layout">
        <Surface className="team-access-panel">
          <div className="settings-section-heading">
            <div>
              <span className="settings-kicker">Nueva invitación</span>
              <h2>Invitar administrador</h2>
              <p>El rol y el condominio se asignan al aceptar el enlace seguro.</p>
            </div>
            <SettingsIcon size={22} />
          </div>

          <form className="team-invitation-form" onSubmit={createInvitation}>
            <Field label="Correo electrónico">
              <input
                autoCapitalize="none"
                autoComplete="email"
                className="input"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="administrador@correo.com"
                required
                type="email"
                value={email}
              />
            </Field>

            <Field label="Rol administrativo">
              <select
                className="select"
                onChange={(event) => setRole(event.target.value as AdministrativeRole)}
                value={role}
              >
                {ADMINISTRATIVE_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <p className="team-role-description">
              {ADMINISTRATIVE_ROLE_OPTIONS.find((option) => option.value === role)?.description}
            </p>

            <Field hint="Entre mañana y 90 días." label="Fecha de expiración">
              <input
                className="input"
                max={dateInputValue(90)}
                min={dateInputValue(1)}
                onChange={(event) => setExpirationDate(event.target.value)}
                required
                type="date"
                value={expirationDate}
              />
            </Field>

            <p className="team-role-description">
              En producción, al enviar esta invitación Habitta enviará un correo transaccional real
              a la dirección indicada. Este envío es independiente de los correos automáticos del
              condominio.
            </p>

            <Button disabled={creating} type="submit">
              {creating ? 'Creando invitación…' : 'Crear y enviar invitación'}
            </Button>
          </form>
        </Surface>

        <Surface className="team-access-panel">
          <div className="settings-section-heading">
            <div>
              <span className="settings-kicker">Acceso actual</span>
              <h2>Miembros del equipo</h2>
              <p>Cambia roles, suspende temporalmente o retira accesos sin borrar cuentas.</p>
            </div>
            <Badge tone="success">{activeMembers} activos</Badge>
          </div>

          {data.members.length ? (
            <div className="team-member-list">
              {data.members.map((member) => {
                const selectedRole = memberRoles[member.user_id] ?? member.role;
                const busy = memberBusyId === member.user_id;
                const isCurrentUser = member.user_id === session.user.id;
                return (
                  <article
                    className={member.status === 'suspended' ? 'team-member--suspended' : undefined}
                    key={member.user_id}
                  >
                    <span>{(member.full_name ?? member.email).slice(0, 2).toUpperCase()}</span>
                    <div className="team-member-identity">
                      <strong>
                        {member.full_name ?? member.email}
                        {isCurrentUser ? ' · Tú' : ''}
                      </strong>
                      <small>{member.email}</small>
                      <small>Desde {formatDate(member.joined_at)}</small>
                    </div>
                    <Badge tone={member.status === 'active' ? 'success' : 'warning'}>
                      {member.status === 'active' ? 'Activo' : 'Suspendido'}
                    </Badge>

                    <div className="team-member-controls">
                      <select
                        aria-label={`Rol de ${member.full_name ?? member.email}`}
                        className="select team-member-role-select"
                        disabled={busy}
                        onChange={(event) =>
                          setMemberRoles((current) => ({
                            ...current,
                            [member.user_id]: event.target.value as AdministrativeRole,
                          }))
                        }
                        value={selectedRole}
                      >
                        {ADMINISTRATIVE_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      {member.status === 'active' ? (
                        <>
                          <Button
                            disabled={busy || selectedRole === member.role}
                            onClick={() => void runMemberAction(member, 'change_role')}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Guardar rol
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() => void runMemberAction(member, 'suspend')}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Suspender
                          </Button>
                        </>
                      ) : (
                        <Button
                          disabled={busy}
                          onClick={() => void runMemberAction(member, 'reactivate')}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Reactivar
                        </Button>
                      )}

                      <Button
                        disabled={busy}
                        onClick={() => void runMemberAction(member, 'remove')}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Quitar acceso
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              description="Aún no hay otros miembros administrativos en este condominio."
              icon={<PeopleIcon size={26} />}
              title="Equipo sin miembros adicionales"
            />
          )}
        </Surface>
      </section>

      <Surface className="team-access-panel">
        <div className="settings-section-heading">
          <div>
            <span className="settings-kicker">Trazabilidad</span>
            <h2>Historial de invitaciones</h2>
            <p>Consulta estado, rol y expiración de cada invitación administrativa.</p>
          </div>
        </div>

        {data.invitations.length ? (
          <div className="team-invitation-list">
            {data.invitations.map((invitation) => (
              <article key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <small>{administrativeRoleLabel(invitation.intended_role)}</small>
                </div>
                <div>
                  <small>Creada {formatDate(invitation.created_at)}</small>
                  <small>Vence {formatDate(invitation.expires_at)}</small>
                </div>
                <Badge tone={invitationTone(invitation.status)}>
                  {invitationStatus(invitation.status)}
                </Badge>
                {invitation.status === 'pending' ? (
                  <Button
                    disabled={revokingId === invitation.id}
                    onClick={() => void revoke(invitation.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {revokingId === invitation.id ? 'Revocando…' : 'Revocar'}
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            description="Las invitaciones que crees aparecerán aquí con su estado."
            icon={<PeopleIcon size={26} />}
            title="Sin invitaciones registradas"
          />
        )}
      </Surface>
    </div>
  );
}
