// HAB-475 / HAB-430 Phase 4.
// This raw static surface uses only the Platform Admin session and hardened read RPCs.
// All revenue numbers are derived from authoritative SaaS commercial fields already returned by Postgres.
const config = window.HABITTA_ADMIN_CONFIG;
const SESSION_KEY = 'habitta-admin-session';
const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const title = document.querySelector('#ops-title');
const description = document.querySelector('#ops-description');
const globalSearch = document.querySelector('#ops-global-search');
const searchInput = document.querySelector('#ops-search');
const accountFilter = document.querySelector('#ops-account-filter');
const statusFilter = document.querySelector('#ops-status-filter');
const billingFilter = document.querySelector('#ops-billing-filter');
const sortSelect = document.querySelector('#ops-sort');
const body = document.querySelector('#ops-body');
const status = document.querySelector('#ops-status');
const prevButton = document.querySelector('#ops-prev');
const nextButton = document.querySelector('#ops-next');
const pageLabel = document.querySelector('#ops-page');
const logoutButton = document.querySelector('#ops-logout');
const upcoming = document.querySelector('#ops-upcoming');

const metricMrr = document.querySelector('#ops-mrr');
const metricArr = document.querySelector('#ops-arr');
const metricActive = document.querySelector('#ops-active');
const metricTrials = document.querySelector('#ops-trials');
const metricTrialsSoon = document.querySelector('#ops-trials-soon');
const metricBillingAttention = document.querySelector('#ops-billing-attention');
const trial7 = document.querySelector('#ops-trial-7');
const trial14 = document.querySelector('#ops-trial-14');
const trial30 = document.querySelector('#ops-trial-30');

let rows = [];
let currentPage = 1;

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

function redirectToLogin() {
  clearSession();
  window.location.replace('/');
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
    let message = 'No se pudo cargar la operación comercial de plataforma.';
    try {
      const payload = await response.json();
      message = payload.message ?? payload.error_description ?? payload.hint ?? message;
    } catch {
      // Preserve a safe generic error if the response is not JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

function rpc(name, accessToken) {
  return request(`/rest/v1/rpc/${name}`, accessToken, {
    method: 'POST',
    body: '{}',
  });
}

async function ensurePlatformAdmin(accessToken) {
  const admins = await request('/rest/v1/platform_admins?select=user_id', accessToken);
  if (!admins.length) throw new Error('forbidden');
}

function currentView() {
  const value = new URLSearchParams(window.location.search).get('view');
  return ['revenue', 'trials'].includes(value) ? value : 'subscriptions';
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatMoney(value, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

function monthlyEquivalent(value, period) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return period === 'annual' ? amount / 12 : amount;
}

function daysUntil(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.ceil((timestamp - Date.now()) / DAY_MS);
}

function isCustomer(row) {
  return row.account_type === 'customer';
}

function isCurrentTrial(row) {
  if (!isCustomer(row) || row.subscription_status !== 'trialing') return false;
  const days = daysUntil(row.trial_ends_at);
  return days !== null && days >= 0;
}

function isRevenueEligible(row) {
  return (
    isCustomer(row) &&
    row.commercial_status === 'confirmed' &&
    ['active', 'past_due'].includes(row.subscription_status)
  );
}

function billingState(row) {
  if (!isCustomer(row)) return 'not_applicable';
  if (!row.subscription_id) return 'attention';
  if (['cancelled'].includes(row.subscription_status)) return 'not_applicable';
  if (['past_due', 'suspended'].includes(row.subscription_status)) return 'attention';
  if (['active', 'trialing'].includes(row.subscription_status)) {
    return row.billing_consent_recorded && row.billing_method_ready ? 'ready' : 'attention';
  }
  return 'not_applicable';
}

function attentionFor(row) {
  if (!isCustomer(row)) return { key: 'nonbillable', label: 'No facturable', tone: 'neutral' };
  if (!row.subscription_id) return { key: 'missing', label: 'Sin suscripción', tone: 'warning' };
  if (row.subscription_status === 'suspended')
    return { key: 'suspended', label: 'Suspendida', tone: 'danger' };
  if (row.subscription_status === 'past_due')
    return { key: 'past_due', label: 'Pago vencido', tone: 'danger' };
  const trialDays = daysUntil(row.trial_ends_at);
  if (
    row.subscription_status === 'trialing' &&
    trialDays !== null &&
    trialDays >= 0 &&
    trialDays <= 7
  ) {
    return { key: 'trial', label: `Trial · ${trialDays} día(s)`, tone: 'warning' };
  }
  if (
    ['active', 'trialing'].includes(row.subscription_status) &&
    (!row.billing_consent_recorded || !row.billing_method_ready)
  ) {
    return { key: 'readiness', label: 'Billing incompleto', tone: 'warning' };
  }
  return { key: 'none', label: 'Sin alertas', tone: 'success' };
}

function mergeRows(operationsRows, commercialRows) {
  const commercialByCondominium = new Map(commercialRows.map((row) => [row.condominium_id, row]));

  // Identity remains bounded by the established operations RPC. Commercial data can enrich an
  // existing condominium row but never create a new cross-tenant browser-visible identity.
  return operationsRows.map((operation) => {
    const commercial = commercialByCondominium.get(operation.condominium_id) ?? {};
    return { ...operation, ...commercial };
  });
}

function aggregateRunRate(sourceRows, field, multiplier = 1) {
  const totals = new Map();
  for (const row of sourceRows) {
    if (!isRevenueEligible(row)) continue;
    const currency = row.currency || 'USD';
    const amount = monthlyEquivalent(row[field], row.billing_period) * multiplier;
    if (!Number.isFinite(amount)) continue;
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return totals;
}

function formatAggregate(totals) {
  if (!totals.size) return formatMoney(0, 'USD');
  if (totals.size !== 1) return 'Monedas mixtas';
  const [[currency, amount]] = totals;
  return formatMoney(amount, currency);
}

function trialBucket(row) {
  if (!isCurrentTrial(row)) return null;
  const days = daysUntil(row.trial_ends_at);
  if (days === null || days < 0 || days > 30) return null;
  if (days <= 7) return '7';
  if (days <= 14) return '14';
  return '30';
}

function renderMetrics() {
  const mrr = aggregateRunRate(rows, 'effective_period_amount');
  const arr = aggregateRunRate(rows, 'effective_period_amount', 12);
  metricMrr.textContent = formatAggregate(mrr);
  metricArr.textContent = formatAggregate(arr);
  metricActive.textContent = String(
    rows.filter((row) => isCustomer(row) && row.subscription_status === 'active').length,
  );
  metricTrials.textContent = String(rows.filter(isCurrentTrial).length);
  metricTrialsSoon.textContent = String(
    rows.filter((row) => trialBucket(row) === '7').length,
  );
  metricBillingAttention.textContent = String(
    rows.filter((row) => isCustomer(row) && billingState(row) === 'attention').length,
  );

  const buckets = { 7: 0, 14: 0, 30: 0 };
  for (const row of rows) {
    const bucket = trialBucket(row);
    if (bucket) buckets[bucket] += 1;
  }
  trial7.textContent = String(buckets[7]);
  trial14.textContent = String(buckets[14]);
  trial30.textContent = String(buckets[30]);
}

function renderViewChrome() {
  const view = currentView();
  const content = {
    subscriptions: {
      title: 'Suscripciones',
      description:
        'Estado SaaS, preparación de billing y atención comercial por condominio usando contratos autoritativos.',
    },
    revenue: {
      title: 'Revenue',
      description:
        'MRR y ARR run-rate con separación clara entre precio contratado, referencia de catálogo y monto efectivo.',
    },
    trials: {
      title: 'Trials',
      description:
        'Pruebas activas, vencimientos próximos y readiness necesario para continuar al ciclo de cobro.',
    },
  }[view];

  title.textContent = content.title;
  description.textContent = content.description;
  document.title = `${content.title} · Habitta Platform Admin`;

  for (const link of document.querySelectorAll('[data-view-link]')) {
    link.removeAttribute('aria-current');
    if (link.dataset.viewLink === view) link.setAttribute('aria-current', 'page');
  }
  for (const tab of document.querySelectorAll('[data-ops-tab]')) {
    tab.removeAttribute('aria-current');
    if (tab.dataset.opsTab === view) tab.setAttribute('aria-current', 'page');
  }

  if (view === 'trials') {
    statusFilter.value = 'trialing';
    statusFilter.disabled = true;
  } else {
    statusFilter.disabled = false;
  }
}

function searchValue(row) {
  return [
    row.organization_name,
    row.condominium_name,
    row.plan_name,
    row.plan_code,
    row.account_type,
    row.subscription_status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es');
}

function readFilters() {
  const params = new URLSearchParams(window.location.search);
  const view = currentView();
  const requestedSort = params.get('sort');
  const fallbackSort = view === 'revenue' ? 'effective' : view === 'trials' ? 'trial' : 'attention';
  return {
    query: params.get('q') ?? '',
    account: params.get('account') ?? '',
    status: params.get('status') ?? '',
    billing: params.get('billing') ?? '',
    sort: ['attention', 'name', 'effective', 'trial'].includes(requestedSort)
      ? requestedSort
      : fallbackSort,
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

function applyFiltersToControls() {
  const filters = readFilters();
  searchInput.value = filters.query;
  globalSearch.value = filters.query;
  accountFilter.value = filters.account;
  statusFilter.value = currentView() === 'trials' ? 'trialing' : filters.status;
  billingFilter.value = filters.billing;
  sortSelect.value = filters.sort;
  currentPage = filters.page;
  renderViewChrome();
}

function writeFilters({ resetPage = false } = {}) {
  const params = new URLSearchParams(window.location.search);
  const view = currentView();
  if (view === 'subscriptions') params.delete('view');
  else params.set('view', view);

  const values = {
    q: searchInput.value.trim(),
    account: accountFilter.value,
    status: view === 'trials' ? '' : statusFilter.value,
    billing: billingFilter.value,
    sort: sortSelect.value,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }

  if (resetPage) currentPage = 1;
  if (currentPage > 1) params.set('page', String(currentPage));
  else params.delete('page');
  window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`.replace(/\?$/, ''));
}

function filteredRows() {
  const view = currentView();
  const query = searchInput.value.trim().toLocaleLowerCase('es');
  const account = accountFilter.value;
  const subscription = statusFilter.value;
  const billing = billingFilter.value;

  const filtered = rows.filter((row) => {
    if (view === 'trials' && row.subscription_status !== 'trialing') return false;
    if (query && !searchValue(row).includes(query)) return false;
    if (account && row.account_type !== account) return false;
    if (subscription === 'none' && row.subscription_id) return false;
    if (subscription && subscription !== 'none' && row.subscription_status !== subscription)
      return false;
    if (billing && billingState(row) !== billing) return false;
    return true;
  });

  filtered.sort((left, right) => {
    const sort = sortSelect.value;
    if (sort === 'attention') {
      const score = (row) => {
        const item = attentionFor(row);
        return item.tone === 'danger' ? 3 : item.tone === 'warning' ? 2 : item.tone === 'success' ? 0 : -1;
      };
      const difference = score(right) - score(left);
      if (difference) return difference;
    }
    if (sort === 'effective') {
      const difference =
        monthlyEquivalent(right.effective_period_amount, right.billing_period) -
        monthlyEquivalent(left.effective_period_amount, left.billing_period);
      if (difference) return difference;
    }
    if (sort === 'trial') {
      const leftDays = daysUntil(left.trial_ends_at);
      const rightDays = daysUntil(right.trial_ends_at);
      const safeLeft = leftDays === null || leftDays < 0 ? Number.POSITIVE_INFINITY : leftDays;
      const safeRight = rightDays === null || rightDays < 0 ? Number.POSITIVE_INFINITY : rightDays;
      if (safeLeft !== safeRight) return safeLeft - safeRight;
    }
    return String(left.organization_name ?? '').localeCompare(String(right.organization_name ?? ''), 'es');
  });

  return filtered;
}

function badge(text, tone = 'neutral') {
  const span = document.createElement('span');
  span.className = `status-badge status-badge--${tone}`;
  span.textContent = text;
  return span;
}

function accountLabel(value) {
  return { customer: 'Cliente', demo: 'Demo', internal: 'Interno' }[value] ?? value ?? '—';
}

function accountBadge(value) {
  const tone = value === 'customer' ? 'customer' : value === 'demo' ? 'demo' : 'neutral';
  return badge(accountLabel(value), tone);
}

function subscriptionLabel(value) {
  return (
    {
      trialing: 'Prueba',
      active: 'Activa',
      past_due: 'Pago vencido',
      suspended: 'Suspendida',
      cancelled: 'Cancelada',
    }[value] ?? 'Sin suscripción'
  );
}

function subscriptionTone(value) {
  if (value === 'active') return 'success';
  if (value === 'trialing') return 'info';
  if (value === 'past_due') return 'warning';
  if (value === 'suspended' || value === 'cancelled') return 'danger';
  return 'neutral';
}

function appendTextCell(tr, value, secondary = null, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = value ?? '—';
  if (secondary) {
    const small = document.createElement('span');
    small.className = 'table-secondary';
    small.textContent = secondary;
    td.append(small);
  }
  tr.append(td);
  return td;
}

function monthlyPrice(row, field) {
  if (!isCustomer(row) && field === 'effective_period_amount') return 'No facturable';
  const raw = row[field];
  if (raw === null || raw === undefined || raw === '') return '—';
  return `${formatMoney(monthlyEquivalent(raw, row.billing_period), row.currency)}/mes`;
}

function priceCell(tr, row, field) {
  const td = document.createElement('td');
  td.className = 'ops-price';
  const strong = document.createElement('strong');
  strong.textContent = monthlyPrice(row, field);
  td.append(strong);
  if (row.billing_period && row[field] !== null && row[field] !== undefined) {
    const small = document.createElement('small');
    small.textContent = row.billing_period === 'annual' ? 'término anual normalizado' : 'término mensual';
    td.append(small);
  }
  tr.append(td);
}

function readinessElement(value, positive, negative, notApplicable = false) {
  const span = document.createElement('span');
  if (notApplicable) {
    span.className = 'ops-readiness ops-readiness--neutral';
    span.textContent = 'No aplica';
  } else if (value) {
    span.className = 'ops-readiness ops-readiness--ready';
    span.textContent = positive;
  } else {
    span.className = 'ops-readiness ops-readiness--warning';
    span.textContent = negative;
  }
  return span;
}

function trialOrPeriod(row) {
  if (row.subscription_status === 'trialing') {
    const days = daysUntil(row.trial_ends_at);
    const suffix = days !== null && days >= 0 ? ` · ${days} día(s)` : '';
    return `Trial hasta ${formatDate(row.trial_ends_at)}${suffix}`;
  }
  if (row.current_period_end) return `Período hasta ${formatDate(row.current_period_end)}`;
  return '—';
}

function renderTable() {
  const filtered = filteredRows();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const first = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(first, first + PAGE_SIZE);
  body.innerHTML = '';

  for (const row of pageRows) {
    const tr = document.createElement('tr');
    const attention = attentionFor(row);
    tr.dataset.billable = String(isCustomer(row));
    tr.dataset.attention = String(['danger', 'warning'].includes(attention.tone));

    const identityCell = document.createElement('td');
    const identity = document.createElement('div');
    identity.className = 'ops-identity';
    const organization = document.createElement('strong');
    organization.textContent = row.organization_name ?? '—';
    const condominium = document.createElement('span');
    condominium.textContent = row.condominium_name ?? '—';
    identity.append(organization, condominium);
    identityCell.append(identity);
    tr.append(identityCell);

    const accountCell = document.createElement('td');
    accountCell.append(accountBadge(row.account_type));
    if (!isCustomer(row)) {
      const note = document.createElement('span');
      note.className = 'table-secondary';
      note.textContent = 'No facturable';
      accountCell.append(note);
    }
    tr.append(accountCell);

    appendTextCell(tr, row.plan_name ?? row.plan_code ?? 'Sin plan');

    const subscriptionCell = document.createElement('td');
    subscriptionCell.append(badge(subscriptionLabel(row.subscription_status), subscriptionTone(row.subscription_status)));
    tr.append(subscriptionCell);

    priceCell(tr, row, 'contracted_period_amount');
    priceCell(tr, row, 'catalog_reference_amount');
    priceCell(tr, row, 'effective_period_amount');
    appendTextCell(tr, trialOrPeriod(row));

    const notApplicable = !isCustomer(row) || !['active', 'trialing', 'past_due', 'suspended'].includes(row.subscription_status);
    const methodCell = document.createElement('td');
    methodCell.append(
      readinessElement(row.billing_method_ready, 'Listo', 'Falta método', notApplicable),
    );
    tr.append(methodCell);

    const consentCell = document.createElement('td');
    consentCell.append(
      readinessElement(row.billing_consent_recorded, 'Registrado', 'Falta consentimiento', notApplicable),
    );
    tr.append(consentCell);

    const autoCell = document.createElement('td');
    autoCell.append(
      readinessElement(row.auto_bill_enabled, 'Activo', 'Desactivado', notApplicable),
    );
    tr.append(autoCell);

    const attentionCell = document.createElement('td');
    attentionCell.append(badge(attention.label, attention.tone));
    tr.append(attentionCell);

    const actionCell = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'ops-row-action';
    link.href = `/customers.html?organization=${encodeURIComponent(row.organization_id)}`;
    link.textContent = 'Ver cliente';
    link.setAttribute('aria-label', `Abrir Customer 360 de ${row.organization_name}`);
    actionCell.append(link);
    tr.append(actionCell);

    body.append(tr);
  }

  status.textContent = filtered.length
    ? `Mostrando ${first + 1}–${Math.min(first + PAGE_SIZE, filtered.length)} de ${filtered.length} registro(s).`
    : 'No hay registros que coincidan con la vista y los filtros actuales.';
  pageLabel.textContent = `Página ${currentPage} de ${totalPages}`;
  prevButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= totalPages;
  writeFilters();
}

function renderUpcomingTrials() {
  upcoming.innerHTML = '';
  const trials = rows
    .filter((row) => {
      const days = daysUntil(row.trial_ends_at);
      return isCurrentTrial(row) && days !== null && days <= 30;
    })
    .sort((left, right) => daysUntil(left.trial_ends_at) - daysUntil(right.trial_ends_at))
    .slice(0, 6);

  if (!trials.length) {
    const empty = document.createElement('div');
    empty.className = 'ops-empty';
    empty.textContent = 'No hay trials customer que venzan en los próximos 30 días.';
    upcoming.append(empty);
    return;
  }

  for (const row of trials) {
    const item = document.createElement('article');
    item.className = 'upcoming-item';
    const header = document.createElement('div');
    header.className = 'upcoming-item-header';
    const name = document.createElement('strong');
    name.textContent = row.organization_name;
    const time = document.createElement('time');
    const days = daysUntil(row.trial_ends_at);
    time.textContent = `${days} día(s)`;
    time.dateTime = row.trial_ends_at;
    header.append(name, time);
    const detail = document.createElement('span');
    detail.textContent = `${row.condominium_name} · ${row.plan_name ?? row.plan_code ?? 'Sin plan'} · vence ${formatDate(row.trial_ends_at)}`;
    const link = document.createElement('a');
    link.href = `/customers.html?organization=${encodeURIComponent(row.organization_id)}`;
    link.textContent = 'Ver cliente →';
    item.append(header, detail, link);
    upcoming.append(item);
  }
}

function renderAll() {
  renderViewChrome();
  renderMetrics();
  renderUpcomingTrials();
  renderTable();
}

function handleFilterChange() {
  currentPage = 1;
  writeFilters({ resetPage: true });
  renderTable();
}

function bindEvents() {
  searchInput.addEventListener('input', () => {
    globalSearch.value = searchInput.value;
    handleFilterChange();
  });
  globalSearch.addEventListener('input', () => {
    searchInput.value = globalSearch.value;
    handleFilterChange();
  });
  accountFilter.addEventListener('change', handleFilterChange);
  statusFilter.addEventListener('change', handleFilterChange);
  billingFilter.addEventListener('change', handleFilterChange);
  sortSelect.addEventListener('change', handleFilterChange);

  prevButton.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    renderTable();
  });
  nextButton.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(filteredRows().length / PAGE_SIZE));
    if (currentPage >= totalPages) return;
    currentPage += 1;
    renderTable();
  });

  logoutButton.addEventListener('click', redirectToLogin);
}

async function bootstrap() {
  const session = getSession();
  if (!session?.access_token) {
    window.location.replace('/');
    return;
  }

  applyFiltersToControls();
  bindEvents();
  status.textContent = 'Cargando suscripciones y revenue…';

  try {
    await ensurePlatformAdmin(session.access_token);
    const [operationsRows, commercialRows] = await Promise.all([
      rpc('get_platform_operations_overview', session.access_token),
      rpc('get_platform_commercial_overview', session.access_token),
    ]);
    rows = mergeRows(operationsRows, commercialRows);
    renderAll();
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      redirectToLogin();
      return;
    }
    if (error instanceof Error && error.message === 'forbidden') {
      status.textContent = 'La sesión actual no tiene autorización de Platform Admin.';
      return;
    }
    status.textContent = error instanceof Error ? error.message : 'No se pudo cargar esta vista.';
  }
}

void bootstrap();
