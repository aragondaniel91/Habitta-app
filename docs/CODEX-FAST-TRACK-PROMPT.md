# Habitta — Codex Fast Track

## Objetivo

Avanzar rápido sin crear una arquitectura desechable. En una sola rama, Codex debe realizar una revisión arquitectónica breve de los riesgos críticos y luego construir la fundación técnica funcional de Habitta.

## Repositorio

`aragondaniel91/Habitta-app`

## Rama

Crear y trabajar únicamente en:

`agent/project-foundation`

No modificar `main` directamente.

## Contexto aprobado

Habitta será una plataforma SaaS multi-condominio para Venezuela.

Primera etapa:
- aplicación web responsiva para PC, tablet y teléfono;
- administración de condominios;
- propietarios e inquilinos;
- cuotas, cuentas por cobrar, pagos y comprobantes;
- cuentas por pagar, gastos, bancos y caja;
- pagos nacionales e internacionales configurados por cada condominio;
- notificaciones in-app y correo;
- encuestas, votaciones y propuestas de presupuesto.

Segunda etapa:
- aplicación Android y iPhone usando la misma API, autenticación, permisos y datos.

## Stack aprobado

- Monorepo: pnpm workspaces + Turborepo
- Web: React + Vite + TypeScript
- API: Hono sobre Cloudflare Workers
- Base de datos: Supabase Free PostgreSQL
- Auth: Supabase Auth
- Archivos privados: Cloudflare R2
- Procesos asíncronos: Cloudflare Queues
- Correo: Resend
- App móvil futura: React Native + Expo
- CI/CD: GitHub Actions

## Regla de velocidad

No producir una colección extensa de documentos antes de implementar.

Haz solo una revisión corta de los riesgos bloqueantes y registra las decisiones esenciales en:

`docs/FOUNDATION-DECISIONS.md`

Después implementa inmediatamente la base técnica.

## Fase A — Revisión crítica breve

Antes de escribir migraciones, confirma y documenta únicamente:

1. Jerarquía multi-tenant.
2. Estrategia de roles y permisos server-side.
3. Separación entre obligaciones, pagos y aplicaciones de pago.
4. Operaciones financieras que requieren transacción PostgreSQL.
5. Estrategia RLS.
6. Contratos API reutilizables por web y futura app móvil.
7. Manejo seguro de archivos privados.
8. Eventos de notificación.

No redactes documentos redundantes ni repitas el PRD.

## Fase B — Fundación técnica

Implementa:

```text
apps/
  web/
  api/

packages/
  domain/
  contracts/
  validation/
  shared-types/
  ui/

supabase/
  migrations/
  seed.sql
  tests/
```

### Configuración requerida

- TypeScript estricto.
- ESLint.
- Prettier.
- Vitest.
- Playwright preparado para la web.
- Wrangler para la API.
- Supabase CLI.
- Variables documentadas en `.env.example` sin secretos.
- GitHub Actions para lint, typecheck, test y build.

## Fase C — Primer modelo de datos

Crear migraciones iniciales para:

### Identidad y tenancy
- profiles
- organizations
- organization_memberships
- condominiums
- condominium_memberships
- roles
- permissions
- role_permissions
- audit_events

### Propiedades
- buildings
- units
- ownerships
- tenancies
- invitations

### Finanzas iniciales
- billing_periods
- charge_types
- charges
- obligations
- payment_methods
- payment_accounts
- reported_payments
- payment_proofs
- payment_reviews
- payment_allocations
- receipts
- exchange_rates

### Comunicación inicial
- notifications
- notification_preferences
- email_deliveries

Usar UUID, timestamps, restricciones, claves foráneas e índices apropiados.

## Fase D — Seguridad

Crear políticas RLS iniciales y pruebas para demostrar que:

1. Un usuario de un condominio no puede leer otro condominio.
2. Un propietario solo puede ver sus unidades y estados de cuenta.
3. Un inquilino solo puede ver la información autorizada.
4. Un revisor de pagos no recibe permisos administrativos generales.
5. La `service_role` nunca llega al frontend.

## Fase E — API mínima

Implementar endpoints iniciales con validación de esquema y manejo consistente de errores:

- `GET /health`
- `GET /api/v1/me`
- `GET /api/v1/condominiums`
- `GET /api/v1/units`
- `GET /api/v1/units/:id/statement`
- `POST /api/v1/payments/report`
- `GET /api/v1/payments/pending`
- `POST /api/v1/payments/:id/approve`
- `POST /api/v1/payments/:id/reject`

Los endpoints financieros deben validar permisos en servidor.

## Fase F — Web mínima

Crear una interfaz inicial usando el branding aprobado de Habitta:

- Login.
- Shell responsivo.
- Navegación por rol.
- Dashboard administrativo inicial.
- Dashboard de propietario inicial.
- Pantalla de pagos pendientes.
- Pantalla para reportar pago y adjuntar comprobante como placeholder funcional.

No crear todavía un diseño enorme. Priorizar estructura clara, accesibilidad y navegación móvil.

## Reglas financieras obligatorias

- Un pago pendiente no modifica el saldo.
- Un pago aprobado se aplica dentro de una transacción.
- Un pago puede cubrir varias obligaciones.
- Una obligación puede recibir varios pagos.
- Las tasas quedan congeladas por transacción.
- No borrar operaciones financieras aprobadas.
- Las correcciones usan reversos o ajustes futuros.
- La IA no aprueba pagos ni cambia saldos.

## Restricciones

- No ejecutar migraciones remotas en producción.
- No desplegar en Cloudflare todavía.
- No agregar claves reales.
- No crear Stripe, PayPal ni Resend todavía.
- No implementar chat completo.
- No implementar app móvil.
- No introducir microservicios.
- No bloquear el avance por detalles menores; usar decisiones razonables y documentarlas.

## Validación obligatoria

Ejecutar:

- instalación limpia;
- lint;
- typecheck;
- unit tests;
- build web;
- build API;
- `git diff --check`;
- escaneo básico para secretos.

## Entrega

1. Crear commits claros en `agent/project-foundation`.
2. Abrir un pull request en borrador hacia `main`.
3. Incluir en el PR:
   - qué se implementó;
   - decisiones arquitectónicas;
   - pruebas ejecutadas;
   - limitaciones conocidas;
   - pasos manuales pendientes para conectar Supabase y Cloudflare.
4. No hacer merge.
