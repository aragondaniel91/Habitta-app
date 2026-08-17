from pathlib import Path
import re

path = Path('apps/web/src/features/people/PeoplePanel.tsx')
text = path.read_text()


def once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


def regex_once(pattern: str, replacement: str, label: str):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected one regex match, found {count}')


once(
    "  createResidentInvitation,\n  listResidentInvitations,\n  residentRoleLabel,",
    "  createResidentInvitation,\n  listResidentInvitationDeliveryEvents,\n  listResidentInvitations,\n  residentDeliveryLabel,\n  residentRoleLabel,",
    'imports-functions',
)
once(
    "  type ResidentInvitation,\n  type ResidentRole,",
    "  type ResidentInvitation,\n  type ResidentInvitationDelivery,\n  type ResidentInvitationDeliveryEvent,\n  type ResidentRole,",
    'imports-types',
)
once(
    "type LatestInvitation = {\n  url: string;\n  role: ResidentRole;\n  unitLabel: string;\n};",
    "type LatestInvitation = {\n  url: string;\n  role: ResidentRole;\n  unitLabel: string;\n  delivery: ResidentInvitationDelivery;\n};",
    'latest-type',
)
once(
    "function invitationTone(status: ResidentInvitation['status']) {\n  if (status === 'accepted') return 'success' as const;\n  if (status === 'pending') return 'info' as const;\n  if (status === 'expired') return 'warning' as const;\n  return 'neutral' as const;\n}",
    "function invitationTone(status: ResidentInvitation['status']) {\n  if (status === 'accepted') return 'success' as const;\n  if (status === 'pending') return 'info' as const;\n  if (status === 'expired') return 'warning' as const;\n  return 'neutral' as const;\n}\n\nfunction deliveryTone(event?: ResidentInvitationDeliveryEvent) {\n  if (event?.event_type === 'email_sent') return 'success' as const;\n  if (event?.event_type === 'email_failed') return 'warning' as const;\n  return 'neutral' as const;\n}",
    'delivery-tone',
)
once(
    "  const [invitations, setInvitations] = useState<ResidentInvitation[]>([]);",
    "  const [invitations, setInvitations] = useState<ResidentInvitation[]>([]);\n  const [deliveryEvents, setDeliveryEvents] = useState<ResidentInvitationDeliveryEvent[]>([]);",
    'delivery-state',
)

regex_once(
    r"  const loadPersonContext = useCallback\(.*?\n  \);\n\n  useEffect\(\(\) => \{\n    void loadDirectory\(\);",
    """  const loadPersonContext = useCallback(
    async (personId: string) => {
      const [view, invitationItems, deliveryItems] = await Promise.all([
        peopleApi<PersonRelationshipView>(
          `/v1/condominiums/${condominiumId}/people/${personId}/relationships`,
          session,
        ),
        listResidentInvitations(condominiumId, personId),
        listResidentInvitationDeliveryEvents(condominiumId, personId),
      ]);
      setSelected(view.person);
      setOwnerships(view.ownerships);
      setOccupancies(view.occupancies);
      setCondominiumRelationships(view.condominiumRelationships);
      setInvitations(invitationItems);
      setDeliveryEvents(deliveryItems);
    },
    [condominiumId, session],
  );

  useEffect(() => {
    void loadDirectory();""",
    'load-person-context',
)
once(
    "    setInvitations([]);\n    setLatestInvitation(null);",
    "    setInvitations([]);\n    setDeliveryEvents([]);\n    setLatestInvitation(null);",
    'reset-delivery',
)
once(
    "  const inviteUnits = accessOptions.filter((option) => option.role === inviteRole);",
    """  const deliveryByInvitationId = useMemo(() => {
    const latest = new Map<string, ResidentInvitationDeliveryEvent>();
    for (const event of deliveryEvents) {
      if (!latest.has(event.invitation_id)) latest.set(event.invitation_id, event);
    }
    return latest;
  }, [deliveryEvents]);
  const inviteUnits = accessOptions.filter((option) => option.role === inviteRole);""",
    'delivery-map',
)

regex_once(
    r"  const issueInvitation = async \(role: ResidentRole, unitId: string\) => \{.*?\n  \};\n\n  const createInvitation",
    """  const issueInvitation = async (role: ResidentRole, unitId: string) => {
    if (!selected || !unitId) return;
    if (!selected.email) {
      setError('Agrega un correo válido a la persona antes de invitarla.');
      return;
    }
    const option = accessOptions.find((item) => item.role === role && item.unitId === unitId);
    if (!option) {
      setError(
        'La relación activa ya no es compatible con ese acceso. Actualiza el perfil e intenta nuevamente.',
      );
      return;
    }
    setBusyAction('invitation');
    setError('');
    setMessage('');
    setLatestInvitation(null);
    try {
      const result = await createResidentInvitation({
        condominiumId,
        personId: selected.id,
        unitId,
        role,
        session,
      });
      setLatestInvitation({
        url: result.invitationUrl,
        role,
        unitLabel: option.unitLabel,
        delivery: result.emailDelivery,
      });
      const [nextInvitations, nextDeliveryEvents] = await Promise.all([
        listResidentInvitations(condominiumId, selected.id),
        listResidentInvitationDeliveryEvents(condominiumId, selected.id),
      ]);
      setInvitations(nextInvitations);
      setDeliveryEvents(nextDeliveryEvents);
      if (result.emailDelivery.status === 'sent') {
        setMessage(
          result.emailDelivery.mode === 'sandbox'
            ? 'Invitación creada y correo transaccional enviado al buzón de pruebas de este ambiente.'
            : 'Invitación creada y correo transaccional enviado al residente.',
        );
      } else if (result.emailDelivery.status === 'failed') {
        setMessage(
          'Invitación creada, pero el correo no pudo enviarse. Usa el enlace seguro de respaldo.',
        );
      } else {
        setMessage(
          'Invitación creada. El envío automático está desactivado; usa el enlace seguro de respaldo.',
        );
      }
      if (!result.auditPersisted) {
        setError(
          'El resultado del correo no pudo guardarse en la auditoría. Conserva el enlace y revisa la integración antes de reenviar.',
        );
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo crear la invitación.',
      );
    } finally {
      setBusyAction('');
    }
  };

  const createInvitation""",
    'issue-invitation',
)

regex_once(
    r"\n  const openInvitationEmail = \(\) => \{.*?\n  \};\n\n  const previewCsv",
    "\n  const previewCsv",
    'remove-mailto',
)

regex_once(
    r"                  \{latestInvitation \? \(.*?                  \) : null\}\n\n                  <div className=\"people-invitation-history\">",
    """                  {latestInvitation ? (
                    <div className="people-invitation-link-card">
                      <div>
                        <span className="people-kicker">Enlace seguro listo</span>
                        <strong>
                          {residentRoleLabel(latestInvitation.role)} · {latestInvitation.unitLabel}
                        </strong>
                        <Badge
                          tone={
                            latestInvitation.delivery.status === 'sent'
                              ? 'success'
                              : latestInvitation.delivery.status === 'failed'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {latestInvitation.delivery.status === 'sent'
                            ? 'Correo enviado'
                            : latestInvitation.delivery.status === 'failed'
                              ? 'Error de envío'
                              : 'Envío desactivado'}
                        </Badge>
                        <small>
                          Habitta almacena solo el hash del token. El enlace seguro queda disponible
                          como respaldo aunque el correo transaccional falle o esté desactivado.
                        </small>
                      </div>
                      <input
                        aria-label="Enlace seguro de invitación"
                        className="input"
                        readOnly
                        value={latestInvitation.url}
                      />
                      <div>
                        <Button onClick={() => void copyLatestInvitation()} size="sm" type="button">
                          Copiar enlace seguro
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="people-invitation-history">""",
    'latest-card',
)

once(
    "                        const displayStatus = residentInvitationDisplayStatus(invitation);\n                        const eligible = accessOptions.some(",
    "                        const displayStatus = residentInvitationDisplayStatus(invitation);\n                        const deliveryEvent = deliveryByInvitationId.get(invitation.id);\n                        const eligible = accessOptions.some(",
    'history-delivery-event',
)
once(
    """                            <Badge tone={invitationTone(displayStatus)}>
                              {residentInvitationStatusLabels[displayStatus]}
                            </Badge>
                            <div className="people-invitation-history__actions">""",
    """                            <Badge tone={invitationTone(displayStatus)}>
                              {residentInvitationStatusLabels[displayStatus]}
                            </Badge>
                            <Badge tone={deliveryTone(deliveryEvent)}>
                              {residentDeliveryLabel(deliveryEvent)}
                            </Badge>
                            <div className="people-invitation-history__actions">""",
    'history-delivery-badge',
)

path.write_text(text)

css_path = Path('apps/web/src/features/people/people-workspace.css')
css = css_path.read_text()
old = ".people-invitation-history article {\n  grid-template-columns: minmax(0, 1fr) auto auto;\n}"
new = ".people-invitation-history article {\n  grid-template-columns: minmax(0, 1fr) auto auto auto;\n}"
count = css.count(old)
if count != 1:
    raise RuntimeError(f'css-grid: expected one match, found {count}')
css_path.write_text(css.replace(old, new, 1))
