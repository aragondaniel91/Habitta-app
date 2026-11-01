# E2E financieros en local

Esta guía reproduce localmente la suite Playwright financiera. Es exclusivamente para entorno local y pruebas: usa Supabase local y un fixture financiero desechable. No incluye despliegues a producción, pagos reales, RLS ni usuarios reales.

## Prerrequisitos

- Node.js 22 o superior (según `e2e/package.json`), pnpm y la CLI de Supabase disponibles localmente.
- Docker disponible para que `supabase start --debug` pueda levantar la pila local y aplicar las migraciones.
- Dependencias raíz y de `e2e` instaladas, y Chromium instalado para Playwright.
- El fixture financiero validado y cargado antes de correr la suite. El flujo de CI lo valida y aprovisiona en ese orden.
- Variables de entorno de prueba configuradas únicamente con datos del entorno local/fixture. No anotar valores, claves ni secretos en este documento ni en archivos versionados.

## Orden que reproduce el job `financial-e2e`

El job `financial-e2e` de `.github/workflows/financial-e2e.yml` instala las dependencias, inicia Supabase local y aplica las migraciones, obtiene las credenciales locales de Supabase, instala las dependencias de E2E, comprueba tipos, valida y aprovisiona el fixture, instala Chromium y ejecuta la suite. Aunque falle la ejecución, intenta restablecer el fixture y detener los servicios locales.

Estos son los comandos de ejecución relevantes, transcritos tal como figuran en el workflow:

```sh
pnpm install --frozen-lockfile
supabase start --debug
supabase status -o env > supabase.env
npm ci --prefix e2e --ignore-scripts --no-audit --no-fund
pnpm exec tsc -p e2e/tsconfig.json --noEmit
npm --prefix e2e run fixture:validate
npm --prefix e2e run fixture:provision
npm --prefix e2e exec -- playwright install --with-deps chromium
npm --prefix e2e run test:financial
npm --prefix e2e run fixture:reset
supabase stop --no-backup
```

Para una reproducción local, mantenga Supabase iniciado, cargue el fixture mediante los pasos de validación y aprovisionamiento anteriores, y ejecute la suite después de instalar Chromium. Ejecute el restablecimiento del fixture y la detención de Supabase al terminar.

## Scripts declarados en `e2e/package.json`

Los siguientes son los comandos definidos por los scripts del paquete E2E; se muestran literalmente, sin comandos alternativos:

| Script | Comando declarado |
| --- | --- |
| `fixture:validate` | `node scripts/validate-financial-fixture.mjs` |
| `fixture:provision` | `node scripts/provision-financial-fixture.mjs` |
| `fixture:reset` | `node scripts/reset-financial-fixture.mjs` |
| `test:financial` | `playwright test --project=financial-chromium` |

El proyecto `financial-chromium` es el que selecciona los archivos `financial-*.spec.ts` en la configuración de Playwright.

## Nombres de variables de entorno de prueba

La siguiente lista contiene solo nombres, detectados en el workflow, las pruebas financieras, sus utilidades y la configuración de Playwright. No se incluyen valores.

| Grupo | Variables |
| --- | --- |
| Pila local y fixture | `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_FIXTURE_PASSWORD`, `E2E_CONFIRM_RESET` |
| Ejecución y aplicación local | `E2E_BASE_URL`, `E2E_API_BASE_URL`, `CI` |
| Datos del fixture para pruebas | `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_CONDOMINIUM_NAME`, `E2E_FIXTURE_ID` |
| Evidencia opcional | `E2E_VISUAL_EVIDENCE_DIR` |
| Operación interna del workflow | `SUPABASE_INTERNAL_IMAGE_REGISTRY`, `ANON_KEY`, `SERVICE_ROLE_KEY` |

Las credenciales obtenidas de la instancia local se transfieren en el workflow a los nombres de prueba correspondientes antes de aprovisionar el fixture y ejecutar Playwright. Mantenga esos valores locales y fuera del control de versiones.
