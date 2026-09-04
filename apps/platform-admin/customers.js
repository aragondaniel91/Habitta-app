// HAB-464 / HAB-430 Phase 2.
// Raw static Platform Admin surface: anon key + operator JWT only. Cross-tenant authorization
// remains inside hardened Postgres RPCs; this browser never receives privileged credentials.
const config = window.HABITTA_ADMIN_CONFIG;
const SESSION_KEY = 'habitta-admin-session';
const PAGE_SIZE = 20;

const listView = document.querySelector('#customers-list-view');
const detailView = document.querySelector('#customer-detail-view');
const detailContent = document.querySelector('#customer-detail-content');
const detailStatus = document.querySelector('#customer-detail-status');
const logoutButton = document.querySelector('#customers-logout');
const globalSearch = document.querySelector('#global-customer-search');
const searchInput = document.querySelector('#customer-search');
const accountFilter = document.querySelector('#customer-account-filter');
const subscriptionFilter = document.querySelector('#customer-subscription-filter');
const billingFilter = document.querySelector('#customer-billing-filter');
const sortSelect = document.querySelector('#customer-sort');
const customersBody = document.querySelector('#customers-body');
const customersStatus = document.querySelector('#customers-status');
const prevButton = document.querySelector('#customers-prev');
const nextButton = document.querySelector('#customers-next');
const pageLabel = document.querySelector('#customers-page');
const backButton = document.querySelector('#customer-back');

const metricTotal = document.querySelector('#customers-metric-total');
const metricActive = document.querySelector('#customers-metric-active');
const metricTrials = document.querySelector('#customers-metric-trials');
const metricAttention = document.querySelector('#customers-metric-attention');

let portfolio = [];
let currentPage = 1;
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
    let message = 'No se pudo cargar Platform Admin.';
    try {
      const body = await response.json();
      message = body.message ?? body.error_description ?? body.hint ?? message;
    } catch {
      // Keep the safe generic error; response bodies are not assumed to be JSON.
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
  const rows = await request('/rest/v1/platform_admins?select=user_id', accessToken);
  if (!rows.length) throw new Error('forbidden');
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

function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

function accountLabel(value) {
  return { customer: 'Cliente', demo: 'Demo', internal: 'Interno' }[value] ?? value ?? '—';
}

function subscriptionLabel(value) {
  return (
    {
      trialing: 'Prueba',
      active: 'Activa',
      past_due: 'Pago vencido',
      suspended: 'Suspendida',
      cancelled: 'Cancelada',
      none: 'Sin suscripción',
    }[value] ??
    value ??
    'Sin suscripción'
  );
}

function badge(text, tone = 'neutral') {
  const span = document.createElement('span');
  span.className = `status-badge status-badge--${tone}`;
  span.textContent = text;
  return span;
}

function accountBadge(value) {
  const tone = value === 'customer' ? 'customer' : value === 'demo' ? 'demo' : 'neutral';
  return badge(accountLabel(value), tone);
}

function subscriptionTone(value) {
  if (value === 'active') return 'success';
  if (value === 'trialing') return 'info';
  if (value === 'past_due') return 'warning';
  if (value === 'suspended' || value === 'cancelled') return 'danger';
  return 'neutral';
}

function monthlyEquivalent(amount, period) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return 0;
  return period === 'annual' ? number / 12 : number;
}

function daysUntil(value) {
  if (!value) return null;
  const remaining = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(remaining)) return null;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

function trialEndsSoon(row) {
  if (row.account_type !== 'customer' || row.subscription_status !== 'trialing') return false;
  const days = daysUntil(row.trial_ends_at);
  return days !== null && days >= 0 && days <= 7;
}

function mergePortfolioRows(operationsRows, commercialRows) {
  const commercialByCondominium = new Map(commercialRows.map((row) => [row.condominium_id, row]));
  const organizations = new Map();

  for (const operation of operationsRows) {
    const commercial = commercialByCondominium.get(operation.condominium_id) ?? {};
    const row = { ...operation, ...commercial };
    const id = row.organization_id;
    if (!organizations.has(id)) {
      organizations.set(id, {
        id,
        name: row.organization_name,
        accountType: row.account_type,
        condominiums: [],
      });
    }
    organizations.get(id).condominiums.push(row);
  }

  // The operations RPC is the portfolio identity boundary. If a future commercial contract contains
  // a row absent there, do not silently enlarge the browser's cross-tenant identity surface.
  return [...organizations.values()].map(deriveOrganization);
}

function deriveOrganization(organization) {
  const rows = organization.condominiums;
  const statuses = [...new Set(rows.map((row) => row.subscription_status ?? 'none'))];
  const plans = [...new Set(rows.map((row) => row.plan_name).filter(Boolean))];
  const currencies = [...new Set(rows.map((row) => row.currency).filter(Boolean))];
  const trialDates = rows
    .filter((row) => row.subscription_status === 'trialing' && row.trial_ends_at)
    .map((row) => row.trial_ends_at)
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
  const unitCount = rows.reduce((total, row) => total + Number(row.active_unit_count ?? 0), 0);
  const membershipCount = rows.reduce((total, row) => total + Number(row.membership_count ?? 0), 0);
  const currency = currencies.length === 1 ? currencies[0] : null;
  const contractedMrr = rows.reduce(
    (total, row) => total + monthlyEquivalent(row.contracted_period_amount, row.billing_period),
    0,
  );

  const isCustomer = organization.accountType === 'customer';
  const missingSubscription = isCustomer && rows.some((row) => !row.subscription_id);
  const pastDue = isCustomer && rows.some((row) => row.subscription_status === 'past_due');
  const suspended = isCustomer && rows.some((row) => row.subscription_status === 'suspended');
  const billingSetupIncomplete =
    isCustomer &&
    rows.some(
      (row) =>
        row.subscription_status === 'active' &&
        (!row.billing_consent_recorded || !row.billing_method_ready),
    );
  const trialEnding = rows.some(trialEndsSoon);

  let billingState = 'not_applicable';
  if (isCustomer) {
    if (pastDue || suspended) billingState = 'attention';
    else if (missingSubscription || billingSetupIncomplete) billingState = 'incomplete';
    else if (
      rows.filter((row) => row.subscription_id).length > 0 &&
      rows
        .filter((row) => row.subscription_id)
        .every((row) => row.billing_consent_recorded && row.billing_method_ready)
    ) {
      billingState = 'ready';
    } else {
      billingState = 'incomplete';
    }
  }

  const attention = [];
  if (suspended) attention.push({ key: 'suspended', label: 'Suspendida', tone: 'danger' });
  if (pastDue) attention.push({ key: 'past_due', label: 'Pago vencido', tone: 'danger' });
  if (missingSubscription)
    attention.push({ key: 'missing_subscription', label: 'Sin suscripción', tone: 'warning' });
  if (billingSetupIncomplete)
    attention.push({ key: 'billing_setup', label: 'Billing incompleto', tone: 'warning' });
  if (trialEnding)
    attention.push({ key: 'trial_ending', label: 'Trial por vencer', tone: 'warning' });

  return {
    ...organization,
    statuses,
    plans,
    currency,
    contractedMrr,
    unitCount,
    membershipCount,
    trialEndsAt: trialDates[0] ?? null,
    billingState,
    attention,
    billable: isCustomer,
  };
}

function organizationSearchValue(organization) {
  return [
    organization.name,
    organization.accountType,
    ...organization.plans,
    ...organization.statuses,
    ...organization.condominiums.map((row) => row.condominium_name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es');
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get('q') ?? '',
    account: params.get('account') ?? '',
    subscription: params.get('status') ?? '',
    billing: params.get('billing') ?? '',
    sort: params.get('sort') ?? 'name',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

function applyFiltersToControls() {
  const filters = readFiltersFromUrl();
  searchInput.value = filters.query;
  globalSearch.value = filters.query;
  accountFilter.value = filters.account;
  subscriptionFilter.value = filters.subscription;
  billingFilter.value = filters.billing;
  sortSelect.value = ['name', 'attention', 'units', 'price'].includes(filters.sort)
    ? filters.sort
    : 'name';
  currentPage = filters.page;
}

function writeFiltersToUrl({ resetPage = false } = {}) {
  const params = new URLSearchParams(window.location.search);
  const values = {
    q: searchInput.value.trim(),
    account: accountFilter.value,
    status: subscriptionFilter.value,
    billing: billingFilter.value,
    sort: sortSelect.value === 'name' ? '' : sortSelect.value,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  if (resetPage) currentPage = 1;
  if (currentPage > 1) params.set('page', String(currentPage));
  else params.delete('page');
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}?${params.toString()}`.replace(/\?$/, ''),
  );
}

function matchesSubscriptionFilter(organization, value) {
  if (!value) return true;
  if (value === 'none') return organization.statuses.includes('none');
  return organization.statuses.includes(value);
}

function filteredPortfolio() {
  const query = searchInput.value.trim().toLocaleLowerCase('es');
  const account = accountFilter.value;
  const subscription = subscriptionFilter.value;
  const billing = billingFilter.value;

  const rows = portfolio.filter((organization) => {
    if (query && !organizationSearchValue(organization).includes(query)) return false;
    if (account && organization.accountType !== account) return false;
    if (!matchesSubscriptionFilter(organization, subscription)) return false;
    if (billing && organization.billingState !== billing) return false;
    return true;
  });

  const sort = sortSelect.value;
  rows.sort((left, right) => {
    if (sort === 'attention') {
      const difference = right.attention.length - left.attention.length;
      if (difference) return difference;
    }
    if (sort === 'units') {
      const difference = right.unitCount - left.unitCount;
      if (difference) return difference;
    }
    if (sort === 'price') {
      const difference = right.contractedMrr - left.contractedMrr;
      if (difference) return difference;
    }
    return left.name.localeCompare(right.name, 'es');
  });
  return rows;
}

function renderMetrics() {
  const customers = portfolio.filter((organization) => organization.billable);
  metricTotal.textContent = String(customers.length);
  metricActive.textContent = String(
    customers.reduce(
      (total, organization) =>
        total +
        organization.condominiums.filter((row) => row.subscription_status === 'active').length,
      0,
    ),
  );
  metricTrials.textContent = String(
    customers.filter((organization) =>
      organization.attention.some((item) => item.key === 'trial_ending'),
    ).length,
  );
  metricAttention.textContent = String(
    customers.filter((organization) => organization.attention.length > 0).length,
  );
}

function planLabel(organization) {
  if (!organization.plans.length) return 'Sin plan';
  if (organization.plans.length === 1) return organization.plans[0];
  return `${organization.plans.length} planes`;
}

function statusSummary(organization) {
  if (organization.statuses.length === 1) return organization.statuses[0];
  const priority = ['suspended', 'past_due', 'trialing', 'active', 'cancelled', 'none'];
  return (
    priority.find((status) => organization.statuses.includes(status)) ?? organization.statuses[0]
  );
}

function contractedPriceLabel(organization) {
  if (!organization.billable) return 'No facturable';
  if (!organization.currency) return organization.contractedMrr ? 'Monedas mixtas' : '—';
  if (!organization.contractedMrr) return '—';
  return `${formatMoney(organization.contractedMrr, organization.currency)}/mes`;
}

function trialOrPeriodLabel(organization) {
  if (organization.trialEndsAt) {
    const days = daysUntil(organization.trialEndsAt);
    const suffix = days !== null && days >= 0 ? ` · ${days} día(s)` : '';
    return `Trial: ${formatDate(organization.trialEndsAt)}${suffix}`;
  }
  const periodEnds = organization.condominiums
    .map((row) => row.current_period_end)
    .filter(Boolean)
    .sort();
  return periodEnds[0] ? `Período: ${formatDate(periodEnds[0])}` : '—';
}

function billingReadinessElement(organization) {
  const span = document.createElement('span');
  const configByState = {
    ready: ['Listo para cobrar', 'ready'],
    incomplete: ['Configuración incompleta', 'warning'],
    attention: ['Requiere atención', 'danger'],
    not_applicable: ['No aplica', 'neutral'],
  };
  const [label, tone] = configByState[organization.billingState] ?? configByState.incomplete;
  span.className = `billing-readiness billing-readiness--${tone}`;
  span.textContent = label;
  return span;
}

function initials(name) {
  return String(name ?? 'H')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function appendTextCell(row, text, secondary = null) {
  const cell = document.createElement('td');
  cell.textContent = text ?? '—';
  if (secondary) {
    const detail = document.createElement('span');
    detail.className = 'table-secondary';
    detail.textContent = secondary;
    cell.append(detail);
  }
  row.append(cell);
  return cell;
}

function openCustomer(organizationId) {
  const params = new URLSearchParams(window.location.search);
  params.set('organization', organizationId);
  window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
  route();
}

function renderPortfolio() {
  const rows = filteredPortfolio();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const first = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(first, first + PAGE_SIZE);

  customersBody.innerHTML = '';
  for (const organization of pageRows) {
    const row = document.createElement('tr');
    row.dataset.organizationId = organization.id;
    row.tabIndex = 0;
    row.setAttribute('aria-label', `Abrir Customer 360 de ${organization.name}`);

    const identityCell = document.createElement('td');
    const identity = document.createElement('div');
    identity.className = 'customer-identity';
    const avatar = document.createElement('span');
    avatar.className = 'customer-avatar';
    avatar.textContent = initials(organization.name);
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = organization.name;
    const condoNames = document.createElement('span');
    condoNames.className = 'table-secondary';
    condoNames.textContent = organization.condominiums
      .map((item) => item.condominium_name)
      .slice(0, 2)
      .join(' · ');
    copy.append(name, condoNames);
    identity.append(avatar, copy);
    identityCell.append(identity);
    row.append(identityCell);

    appendTextCell(
      row,
      String(organization.condominiums.length),
      organization.condominiums.length === 1 ? 'condominio' : 'condominios',
    );

    const accountCell = document.createElement('td');
    accountCell.append(accountBadge(organization.accountType));
    if (!organization.billable) {
      const note = document.createElement('span');
      note.className = 'table-secondary';
      note.textContent = 'No facturable';
      accountCell.append(note);
    }
    row.append(accountCell);

    appendTextCell(row, planLabel(organization));

    const status = statusSummary(organization);
    const statusCell = document.createElement('td');
    statusCell.append(badge(subscriptionLabel(status), subscriptionTone(status)));
    if (organization.statuses.length > 1) {
      const note = document.createElement('span');
      note.className = 'table-secondary';
      note.textContent = `${organization.statuses.length} estados en la organización`;
      statusCell.append(note);
    }
    row.append(statusCell);

    appendTextCell(row, contractedPriceLabel(organization));
    appendTextCell(row, trialOrPeriodLabel(organization));
    appendTextCell(row, String(organization.unitCount));

    const billingCell = document.createElement('td');
    billingCell.append(billingReadinessElement(organization));
    row.append(billingCell);

    const attentionCell = document.createElement('td');
    if (!organization.billable) {
      attentionCell.append(badge('No facturable', 'neutral'));
    } else if (!organization.attention.length) {
      attentionCell.append(badge('Sin alertas', 'success'));
    } else {
      attentionCell.append(badge(organization.attention[0].label, organization.attention[0].tone));
      if (organization.attention.length > 1) {
        const note = document.createElement('span');
        note.className = 'table-secondary';
        note.textContent = `+${organization.attention.length - 1} señal(es)`;
        attentionCell.append(note);
      }
    }
    row.append(attentionCell);

    const activate = () => openCustomer(organization.id);
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
    customersBody.append(row);
  }

  customersStatus.textContent = rows.length
    ? `Mostrando ${first + 1}–${Math.min(first + PAGE_SIZE, rows.length)} de ${rows.length} organización(es).`
    : 'No hay clientes que coincidan con los filtros actuales.';
  pageLabel.textContent = `Página ${currentPage} de ${totalPages}`;
  prevButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= totalPages;
  writeFiltersToUrl();
}

function handleFilterChange() {
  currentPage = 1;
  writeFiltersToUrl({ resetPage: true });
  renderPortfolio();
}

function showList() {
  detailView.hidden = true;
  listView.hidden = false;
  applyFiltersToControls();
  renderPortfolio();
}

function totalBy(data, key) {
  return data.condominiums.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function detailMonthlyTotal(data, field) {
  const billable = data.organization?.billable;
  if (!billable) return { amount: 0, currency: null };
  const currencies = uniqueValues(data.condominiums.map((row) => row.terms?.currency));
  if (currencies.length !== 1) return { amount: null, currency: null };
  const amount = data.condominiums.reduce(
    (total, row) => total + monthlyEquivalent(row[field], row.terms?.billing_period),
    0,
  );
  return { amount, currency: currencies[0] };
}

function detailBillingState(data) {
  if (!data.organization?.billable) return 'No aplica';
  const subscriptions = data.condominiums.filter((row) => row.subscription);
  if (!subscriptions.length) return 'Sin suscripción';
  if (subscriptions.some((row) => row.subscription.status === 'past_due')) return 'Pago vencido';
  if (subscriptions.some((row) => row.subscription.status === 'suspended')) return 'Suspendida';
  const allReady = subscriptions.every(
    (row) => row.billing_readiness?.consent_recorded && row.billing_readiness?.method_ready,
  );
  return allReady ? 'Método + consentimiento listos' : 'Configuración incompleta';
}

function detailAttention(data) {
  if (!data.organization?.billable) {
    return [{ label: 'Cuenta no facturable: las señales de revenue no aplican.', tone: 'neutral' }];
  }
  const items = [];
  for (const row of data.condominiums) {
    const attention = row.attention ?? {};
    if (attention.suspended)
      items.push({ label: `${row.name}: suscripción suspendida.`, tone: 'danger' });
    if (attention.past_due) items.push({ label: `${row.name}: pago vencido.`, tone: 'danger' });
    if (attention.missing_subscription)
      items.push({ label: `${row.name}: cliente sin suscripción.`, tone: 'warning' });
    if (attention.billing_setup_incomplete)
      items.push({ label: `${row.name}: billing incompleto.`, tone: 'warning' });
    if (attention.trial_ends_within_7_days)
      items.push({ label: `${row.name}: trial vence en 7 días o menos.`, tone: 'warning' });
  }
  return items.length
    ? items
    : [{ label: 'Sin alertas comerciales autoritativas.', tone: 'neutral' }];
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function renderDetailMeta(data) {
  const meta = document.querySelector('#customer-360-meta');
  meta.innerHTML = '';
  meta.append(accountBadge(data.organization.account_type));
  meta.append(
    badge(
      data.organization.billable ? 'Facturable' : 'No facturable',
      data.organization.billable ? 'success' : 'neutral',
    ),
  );
  meta.append(
    badge(
      `${data.condominiums.length} condominio${data.condominiums.length === 1 ? '' : 's'}`,
      'info',
    ),
  );
}

function renderDetailAttention(data) {
  const container = document.querySelector('#customer-360-attention');
  container.innerHTML = '';
  for (const item of detailAttention(data)) {
    const element = document.createElement('div');
    element.className = `attention-item${item.tone === 'warning' ? ' attention-item--warning' : ''}${item.tone === 'neutral' ? ' attention-item--neutral' : ''}`;
    element.textContent = item.label;
    container.append(element);
  }
}

function readinessLabel(row, billable) {
  if (!billable) return 'No aplica';
  if (!row.subscription) return 'Sin suscripción';
  const readiness = row.billing_readiness ?? {};
  if (readiness.consent_recorded && readiness.method_ready) {
    return readiness.auto_bill_enabled ? 'Auto-billing activo' : 'Método y consentimiento listos';
  }
  if (!readiness.consent_recorded && !readiness.method_ready)
    return 'Faltan consentimiento y método';
  if (!readiness.consent_recorded) return 'Falta consentimiento';
  return 'Falta método de pago';
}

function renderSubscriptions(data) {
  const body = document.querySelector('#customer-360-subscriptions');
  body.innerHTML = '';
  for (const row of data.condominiums) {
    const tr = document.createElement('tr');
    appendTextCell(tr, row.name);
    const status = row.subscription?.status ?? 'none';
    const statusCell = document.createElement('td');
    statusCell.append(badge(subscriptionLabel(status), subscriptionTone(status)));
    tr.append(statusCell);
    appendTextCell(tr, row.terms?.plan_name ?? row.terms?.plan_code ?? 'Sin plan');
    appendTextCell(
      tr,
      row.subscription?.status === 'trialing'
        ? `Trial hasta ${formatDate(row.subscription.trial_ends_at)}`
        : row.subscription?.current_period_end
          ? `Hasta ${formatDate(row.subscription.current_period_end)}`
          : '—',
    );
    appendTextCell(
      tr,
      row.terms
        ? `${formatMoney(row.terms.contracted_period_amount, row.terms.currency)}/${row.terms.billing_period === 'annual' ? 'año' : 'mes'}`
        : '—',
    );
    appendTextCell(
      tr,
      row.effective_period_amount === null || row.effective_period_amount === undefined
        ? '—'
        : formatMoney(row.effective_period_amount, row.terms?.currency),
    );
    appendTextCell(tr, readinessLabel(row, data.organization.billable));
    body.append(tr);
  }
}

function renderAdjustments(data) {
  const container = document.querySelector('#customer-360-adjustments');
  const adjustments = data.adjustment_history ?? [];
  container.innerHTML = '';
  if (!adjustments.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No hay ajustes comerciales registrados.';
    container.append(empty);
    return;
  }

  const tableScroll = document.createElement('div');
  tableScroll.className = 'table-scroll';
  const table = document.createElement('table');
  const head = document.createElement('thead');
  head.innerHTML =
    '<tr><th>Tipo</th><th>Origen</th><th>Referencia</th><th>Efectivo</th><th>Vigencia</th></tr>';
  const body = document.createElement('tbody');
  for (const adjustment of adjustments.slice(0, 20)) {
    const tr = document.createElement('tr');
    appendTextCell(tr, adjustment.kind ?? 'Ajuste');
    appendTextCell(tr, adjustment.source ?? '—');
    appendTextCell(tr, formatMoney(adjustment.reference_period_amount, adjustment.currency));
    appendTextCell(tr, formatMoney(adjustment.effective_period_amount, adjustment.currency));
    appendTextCell(
      tr,
      `${formatDate(adjustment.effective_from)} → ${formatDate(adjustment.effective_to)}`,
    );
    body.append(tr);
  }
  table.append(head, body);
  tableScroll.append(table);
  container.append(tableScroll);
}

function actorLabel(value) {
  if (!value) return 'Actor no registrado';
  const text = String(value);
  return `Actor ${text.slice(0, 8)}…`;
}

function historyItems(data) {
  const events = [];
  for (const item of data.commercial_history ?? []) {
    events.push({
      at: item.created_at,
      title: item.event_type ?? 'Evento de suscripción',
      detail: [
        item.from_status && item.to_status ? `${item.from_status} → ${item.to_status}` : null,
        item.from_plan && item.to_plan ? `${item.from_plan} → ${item.to_plan}` : null,
        item.reason,
        actorLabel(item.actor_user_id),
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }
  for (const item of data.terms_history ?? []) {
    events.push({
      at: item.created_at,
      title: `Términos ${item.plan_code ?? ''}`.trim(),
      detail: `${item.billing_period ?? 'período'} · ${formatMoney(item.contracted_period_amount, item.currency)} · ${actorLabel(item.authorized_by)}`,
    });
  }
  for (const item of data.adjustment_history ?? []) {
    events.push({
      at: item.created_at,
      title: `Ajuste ${item.kind ?? 'comercial'}`,
      detail: `${item.source ?? 'origen registrado'} · ${formatMoney(item.effective_period_amount, item.currency)} · ${actorLabel(item.authorized_by)}`,
    });
  }
  return events
    .filter((item) => item.at)
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 24);
}

function renderHistory(data) {
  const container = document.querySelector('#customer-360-history');
  container.innerHTML = '';
  const items = historyItems(data);
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No hay actividad comercial registrada todavía.';
    container.append(empty);
    return;
  }
  for (const item of items) {
    const wrapper = document.createElement('article');
    wrapper.className = 'history-item';
    const dot = document.createElement('span');
    dot.className = 'history-dot';
    const content = document.createElement('div');
    content.className = 'history-content';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const detail = document.createElement('span');
    detail.textContent = `${formatDate(item.at)} · ${item.detail}`;
    content.append(title, detail);
    wrapper.append(dot, content);
    container.append(wrapper);
  }
}

function renderCondominiumList(data) {
  const container = document.querySelector('#customer-360-condo-list');
  container.innerHTML = '';
  for (const row of data.condominiums) {
    const item = document.createElement('div');
    item.style.padding = '10px 0';
    item.style.borderBottom = '1px solid var(--habitta-border)';
    const name = document.createElement('strong');
    name.style.display = 'block';
    name.style.fontSize = '.77rem';
    name.textContent = row.name;
    const detail = document.createElement('span');
    detail.className = 'table-secondary';
    detail.textContent = `${row.active_unit_count ?? 0} unidades activas · ${row.membership_count ?? 0} membresías`;
    item.append(name, detail);
    container.append(item);
  }
}

function renderCustomer360(data) {
  const plans = uniqueValues(
    data.condominiums.map((row) => row.terms?.plan_name ?? row.terms?.plan_code),
  );
  const statuses = uniqueValues(data.condominiums.map((row) => row.subscription?.status));
  const effective = detailMonthlyTotal(data, 'effective_period_amount');

  setText('#customer-360-name', data.organization.name);
  setText(
    '#customer-360-subtitle',
    `${data.condominiums.length} condominio${data.condominiums.length === 1 ? '' : 's'} · Contexto comercial y operativo seguro`,
  );
  setText(
    '#customer-360-plan',
    plans.length === 1 ? plans[0] : plans.length ? 'Múltiples planes' : 'Sin plan',
  );
  setText(
    '#customer-360-status',
    statuses.length === 1
      ? subscriptionLabel(statuses[0])
      : statuses.length
        ? 'Estados mixtos'
        : 'Sin suscripción',
  );
  setText(
    '#customer-360-price',
    !data.organization.billable
      ? 'No facturable'
      : effective.amount === null
        ? 'Monedas mixtas'
        : effective.currency
          ? `${formatMoney(effective.amount, effective.currency)}/mes`
          : '—',
  );
  setText('#customer-360-billing', detailBillingState(data));
  setText('#customer-360-condominiums', String(data.condominiums.length));
  setText('#customer-360-units', String(totalBy(data, 'active_unit_count')));
  setText('#customer-360-memberships', String(totalBy(data, 'membership_count')));

  renderDetailMeta(data);
  renderDetailAttention(data);
  renderSubscriptions(data);
  renderAdjustments(data);
  renderHistory(data);
  renderCondominiumList(data);
}

async function loadDetail(organizationId) {
  const requestId = ++detailRequest;
  const session = sessionOrRedirect();
  if (!session) return;
  detailContent.hidden = true;
  detailStatus.hidden = false;
  detailStatus.textContent = 'Cargando Customer 360…';

  try {
    const data = await rpc('get_platform_customer_360', session.access_token, {
      target_organization: organizationId,
    });
    if (requestId !== detailRequest) return;
    renderCustomer360(data);
    detailContent.hidden = false;
    detailStatus.hidden = true;
  } catch (error) {
    if (requestId !== detailRequest) return;
    if (error instanceof Error && error.message === 'unauthorized') {
      clearSession();
      window.location.replace('/');
      return;
    }
    detailStatus.textContent =
      error instanceof Error ? error.message : 'No se pudo cargar Customer 360.';
  }
}

function showDetail(organizationId) {
  listView.hidden = true;
  detailView.hidden = false;
  loadDetail(organizationId);
}

function route() {
  const params = new URLSearchParams(window.location.search);
  const organizationId = params.get('organization');
  if (organizationId) showDetail(organizationId);
  else showList();
}

function goBackToPortfolio() {
  const params = new URLSearchParams(window.location.search);
  params.delete('organization');
  window.history.pushState(
    {},
    '',
    `${window.location.pathname}?${params.toString()}`.replace(/\?$/, ''),
  );
  route();
}

async function bootstrap() {
  const session = sessionOrRedirect();
  if (!session) return;
  try {
    await ensurePlatformAdmin(session.access_token);
    const [operationsRows, commercialRows] = await Promise.all([
      rpc('get_platform_operations_overview', session.access_token),
      rpc('get_platform_commercial_overview', session.access_token),
    ]);
    portfolio = mergePortfolioRows(operationsRows, commercialRows);
    renderMetrics();
    applyFiltersToControls();
    route();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'unauthorized' || error.message === 'forbidden')
    ) {
      clearSession();
      window.location.replace('/');
      return;
    }
    customersStatus.textContent =
      error instanceof Error ? error.message : 'No se pudo cargar el portafolio de clientes.';
  }
}

for (const control of [searchInput, accountFilter, subscriptionFilter, billingFilter, sortSelect]) {
  control.addEventListener(control === searchInput ? 'input' : 'change', handleFilterChange);
}

globalSearch.addEventListener('input', () => {
  searchInput.value = globalSearch.value;
  handleFilterChange();
});

prevButton.addEventListener('click', () => {
  if (currentPage <= 1) return;
  currentPage -= 1;
  renderPortfolio();
});

nextButton.addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(filteredPortfolio().length / PAGE_SIZE));
  if (currentPage >= totalPages) return;
  currentPage += 1;
  renderPortfolio();
});

backButton.addEventListener('click', goBackToPortfolio);
logoutButton.addEventListener('click', () => {
  clearSession();
  window.location.replace('/');
});
window.addEventListener('popstate', route);

bootstrap();
