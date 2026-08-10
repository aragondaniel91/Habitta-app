import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from './navigation';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const appSource = read('./App.tsx');

// Every route's page: dashboard is added once because two routes share AdministrativeDashboard.
const pageComponents = [...new Set(APP_ROUTES.map((route) => route.key))]
  .map((key) => APP_ROUTES.find((route) => route.key === key)!)
  .map((route) => {
    const match = appSource.match(
      new RegExp(`activeRoute\\.key === '${route.key}'[\\s\\S]{0,80}?<(\\w+)`),
    );
    return match?.[1];
  })
  .filter((name): name is string => Boolean(name));

describe('module code splitting', () => {
  it('imports every module page through lazy() rather than eagerly', () => {
    expect(pageComponents.length).toBeGreaterThan(10);
    for (const name of pageComponents) {
      expect(appSource).toContain(`const ${name} = lazy(`);
      expect(appSource).not.toMatch(new RegExp(`^import \\{ ${name} \\} from './pages/`, 'm'));
    }
  });

  it('wraps the routed page in Suspense so a chunk can load without a blank screen', () => {
    expect(appSource).toContain('<Suspense fallback={<ModuleLoading />}>{page}</Suspense>');
  });

  it('keeps each module CSS sheet out of the initial bundle', () => {
    const mainSource = read('./main.tsx');
    const globalSheets = ['styles.css', 'auth.css', 'brand-palette.css', 'page-header.css'];
    for (const sheet of globalSheets) {
      expect(mainSource).toContain(`import './${sheet}';`);
    }
    // These belong to one module each and must not load before that module does.
    for (const sheet of ['maintenance.css', 'treasury.css', 'payments.css', 'reports.css']) {
      expect(mainSource).not.toContain(`import './${sheet}';`);
    }
  });
});
