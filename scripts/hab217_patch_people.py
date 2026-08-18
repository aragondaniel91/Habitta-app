from pathlib import Path

path = Path('apps/web/src/features/people/PeoplePanel.tsx')
text = path.read_text()

text = text.replace(
"  Person,\n  PersonRelationshipView,\n  Preview,",
"  Person,\n  PersonAdminNoteRevision,\n  PersonAdminNotesView,\n  PersonRelationshipView,\n  Preview,",
)

text = text.replace(
"  const [deliveryEvents, setDeliveryEvents] = useState<ResidentInvitationDeliveryEvent[]>([]);\n  const [query, setQuery] = useState('');",
"  const [deliveryEvents, setDeliveryEvents] = useState<ResidentInvitationDeliveryEvent[]>([]);\n  const [adminNoteRevisions, setAdminNoteRevisions] = useState<PersonAdminNoteRevision[]>([]);\n  const [adminNotesAuthorized, setAdminNotesAuthorized] = useState(false);\n  const [adminNoteDraft, setAdminNoteDraft] = useState('');\n  const [query, setQuery] = useState('');",
)

old = """      const [view, invitationItems, deliveryItems] = await Promise.all([\n        peopleApi<PersonRelationshipView>(\n          `/v1/condominiums/${condominiumId}/people/${personId}/relationships`,\n          session,\n        ),\n        listResidentInvitations(condominiumId, personId),\n        listResidentInvitationDeliveryEvents(condominiumId, personId),\n      ]);\n      setSelected(view.person);\n      setOwnerships(view.ownerships);\n      setOccupancies(view.occupancies);\n      setCondominiumRelationships(view.condominiumRelationships);\n      setInvitations(invitationItems);\n      setDeliveryEvents(deliveryItems);"""
new = """      const [view, invitationItems, deliveryItems, notesView] = await Promise.all([\n        peopleApi<PersonRelationshipView>(\n          `/v1/condominiums/${condominiumId}/people/${personId}/relationships`,\n          session,\n        ),\n        listResidentInvitations(condominiumId, personId),\n        listResidentInvitationDeliveryEvents(condominiumId, personId),\n        peopleApi<PersonAdminNotesView>(\n          `/v1/condominiums/${condominiumId}/people/${personId}/admin-notes`,\n          session,\n        ),\n      ]);\n      setSelected(view.person);\n      setOwnerships(view.ownerships);\n      setOccupancies(view.occupancies);\n      setCondominiumRelationships(view.condominiumRelationships);\n      setInvitations(invitationItems);\n      setDeliveryEvents(deliveryItems);\n      setAdminNotesAuthorized(notesView.authorized);\n      setAdminNoteRevisions(notesView.revisions);\n      const currentNote = notesView.revisions[0];\n      setAdminNoteDraft(\n        currentNote?.action === 'saved' && currentNote.content ? currentNote.content : '',\n      );"""
if old not in text:
    raise SystemExit('loadPersonContext target not found')
text = text.replace(old, new)

text = text.replace(
"    setDeliveryEvents([]);\n    setLatestInvitation(null);",
"    setDeliveryEvents([]);\n    setAdminNoteRevisions([]);\n    setAdminNotesAuthorized(false);\n    setAdminNoteDraft('');\n    setLatestInvitation(null);",
)

anchor = """  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {\n    event.preventDefault();\n    await issueInvitation(inviteRole, inviteUnitId);\n  };\n\n"""
addition = """  const saveAdminNote = async (event: FormEvent<HTMLFormElement>) => {\n    event.preventDefault();\n    if (!selected || !adminNotesAuthorized) return;\n    const content = adminNoteDraft.trim();\n    if (!content) {\n      setError('Escribe una nota o usa “Limpiar nota” para conservar el cambio en el historial.');\n      return;\n    }\n    setBusyAction('admin-note');\n    setError('');\n    setMessage('');\n    try {\n      await peopleApi(\n        `/v1/condominiums/${condominiumId}/people/${selected.id}/admin-notes`,\n        session,\n        { method: 'POST', body: JSON.stringify({ content }) },\n      );\n      await loadPersonContext(selected.id);\n      setMessage('Nota administrativa guardada. La revisión anterior permanece en el historial.');\n    } catch (requestError) {\n      setError(\n        requestError instanceof Error\n          ? requestError.message\n          : 'No se pudo guardar la nota administrativa.',\n      );\n    } finally {\n      setBusyAction('');\n    }\n  };\n\n  const clearAdminNote = async () => {\n    if (!selected || !adminNotesAuthorized) return;\n    setBusyAction('clear-admin-note');\n    setError('');\n    setMessage('');\n    try {\n      await peopleApi(\n        `/v1/condominiums/${condominiumId}/people/${selected.id}/admin-notes/clear`,\n        session,\n        { method: 'POST' },\n      );\n      await loadPersonContext(selected.id);\n      setMessage('Nota administrativa limpiada. El historial anterior se conserva.');\n    } catch (requestError) {\n      setError(\n        requestError instanceof Error\n          ? requestError.message\n          : 'No se pudo limpiar la nota administrativa.',\n      );\n    } finally {\n      setBusyAction('');\n    }\n  };\n\n"""
if anchor not in text:
    raise SystemExit('createInvitation anchor not found')
text = text.replace(anchor, anchor + addition)

insert_before = """                <section className=\"people-section people-access-section\">\n"""
notes_section = """                {adminNotesAuthorized ? (\n                  <section className=\"people-section\">\n                    <div className=\"people-section__heading\">\n                      <div>\n                        <span className=\"people-kicker\">Administración · privado</span>\n                        <h3>Notas internas</h3>\n                        <p>\n                          Solo personal autorizado para gestionar Personas puede ver estas notas.\n                          Nunca guardes contraseñas, tokens, datos de tarjeta ni otros secretos.\n                        </p>\n                      </div>\n                      <Badge tone=\"warning\">Privado</Badge>\n                    </div>\n                    <form\n                      className=\"people-invitation-form\"\n                      onSubmit={(event) => void saveAdminNote(event)}\n                    >\n                      <Field\n                        hint=\"Máximo 4.000 caracteres. Cada guardado crea una nueva revisión auditable.\"\n                        label=\"Nota administrativa\"\n                      >\n                        <textarea\n                          className=\"input\"\n                          maxLength={4000}\n                          onChange={(event) => setAdminNoteDraft(event.target.value)}\n                          placeholder=\"Ej. Preferencia de contacto, seguimiento administrativo o contexto operativo…\"\n                          rows={5}\n                          value={adminNoteDraft}\n                        />\n                      </Field>\n                      <div className=\"people-access-summary\" role=\"note\">\n                        <span>Historial protegido</span>\n                        <strong>{adminNoteRevisions.length} revisiones</strong>\n                        <span>\n                          {adminNoteRevisions[0]\n                            ? `Último cambio ${formatDate(adminNoteRevisions[0].created_at)}`\n                            : 'Sin notas administrativas registradas'}\n                        </span>\n                      </div>\n                      <div className=\"people-invitation-history__actions\">\n                        <Button disabled={busyAction === 'admin-note'} type=\"submit\">\n                          {busyAction === 'admin-note' ? 'Guardando…' : 'Guardar nota'}\n                        </Button>\n                        {adminNoteRevisions[0]?.action === 'saved' ? (\n                          <Button\n                            disabled={busyAction === 'clear-admin-note'}\n                            onClick={() => void clearAdminNote()}\n                            type=\"button\"\n                            variant=\"ghost\"\n                          >\n                            {busyAction === 'clear-admin-note' ? 'Limpiando…' : 'Limpiar nota'}\n                          </Button>\n                        ) : null}\n                      </div>\n                    </form>\n                  </section>\n                ) : null}\n\n"""
if insert_before not in text:
    raise SystemExit('access section anchor not found')
text = text.replace(insert_before, notes_section + insert_before, 1)

path.write_text(text)

web_test = Path('apps/web/src/people-workspace.test.ts')
test_text = web_test.read_text()
needle = """  it('uses shared confirmation dialogs for relationship and invitation lifecycle actions', () => {\n"""
test_block = """  it('keeps administrative notes private and revision based in the live People profile', () => {\n    expect(workspaceSource).toContain('/admin-notes`');\n    expect(workspaceSource).toContain('/admin-notes/clear`');\n    expect(workspaceSource).toContain('Administración · privado');\n    expect(workspaceSource).toContain('Cada guardado crea una nueva revisión auditable');\n    expect(workspaceSource).toContain('Nunca guardes contraseñas, tokens, datos de tarjeta');\n  });\n\n"""
if needle not in test_text:
    raise SystemExit('web test anchor not found')
test_text = test_text.replace(needle, test_block + needle)
web_test.write_text(test_text)
