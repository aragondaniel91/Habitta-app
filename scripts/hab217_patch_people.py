from pathlib import Path

path = Path('apps/web/src/features/people/PeoplePanel.tsx')
text = path.read_text()


def replace_once(source: str, target: str, label: str) -> None:
    global text
    count = text.count(source)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    text = text.replace(source, target, 1)


if 'Administración · privado' not in text:
    replace_once(
        "  Person,\n  PersonRelationshipView,",
        "  Person,\n  PersonAdminNoteRevision,\n  PersonAdminNotesView,\n  PersonRelationshipView,",
        'note type imports',
    )

    replace_once(
        "  const [deliveryEvents, setDeliveryEvents] = useState<ResidentInvitationDeliveryEvent[]>([]);\n  const [query, setQuery] = useState('');",
        "  const [deliveryEvents, setDeliveryEvents] = useState<ResidentInvitationDeliveryEvent[]>([]);\n  const [adminNoteRevisions, setAdminNoteRevisions] = useState<PersonAdminNoteRevision[]>([]);\n  const [adminNotesAuthorized, setAdminNotesAuthorized] = useState(false);\n  const [adminNoteDraft, setAdminNoteDraft] = useState('');\n  const [query, setQuery] = useState('');",
        'note state',
    )

    replace_once(
        '      const [view, invitationItems, deliveryItems] = await Promise.all([',
        '      const [view, invitationItems, deliveryItems, notesView] = await Promise.all([',
        'person context tuple',
    )

    replace_once(
        "        listResidentInvitationDeliveryEvents(condominiumId, personId),\n      ]);",
        "        listResidentInvitationDeliveryEvents(condominiumId, personId),\n        peopleApi<PersonAdminNotesView>(\n          `/v1/condominiums/${condominiumId}/people/${personId}/admin-notes`,\n          session,\n        ),\n      ]);",
        'person context note request',
    )

    replace_once(
        '      setDeliveryEvents(deliveryItems);',
        "      setDeliveryEvents(deliveryItems);\n      setAdminNotesAuthorized(notesView.authorized);\n      setAdminNoteRevisions(notesView.revisions);\n      const currentNote = notesView.revisions[0];\n      setAdminNoteDraft(\n        currentNote?.action === 'saved' && currentNote.content ? currentNote.content : '',\n      );",
        'person context note state',
    )

    replace_once(
        "    setDeliveryEvents([]);\n    setLatestInvitation(null);",
        "    setDeliveryEvents([]);\n    setAdminNoteRevisions([]);\n    setAdminNotesAuthorized(false);\n    setAdminNoteDraft('');\n    setLatestInvitation(null);",
        'condominium switch note reset',
    )

    handler_anchor = """  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {\n    event.preventDefault();\n    await issueInvitation(inviteRole, inviteUnitId);\n  };\n\n"""
    handler_addition = """  const saveAdminNote = async (event: FormEvent<HTMLFormElement>) => {\n    event.preventDefault();\n    if (!selected || !adminNotesAuthorized) return;\n    const content = adminNoteDraft.trim();\n    if (!content) {\n      setError('Escribe una nota o usa “Limpiar nota” para conservar el cambio en el historial.');\n      return;\n    }\n    setBusyAction('admin-note');\n    setError('');\n    setMessage('');\n    try {\n      await peopleApi(\n        `/v1/condominiums/${condominiumId}/people/${selected.id}/admin-notes`,\n        session,\n        { method: 'POST', body: JSON.stringify({ content }) },\n      );\n      await loadPersonContext(selected.id);\n      setMessage('Nota administrativa guardada. La revisión anterior permanece en el historial.');\n    } catch (requestError) {\n      setError(\n        requestError instanceof Error\n          ? requestError.message\n          : 'No se pudo guardar la nota administrativa.',\n      );\n    } finally {\n      setBusyAction('');\n    }\n  };\n\n  const clearAdminNote = async () => {\n    if (!selected || !adminNotesAuthorized) return;\n    setBusyAction('clear-admin-note');\n    setError('');\n    setMessage('');\n    try {\n      await peopleApi(\n        `/v1/condominiums/${condominiumId}/people/${selected.id}/admin-notes/clear`,\n        session,\n        { method: 'POST' },\n      );\n      await loadPersonContext(selected.id);\n      setMessage('Nota administrativa limpiada. El historial anterior se conserva.');\n    } catch (requestError) {\n      setError(\n        requestError instanceof Error\n          ? requestError.message\n          : 'No se pudo limpiar la nota administrativa.',\n      );\n    } finally {\n      setBusyAction('');\n    }\n  };\n\n"""
    replace_once(handler_anchor, handler_anchor + handler_addition, 'note handlers')

    access_anchor = '                <section className="people-section people-access-section">\n'
    notes_section = """                {adminNotesAuthorized ? (\n                  <section className=\"people-section\">\n                    <div className=\"people-section__heading\">\n                      <div>\n                        <span className=\"people-kicker\">Administración · privado</span>\n                        <h3>Notas internas</h3>\n                        <p>\n                          Solo personal autorizado para gestionar Personas puede ver estas notas.\n                          Nunca guardes contraseñas, tokens, datos de tarjeta ni otros secretos.\n                        </p>\n                      </div>\n                      <Badge tone=\"warning\">Privado</Badge>\n                    </div>\n                    <form\n                      className=\"people-invitation-form\"\n                      onSubmit={(event) => void saveAdminNote(event)}\n                    >\n                      <Field\n                        hint=\"Máximo 4.000 caracteres. Cada guardado crea una nueva revisión auditable.\"\n                        label=\"Nota administrativa\"\n                      >\n                        <textarea\n                          className=\"input\"\n                          maxLength={4000}\n                          onChange={(event) => setAdminNoteDraft(event.target.value)}\n                          placeholder=\"Ej. Preferencia de contacto, seguimiento administrativo o contexto operativo…\"\n                          rows={5}\n                          value={adminNoteDraft}\n                        />\n                      </Field>\n                      <div className=\"people-access-summary\" role=\"note\">\n                        <span>Historial protegido</span>\n                        <strong>{adminNoteRevisions.length} revisiones</strong>\n                        <span>\n                          {adminNoteRevisions[0]\n                            ? `Último cambio ${formatDate(adminNoteRevisions[0].created_at)}`\n                            : 'Sin notas administrativas registradas'}\n                        </span>\n                      </div>\n                      <div className=\"people-invitation-history__actions\">\n                        <Button disabled={busyAction === 'admin-note'} type=\"submit\">\n                          {busyAction === 'admin-note' ? 'Guardando…' : 'Guardar nota'}\n                        </Button>\n                        {adminNoteRevisions[0]?.action === 'saved' ? (\n                          <Button\n                            disabled={busyAction === 'clear-admin-note'}\n                            onClick={() => void clearAdminNote()}\n                            type=\"button\"\n                            variant=\"ghost\"\n                          >\n                            {busyAction === 'clear-admin-note' ? 'Limpiando…' : 'Limpiar nota'}\n                          </Button>\n                        ) : null}\n                      </div>\n                    </form>\n                  </section>\n                ) : null}\n\n"""
    replace_once(access_anchor, notes_section + access_anchor, 'private notes section')

    path.write_text(text)

web_test = Path('apps/web/src/people-workspace.test.ts')
test_text = web_test.read_text()
if 'keeps administrative notes private and revision based' not in test_text:
    needle = "  it('uses shared confirmation dialogs for relationship and invitation lifecycle actions', () => {\n"
    if test_text.count(needle) != 1:
        raise SystemExit(f'web test anchor: expected 1, found {test_text.count(needle)}')
    test_block = """  it('keeps administrative notes private and revision based in the live People profile', () => {\n    expect(workspaceSource).toContain('/admin-notes`');\n    expect(workspaceSource).toContain('/admin-notes/clear`');\n    expect(workspaceSource).toContain('Administración · privado');\n    expect(workspaceSource).toContain('Cada guardado crea una nueva revisión auditable');\n    expect(workspaceSource).toContain('Nunca guardes contraseñas, tokens, datos de tarjeta');\n  });\n\n"""
    web_test.write_text(test_text.replace(needle, test_block + needle, 1))
