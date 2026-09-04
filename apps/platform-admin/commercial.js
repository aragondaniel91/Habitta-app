// HAB-477 / HAB-430 Phase 5.
// Platform Admin commercial mutations remain browser -> hardened Postgres RPCs with the operator JWT.
// This surface never receives service-role credentials and never reads or writes tenant ledger data.
const config = window.HABITTA_ADMIN_CONFIG;
const SESSION_KEY = 'habitta-admin-session';

const customerSelect = document.querySelector('#commercial-customer-select');
const condominiumSelect = document.querySelector('#commercial-condominium-select');
const globalSearch = document.querySelector('#commercial-global-search');
const customerName = document.querySelector('#commercial-customer-name');
const customerMeta = document.querySelector('#commercial-customer-meta');
const customer360Link = document.querySelector('#commercial-customer-360');
const seeActivityLink = document.querySelector('#commercial-see-activity');
const statusElement = document.querySelector('#commercial-status');
const actionsView = document.querySelector('#commercial-actions-view');
const activityView = document.querySelector('#commercial-activity-view');
const actionCards = document.querySelector('#commercial-action-cards');
const offerList = document.querySelector('#commercial-offer-list');
const recentActivity = document.querySelector('#commercial-recent-activity');
const auditBody = document.querySelector('#commercial-audit-body');
const activityStatus = document.querySelector('#activity-status');
const activitySearch = document.querySelector('#activity-search');
const activityTypeFilter = document.querySelector('#activity-type-filter');
const refreshButton = document.querySelector('#commercial-refresh');
const logoutButton = document.querySelector('#commercial-logout');
const newOfferButton = document.querySelector('#new-offer-button');

const actionDialog = document.querySelector('#commercial-action-dialog');
const actionForm = document.querySelector('#commercial-action-form');
const dialogTitle = document.querySelector('#commercial-dialog-title');
const dialogSubtitle = document.querySelector('#commercial-dialog-subtitle');
const dialogWarning = document.querySelector('#commercial-dialog-warning');
const dialogFields = document.querySelector('#commercial-dialog-fields');
const dialogClose = document.querySelector('#commercial-dialog-close');
const dialogCancel = document.querySelector('#commercial-dialog-cancel');
const dialogSubmit = document.querySelector('#commercial-dialog-submit');
const confirmCheck = document.querySelector('#commercial-confirm-check');

const offerDialog = document.querySelector('#offer-dialog');
const offerForm = document.querySelector('#offer-form');
const offerDialogClose = document.querySelector('#offer-dialog-close');
const offerDialogCancel = document.querySelector('#offer-dialog-cancel');

const stateAccount = document.querySelector('#state-account');
const statePlan = document.querySelector('#state-plan');
const stateSubscription = document.querySelector('#state-subscription');
const stateContracted = document.querySelector('#state-contracted');
const stateEffective = document.querySelector('#state-effective');
const statePeriod = document.querySelector('#state-period');
const stateMethod = document.querySelector('#state-method');
const stateConsent = document.querySelector('#state-consent');
const stateAutoBill = document.querySelector('#state-auto-bill');

let operationsRows = [];
let commercialRows = [];
let organizations = [];
let offers = [];
let plans = [];
let customer360 = null;
let currentAction = null;
let detailRequest = 0;

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

async function request(path, accessToken, options = {}) {
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
  if (!response.ok) {
    let message = `Solicitud rechazada (${response.status}).`;
    try {
      const body = await response.json();
      message = body.message ?? body.error_description ?? body.hint ?? message;
    } catch {
      // Keep the safe generic error when the response body is not JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

function rpc(name, accessToken, body = {}) {
  return request(`/rest/v1/rpc/${name}`, accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function ensurePlatformAdmin(accessToken) {
  const rows = await request('/rest/v1/platform_admins?select=user_id&limit=1', accessToken);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('forbidden');
}

function setStatus(message, tone = '') {
  statusElement.textContent = message;
  if (tone) statusElement.dataset.tone = tone;
  else delete statusElement.dataset.tone;
}

function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(number);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function inputDate(value = null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function accountLabel(value) {
  return { customer: 'Cliente', demo: 'Demo · no facturable', internal: 'Interno · no facturable' }[
    value
  ] ?? '—';
}

function subscriptionLabel(value) {
  return (
    {
      trialing: 'Trial',
      active: 'Activa',
      past_due: 'Pago vencido',
      suspended: 'Suspendida',
      cancelled: 'Cancelada',
    }[value] ?? 'Sin suscripción'
  );
}

function badge(text, tone = 'neutral') {
  const span = document.createElement('span');
  span.className = `tag tag--${tone}`;
  span.textContent = text;
  return span;
}

function mergeOrganizations() {
  const commercialByCondominium = new Map(
    commercialRows.map((row) => [row.condominium_id, row]),
  );
  const byOrganization = new Map();

  for (const operation of operationsRows) {
    const commercial = commercialByCondominium.get(operation.condominium_id) ?? {};
    const row = { ...operation, ...commercial };
    if (!byOrganization.has(row.organization_id)) {
      byOrganization.set(row.organization_id, {
        id: row.organization_id,
        name: row.organization_name,
        account_type: row.account_type,
        condominiums: [],
      });
    }
    byOrganization.get(row.organization_id).condominiums.push(row);
  }

  // Operations remains the identity boundary. Commercial rows cannot silently enlarge cross-tenant
  // browser visibility when they are absent from the authorized operations read model.
  return [...byOrganization.values()].sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

function urlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    view: params.get('view') === 'activity' ? 'activity' : 'actions',
    organization: params.get('organization'),
    condominium: params.get('condominium'),
  };
}

function writeUrl({ view, organization, condominium } = {}) {
  const current = urlState();
  const params = new URLSearchParams();
  const nextView = view ?? current.view;
  const nextOrganization = organization ?? current.organization;
  const nextCondominium = condominium ?? current.condominium;
  if (nextView === 'activity') params.set('view', 'activity');
  if (nextOrganization) params.set('organization', nextOrganization);
  if (nextCondominium) params.set('condominium', nextCondominium);
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}?${params.toString()}`.replace(/\?$/, ''),
  );
}

function selectedOrganization() {
  const state = urlState();
  return organizations.find((organization) => organization.id === state.organization) ?? null;
}

function selectedRow() {
  const organization = selectedOrganization();
  if (!organization) return null;
  const state = urlState();
  return (
    organization.condominiums.find((row) => row.condominium_id === state.condominium) ??
    organization.condominiums[0] ??
    null
  );
}

function normalizeSelection() {
  if (!organizations.length) return;
  const state = urlState();
  const fallbackOrganization =
    organizations.find((organization) => organization.account_type === 'customer') ?? organizations[0];
  const organization =
    organizations.find((item) => item.id === state.organization) ?? fallbackOrganization;
  const condominium =
    organization.condominiums.find((row) => row.condominium_id === state.condominium) ??
    organization.condominiums[0];
  writeUrl({
    view: state.view,
    organization: organization.id,
    condominium: condominium?.condominium_id ?? null,
  });
}

function currentView() {
  return urlState().view;
}

function renderView() {
  const view = currentView();
  actionsView.hidden = view !== 'actions';
  activityView.hidden = view !== 'activity';
  document.querySelector('#commercial-page-title').textContent =
    view === 'activity' ? 'Actividad comercial' : 'Acciones comerciales';
  document.querySelector('#commercial-page-copy').textContent =
    view === 'activity'
      ? 'Consulta el historial autoritativo de cambios, términos y ajustes del cliente seleccionado.'
      : 'Ejecuta únicamente operaciones SaaS ya autorizadas y revisa su historial auditable sin salir del Platform Admin.';

  for (const link of document.querySelectorAll('[data-commercial-tab]')) {
    if (link.dataset.commercialTab === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const link of document.querySelectorAll('[data-commercial-nav]')) {
    if (link.dataset.commercialNav === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function renderSelectors() {
  const organization = selectedOrganization();
  const row = selectedRow();

  customerSelect.innerHTML = '';
  for (const item of organizations) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.name} · ${accountLabel(item.account_type)}`;
    option.selected = item.id === organization?.id;
    customerSelect.append(option);
  }

  condominiumSelect.innerHTML = '';
  for (const item of organization?.condominiums ?? []) {
    const option = document.createElement('option');
    option.value = item.condominium_id;
    option.textContent = item.condominium_name;
    option.selected = item.condominium_id === row?.condominium_id;
    condominiumSelect.append(option);
  }

  customerName.textContent = organization?.name ?? 'Sin clientes';
  customerMeta.textContent = organization
    ? `${organization.condominiums.length} condominio${organization.condominiums.length === 1 ? '' : 's'} · ${accountLabel(organization.account_type)}`
    : '—';

  if (organization) {
    customer360Link.href = `/customers.html?organization=${encodeURIComponent(organization.id)}`;
    const activityParams = new URLSearchParams({
      view: 'activity',
      organization: organization.id,
    });
    if (row?.condominium_id) activityParams.set('condominium', row.condominium_id);
    seeActivityLink.href = `/commercial.html?${activityParams.toString()}`;
  }
}

function planLabel(row) {
  return row?.plan_name ?? row?.plan_code ?? 'Sin plan';
}

function periodLabel(row) {
  if (!row?.subscription_id) return '—';
  if (row.subscription_status === 'trialing') return `Trial hasta ${formatDate(row.trial_ends_at)}`;
  return row.current_period_end ? `Hasta ${formatDate(row.current_period_end)}` : '—';
}

function priceLabel(value, row) {
  if (value === null || value === undefined) return '—';
  const suffix = row.billing_period === 'annual' ? '/año' : '/mes';
  return `${formatMoney(value, row.currency)}${suffix}`;
}

function yesNo(value) {
  return value ? 'Sí' : 'No';
}

function renderState() {
  const row = selectedRow();
  if (!row) {
    for (const element of [
      stateAccount,
      statePlan,
      stateSubscription,
      stateContracted,
      stateEffective,
      statePeriod,
      stateMethod,
      stateConsent,
      stateAutoBill,
    ]) {
      element.textContent = '—';
    }
    return;
  }

  stateAccount.textContent = accountLabel(row.account_type);
  statePlan.textContent = planLabel(row);
  stateSubscription.textContent = subscriptionLabel(row.subscription_status);
  stateContracted.textContent = priceLabel(row.contracted_period_amount, row);
  stateEffective.textContent = priceLabel(row.effective_period_amount, row);
  statePeriod.textContent = periodLabel(row);
  stateMethod.textContent = row.account_type === 'customer' ? yesNo(row.billing_method_ready) : 'No aplica';
  stateConsent.textContent =
    row.account_type === 'customer' ? yesNo(row.billing_consent_recorded) : 'No aplica';
  stateAutoBill.textContent =
    row.account_type === 'customer' ? yesNo(row.auto_bill_enabled) : 'No aplica';
}

function offerDescription(offer) {
  const value =
    offer.kind === 'percentage'
      ? `${Number(offer.percentage_off)}%`
      : formatMoney(offer.fixed_amount, offer.currency);
  return `${value} por ${offer.duration_months} mes(es)`;
}

function activeOffers() {
  const today = new Date().toISOString().slice(0, 10);
  return offers.filter((offer) => {
    if (!offer.active) return false;
    if (offer.valid_from && today < offer.valid_from) return false;
    if (offer.valid_until && today > offer.valid_until) return false;
    if (
      offer.max_redemptions !== null &&
      Number(offer.redemption_count) >= Number(offer.max_redemptions)
    )
      return false;
    return true;
  });
}

const actionDefinitions = {
  trial: {
    label: 'Iniciar 30 días',
    icon: '30',
    copy: 'Crea el trial comercial idempotente para un cliente todavía sin suscripción.',
  },
  coupon: {
    label: 'Aplicar cupón',
    icon: '%',
    copy: 'Aplica una oferta activa sin modificar el precio contractual base ni permitir stacking.',
  },
  gift: {
    label: 'Regalar meses',
    icon: '＋',
    copy: 'Registra acceso temporal a $0 como ajuste comercial auditable, nunca como pago.',
  },
  activate: {
    label: 'Activar manual',
    icon: '✓',
    copy: 'Confirma acceso activo sin habilitar auto-billing ni fabricar un cobro.',
  },
};

function allowedActions(row) {
  if (!row) return [];
  if (row.account_type !== 'customer') return [];
  if (!row.subscription_id) return ['trial'];
  const actions = [];
  if (row.subscription_status !== 'cancelled' && activeOffers().length > 0) actions.push('coupon');
  if (['active', 'past_due'].includes(row.subscription_status)) actions.push('gift');
  if (['trialing', 'suspended', 'past_due'].includes(row.subscription_status)) actions.push('activate');
  return actions;
}

function renderActions() {
  const row = selectedRow();
  actionCards.innerHTML = '';

  if (!row) {
    const empty = document.createElement('div');
    empty.className = 'empty-actions';
    empty.textContent = 'No hay un condominio seleccionado.';
    actionCards.append(empty);
    return;
  }

  if (row.account_type !== 'customer') {
    const empty = document.createElement('div');
    empty.className = 'empty-actions';
    empty.append(
      badge('Fuera de billing', 'neutral'),
      document.createTextNode(
        ' Demo e Interno permanecen visibles, pero no reciben controles de mutación comercial.',
      ),
    );
    actionCards.append(empty);
    return;
  }

  const actions = allowedActions(row);
  if (!actions.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-actions';
    empty.textContent =
      row.subscription_status === 'cancelled'
        ? 'La suscripción está cancelada y no hay una mutación aprobada para este estado.'
        : 'No hay acciones comerciales aplicables al estado actual.';
    actionCards.append(empty);
    return;
  }

  for (const action of actions) {
    const definition = actionDefinitions[action];
    const card = document.createElement('article');
    card.className = 'action-card';
    const head = document.createElement('div');
    head.className = 'action-card-head';
    const icon = document.createElement('span');
    icon.className = 'action-icon';
    icon.textContent = definition.icon;
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = definition.label;
    const description = document.createElement('p');
    description.textContent = definition.copy;
    copy.append(title, description);
    head.append(icon, copy);

    const guardrail = document.createElement('p');
    guardrail.textContent = `${row.condominium_name} · ${subscriptionLabel(row.subscription_status)}`;

    const button = document.createElement('button');
    button.className = action === 'activate' ? 'primary-button' : 'secondary-button';
    button.type = 'button';
    button.textContent = definition.label;
    button.addEventListener('click', () => openAction(action, row));
    card.append(head, guardrail, button);
    actionCards.append(card);
  }
}

function field(labelText, control, { full = false } = {}) {
  const label = document.createElement('label');
  if (full) label.className = 'field-full';
  label.append(document.createTextNode(labelText), control);
  return label;
}

function selectControl(name, options) {
  const select = document.createElement('select');
  select.name = name;
  select.required = true;
  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }
  return select;
}

function inputControl(name, { type = 'text', value = '', min = null } = {}) {
  const input = document.createElement('input');
  input.name = name;
  input.type = type;
  input.value = value;
  input.required = true;
  if (min !== null) input.min = String(min);
  return input;
}

function openAction(action, row) {
  currentAction = { action, row };
  dialogFields.innerHTML = '';
  delete dialogWarning.dataset.tone;
  confirmCheck.checked = false;
  dialogSubmit.disabled = true;
  dialogSubtitle.textContent = `${row.organization_name} · ${row.condominium_name}`;

  if (action === 'trial') {
    dialogTitle.textContent = 'Iniciar 30 días gratis';
    dialogWarning.textContent =
      'No se cobrará hoy. Auto-billing permanece apagado y el trial solo puede usar planes públicos autorizados.';
    dialogFields.append(
      field(
        'Plan',
        selectControl(
          'plan',
          plans.map((plan) => ({
            value: plan.code,
            label: `${plan.name} · ${formatMoney(plan.catalog_monthly_usd)}/mes`,
          })),
        ),
      ),
      field(
        'Facturación futura',
        selectControl('billingPeriod', [
          { value: 'monthly', label: 'Mensual' },
          { value: 'annual', label: 'Anual' },
        ]),
      ),
    );
  } else if (action === 'coupon') {
    dialogTitle.textContent = 'Aplicar cupón';
    dialogWarning.textContent =
      'El beneficio es temporal. HAB-424 preserva el precio contractual base, limita redenciones y rechaza stacking no permitido.';
    dialogFields.append(
      field(
        'Oferta',
        selectControl(
          'offer',
          activeOffers().map((offer) => ({
            value: offer.code,
            label: `${offer.code} · ${offerDescription(offer)}`,
          })),
        ),
      ),
      field(
        'Comienza',
        inputControl('startDate', {
          type: 'date',
          value: inputDate(row.subscription_status === 'trialing' ? row.trial_ends_at : null),
        }),
      ),
    );
  } else if (action === 'gift') {
    dialogTitle.textContent = 'Regalar meses';
    dialogWarning.textContent =
      'El período regalado se registra como ajuste comercial a $0. No crea payments, receivables ni movimientos del ledger.';
    dialogFields.append(
      field(
        'Meses',
        selectControl(
          'months',
          [1, 2, 3, 6].map((value) => ({
            value: String(value),
            label: `${value} mes${value === 1 ? '' : 'es'}`,
          })),
        ),
      ),
      field('Comienza', inputControl('startDate', { type: 'date', value: inputDate() })),
      field(
        'Nota',
        inputControl('note', { value: 'Acceso promocional autorizado' }),
        { full: true },
      ),
    );
  } else if (action === 'activate') {
    dialogTitle.textContent = 'Activar manualmente';
    dialogWarning.textContent =
      'Confirma la suscripción como activa, pero NO registra un pago, NO configura método/consentimiento y NO habilita auto-billing.';
  }

  actionDialog.showModal();
}

async function submitAction() {
  if (!currentAction || !confirmCheck.checked) return;
  const session = sessionOrRedirect();
  if (!session) return;
  const { action, row } = currentAction;
  const data = new FormData(actionForm);
  dialogSubmit.disabled = true;

  try {
    if (action === 'trial') {
      await rpc('platform_start_30_day_trial', session.access_token, {
        p_condominium_id: row.condominium_id,
        p_plan_code: String(data.get('plan')),
        p_billing_period: String(data.get('billingPeriod')),
      });
    } else if (action === 'coupon') {
      await rpc('platform_apply_commercial_offer', session.access_token, {
        p_condominium_id: row.condominium_id,
        p_code: String(data.get('offer')),
        p_start_date: String(data.get('startDate')),
      });
    } else if (action === 'gift') {
      await rpc('platform_gift_months', session.access_token, {
        p_condominium_id: row.condominium_id,
        p_months: Number(data.get('months')),
        p_start_date: String(data.get('startDate')),
        p_note: String(data.get('note') ?? ''),
      });
    } else if (action === 'activate') {
      await rpc('platform_activate_subscription', session.access_token, {
        p_condominium_id: row.condominium_id,
        p_billing_consent_at: null,
        p_billing_method_ready_at: null,
        p_enable_auto_bill: false,
      });
    }

    actionDialog.close();
    setStatus('Acción comercial confirmada. El estado y la auditoría fueron recargados.', 'success');
    await loadData({ keepStatus: true });
  } catch (error) {
    dialogSubmit.disabled = false;
    dialogWarning.dataset.tone = 'error';
    dialogWarning.textContent =
      error instanceof Error ? error.message : 'No se pudo aplicar la acción comercial.';
  }
}

function renderOffers() {
  offerList.innerHTML = '';
  if (!offers.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-actions';
    empty.textContent = 'Todavía no hay ofertas comerciales definidas.';
    offerList.append(empty);
    return;
  }

  for (const offer of offers) {
    const row = document.createElement('article');
    row.className = 'offer-row';
    const head = document.createElement('div');
    head.className = 'offer-row-head';
    const code = document.createElement('strong');
    code.textContent = offer.code;
    head.append(code, badge(offer.active ? 'Activa' : 'Deshabilitada', offer.active ? 'success' : 'neutral'));
    const copy = document.createElement('p');
    copy.textContent = offerDescription(offer);
    const meta = document.createElement('div');
    meta.className = 'offer-meta';
    meta.append(
      badge(
        `Usos ${offer.redemption_count}${offer.max_redemptions === null ? '' : `/${offer.max_redemptions}`}`,
        'info',
      ),
      badge(offer.valid_until ? `Hasta ${formatDate(offer.valid_until)}` : 'Sin fecha final', 'neutral'),
    );
    if (offer.active) {
      const disable = document.createElement('button');
      disable.className = 'secondary-button';
      disable.type = 'button';
      disable.textContent = 'Deshabilitar';
      disable.addEventListener('click', () => void disableOffer(offer));
      meta.append(disable);
    }
    row.append(head, copy, meta);
    offerList.append(row);
  }
}

function actorLabel(value) {
  if (!value) return 'No registrado';
  return `Actor ${String(value).slice(0, 8)}…`;
}

function condominiumName(id) {
  if (!id) return 'Organización';
  const organization = selectedOrganization();
  return (
    organization?.condominiums.find((row) => row.condominium_id === id)?.condominium_name ??
    'Condominio registrado'
  );
}

function activityItems(data) {
  if (!data) return [];
  const items = [];
  for (const item of data.commercial_history ?? []) {
    const detail = [
      item.from_status && item.to_status ? `${item.from_status} → ${item.to_status}` : null,
      item.from_plan && item.to_plan ? `${item.from_plan} → ${item.to_plan}` : null,
      item.reason,
    ]
      .filter(Boolean)
      .join(' · ');
    items.push({
      at: item.created_at,
      type: 'subscription',
      typeLabel: 'Suscripción',
      action: item.event_type ?? 'Evento de suscripción',
      condominium: condominiumName(item.condominium_id),
      detail: detail || 'Cambio registrado por el contrato comercial.',
      actor: actorLabel(item.actor_user_id),
    });
  }
  for (const item of data.terms_history ?? []) {
    items.push({
      at: item.created_at,
      type: 'terms',
      typeLabel: 'Términos',
      action: `Términos ${item.plan_code ?? ''}`.trim(),
      condominium: condominiumName(item.condominium_id),
      detail: `${item.billing_period ?? 'período'} · ${formatMoney(item.contracted_period_amount, item.currency)}`,
      actor: actorLabel(item.authorized_by),
    });
  }
  for (const item of data.adjustment_history ?? []) {
    items.push({
      at: item.created_at,
      type: 'adjustment',
      typeLabel: 'Ajuste',
      action: `Ajuste ${item.kind ?? 'comercial'}`,
      condominium: condominiumName(item.condominium_id),
      detail: `${item.source ?? 'origen registrado'} · ${formatMoney(item.effective_period_amount, item.currency)} · ${formatDate(item.effective_from)} → ${formatDate(item.effective_to)}`,
      actor: actorLabel(item.authorized_by),
    });
  }
  return items
    .filter((item) => item.at)
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
}

function activityTone(type) {
  if (type === 'subscription') return 'info';
  if (type === 'terms') return 'neutral';
  return 'warning';
}

function renderRecentActivity() {
  recentActivity.innerHTML = '';
  const items = activityItems(customer360).slice(0, 5);
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-actions';
    empty.textContent = 'No hay actividad comercial registrada todavía.';
    recentActivity.append(empty);
    return;
  }
  for (const item of items) {
    const article = document.createElement('article');
    article.className = 'activity-item';
    const head = document.createElement('div');
    head.className = 'activity-item-head';
    const title = document.createElement('strong');
    title.textContent = item.action;
    head.append(title, badge(item.typeLabel, activityTone(item.type)));
    const copy = document.createElement('p');
    copy.textContent = item.detail;
    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    meta.append(
      badge(formatDateTime(item.at), 'neutral'),
      badge(item.condominium, 'neutral'),
      badge(item.actor, 'neutral'),
    );
    article.append(head, copy, meta);
    recentActivity.append(article);
  }
}

function filteredActivity() {
  const query = activitySearch.value.trim().toLocaleLowerCase('es');
  const type = activityTypeFilter.value;
  return activityItems(customer360).filter((item) => {
    if (type && item.type !== type) return false;
    if (!query) return true;
    return [item.typeLabel, item.action, item.condominium, item.detail, item.actor]
      .join(' ')
      .toLocaleLowerCase('es')
      .includes(query);
  });
}

function appendAuditCell(tr, text, className = '') {
  const td = document.createElement('td');
  td.textContent = text ?? '—';
  if (className) td.className = className;
  tr.append(td);
}

function renderAudit() {
  auditBody.innerHTML = '';
  const items = filteredActivity();
  for (const item of items) {
    const tr = document.createElement('tr');
    appendAuditCell(tr, formatDateTime(item.at));
    const typeCell = document.createElement('td');
    typeCell.append(badge(item.typeLabel, activityTone(item.type)));
    tr.append(typeCell);
    appendAuditCell(tr, item.action);
    appendAuditCell(tr, item.condominium);
    appendAuditCell(tr, item.detail, 'audit-detail');
    appendAuditCell(tr, item.actor, 'audit-actor');
    auditBody.append(tr);
  }
  activityStatus.textContent = items.length
    ? `${items.length} evento(s) autoritativo(s) para el cliente seleccionado.`
    : 'No hay actividad que coincida con los filtros actuales.';
}

function renderAll() {
  renderView();
  renderSelectors();
  renderState();
  renderActions();
  renderOffers();
  renderRecentActivity();
  renderAudit();
}

async function loadCustomer360(organizationId) {
  const session = sessionOrRedirect();
  if (!session || !organizationId) return;
  const requestId = ++detailRequest;
  try {
    const data = await rpc('get_platform_customer_360', session.access_token, {
      target_organization: organizationId,
    });
    if (requestId !== detailRequest) return;
    customer360 = data;
    renderRecentActivity();
    renderAudit();
  } catch (error) {
    if (requestId !== detailRequest) return;
    if (error instanceof Error && error.message === 'unauthorized') {
      clearSession();
      window.location.replace('/');
      return;
    }
    setStatus(
      error instanceof Error ? error.message : 'No se pudo cargar el historial comercial.',
      'error',
    );
  }
}

async function loadData({ keepStatus = false } = {}) {
  const session = sessionOrRedirect();
  if (!session) return;
  if (!keepStatus) setStatus('Cargando operación comercial…');

  try {
    await ensurePlatformAdmin(session.access_token);
    const [operations, commercial, offerRows, planRows] = await Promise.all([
      rpc('get_platform_operations_overview', session.access_token),
      rpc('get_platform_commercial_overview', session.access_token),
      rpc('platform_list_commercial_offers', session.access_token),
      request(
        '/rest/v1/plans?select=code,name,catalog_monthly_usd,catalog_annual_usd&is_public=eq.true&order=sort_order',
        session.access_token,
      ),
    ]);
    operationsRows = Array.isArray(operations) ? operations : [];
    commercialRows = Array.isArray(commercial) ? commercial : [];
    offers = Array.isArray(offerRows) ? offerRows : [];
    plans = Array.isArray(planRows) ? planRows : [];
    organizations = mergeOrganizations();
    normalizeSelection();
    customer360 = null;
    renderAll();
    const organization = selectedOrganization();
    if (organization) await loadCustomer360(organization.id);
    if (!keepStatus) {
      setStatus(
        `${organizations.length} organización(es) autorizada(s) · ${offers.filter((offer) => offer.active).length} oferta(s) activa(s).`,
        'success',
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'unauthorized' || error.message === 'forbidden')
    ) {
      clearSession();
      window.location.replace('/');
      return;
    }
    setStatus(
      error instanceof Error ? error.message : 'No se pudo cargar la operación comercial.',
      'error',
    );
  }
}

async function disableOffer(offer) {
  if (!window.confirm(`¿Deshabilitar ${offer.code}? Las aplicaciones existentes no se modifican.`)) return;
  const session = sessionOrRedirect();
  if (!session) return;
  try {
    await rpc('platform_disable_commercial_offer', session.access_token, { p_offer_id: offer.id });
    setStatus(`Oferta ${offer.code} deshabilitada.`, 'success');
    await loadData({ keepStatus: true });
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : 'No se pudo deshabilitar la oferta.',
      'error',
    );
  }
}

async function createOffer() {
  const session = sessionOrRedirect();
  if (!session) return;
  const data = new FormData(offerForm);
  const submit = offerForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await rpc('platform_create_commercial_offer', session.access_token, {
      p_code: String(data.get('code') ?? '').trim(),
      p_kind: String(data.get('kind')),
      p_value: Number(data.get('value')),
      p_duration_months: Number(data.get('duration')),
      p_valid_from: null,
      p_valid_until: data.get('validUntil') ? String(data.get('validUntil')) : null,
      p_max_redemptions: data.get('maxRedemptions') ? Number(data.get('maxRedemptions')) : null,
      p_note: String(data.get('note') ?? ''),
    });
    offerDialog.close();
    offerForm.reset();
    setStatus('Oferta comercial creada correctamente.', 'success');
    await loadData({ keepStatus: true });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'No se pudo crear la oferta.', 'error');
  } finally {
    submit.disabled = false;
  }
}

async function selectOrganization(organizationId) {
  const organization = organizations.find((item) => item.id === organizationId);
  if (!organization) return;
  const condominium = organization.condominiums[0];
  writeUrl({
    organization: organization.id,
    condominium: condominium?.condominium_id ?? null,
  });
  customer360 = null;
  renderAll();
  await loadCustomer360(organization.id);
}

customerSelect.addEventListener('change', () => void selectOrganization(customerSelect.value));
condominiumSelect.addEventListener('change', () => {
  writeUrl({ condominium: condominiumSelect.value });
  renderSelectors();
  renderState();
  renderActions();
});

for (const link of document.querySelectorAll('[data-commercial-tab], [data-commercial-nav]')) {
  link.addEventListener('click', (event) => {
    const view = link.dataset.commercialTab ?? link.dataset.commercialNav;
    if (!['actions', 'activity'].includes(view)) return;
    event.preventDefault();
    writeUrl({ view });
    renderView();
    renderAudit();
  });
}

activitySearch.addEventListener('input', renderAudit);
activityTypeFilter.addEventListener('change', renderAudit);

globalSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const query = globalSearch.value.trim().toLocaleLowerCase('es');
  if (!query) return;
  const match = organizations.find((organization) =>
    [
      organization.name,
      ...organization.condominiums.map((row) => row.condominium_name),
      ...organization.condominiums.map((row) => row.plan_name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('es')
      .includes(query),
  );
  if (match) void selectOrganization(match.id);
  else setStatus('No se encontró un cliente que coincida con la búsqueda.', 'error');
});

confirmCheck.addEventListener('change', () => {
  dialogSubmit.disabled = !confirmCheck.checked;
});
actionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitAction();
});
dialogClose.addEventListener('click', () => actionDialog.close());
dialogCancel.addEventListener('click', () => actionDialog.close());

newOfferButton.addEventListener('click', () => offerDialog.showModal());
offerDialogClose.addEventListener('click', () => offerDialog.close());
offerDialogCancel.addEventListener('click', () => offerDialog.close());
offerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void createOffer();
});

refreshButton.addEventListener('click', () => void loadData());
logoutButton.addEventListener('click', () => {
  clearSession();
  window.location.replace('/');
});
window.addEventListener('popstate', () => {
  normalizeSelection();
  renderAll();
  const organization = selectedOrganization();
  if (organization) void loadCustomer360(organization.id);
});

loadData();
