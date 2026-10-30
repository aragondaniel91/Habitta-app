# Habitta — Decisiones aprobadas

**Última actualización:** 30 de octubre de 2026

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
- ZeptoMail para correo transaccional.
- GitHub para código, migraciones, documentación y CI.

La infraestructura comenzará gratuita. Los planes se ampliarán cuando Habitta tenga clientes o uso real, sin cambiar arquitectura ni reescribir la aplicación.

## Aislamiento entre desarrollo y producción

Desarrollo y producción no deben compartir proyecto ni credenciales de Supabase. El guardarraíl de #615, implementado en `scripts/release/assert-development-isolation.mjs`, rechaza una entrega de desarrollo si `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_ACCESS_TOKEN` pueden pertenecer o acceder a producción; exige que las comprobaciones estáticas y en vivo prueben el aislamiento. `scripts/release/validate-development-release.mjs` también prohíbe que `env.dev.vars.SUPABASE_URL` quede fijada en `apps/api/wrangler.jsonc`: esa URL se entrega en tiempo de ejecución y debe pasar el guardarraíl.

El valor local predeterminado de la API es `SUPABASE_URL=http://127.0.0.1:54321` en `apps/api/wrangler.jsonc`; `supabase/config.toml` configura el servicio API local en el puerto `54321`. El flujo `.github/workflows/financial-e2e.yml` inicia Supabase local y usa esa misma URL. Esto confirma el uso local para la configuración base y las pruebas financieras, pero no documenta que exista actualmente un proyecto Supabase remoto de desarrollo.

La configuración declarada en `apps/api/wrangler.jsonc` es:

1. `env.dev.vars.NOTIFICATIONS_EMAIL_MODE` es `disabled` y `env.dev.vars.NOTIFICATIONS_EMAIL_PROVIDER` es `zeptomail`; `env.dev.triggers.crons` es una lista vacía.
2. `env.prod.vars.NOTIFICATIONS_EMAIL_MODE` es `live` y `env.prod.vars.NOTIFICATIONS_EMAIL_PROVIDER` es `zeptomail`; `env.prod.triggers.crons` declara `*/5 * * * *`.

Por tanto, la antigua afirmación de que producción debía permanecer con correo desactivado y sin cron no coincide con la configuración vigente. Existe una diferencia adicional que debe conservarse visible: `.github/workflows/development-release-apply.yml` entrega al Worker de desarrollo `NOTIFICATIONS_EMAIL_MODE=sandbox`; no debe confundirse esa sustitución de despliegue con el valor `disabled` declarado en `apps/api/wrangler.jsonc`.

> Nota para quien edite `apps/api/wrangler.jsonc`: pese a la extensión `.jsonc`, el archivo **no admite comentarios**. Los dos validadores que lo leen (`validate-notifications-config.mjs` y `validate-development-release.mjs`) solo eliminan comas finales antes de `JSON.parse`, así que un comentario `//` rompe CI.

## Stack

- Aplicación web: React + Vite + TypeScript
- API: Hono sobre Cloudflare Workers
- Website comercial: sitio estático servido con HTML/CSS/JS plano, sin framework ni paso de compilación de Astro, sin `package.json` propio y desplegado directamente en Cloudflare Pages. (Verificado contra el contenido de `apps/site` en `main`, commit `2d659747`.)
- Base de datos: PostgreSQL en Supabase
- Autenticación: Supabase Auth
- Documentos privados: Cloudflare R2
- Procesos asíncronos: Cloudflare Queues
- Correo: ZeptoMail
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
