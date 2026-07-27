# Notificaciones: desarrollo con Cloudflare

## Prerrequisitos

Instala las dependencias con `pnpm install`, autentica Wrangler solo si vas a aprovisionar recursos remotos de desarrollo y copia `apps/api/.dev.vars.example` a `apps/api/.dev.vars`. Ese archivo local no se versiona.

## Desarrollo local seguro

Mantén `NOTIFICATIONS_EMAIL_MODE=disabled` y ejecuta `pnpm notifications:dev`. El Worker usa las colas y el almacenamiento R2 simulados localmente por Wrangler y no llama a Resend. En otra terminal, ejecuta `pnpm notifications:smoke`; el comando ejecuta la prueba aislada del consumidor con un `deliveryId` sintético, confirma el resultado `skipped` y confirma cero llamadas al proveedor.

Para probar formato de correo sin destinatarios reales, usa `NOTIFICATIONS_EMAIL_MODE=sandbox`, define `NOTIFICATIONS_SANDBOX_EMAIL` con un buzón controlado y configura un remitente de Resend de desarrollo. Todo mensaje se redirige al buzón sandbox y el asunto empieza con `[HABITTA DEV]`. `live` solo es válido con `APP_ENV=production`; en desarrollo el Worker lo rechaza antes de procesar el cron o llamar a Resend.

## Recursos remotos de desarrollo

`pnpm notifications:infra:plan` no hace llamadas remotas y muestra las colas que faltaría crear. Tras revisar el plan, `pnpm notifications:infra:apply` pide escribir `APPLY`, verifica la sesión de Wrangler, lista las colas existentes y crea únicamente las faltantes: `habitta-notifications-dev` y `habitta-notifications-dlq-dev`. No despliega el Worker ni configura secretos.

El environment `dev` declara además el binding `PAYMENT_PROOFS` hacia `habitta-payment-proofs-dev`, porque los bindings de Wrangler no se heredan entre environments. Este script no crea el bucket R2; debe existir o aprovisionarse mediante el flujo específico de comprobantes antes de desplegar el Worker de desarrollo.

Configura los secretos únicamente con los mecanismos seguros de Cloudflare: `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL` y, para sandbox, `NOTIFICATIONS_SANDBOX_EMAIL`. Nunca los copies a ejemplos, logs, incidencias o PRs. Ten presente que `wrangler secret put` puede crear una nueva versión; revisa la versión y promoción antes de habilitar un Worker remoto.

## Checklist y rollback

Antes de habilitar sandbox, confirma que Queue y DLQ existen, que el binding R2 de desarrollo está disponible, que el modo sea `sandbox`, que el destinatario sea controlado y que los asuntos lleven el prefijo. Ejecuta una sola prueba, comprueba que la delivery terminó en `sent`, revisa únicamente el `provider_message_id` y confirma que no hubo duplicados.

Para detener envíos, cambia el modo a `disabled`; las entregas se marcan como omitidas con `email_delivery_disabled` y no se pierde el registro. Si fuera necesario, detén temporalmente el cron o el consumidor, pero no borres el outbox, las deliveries ni las colas antes de inspeccionarlas.

Para diagnosticar reintentos agotados, ejecuta `pnpm notifications:dlq:diagnose`. Revisa solo `deliveryId`, timestamps, attempts y error code sanitizado; corrige la causa y reinyecta manualmente `{ "deliveryId": "<uuid>" }`. No incluyas destinatarios ni payloads en la investigación y no reproceses automáticamente la DLQ.
