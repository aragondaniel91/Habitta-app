# Notificaciones: desarrollo con Cloudflare

## Prerrequisitos

Instala las dependencias con `pnpm install`, autentica Wrangler solo si vas a aprovisionar recursos remotos de desarrollo y copia `apps/api/.dev.vars.example` a `apps/api/.dev.vars`. Ese archivo local no se versiona.

## Desarrollo local seguro

Mantén `NOTIFICATIONS_EMAIL_MODE=disabled` y ejecuta `pnpm notifications:dev`. El Worker usa las colas locales de Wrangler y no llama a Resend. En otra terminal, ejecuta `pnpm notifications:smoke`; genera un identificador sintético, confirma el resultado `skipped` y confirma cero llamadas al proveedor.

Para probar formato de correo sin destinatarios reales, usa `NOTIFICATIONS_EMAIL_MODE=sandbox` y define `NOTIFICATIONS_SANDBOX_EMAIL` con un buzón controlado. Todo mensaje se redirige allí y el asunto empieza con `[HABITTA DEV]`. `live` solo es válido con `APP_ENV=production`; en desarrollo el Worker lo rechaza antes de llamar a Resend.

## Recursos remotos de desarrollo

`pnpm notifications:infra:plan` no hace llamadas remotas y muestra las colas que faltaría crear. Tras revisar el plan, `pnpm notifications:infra:apply` pide escribir `APPLY`, verifica la sesión de Wrangler, lista las colas existentes y crea únicamente las faltantes: `habitta-notifications-dev` y `habitta-notifications-dlq-dev`. No despliega el Worker ni configura secretos.

Configura los secretos únicamente con los mecanismos seguros de Cloudflare: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL` y, para sandbox, `NOTIFICATIONS_SANDBOX_EMAIL`. Nunca los copies a ejemplos, logs, incidencias o PRs.

## Checklist y rollback

Antes de habilitar sandbox, confirma que el modo sea `sandbox`, que el destinatario sea controlado y que los asuntos lleven el prefijo. Para detener envíos, cambia el modo a `disabled`; las entregas se marcan como omitidas con `email_delivery_disabled` y no se pierde el registro.

Para diagnosticar reintentos agotados, ejecuta `pnpm notifications:dlq:diagnose`. Revisa solo `deliveryId`, corrige la causa y reinyecta manualmente `{ "deliveryId": "<uuid>" }`. No incluyas destinatarios ni payloads en la investigación.
