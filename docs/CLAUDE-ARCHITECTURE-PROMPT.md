# Claude Code — Revisión inicial de Habitta

**Modelo:** Opus 4.8  
**Modo:** Standard / esfuerzo alto

## Contexto

Trabaja sobre el repositorio `aragondaniel91/Habitta-app`.

Habitta será una plataforma SaaS multi-condominio. La primera interfaz será web responsiva y la app Android/iPhone se agregará después usando la misma API, autenticación, base de datos y reglas financieras.

Lee primero:

- `README.md`
- `docs/PROJECT-DECISIONS.md`
- `docs/ARCHITECTURE-v0.2.md`
- `docs/SPRINT-1-BACKLOG.md`

## Objetivo

Revisar y fortalecer la arquitectura antes de que Codex genere el monorepo y las primeras migraciones.

## Revisión requerida

1. Multi-tenancy:
   - empresas administradoras;
   - múltiples condominios;
   - usuarios con varias membresías y propiedades;
   - aislamiento en API y RLS.

2. Modelo financiero:
   - cuotas y obligaciones;
   - pagos parciales;
   - asignación de pagos;
   - créditos, ajustes y reversos;
   - multimoneda y tasas congeladas;
   - bancos, caja y cambio de divisas;
   - cuentas por cobrar y pagar.

3. Seguridad:
   - permisos granulares;
   - service role únicamente server-side;
   - comprobantes privados en R2;
   - auditoría;
   - idempotencia;
   - operaciones transaccionales.

4. Extensibilidad:
   - futura app React Native;
   - Stripe, PayPal y otros adaptadores;
   - notificaciones in-app y correo;
   - encuestas, votaciones y propuestas de presupuesto;
   - IA asistiva sin autoridad financiera.

## Entregables

Crea, sin implementar todavía la aplicación completa:

- `docs/ARCHITECTURE-REVIEW-v0.1.md`
- `docs/DATA-MODEL-v0.1.md`
- `docs/FINANCIAL-INVARIANTS-v0.1.md`
- `docs/SECURITY-MULTITENANCY-v0.1.md`
- `docs/IMPLEMENTATION-ORDER-v0.1.md`

Incluye una lista priorizada de cambios obligatorios antes de iniciar código.

## Restricciones

- No sustituir PostgreSQL por D1 como ledger financiero principal.
- No introducir microservicios prematuros.
- No poner lógica financiera crítica en React.
- No permitir borrado silencioso de operaciones aprobadas.
- No usar IA para aprobar pagos, gastos, ajustes o reversos.
- No agregar servicios pagos obligatorios durante el piloto.
- Mantener compatibilidad con Cloudflare Workers y Supabase Free.
