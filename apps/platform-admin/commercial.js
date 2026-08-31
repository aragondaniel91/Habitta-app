const config = window.HABITTA_ADMIN_CONFIG;
const SESSION_KEY = 'habitta-admin-session';

const customerBody = document.querySelector('#customer-body');
const customerStatus = document.querySelector('#customer-status');
const offerList = document.querySelector('#offer-list');
const offerStatus = document.querySelector('#offer-status');
const offerForm = document.querySelector('#offer-form');
const refreshButton = document.querySelector('#refresh-button');
const logoutButton = document.querySelector('#logout-button');
const metricCustomers = document.querySelector('#metric-customers');
const metricTrials = document.querySelector('#metric-trials');
const metricActive = document.querySelector('#metric-active');
const metricOffers = document.querySelector('#metric-offers');
const dialog = document.querySelector('#action-dialog');
const dialogTitle = document.querySelector('#dialog-title');
const dialogCopy = document.querySelector('#dialog-copy');
const dialogNotice = document.querySelector('#dialog-notice');
const dialogFields = document.querySelector('#dialog-fields');
const dialogCancel = document.querySelector('#dialog-cancel');
const dialogSubmit = document.querySelector('#dialog-submit');
const actionForm = document.querySelector('#action-form');

let rows = [];
let offers = [];
let plans = [];
let currentAction = null;

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

function requireSession() {
  const session = getSession();
  if (!session?.access_token) {
    window.location.replace('/');
    throw new Error('missing_session');
  }
  return session;
}

async function request(path, { method = 'GET', body } = {}) {
  const session = requireSession();
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 401) {
    clearSession();
    window.location.replace('/');
    throw new Error('unauthorized');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error_description ?? `Solicitud rechazada (${response.status}).`);
  }
  return payload;
}

const rpc = (name, body = {}) => request(`/rest/v1/rpc/${name}`, { method: 'POST', body });

async function verifyPlatformAdmin() {
  const result = await request('/rest/v1/platform_admins?select=user_id&limit=1');
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error('Esta cuenta no tiene acceso de Platform Admin.');
  }
}

async function loadData() {
  setStatus(customerStatus, 'Cargando estado comercial…');
  setStatus(offerStatus, 'Cargando ofertas…');
  try {
    const [overview, offerRows, planRows] = await Promise.all([
      rpc('get_platform_commercial_overview'),
      rpc('platform_list_commercial_offers'),
      request('/rest/v1/plans?select=code,name,catalog_monthly_usd,catalog_annual_usd&is_public=eq.true&order=sort_order'),
    ]);
    rows = Array.isArray(overview) ? overview : [];
    offers = Array.isArray(offerRows) ? offerRows : [];
    plans = Array.isArray(planRows) ? planRows : [];
    render();
    setStatus(customerStatus, `${rows.length} condominio(s) en el overview comercial.`, 'success');
    setStatus(offerStatus, `${offers.length} oferta(s) definida(s).`, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el estado comercial.';
    setStatus(customerStatus, message, 'error');
    setStatus(offerStatus, message, 'error');
  }
}

function setStatus(element, message, tone = '') {
  element.textContent = message;
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-VE', {
    year: 'numeric', month: 'short', day: '2-digit',
  });
}

function inputDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function badge(text, tone = 'neutral') {
  const span = document.createElement('span');
  span.className = `badge badge--${tone}`;
  span.textContent = text;
  return span;
}

function accountBadge(accountType) {
  if (accountType === 'customer') return badge('Cliente', 'green');
  if (accountType === 'demo') return badge('Demo · no facturable', 'purple');
  return badge('Interno · no facturable', 'neutral');
}

function statusBadge(status) {
  const labels = {
    trialing: ['Trial', 'blue'], active: ['Activa', 'green'], past_due: ['Vencida', 'amber'],
    suspended: ['Suspendida', 'red'], cancelled: ['Cancelada', 'red'],
  };
  const [label, tone] = labels[status] ?? ['Sin suscripción', 'neutral'];
  return badge(label, tone);
}

function adjustmentLabel(row) {
  if (row.subscription_status === 'trialing' && row.trial_ends_at) {
    return `30 días gratis · hasta ${formatDate(row.trial_ends_at)}`;
  }
  if (row.adjustment_source === 'gift') return `Regalado · hasta ${formatDate(row.adjustment_effective_to)}`;
  if (row.adjustment_source === 'coupon') return `Cupón · hasta ${formatDate(row.adjustment_effective_to)}`;
  return '—';
}

function renderMetrics() {
  const customers = rows.filter((row) => row.account_type === 'customer');
  metricCustomers.textContent = String(customers.length);
  metricTrials.textContent = String(customers.filter((row) => row.subscription_status === 'trialing').length);
  metricActive.textContent = String(customers.filter((row) => row.subscription_status === 'active').length);
  metricOffers.textContent = String(offers.filter((offer) => offer.active).length);
}

function priceLabel(row) {
  if (!row.subscription_id) return '—';
  const period = row.billing_period === 'annual' ? '/año' : '/mes';
  const contract = formatMoney(row.contracted_period_amount, row.currency);
  const effective = formatMoney(row.effective_period_amount, row.currency);
  if (row.effective_period_amount !== null && Number(row.effective_period_amount) !== Number(row.contracted_period_amount)) {
    return `${contract} → ${effective}${period}`;
  }
  return `${contract}${period}`;
}

function makeMini(label, action, row, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', () => openAction(action, row));
  return button;
}

function renderCustomers() {
  customerBody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'No hay condominios todavía.';
    tr.append(td);
    customerBody.append(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    const identity = document.createElement('td');
    const org = document.createElement('strong');
    org.textContent = row.organization_name;
    const condo = document.createElement('span');
    condo.className = 'secondary';
    condo.textContent = row.condominium_name;
    const account = document.createElement('span');
    account.className = 'secondary';
    account.append(accountBadge(row.account_type));
    identity.append(org, condo, account);
    tr.append(identity);

    appendCell(tr, String(row.active_unit_count ?? 0));
    appendCell(tr, row.plan_name ?? 'Sin plan');
    const status = document.createElement('td'); status.append(statusBadge(row.subscription_status)); tr.append(status);
    appendCell(tr, priceLabel(row));
    appendCell(tr, adjustmentLabel(row));

    const actions = document.createElement('td');
    actions.className = 'actions';
    if (row.account_type !== 'customer') {
      actions.append(badge('Fuera de billing', 'neutral'));
    } else if (!row.subscription_id) {
      actions.append(makeMini('Iniciar 30 días', 'trial', row));
    } else {
      if (row.subscription_status !== 'cancelled') actions.append(makeMini('Aplicar cupón', 'coupon', row, activeOffers().length === 0));
      if (['active', 'past_due'].includes(row.subscription_status)) actions.append(makeMini('Regalar meses', 'gift', row));
      if (['trialing', 'suspended', 'past_due'].includes(row.subscription_status)) actions.append(makeMini('Activar manual', 'activate', row));
    }
    tr.append(actions);
    customerBody.append(tr);
  }
}

function appendCell(tr, text) {
  const td = document.createElement('td');
  td.textContent = text;
  tr.append(td);
}

function offerDescription(offer) {
  const value = offer.kind === 'percentage'
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
    if (offer.max_redemptions !== null && Number(offer.redemption_count) >= Number(offer.max_redemptions)) return false;
    return true;
  });
}

function renderOffers() {
  offerList.innerHTML = '';
  if (!offers.length) {
    const p = document.createElement('p');
    p.textContent = 'Todavía no hay ofertas. Crea solo las que necesites para una venta o piloto real.';
    offerList.append(p);
    return;
  }
  for (const offer of offers) {
    const article = document.createElement('article');
    article.className = 'offer';
    const head = document.createElement('div'); head.className = 'offer-head';
    const code = document.createElement('strong'); code.textContent = offer.code;
    head.append(code, badge(offer.active ? 'Activa' : 'Deshabilitada', offer.active ? 'green' : 'neutral'));
    const p = document.createElement('p'); p.textContent = offerDescription(offer);
    const meta = document.createElement('div'); meta.className = 'offer-meta';
    meta.append(
      badge(`Usos: ${offer.redemption_count}${offer.max_redemptions === null ? '' : `/${offer.max_redemptions}`}`, 'blue'),
      badge(offer.valid_until ? `Hasta ${formatDate(offer.valid_until)}` : 'Sin fecha final', 'neutral'),
    );
    if (offer.active) {
      const disable = document.createElement('button');
      disable.type = 'button'; disable.className = 'mini'; disable.textContent = 'Deshabilitar';
      disable.addEventListener('click', () => disableOffer(offer));
      meta.append(disable);
    }
    article.append(head, p, meta);
    offerList.append(article);
  }
}

function render() {
  renderMetrics();
  renderCustomers();
  renderOffers();
}

function field(labelText, control) {
  const label = document.createElement('label');
  label.textContent = labelText;
  label.append(control);
  return label;
}

function selectControl(name, options) {
  const select = document.createElement('select');
  select.name = name;
  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }
  return select;
}

function dateControl(name, value) {
  const input = document.createElement('input'); input.type = 'date'; input.name = name; input.value = value; return input;
}

function textControl(name, value = '') {
  const input = document.createElement('input'); input.name = name; input.value = value; return input;
}

function openAction(action, row) {
  currentAction = { action, row };
  dialogFields.innerHTML = '';
  dialogSubmit.disabled = false;

  if (action === 'trial') {
    dialogTitle.textContent = 'Iniciar 30 días gratis';
    dialogCopy.textContent = `${row.organization_name} · ${row.condominium_name}`;
    dialogNotice.textContent = 'No se cobrará hoy y auto-billing permanecerá apagado. Al vencer el trial, el acceso comercial falla cerrado hasta una activación explícita.';
    dialogFields.append(
      field('Plan', selectControl('plan', plans.map((plan) => ({ value: plan.code, label: `${plan.name} · ${formatMoney(plan.catalog_monthly_usd)}/mes` })))),
      field('Facturación futura', selectControl('billingPeriod', [{ value: 'monthly', label: 'Mensual' }, { value: 'annual', label: 'Anual' }])),
    );
  } else if (action === 'coupon') {
    dialogTitle.textContent = 'Aplicar cupón';
    dialogCopy.textContent = `${row.organization_name} · ${row.condominium_name}`;
    dialogNotice.textContent = 'El descuento será temporal. El precio contractual base no se modifica y HAB-424 no permite stacking.';
    const eligible = activeOffers();
    dialogFields.append(
      field('Oferta', selectControl('offer', eligible.map((offer) => ({ value: offer.code, label: `${offer.code} · ${offerDescription(offer)}` })))),
      field('Comienza', dateControl('startDate', inputDate(row.subscription_status === 'trialing' ? row.trial_ends_at : null))),
    );
  } else if (action === 'gift') {
    dialogTitle.textContent = 'Regalar acceso';
    dialogCopy.textContent = `${row.organization_name} · ${row.condominium_name}`;
    dialogNotice.textContent = 'El período regalado queda como ajuste comercial a $0. No crea pagos, receivables ni movimientos contables.';
    dialogFields.append(
      field('Meses', selectControl('months', [1,2,3,6].map((value) => ({ value: String(value), label: `${value} mes${value === 1 ? '' : 'es'}` })))),
      field('Comienza', dateControl('startDate', inputDate(null))),
      field('Nota', textControl('note', 'Acceso promocional autorizado')),
    );
  } else if (action === 'activate') {
    dialogTitle.textContent = 'Activar suscripción manualmente';
    dialogCopy.textContent = `${row.organization_name} · ${row.condominium_name}`;
    dialogNotice.textContent = 'Esta acción confirma la suscripción como activa, pero NO habilita cobro automático ni registra un pago. Úsala solo cuando el acuerdo comercial haya sido confirmado fuera de Habitta.';
  }

  dialog.showModal();
}

async function submitAction() {
  if (!currentAction) return;
  const { action, row } = currentAction;
  const data = new FormData(actionForm);
  dialogSubmit.disabled = true;
  try {
    if (action === 'trial') {
      await rpc('platform_start_30_day_trial', {
        p_condominium_id: row.condominium_id,
        p_plan_code: String(data.get('plan')),
        p_billing_period: String(data.get('billingPeriod')),
      });
    } else if (action === 'coupon') {
      await rpc('platform_apply_commercial_offer', {
        p_condominium_id: row.condominium_id,
        p_code: String(data.get('offer')),
        p_start_date: String(data.get('startDate')),
      });
    } else if (action === 'gift') {
      await rpc('platform_gift_months', {
        p_condominium_id: row.condominium_id,
        p_months: Number(data.get('months')),
        p_start_date: String(data.get('startDate')),
        p_note: String(data.get('note') ?? ''),
      });
    } else if (action === 'activate') {
      await rpc('platform_activate_subscription', {
        p_condominium_id: row.condominium_id,
        p_billing_consent_at: null,
        p_billing_method_ready_at: null,
        p_enable_auto_bill: false,
      });
    }
    dialog.close();
    setStatus(customerStatus, 'Acción comercial aplicada correctamente.', 'success');
    await loadData();
  } catch (error) {
    dialogSubmit.disabled = false;
    dialogNotice.textContent = error instanceof Error ? error.message : 'No se pudo aplicar la acción.';
    dialogNotice.style.background = 'var(--red-soft)';
    dialogNotice.style.color = 'var(--red)';
  }
}

async function disableOffer(offer) {
  if (!window.confirm(`¿Deshabilitar ${offer.code}? Las aplicaciones existentes no se modifican.`)) return;
  try {
    await rpc('platform_disable_commercial_offer', { p_offer_id: offer.id });
    await loadData();
  } catch (error) {
    setStatus(offerStatus, error instanceof Error ? error.message : 'No se pudo deshabilitar la oferta.', 'error');
  }
}

offerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(offerForm);
  const submit = offerForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await rpc('platform_create_commercial_offer', {
      p_code: String(data.get('code') ?? '').trim(),
      p_kind: String(data.get('kind')),
      p_value: Number(data.get('value')),
      p_duration_months: Number(data.get('duration')),
      p_valid_from: null,
      p_valid_until: data.get('validUntil') ? String(data.get('validUntil')) : null,
      p_max_redemptions: data.get('maxRedemptions') ? Number(data.get('maxRedemptions')) : null,
      p_note: String(data.get('note') ?? ''),
    });
    offerForm.reset();
    setStatus(offerStatus, 'Oferta creada correctamente.', 'success');
    await loadData();
  } catch (error) {
    setStatus(offerStatus, error instanceof Error ? error.message : 'No se pudo crear la oferta.', 'error');
  } finally {
    submit.disabled = false;
  }
});

actionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitAction();
});
dialogCancel.addEventListener('click', () => dialog.close());
refreshButton.addEventListener('click', () => void loadData());
logoutButton.addEventListener('click', () => { clearSession(); window.location.replace('/'); });

try {
  requireSession();
  await verifyPlatformAdmin();
  await loadData();
} catch (error) {
  if (error instanceof Error && error.message !== 'missing_session' && error.message !== 'unauthorized') {
    setStatus(customerStatus, error.message, 'error');
    setStatus(offerStatus, error.message, 'error');
  }
}
