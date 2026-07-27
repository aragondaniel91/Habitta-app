# Development release

Este entorno usa exclusivamente `development`, `habitta-api-dev`, `habitta-web-dev`, `habitta-notifications-dev`, `habitta-notifications-dlq-dev` y `habitta-payment-proofs-dev`. El correo debe permanecer en `NOTIFICATIONS_EMAIL_MODE=disabled`.

## GitHub Free

Para un repositorio privado en GitHub Free, configura las credenciales en `Settings → Secrets and variables → Actions` a nivel del repositorio. No uses Environment secrets porque requieren GitHub Pro, Team o Enterprise en repositorios privados.

Variables públicas del repositorio: `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_API_BASE_URL`, `CLOUDFLARE_WORKER_DEV_URL`, `CLOUDFLARE_PAGES_DEV_URL` y `CLOUDFLARE_PAGES_PROJECT_NAME`.

Secretos del repositorio: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

La edición Free no ofrece el approval gate del Environment para este repositorio privado. La protección se conserva mediante `workflow_dispatch`, validación del ref, confirmación exacta del project ref, `DEPLOY-HABITTA-DEVELOPMENT`, checks completos y correo forzado a disabled.

## Plan y aplicación

Ejecuta primero `Development Release Plan`, indicando `main` y confirmando el project ref. Revisa el resumen sanitizado: commit, migraciones, recursos dev y correo disabled. El workflow no crea ni modifica recursos.

Después de revisar el plan, ejecuta `Development Release Apply` con un ref contenido en `main` y la confirmación exacta `DEPLOY-HABITTA-DEVELOPMENT`. El orden es validación, recursos idempotentes, migraciones, build, upload/promoción de Worker, smoke, Pages y smoke end-to-end. No se usan deploys automáticos por push o PR.

## Smoke, Queue y correo

El smoke verifica health, 404, 401, CORS y commit esperado antes de Pages. No requiere datos de residentes ni modifica cargos o pagos. Mantén email disabled; las deliveries se omiten y no se llama a Resend. Inspecciona Queue y DLQ solo con `deliveryId`; para detener temporalmente procesamiento, desactiva cron/consumer en configuración de Workers sin purgar mensajes ni borrar datos.

## Rollback y migraciones

Antes de promover, el workflow guarda versión previa y nueva. Si falla el smoke del Worker, ejecuta el comando de rollback guardado para promover la versión anterior al 100%; no borres Queue, R2, Pages, migraciones ni datos. Conserva deployments de Pages anteriores.

Las migraciones remotas no se revierten automáticamente. Ante una migración fallida, detén el release, corrige con una migración nueva y vuelve a ejecutar el plan. Nunca uses `db reset --linked`, repair automático ni SQL improvisado en remoto.
