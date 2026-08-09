# Habitta — Decisiones aprobadas

**Última actualización:** 23 de julio de 2026

## Producto

Habitta será una plataforma SaaS multi-condominio para administradoras, condominios, propietarios e inquilinos. La primera entrega será una aplicación web responsiva para PC, tablet y teléfono. Las aplicaciones Android y iPhone se construirán en una segunda etapa usando la misma API y base de datos.

## Principios

- No construir un prototipo desechable.
- Mantener desde el inicio arquitectura multi-condominio.
- Reducir el error humano mediante validaciones y cálculos automáticos.
- Mantener trazabilidad financiera y auditoría.
- Cada condominio configura sus propias cuentas nacionales e internacionales.
- Habitta no custodiará fondos en la primera etapa.
- Las notificaciones por correo e in-app forman parte del primer release.
- La IA asistirá, pero no aprobará pagos ni modificará saldos por sí sola.

## Infraestructura inicial

- Cloudflare para frontend, API, R2, Queues, seguridad y despliegue.
- Supabase Free para PostgreSQL y autenticación.
- Resend Free para correo transaccional.
- GitHub para código, migraciones, documentación y CI.

La infraestructura comenzará gratuita. Los planes se ampliarán cuando Habitta tenga clientes o uso real, sin cambiar arquitectura ni reescribir la aplicación.

## Base de datos compartida entre desarrollo y producción

Desarrollo y producción usan el mismo proyecto Supabase mientras Habitta no tenga ingresos. Es una decisión deliberada de costo, no un descuido.

Mientras la base sea compartida se aplican dos restricciones obligatorias:

1. **El correo de producción permanece en `disabled`.** Activarlo enviaría mensajes reales a las direcciones que aparezcan en datos de prueba.
2. **El entorno `prod` no declara cron.** `claim_due_notification_deliveries` filtra solo por estado y fecha de vencimiento, sin columna de entorno. Dos Workers programados sobre la misma base competirían por las mismas entregas: el de producción las reclamaría y, al estar el correo desactivado, las descartaría como `skipped`, dejando sin enviar las que desarrollo necesita en su bandeja sandbox.

`scripts/cloudflare/validate-notifications-config.mjs` hace cumplir la segunda restricción y corre en CI y en el release de producción. El guardarraíl es condicional: compara `env.dev.vars.SUPABASE_URL` con `env.prod.vars.SUPABASE_URL` y, en cuanto dejen de coincidir, vuelve a **exigir** el cron en producción. No hay que acordarse de revertirlo.

**Condición para separar los entornos:** el primer condominio real con datos de personas y pagos verdaderos. La vía sin costo adicional es mover el desarrollo diario a Supabase local — `supabase/config.toml` ya existe y `financial-e2e.yml` ya lo usa — dejando el proyecto en la nube como exclusivo de producción.

Al separar, ambas restricciones se levantan juntas: se activa el correo de producción y se restaura `"triggers": { "crons": ["*/5 * * * *"] }` en el entorno `prod`.

> Nota para quien edite `apps/api/wrangler.jsonc`: pese a la extensión `.jsonc`, el archivo **no admite comentarios**. Los dos validadores que lo leen (`validate-notifications-config.mjs` y `validate-development-release.mjs`) solo eliminan comas finales antes de `JSON.parse`, así que un comentario `//` rompe CI.

## Stack

- Aplicación web: React + Vite + TypeScript
- API: Hono sobre Cloudflare Workers
- Website comercial: Astro
- Base de datos: PostgreSQL en Supabase
- Autenticación: Supabase Auth
- Documentos privados: Cloudflare R2
- Procesos asíncronos: Cloudflare Queues
- Correo: Resend
- Aplicación móvil futura: React Native + Expo

## Módulos prioritarios

1. Empresas administradoras y condominios
2. Torres, unidades, propietarios e inquilinos
3. Roles y permisos granulares
4. Importación desde Excel
5. Cuotas y cuentas por cobrar
6. Pagos multimoneda y comprobantes
7. Aprobación, rechazo, ajustes y recibos
8. Gastos y cuentas por pagar
9. Bancos, caja y conciliación
10. Reportes y transparencia
11. Notificaciones in-app y correo
12. Solicitudes y anuncios
13. Encuestas, votaciones y propuestas de presupuesto
14. Auditoría

## Branding

- Nombre: Habitta
- Dirección visual: estilo de Vecora
- Paleta y concepto de logo: inspirados en la alternativa CondoGest aprobada
