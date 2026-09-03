const pricingStyles = document.createElement('link');
pricingStyles.rel = 'stylesheet';
pricingStyles.href = './pricing.css';
document.head.append(pricingStyles);

const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('#primary-menu');

function closeMenu() {
  if (!menuButton || !menu) return;
  menuButton.setAttribute('aria-expanded', 'false');
  menu.classList.remove('is-open');
  document.body.classList.remove('menu-open');
}

if (menuButton && menu) {
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    menu.classList.toggle('is-open', !open);
    document.body.classList.toggle('menu-open', !open);
  });

  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}

const year = document.querySelector('#year');
if (year) year.textContent = String(new Date().getFullYear());

const CATALOG_URL = 'https://habitta-api-prod.aragondaniel91.workers.dev/public/v1/plans';
const APP_URL = 'https://app.mihabitta.com/';
const SELF_SERVICE_PLAN_CODES = new Set(['esencial', 'comunidad']);
const pricingSection = document.querySelector('#precios');
const pricingGrid = pricingSection?.querySelector('.pricing-grid');

const isPositiveNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isPublicPlan = (plan) =>
  plan &&
  typeof plan === 'object' &&
  typeof plan.code === 'string' &&
  typeof plan.name === 'string' &&
  isPositiveNumber(plan.catalog_monthly_usd) &&
  isPositiveNumber(plan.catalog_annual_usd) &&
  Number.isInteger(plan.default_unit_limit) &&
  plan.default_unit_limit > 0 &&
  Number.isInteger(plan.sort_order) &&
  Array.isArray(plan.capabilities) &&
  plan.capabilities.every(
    (capability) =>
      capability &&
      typeof capability === 'object' &&
      typeof capability.code === 'string' &&
      typeof capability.domain === 'string' &&
      typeof capability.name === 'string',
  );

const formatUsd = (amount) =>
  new Intl.NumberFormat('es-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

const appendText = (parent, tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
};

const selfServiceSignupUrl = (planCode, period) => {
  const url = new URL(APP_URL);
  url.searchParams.set('signup', '1');
  url.searchParams.set('plan', planCode);
  url.searchParams.set('period', period);
  return url.toString();
};

const buildPricingControls = () => {
  if (!pricingSection || !pricingGrid) return null;

  pricingGrid.replaceChildren();
  pricingGrid.setAttribute('aria-busy', 'true');

  const controls = document.createElement('div');
  controls.className = 'pricing-controls';

  const toggle = document.createElement('div');
  toggle.className = 'billing-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Periodo de facturación');

  const monthly = document.createElement('button');
  monthly.type = 'button';
  monthly.className = 'billing-option is-active';
  monthly.dataset.period = 'monthly';
  monthly.setAttribute('aria-pressed', 'true');
  monthly.textContent = 'Mensual';

  const annual = document.createElement('button');
  annual.type = 'button';
  annual.className = 'billing-option';
  annual.dataset.period = 'annual';
  annual.setAttribute('aria-pressed', 'false');
  annual.textContent = 'Anual';

  toggle.append(monthly, annual);

  const note = document.createElement('p');
  note.className = 'pricing-currency-note';
  note.textContent = 'Precios de catálogo en USD.';

  controls.append(toggle, note);

  pricingGrid.before(controls);

  const status = document.createElement('div');
  status.className = 'pricing-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  appendText(status, 'span', 'pricing-status-dot', '');
  appendText(status, 'p', '', 'Consultando planes y precios…');
  pricingGrid.before(status);

  return { toggle, status };
};

const renderPlan = (plan, period) => {
  const article = document.createElement('article');
  article.dataset.planCode = plan.code;
  if (plan.code === 'comunidad') article.classList.add('featured-plan');

  if (plan.code === 'comunidad') {
    appendText(article, 'p', 'plan-badge', 'PARA LA OPERACIÓN DIARIA');
  }

  appendText(article, 'h3', 'plan-name', plan.name);

  const price = period === 'annual' ? plan.catalog_annual_usd : plan.catalog_monthly_usd;
  const priceRow = document.createElement('p');
  priceRow.className = 'plan-price';
  appendText(priceRow, 'strong', '', formatUsd(price));
  appendText(priceRow, 'span', '', period === 'annual' ? ' USD / año' : ' USD / mes');
  article.append(priceRow);

  appendText(article, 'p', 'plan-limit', `Hasta ${plan.default_unit_limit} unidades`);

  const list = document.createElement('ul');
  const visibleCapabilities = plan.capabilities.slice(0, 4);
  visibleCapabilities.forEach((capability) => appendText(list, 'li', '', capability.name));
  if (plan.capabilities.length > visibleCapabilities.length) {
    appendText(
      list,
      'li',
      'plan-more',
      `+ ${plan.capabilities.length - visibleCapabilities.length} funcionalidades`,
    );
  }
  article.append(list);

  const link = document.createElement('a');
  link.className = plan.code === 'comunidad' ? 'button' : 'button button-outline';
  if (SELF_SERVICE_PLAN_CODES.has(plan.code)) {
    link.href = selfServiceSignupUrl(plan.code, period);
    link.textContent = 'Comenzar prueba gratis';
    link.setAttribute('aria-label', `Comenzar prueba gratis de ${plan.name}`);
  } else {
    link.href = `mailto:hola@mihabitta.com?subject=${encodeURIComponent(`Onboarding guiado ${plan.name}`)}`;
    link.textContent = 'Hablar con Habitta';
  }
  article.append(link);

  return article;
};

const renderCatalog = (plans, period) => {
  if (!pricingGrid) return;
  const fragment = document.createDocumentFragment();
  plans.forEach((plan) => fragment.append(renderPlan(plan, period)));
  pricingGrid.replaceChildren(fragment);
  pricingGrid.setAttribute('aria-busy', 'false');
};

const renderCatalogUnavailable = (status) => {
  if (!pricingGrid) return;
  pricingGrid.replaceChildren();
  pricingGrid.setAttribute('aria-busy', 'false');
  pricingGrid.classList.add('pricing-grid-unavailable');

  const card = document.createElement('article');
  card.className = 'pricing-unavailable';
  appendText(card, 'p', 'card-label', 'PLANES');
  appendText(card, 'h3', '', 'Precios temporalmente no disponibles.');
  appendText(
    card,
    'p',
    '',
    'Podemos ayudarte a elegir el plan adecuado mientras restablecemos la consulta de catálogo.',
  );
  const link = document.createElement('a');
  link.className = 'button button-outline';
  link.href = 'mailto:hola@mihabitta.com?subject=Información%20sobre%20planes%20Habitta';
  link.textContent = 'Solicitar información';
  card.append(link);
  pricingGrid.append(card);

  if (status) {
    status.classList.add('is-error');
    const copy = status.querySelector('p');
    if (copy) copy.textContent = 'No pudimos consultar el catálogo en este momento.';
  }
};

const loadPublicCatalog = async () => {
  if (!pricingSection || !pricingGrid) return;
  const controls = buildPricingControls();
  if (!controls) return;

  try {
    const response = await fetch(CATALOG_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('catalogue unavailable');

    const payload = await response.json();
    if (
      !payload ||
      payload.currency !== 'USD' ||
      !Array.isArray(payload.plans) ||
      payload.plans.length === 0 ||
      !payload.plans.every(isPublicPlan)
    ) {
      throw new Error('invalid catalogue');
    }

    const plans = [...payload.plans].sort((a, b) => a.sort_order - b.sort_order);
    let period = 'monthly';
    renderCatalog(plans, period);
    controls.status.classList.add('is-ready');
    const statusCopy = controls.status.querySelector('p');
    if (statusCopy)
      statusCopy.textContent = `${plans.length} planes disponibles · precios de catálogo en USD.`;

    controls.toggle.addEventListener('click', (event) => {
      const button = event.target.closest('[data-period]');
      if (!(button instanceof HTMLButtonElement)) return;
      const nextPeriod = button.dataset.period;
      if (nextPeriod !== 'monthly' && nextPeriod !== 'annual') return;
      period = nextPeriod;
      controls.toggle.querySelectorAll('[data-period]').forEach((option) => {
        const active = option === button;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-pressed', String(active));
      });
      renderCatalog(plans, period);
    });
  } catch {
    renderCatalogUnavailable(controls.status);
  }
};

void loadPublicCatalog();
