# HABITTA — Release A preflight de solo lectura

**Alcance:** Evidencia automatizada de preparación técnica del lote A, **NO autoriza ni ejecuta deploy**. 29-oct-2026. Issue de release [#573](https://github.com/aragondaniel91/Habitta-app/issues/573), auditoría humana [#571](https://github.com/aragondaniel91/Habitta-app/issues/571) y desvío de cambios SQL [#612](https://github.com/aragondaniel91/Habitta-app/issues/612).

## Ejecución segura

Desde el repo:

```bash
pnpm release:pilot:preflight:test
pnpm release:pilot:preflight -- --online --json
```

El comando de preflight finaliza deliberadamente con **código 2** cuando produce `NO_GO` (no debe encadenarse con un deploy usando `&&`); el código 1 corresponde a error de ejecución. En pnpm 10 el separador `--` se transmite y el CLI lo descarta una sola vez. La ejecución online hace **únicamente cinco lecturas públicas**: GET de `/health`, GET no autenticado de `/v1/organizations` (debe responder 401), GET de ruta inexistente (404) y HEAD a `app.mihabitta.com` y `admin.mihabitta.com` (200). No usa sesiones privadas de usuarios, ni modifica SQL, Worker, Pages, Storage o GitHub.

Para comparar el **historial de versiones** con la base productiva, un operador autorizado obtiene una exportación read-only de `Supabase list_migrations` (un arreglo JSON con `version` de 14 dígitos, por ejemplo `{"migrations":[{"version":"20261029134919"}]}`), la guarda **fuera del repositorio y los artefactos de CI**, y ejecuta:

```bash
pnpm release:pilot:preflight -- --online --migration-history /ruta/privada/migration-versions.json
```

El inventario local procede de `git ls-tree HEAD` (commit exacto), **no** de archivos de migración sin confirmar. Si hay cambios en el worktree, se muestra el control `candidate_commit_tree_clean=BLOCK`. Se detectan migraciones del código ausentes en el historial productivo, así como versiones productivas no presentes en el árbol del candidato. Un match acredita **paridad del registro de versiones**, NO que el schema real sea idéntico ni que las migraciones hayan tenido un despliegue aprobado.

Para certificar SHA del frontend se pueden consultar **directamente** dos endpoints read-only de Cloudflare Pages (proyecto y dominio canónico) con `--cloudflare-live` y `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` de alcance mínimo. El token **nunca se imprime**. Sin credenciales, la verificación del SHA de Pages continúa `UNKNOWN`. También se acepta `--pages-control-plane /ruta/privada/snapshot.json` solo para inspeccionar estructura: aun cuando coincida el SHA, un archivo suministrado no demuestra autenticidad y queda `UNKNOWN`.

## Resultado y gates obligatorios

El script devuelve una matriz `PASS`, `BLOCK`, `UNKNOWN` o `HUMAN_REQUIRED` y siempre `releaseDecision=NO_GO`. No recibe flags para levantar manualmente #571, #573 o #612. **Jamás confundir un resultado de preflight con una aprobación humana de seguridad o un release autorizado.**

- **#612:** confirmar en Supabase Dashboard → Project Settings → Integrations → GitHub Integration el estado real de `Deploy to production`. Mientras esté sin comprobar/desactivar o colocar tras un gate externo, **no integrar migraciones SQL adicionales**. La evidencia indica despliegue productivo de DB tras merge a main, sin un nuevo workflow Production Release.
- **#571:** inventario de RPCs privilegiados #569 y revisión AppSec completa por profesional humano independiente, con evidencias de aislamiento tenant, roles y Storage/R2, control financiero, dependencias y findings. No sustituir con IA.
- **#573:** restauración real de backup en ambiente aislado, rollback Worker/Pages, SHA de frontend por control plane, smokes autenticados, métricas y aprobación explícita del Founder para el lote.
- **Feature flag:** `VITE_ENABLE_BOARD_GROUPS_PREVIEW=false` en build del candidato hasta QA autenticada de junta.

## Verificación realizada en esta sesión

Base `main` en `78bc6948fcf2d42289eddfd8c4bae69fb6f5d890`, Worker respondió `9ae959d77f702f27cfa8ee52c6c095ad83744677` (del 24-oct), rutas públicas 401/404, frontend HTTP 200, historial Supabase Production **203** entradas y **203** versiones SQL en el commit candidato, con comparación por versión **sin faltantes ni versiones extra** (`missingInProduction=[]`, `unknownInRepository=[]`); esa coincidencia no prueba autorización ni ausencia de drift. El control de Pages sigue sin SHA certificado. **NO-GO**.

Este documento es la guía de ingeniería que debe mantenerse junto con `docs/HABITTA-LIVE-STATUS.md` y `docs/release/HABITTA-PILOT-28-READINESS-20261029.md`. La rama de implementación **no contiene migraciones SQL**; no debe activar el auto-deploy de Supabase.
