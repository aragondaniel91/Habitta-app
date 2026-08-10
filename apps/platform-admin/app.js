// No bundler, no dependencies: this surface is deployed as raw static files (see
// .github/workflows/static-sites-release.yml), so it talks to Supabase's REST/Auth HTTP API
// directly with fetch() instead of pulling in the supabase-js SDK. Every real permission is
// enforced by RLS (is_platform_admin() and the platform_admin_read_* policies) - this file has no
// elevated access of its own.
const config = window.HABITTA_ADMIN_CONFIG;
const SESSION_KEY = 'habitta-admin-session';

const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const logoutButton = document.querySelector('#logout-button');
const overviewBody = document.querySelector('#overview-body');
const overviewStatus = document.querySelector('#overview-status');

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
    `${config.supabaseUrl}/rest/v1/rpc/get_platform_condominium_overview`,
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
    throw new Error('No se pudo cargar el resumen de condominios.');
  }
  return response.json();
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function renderOverview(rows) {
  overviewBody.innerHTML = '';
  if (!rows.length) {
    overviewStatus.textContent = 'No hay condominios registrados todavía.';
    return;
  }
  overviewStatus.textContent = `${rows.length} condominio(s).`;
  for (const row of rows) {
    const tr = document.createElement('tr');
    const cells = [
      row.organization_name,
      row.condominium_name,
      row.unit_count,
      row.membership_count,
      formatDate(row.created_at),
    ];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.append(td);
    }
    overviewBody.append(tr);
  }
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function showLogin(message) {
  clearSession();
  loginView.hidden = false;
  dashboardView.hidden = true;
  loginError.textContent = message ?? '';
}

async function loadDashboard(session) {
  overviewStatus.textContent = 'Cargando...';
  try {
    const isPlatformAdmin = await fetchIsPlatformAdmin(session.access_token);
    if (!isPlatformAdmin) {
      overviewBody.innerHTML = '';
      overviewStatus.textContent =
        'Tu cuenta inició sesión correctamente, pero no tiene el rol de administrador de plataforma.';
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

const existingSession = getSession();
if (existingSession) {
  showDashboard();
  void loadDashboard(existingSession);
} else {
  showLogin('');
}
