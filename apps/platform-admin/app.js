// No bundler, no dependencies: this surface is deployed as raw static files (see
// .github/workflows/static-sites-release.yml), so it talks to Supabase's REST/Auth HTTP API
// directly with fetch(). Every real permission is enforced in Postgres; this browser surface has
// no service-role credential.
const config = window.HABITTA_ADMIN_CONFIG;
const SESSION_KEY = 'habitta-admin-session';

const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const logoutButton = document.querySelector('#logout-button');
const overviewBody = document.querySelector('#overview-body');
const overviewStatus = document.querySelector('#overview-status');
const searchInput = document.querySelector('#search-input');
const accountFilter = document.querySelector('#account-filter');
const statusFilter = document.querySelector('#status-filter');
const topbar = document.querySelector('.topbar');

const metricOrganizations = document.querySelector('#metric-organizations');
const metricCustomers = document.querySelector('#metric-customers');
const metricCondominiums = document.querySelector('#metric-condominiums');
const metricUnits = document.querySelector('#metric-units');
const metricTrials = document.querySelector('#metric-trials');
const metricMrr = document.querySelector('#metric-mrr');
const metricTrialsSoon = document.querySelector('#metric-trials-soon');
const metricNoSubscription = document.querySelector('#metric-no-subscription');

let overviewRows = [];
let commercialLink = null;

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function showCommercialLink() {
  if (commercialLink || !topbar) return;
  commercialLink = document.createElement('a');
  commercialLink.href = '/commercial.html';
  commercialLink.className = 'secondary-button';
  commercialLink.textContent = 'Comercial';
  commercialLink.style.display = 'inline-flex';
  commercialLink.style.alignItems = 'center';
  commercialLink.style.textDecoration = 'none';
  const badgeElement = topbar.querySelector('.badge');
  if (badgeElement) badgeElement.before(commercialLink);
  else topbar.append(commercialLink);
}

function hideCommercialLink() {
  commercialLink?.remove();
  commercialLink = null;
}

async function signIn(email, password) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error_description ?? data.msg ?? 'No se pudo iniciar sesión.');
  return data;
}

async function fetchIsPlatformAdmin(accessToken) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/platform_admins?select=user_id`, {
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('unauthorized');
    throw new Error('No se pudo verificar el acceso.');
  }
  const rows = await response.json();
  return rows.length > 0;
}

async function fetchOverview(accessToken) {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/rpc/get_platform_operations_overview`,
    {
      method: 'POST',
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  if (!response.ok) {
    if (response.status === 401) throw new Error('unauthorized');
    throw new Error('No se pudo cargar el estado operativo de la plataforma.');
  }
  return response.json();
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function accountLabel(value) {
  return { customer: 'Cliente', demo: 'Demo', internal: 'Interno' }[value] ?? value ?? '—';
}

function statusLabel(value) {
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

function badge(text, tone) {
  const span = document.createElement('span');
  span.className = `status-badge status-badge--${tone}`;
  span.textContent = text;
  return span;
}

function accountBadge(value) {
  const tone = value === 'customer' ? 'customer' : value === 'demo' ? 'demo' : 'neutral';
  return badge(accountLabel(value), tone);
}

function subscriptionBadge(value) {
  const tone =
    value === 'active'
      ? 'success'
      : value === 'trialing'
        ? 'info'
        : value === 'past_due'
          ? 'warning'
          : value === 'suspended' || value === 'cancelled'
            ? 'danger'
            : 'neutral';
  return badge(statusLabel(value), tone);
}

function monthlyEquivalent(row, field) {
  const amount = Number(row[field]);
  if (!Number.isFinite(amount)) return 0;
  return row.billing_period === 'annual' ? amount / 12 : amount;
}

function contractedMrr(rows) {
  return rows.reduce((total, row) => {
    if (row.account_type !== 'customer') return total;
    if (row.commercial_status !== 'confirmed') return total;
    if (!['active', 'past_due'].includes(row.subscription_status)) return total;
    return total + monthlyEquivalent(row, 'contracted_period_amount');
  }, 0);
}

function trialEndsSoon(row) {
  if (row.subscription_status !== 'trialing' || !row.trial_ends_at) return false;
  const remaining = new Date(row.trial_ends_at).getTime() - Date.now();
  return remaining >= 0 && remaining <= 7 * 24 * 60 * 60 * 1000;
}

function renderMetrics(rows) {
  const organizations = new Map();
  for (const row of rows) {
    organizations.set(row.organization_id, row.account_type);
  }
  const customerOrganizations = [...organizations.values()].filter(
    (accountType) => accountType === 'customer',
  ).length;

  metricOrganizations.textContent = String(organizations.size);
  metricCustomers.textContent = String(customerOrganizations);
  metricCondominiums.textContent = String(rows.length);
  metricUnits.textContent = String(
    rows.reduce((total, row) => total + Number(row.active_unit_count ?? 0), 0),
  );
  metricTrials.textContent = String(
    rows.filter((row) => row.subscription_status === 'trialing').length,
  );
  metricMrr.textContent = formatMoney(contractedMrr(rows), 'USD');
  metricTrialsSoon.textContent = String(rows.filter(trialEndsSoon).length);
  metricNoSubscription.textContent = String(rows.filter((row) => !row.subscription_id).length);
}

function normalizedSearchValue(row) {
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

function filteredRows() {
  const query = searchInput.value.trim().toLocaleLowerCase('es');
  const accountType = accountFilter.value;
  const subscriptionStatus = statusFilter.value;

  return overviewRows.filter((row) => {
    if (query && !normalizedSearchValue(row).includes(query)) return false;
    if (accountType && row.account_type !== accountType) return false;
    if (subscriptionStatus === 'none' && row.subscription_id) return false;
    if (
      subscriptionStatus &&
      subscriptionStatus !== 'none' &&
      row.subscription_status !== subscriptionStatus
    )
      return false;
    return true;
  });
}

function appendTextCell(tr, value, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = value ?? '—';
  tr.append(td);
  return td;
}

function renderPrice(row) {
  if (!row.subscription_id || row.contracted_period_amount === null) return '—';
  const period = row.billing_period === 'annual' ? '/año' : '/mes';
  const contracted = formatMoney(row.contracted_period_amount, row.currency);
  const reference = formatMoney(row.catalog_reference_amount, row.currency);
  if (
    row.catalog_reference_amount !== null &&
    Number(row.catalog_reference_amount) !== Number(row.contracted_period_amount)
  ) {
    return `${reference} → ${contracted}${period}`;
  }
  return `${contracted}${period}`;
}

function renderTrialOrPeriod(row) {
  if (row.subscription_status === 'trialing') return `Hasta ${formatDate(row.trial_ends_at)}`;
  if (row.current_period_end) return `Período hasta ${formatDate(row.current_period_end)}`;
  return '—';
}

function renderTable(rows) {
  overviewBody.innerHTML = '';
  if (!rows.length) {
    overviewStatus.textContent = overviewRows.length
      ? 'No hay resultados con los filtros actuales.'
      : 'No hay condominios registrados todavía.';
    return;
  }

  overviewStatus.textContent = `${rows.length} de ${overviewRows.length} condominio(s).`;
  for (const row of rows) {
    const tr = document.createElement('tr');

    const identityCell = document.createElement('td');
    const organization = document.createElement('strong');
    organization.textContent = row.organization_name;
    const condominium = document.createElement('span');
    condominium.className = 'table-secondary';
    condominium.textContent = row.condominium_name;
    identityCell.append(organization, condominium);
    tr.append(identityCell);

    const accountCell = document.createElement('td');
    accountCell.append(accountBadge(row.account_type));
    tr.append(accountCell);

    const structureCell = document.createElement('td');
    structureCell.textContent = `${row.active_unit_count} unidades`;
    const structureSecondary = document.createElement('span');
    structureSecondary.className = 'table-secondary';
    structureSecondary.textContent = `${row.building_count} edificio(s) · ${row.membership_count} miembro(s)`;
    structureCell.append(structureSecondary);
    tr.append(structureCell);

    const planCell = document.createElement('td');
    planCell.textContent = row.plan_name ?? 'Sin plan';
    if (row.commercial_status && row.commercial_status !== 'confirmed') {
      const commercial = document.createElement('span');
      commercial.className = 'table-secondary';
      commercial.textContent = 'Comercial sin confirmar';
      planCell.append(commercial);
    }
    tr.append(planCell);

    const statusCell = document.createElement('td');
    statusCell.append(subscriptionBadge(row.subscription_status));
    tr.append(statusCell);

    appendTextCell(tr, renderTrialOrPeriod(row));
    appendTextCell(tr, renderPrice(row), 'price-cell');
    appendTextCell(tr, formatDate(row.created_at));

    overviewBody.append(tr);
  }
}

function renderOverview(rows) {
  overviewRows = rows;
  renderMetrics(rows);
  renderTable(filteredRows());
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  showCommercialLink();
}

function showLogin(message) {
  clearSession();
  overviewRows = [];
  hideCommercialLink();
  loginView.hidden = false;
  dashboardView.hidden = true;
  loginError.textContent = message ?? '';
}

async function loadDashboard(session) {
  overviewStatus.textContent = 'Cargando estado de plataforma...';
  try {
    const isPlatformAdmin = await fetchIsPlatformAdmin(session.access_token);
    if (!isPlatformAdmin) {
      overviewBody.innerHTML = '';
      overviewStatus.textContent =
        'Tu cuenta inició sesión correctamente, pero no tiene el rol de administrador de plataforma.';
      hideCommercialLink();
      return;
    }
    const rows = await fetchOverview(session.access_token);
    renderOverview(rows);
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      showLogin('Tu sesión expiró. Inicia sesión de nuevo.');
      return;
    }
    overviewStatus.textContent =
      error instanceof Error ? error.message : 'No se pudo cargar el resumen.';
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const formData = new FormData(loginForm);
  try {
    const session = await signIn(String(formData.get('email')), String(formData.get('password')));
    setSession(session);
    showDashboard();
    await loadDashboard(session);
  } catch (error) {
    loginError.textContent = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
  }
});

logoutButton.addEventListener('click', () => {
  showLogin('');
});

for (const filter of [searchInput, accountFilter, statusFilter]) {
  filter.addEventListener('input', () => renderTable(filteredRows()));
  filter.addEventListener('change', () => renderTable(filteredRows()));
}

const existingSession = getSession();
if (existingSession) {
  showDashboard();
  void loadDashboard(existingSession);
} else {
  showLogin('');
}
