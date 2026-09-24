# Captura de walkthroughs de Producción

Use este procedimiento solo para evidencia de walkthroughs en Producción. No cambia producto, datos, credenciales ni metadata por sí mismo.

## Antes de capturar

1. Confirme el SHA exacto del release desplegado en Producción: debe ser un valor hexadecimal de 40 caracteres. No capture con un SHA abreviado, supuesto o no verificable.
2. Use exclusivamente las identidades sintéticas de demo de Producción: el administrador de HAB-416 y los residentes de HAB-423, iniciando sesión en `app.mihabitta.com` según el flujo. Consulte los runbooks existentes [HAB-416](../HAB-416-production-demo-bootstrap.md) y [HAB-423](../HAB-423-production-demo-resident-access.md); no copie su contenido de credenciales ni ejecute sus procedimientos de bootstrap para esta tarea.
3. La ausencia de cualquiera de los archivos locales de credenciales de HAB-416/HAB-423 bloquea la captura. No restablezca credenciales, no exponga secretos, contraseñas ni JWTs, no fabrique capturas y no marque metadata como capturada para continuar.

## Procedimiento seguro

1. Consulte `apps/web/src/features/help/walkthrough-metadata.ts`, la fuente canónica del registro y ciclo de vida. Tome de allí el `workflowId`, audiencia y campos de evidencia; capture solo flujos registrados y pendientes.
2. Complete el flujo usando solo los datos sintéticos de demo. No incluya residentes reales ni PII real en pantalla, archivos o registros.
3. Guarde cada imagen en almacenamiento seguro y determinista como `production-walkthroughs/<releaseSha>/<workflowId>.png`. Use el SHA completo y el `workflowId` canónico; no use nombres ambiguos ni sobrescriba evidencia de otro SHA.
4. Revise visualmente cada imagen antes de registrar evidencia. Debe estar libre de PII real, secretos, JWTs y contraseñas, incluso en barras del navegador, modales, URLs, consolas o logs.
5. Solo después de aprobar esa revisión, registre el estado `captured-production` conforme al contrato de metadata: `sourceUrl`, `capturedAt`, `releaseSha` (el SHA confirmado de 40 caracteres) y `piiReview: 'approved'`, junto con el `screenshotAsset` de la ruta determinista. Si algún campo no cumple el contrato, deje el flujo pendiente.

No use este runbook para modificar código, pruebas, UI, navegación, autenticación, RLS, API, base de datos, comportamiento financiero, suscripciones, onboarding, correo, despliegues, capturas existentes o credenciales.
