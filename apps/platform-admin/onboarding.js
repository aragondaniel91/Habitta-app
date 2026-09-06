// HAB-484/HAB-486 pilot customer provisioning and authoritative operating queue.
// Browser authority is limited to the Platform Admin's own JWT. Invitation tokens and email-provider
// credentials remain inside the Worker/Postgres boundary and are never returned here.
const config = window.HABITTA_ADMIN_CONFIG;
const SESSION_KEY = 'habitta-admin-session';

const logoutButton = document.querySelector('#onboarding-logout');
const globalSearch = document.querySelector('#onboarding-global-search');
const searchInput = document.querySelector('#onboarding-search');
const statusFilter = document.querySelector('#onboarding-status-filter');
const deliveryFilter = document.querySelector('#onboarding-delivery-filter');
const body = document.querySelector('#onboarding-body');
const status = document.querySelector('#onboarding-status');
const newButton = document.querySelector('#new-customer-button');
const dialog = document.querySelector('#new-customer-dialog');
const form = document.querySelector('#new-customer-form');
const closeButton = document.querySelector('#new-customer-close');
const cancelButton = document.querySelector('#new-customer-cancel');
const submitButton = document.querySelector('#new-customer-submit');
const emailInput = document.querySelector('#new-customer-email');
const planSelect = document.querySelector('#new-customer-plan');
const periodSelect = document.querySelector('#new-customer-period');
const expirySelect = document.querySelector('#new-customer-expiry');
const referenceInput = document.querySelector('#new-customer-reference');
const notesInput = document.querySelector('#new-customer-notes');
const planSummary = document.querySelector('#new-customer-plan-summary');
const formStatus = document.querySelector('#new-customer-status');
const revokeDialog = document.querySelector('#revoke-dialog');
const revokeForm = document.querySelector('#revoke-form');
const revokeReason = document.querySelector('#revoke-reason');
const revokeStatus = document.querySelector('#revoke-status');
const revokeCancel = document.querySelector('#revoke-cancel');
const revokeSubmit = document.querySelector('#revoke-submit');

const metricPending = document.querySelector('#onboarding-metric-pending');
const metricAccepted = document.querySelector('#onboarding-metric-accepted');
const metricCompleted = document.querySelector('#onboarding-metric-completed');
const metricEmail = document.querySelector('#onboarding-metric-email');

let invitations = [];
let plans = [];
let revokeTarget = null;

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function sessionOrRedirect() {
  const session = getSession();
  if (!session?.access_token) {
    window.location.replace('/');
    return null;
  }
  return session;
}

function apiBaseUrl() {
  if (config?.apiBaseUrl) return String(config.apiBaseUrl).replace(/\/$/, '');
  if (window.location.hostname === 'admin.mihabitta.com') {
    return 'https://habitta-api-prod.aragondaniel91.workers.dev';
  }
  if (window.location.hostname === 'admin-preview.mihabitta.com') {
    return 'https://habitta-api-dev.aragondaniel91.workers.dev';
  }
  return 'http://localhost:8787';
}

async function supabaseRequest(path, accessToken, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (response.status === 401) throw new Error('unauthorized');
  if (!response.ok) throw new Error('No se pudo consultar Platform Admin.');
  return response.json();
}

async function workerRequest(path, accessToken, options = {}) {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (response.status === 401) throw new Error('unauthorized');
  if (!response.ok) {
    let message = 'No se pudo completar la operación.';
    try {
      const data = await response.json();
      message = data.publicMessage ?? data.error ?? message;
    } catch {
      // Keep the safe generic message.
    }
    throw new Error(message);
  }
  return response.json();
}

async function ensurePlatformAdmin(accessToken) {
  const rows = await supabaseRequest('/rest/v1/platform_admins?select=user_id', accessToken);
  if (!rows.length) throw new Error('forbidden');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-VE', { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(number);
}

function planLabel(code) {
  return plans.find((plan) => plan.code === code)?.name ?? code ?? '—';
}

function periodLabel(value) {
  return value === 'annual' ? 'Anual' : 'Mensual';
}

function effectiveState(invitation) {
  if (invitation.operational_state) return invitation.operational_state;
  if (invitation.onboarding_completed_at) return 'completed';
  if (
    invitation.status === 'pending' &&
    invitation.expires_at &&
    new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    return 'expired';
  }
  return invitation.status;
}

function stateLabel(value) {
  return (
    {
      pending: 'Invitada',
      accepted: 'Aceptada',
      completed: 'Completada',
      revoked: 'Revocada',
      expired: 'Vencida',
    }[value] ?? value
  );
}

function stateTone(value) {
  if (value === 'completed') return 'success';
  if (value === 'accepted') return 'info';
  if (value === 'pending') return 'warning';
  if (value === 'revoked' || value === 'expired') return 'danger';
  return 'neutral';
}

function deliveryLabel(value) {
  return { sent: 'Enviado', failed: 'Falló', pending: 'Pendiente' }[value] ?? value ?? 'Pendiente';
}

function deliveryTone(value) {
  if (value === 'sent') return 'success';
  if (value === 'failed') return 'danger';
  return 'neutral';
}

function badge(text, tone = 'neutral') {
  const span = document.createElement('span');
  span.className = `status-badge status-badge--${tone}`;
  span.textContent = text;
  return span;
}

function button(text, variant, action) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = variant === 'danger' ? 'danger-button' : 'secondary-button';
  element.textContent = text;
  element.addEventListener('click', action);
  return element;
}

function blockerCode(invitation) {
  if (invitation.blocker_code) return invitation.blocker_code;
  const state = effectiveState(invitation);
  if (state === 'completed') return 'none';
  if (state === 'accepted') return 'awaiting_workspace_completion';
  if (state === 'pending' && invitation.delivery_status === 'failed')
    return 'email_delivery_failed';
  if (state === 'pending') return 'awaiting_customer_acceptance';
  if (state === 'expired') return 'invitation_expired';
  if (state === 'revoked') return 'invitation_revoked';
  return 'none';
}

function blockerLabel(value) {
  return (
    {
      email_delivery_failed: 'Email falló',
      awaiting_customer_acceptance: 'Esperando cliente',
      awaiting_workspace_completion: 'Workspace pendiente',
      pending_platform_activation: 'Activación pendiente',
      invitation_expired: 'Invitación vencida',
      invitation_revoked: 'Invitación revocada',
      none: 'Sin bloqueo',
    }[value] ?? 'Revisar estado'
  );
}

function blockerTone(value) {
  if (value === 'none') return 'success';
  if (value === 'awaiting_workspace_completion') return 'info';
  if (value === 'awaiting_customer_acceptance' || value === 'pending_platform_activation') {
    return 'warning';
  }
  if (
    value === 'email_delivery_failed' ||
    value === 'invitation_expired' ||
    value === 'invitation_revoked'
  ) {
    return 'danger';
  }
  return 'neutral';
}

function nextStep(invitation) {
  const coded = {
    resend_invitation: 'Reenviar invitación',
    wait_customer_acceptance: 'Esperar aceptación del cliente',
    customer_complete_workspace: 'Cliente debe completar su condominio',
    complete_commercial_activation: 'Completar activación comercial',
    open_customer_360: 'Abrir Customer 360',
    issue_new_invitation: 'Emitir una invitación nueva',
    none: 'Sin acción pendiente',
  }[invitation.next_action_code];
  if (coded) return coded;

  // Deployment-safety fallback for a brief static/DB rollout mismatch. The authoritative RPC codes
  // take precedence as soon as the HAB-486 migration is present.
  const state = effectiveState(invitation);
  if (state === 'completed') return 'Customer 360 disponible';
  if (state === 'accepted') return 'Cliente debe completar su condominio';
  if (state === 'pending' && invitation.delivery_status === 'failed') return 'Reenviar invitación';
  if (state === 'pending') return 'Esperando aceptación';
  if (state === 'expired' || state === 'revoked') return 'Emitir una invitación nueva';
  return 'Sin acción pendiente';
}

function searchable(invitation) {
  return [
    invitation.email,
    invitation.plan_code,
    planLabel(invitation.plan_code),
    invitation.reference,
    invitation.notes,
    blockerLabel(blockerCode(invitation)),
    nextStep(invitation),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es');
}

function filteredInvitations() {
  const query = (searchInput.value || globalSearch.value || '').trim().toLocaleLowerCase('es');
  return invitations.filter((invitation) => {
    const state = effectiveState(invitation);
    return (
      (!query || searchable(invitation).includes(query)) &&
      (!statusFilter.value || state === statusFilter.value) &&
      (!deliveryFilter.value || invitation.delivery_status === deliveryFilter.value)
    );
  });
}

function updateMetrics() {
  metricPending.textContent = String(
    invitations.filter((item) => effectiveState(item) === 'pending').length,
  );
  metricAccepted.textContent = String(
    invitations.filter((item) => effectiveState(item) === 'accepted').length,
  );
  metricCompleted.textContent = String(
    invitations.filter((item) => effectiveState(item) === 'completed').length,
  );
  metricEmail.textContent = String(
    invitations.filter((item) => item.delivery_status === 'failed').length,
  );
}

function render() {
  body.replaceChildren();
  const rows = filteredInvitations();
  updateMetrics();

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
    cell.className = 'onboarding-empty';
    cell.textContent = invitations.length
      ? 'No hay invitaciones que coincidan con los filtros.'
      : 'Aún no hay clientes en onboarding. Usa “Nuevo cliente” para iniciar el piloto.';
    row.append(cell);
    body.append(row);
    status.textContent = invitations.length ? 'Sin coincidencias.' : 'Sin invitaciones todavía.';
    return;
  }

  for (const invitation of rows) {
    const row = document.createElement('tr');
    const state = effectiveState(invitation);

    const customerCell = document.createElement('td');
    const email = document.createElement('span');
    email.className = 'onboarding-client-email';
    email.textContent = invitation.email;
    customerCell.append(email);
    if (invitation.notes) {
      const notes = document.createElement('span');
      notes.className = 'onboarding-email-detail';
      notes.textContent = invitation.notes;
      customerCell.append(notes);
    }

    const planCell = document.createElement('td');
    const plan = document.createElement('strong');
    plan.textContent = planLabel(invitation.plan_code);
    const period = document.createElement('span');
    period.className = 'onboarding-email-detail';
    period.textContent = periodLabel(invitation.billing_period);
    planCell.append(plan, period);

    const stateCell = document.createElement('td');
    stateCell.append(badge(stateLabel(state), stateTone(state)));

    const deliveryCell = document.createElement('td');
    deliveryCell.append(
      badge(deliveryLabel(invitation.delivery_status), deliveryTone(invitation.delivery_status)),
    );
    if (invitation.delivery_status === 'failed' && invitation.delivery_error_code) {
      const detail = document.createElement('span');
      detail.className = 'onboarding-email-detail';
      detail.textContent = 'Requiere reenvío';
      deliveryCell.append(detail);
    }

    const createdCell = document.createElement('td');
    createdCell.textContent = formatDate(invitation.created_at);
    const expiresCell = document.createElement('td');
    expiresCell.textContent = formatDate(invitation.expires_at);
    const referenceCell = document.createElement('td');
    referenceCell.className = 'onboarding-reference';
    referenceCell.textContent = invitation.reference || '—';
    const nextCell = document.createElement('td');
    nextCell.className = 'onboarding-next';
    const blocker = blockerCode(invitation);
    nextCell.append(badge(blockerLabel(blocker), blockerTone(blocker)));
    const nextDetail = document.createElement('span');
    nextDetail.className = 'onboarding-email-detail';
    nextDetail.textContent = `Siguiente: ${nextStep(invitation)}`;
    nextCell.append(nextDetail);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'onboarding-actions';
    if (
      invitation.next_action_code === 'complete_commercial_activation' &&
      invitation.onboarding_organization_id
    ) {
      const params = new URLSearchParams({ organization: invitation.onboarding_organization_id });
      if (invitation.onboarding_condominium_id) {
        params.set('condominium', invitation.onboarding_condominium_id);
      }
      const link = document.createElement('a');
      link.className = 'secondary-button';
      link.href = `/commercial.html?${params.toString()}`;
      link.textContent = 'Activar';
      actions.append(link);
    }
    if (state === 'completed' && invitation.onboarding_organization_id) {
      const link = document.createElement('a');
      link.className = 'secondary-button';
      link.href = `/customers.html?organization=${encodeURIComponent(invitation.onboarding_organization_id)}`;
      link.textContent = 'Ver cliente';
      actions.append(link);
    }
    if (state === 'pending') {
      actions.append(
        button('Reenviar', 'secondary', () => void resendInvitation(invitation)),
        button('Revocar', 'danger', () => openRevoke(invitation)),
      );
    }
    if (state === 'expired' || state === 'revoked') {
      actions.append(button('Nueva invitación', 'secondary', () => openNewCustomer(invitation)));
    }
    actionsCell.append(actions);

    row.append(
      customerCell,
      planCell,
      stateCell,
      deliveryCell,
      createdCell,
      expiresCell,
      referenceCell,
      nextCell,
      actionsCell,
    );
    body.append(row);
  }

  status.textContent = `${rows.length} de ${invitations.length} invitaciones visibles.`;
}

function populatePlans() {
  planSelect.replaceChildren();
  for (const plan of plans) {
    const option = document.createElement('option');
    option.value = plan.code;
    option.textContent = plan.name;
    planSelect.append(option);
  }
  updatePlanSummary();
}

function updatePlanSummary() {
  const plan = plans.find((item) => item.code === planSelect.value);
  if (!plan) {
    planSummary.replaceChildren();
    return;
  }
  const annual = periodSelect.value === 'annual';
  const amount = annual ? plan.catalog_annual_usd : plan.catalog_monthly_usd;
  const title = document.createElement('strong');
  title.textContent = `${plan.name} · ${formatMoney(amount)} ${annual ? 'al año' : 'al mes'}`;
  const detail = document.createElement('span');
  detail.textContent =
    plan.code === 'esencial' || plan.code === 'comunidad'
      ? 'Al completar el primer condominio se activa automáticamente una prueba real de 30 días. No se cobra hoy.'
      : 'Este es un onboarding guiado. El workspace se crea primero y la activación comercial se completa explícitamente en Platform Admin.';
  planSummary.replaceChildren(title, detail);
}

function resetForm() {
  form.reset();
  periodSelect.value = 'monthly';
  expirySelect.value = '14';
  if (plans[0]) planSelect.value = plans[0].code;
  formStatus.textContent = '';
  formStatus.removeAttribute('data-tone');
  updatePlanSummary();
}

function openNewCustomer(source = null) {
  resetForm();
  if (source) {
    emailInput.value = source.email ?? '';
    planSelect.value = source.plan_code ?? plans[0]?.code ?? '';
    periodSelect.value = source.billing_period ?? 'monthly';
    referenceInput.value = source.reference ?? '';
    notesInput.value = source.notes ?? '';
    updatePlanSummary();
  }
  dialog.showModal();
  window.setTimeout(() => emailInput.focus(), 0);
}

async function issueInvitation(payload) {
  const session = sessionOrRedirect();
  if (!session) return null;
  return workerRequest('/v1/platform/customer-invitations', session.access_token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function resendInvitation(invitation) {
  status.textContent = `Reenviando invitación a ${invitation.email}…`;
  try {
    const result = await issueInvitation({
      email: invitation.email,
      planCode: invitation.plan_code,
      billingPeriod: invitation.billing_period,
      ...(invitation.reference ? { reference: invitation.reference } : {}),
      ...(invitation.notes ? { notes: invitation.notes } : {}),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (!result) return;
    status.textContent = result.delivered
      ? 'Invitación reenviada correctamente.'
      : 'La invitación se renovó, pero el correo no pudo entregarse. Revisa el estado de Email.';
    await load();
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'No se pudo reenviar la invitación.';
  }
}

function openRevoke(invitation) {
  revokeTarget = invitation;
  revokeReason.value = 'Invitación reemplazada por el operador.';
  revokeStatus.textContent = '';
  revokeDialog.showModal();
}

async function load() {
  const session = sessionOrRedirect();
  if (!session) return;
  status.textContent = 'Cargando onboarding…';
  try {
    await ensurePlatformAdmin(session.access_token);
    const [planRows, queue] = await Promise.all([
      supabaseRequest(
        '/rest/v1/plans?select=code,name,catalog_monthly_usd,catalog_annual_usd&is_public=eq.true&order=sort_order',
        session.access_token,
      ),
      workerRequest('/v1/platform/customer-invitations', session.access_token),
    ]);
    plans = planRows;
    invitations = Array.isArray(queue.invitations) ? queue.invitations : [];
    populatePlans();
    render();
    if (new URLSearchParams(window.location.search).get('new') === '1') openNewCustomer();
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      clearSession();
      window.location.replace('/');
      return;
    }
    if (error instanceof Error && error.message === 'forbidden') {
      document.body.textContent = 'Acceso denegado: esta cuenta no es Platform Admin.';
      return;
    }
    status.textContent = error instanceof Error ? error.message : 'No se pudo cargar onboarding.';
  }
}

newButton.addEventListener('click', () => openNewCustomer());
closeButton.addEventListener('click', () => dialog.close());
cancelButton.addEventListener('click', () => dialog.close());
planSelect.addEventListener('change', updatePlanSummary);
periodSelect.addEventListener('change', updatePlanSummary);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  formStatus.textContent = 'Creando invitación y enviando correo…';
  formStatus.dataset.tone = 'neutral';
  try {
    const days = Number(expirySelect.value) || 14;
    const result = await issueInvitation({
      email: emailInput.value.trim(),
      planCode: planSelect.value,
      billingPeriod: periodSelect.value,
      ...(referenceInput.value.trim() ? { reference: referenceInput.value.trim() } : {}),
      ...(notesInput.value.trim() ? { notes: notesInput.value.trim() } : {}),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (!result) return;
    formStatus.dataset.tone = result.delivered ? 'success' : 'error';
    formStatus.textContent = result.delivered
      ? 'Invitación enviada. El cliente ya puede comenzar.'
      : 'La invitación fue creada, pero el proveedor de correo reportó un fallo. Puedes reenviarla desde la cola.';
    await load();
    if (result.delivered) window.setTimeout(() => dialog.close(), 700);
  } catch (error) {
    formStatus.dataset.tone = 'error';
    formStatus.textContent =
      error instanceof Error ? error.message : 'No se pudo crear la invitación.';
  } finally {
    submitButton.disabled = false;
  }
});

revokeCancel.addEventListener('click', () => revokeDialog.close());
revokeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!revokeTarget) return;
  const session = sessionOrRedirect();
  if (!session) return;
  revokeSubmit.disabled = true;
  revokeStatus.textContent = 'Revocando…';
  try {
    await workerRequest(
      `/v1/platform/customer-invitations/${encodeURIComponent(revokeTarget.id)}/revoke`,
      session.access_token,
      {
        method: 'POST',
        body: JSON.stringify({ reason: revokeReason.value.trim() || undefined }),
      },
    );
    revokeDialog.close();
    revokeTarget = null;
    await load();
  } catch (error) {
    revokeStatus.dataset.tone = 'error';
    revokeStatus.textContent = error instanceof Error ? error.message : 'No se pudo revocar.';
  } finally {
    revokeSubmit.disabled = false;
  }
});

for (const input of [globalSearch, searchInput]) input.addEventListener('input', render);
statusFilter.addEventListener('change', render);
deliveryFilter.addEventListener('change', render);
logoutButton.addEventListener('click', () => {
  clearSession();
  window.location.replace('/');
});

void load();
