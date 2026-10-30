# HABITTA — Manifiesto de Release A (puntos 2, 3, 4, 5, 7, 12 y 26)

**Fecha de entrega:** 2026-10-30  
**Candidato técnico:** `main` = `3b1ce70402ad99da1920651f064a2e9cb5f3b4a8`.

El SHA anterior fue obtenido en esta entrega mediante `git rev-parse main`; también
coincidía con `origin/main`. Es un candidato de código integrado, no una versión
productiva ni una autorización de promoción.

> **NO-GO / sólo evidencia.** Este manifiesto no autoriza ni ejecuta despliegues,
> publicaciones, SQL, cambios de RLS, permisos, migraciones ni acceso a sistemas de
> producción. No reemplaza la auditoría humana independiente ni la aprobación del
> Founder. Los estados `IMPLEMENTED_MAIN / TESTED parcial` no equivalen a
> `ACCEPTED` ni a `RELEASED_VERIFIED`.

## Fuentes y criterio de lectura

La evidencia de implementación y de CI que se consolida abajo procede de
[`docs/HABITTA-LIVE-STATUS.md`](../HABITTA-LIVE-STATUS.md) (en particular, las
secciones de #604, #606, #595/#596 y #591/#592) y de
[`docs/HABITTA-PILOT-30-STATUS.md`](../HABITTA-PILOT-30-STATUS.md) (matriz de los
puntos 2, 3, 4, 5, 7, 12 y 26). Los cuatro checks indicados son evidencia histórica
en el HEAD de cada PR, no una afirmación de que se hayan repetido sobre el SHA
candidato `3b1ce70`.

## Cobertura por punto

| Punto | Implementación integrada y CI 4/4 citado | Pruebas reutilizables ya existentes | Verificación pendiente concreta |
| --- | --- | --- | --- |
| 2 — Dashboard: monto, concepto, sujeto y estado | PR #592, merge `afc304c6f9a5b04b433777c497119875caee3d4a`, HEAD de PR `106dc5919355bee8be2b9b72dc03725cf951c617`. CI `40770809733`, pgTAP/DB `40770809827`, Playwright `40770809598` y Financial E2E `40770809772`: **4/4 SUCCESS**. | 19/19 focales locales reportadas; DOM de dashboard (`dashboard-action-clarity.dom.test.tsx` y deep links), más las etapas CI pgTAP/DB, Playwright y Financial E2E del PR. | QA visual autenticada por rol: residente debe ver sólo sus movimientos; administrador/revisor debe ver monto, concepto, unidad y estado correctos. Requiere aceptación Founder antes de release. |
| 3 — Separar acción propia y validación administrativa | Mismo PR #592 / merge `afc304c6` / HEAD `106dc591`; mismos cuatro workflows **SUCCESS** arriba citados. La evidencia documentada incluye el uso de `can_approve` independiente y el filtro de privacidad de movimientos. | Mismas 19/19 focales y pruebas DOM del dashboard; reutilizar las etapas pgTAP/DB, Playwright y Financial E2E exitosas de #592 para regresión. | QA visual multirol: confirmar que una corrección propia no aparece como aprobación administrativa y que los pagos bloqueados por independencia se muestran como pendientes de otro revisor. |
| 4 — Borradores residentes privados hasta envío | PR #604, merge `ffd2e2ac18d6bc7cc159b9a2325ce41942b44e85`, HEAD de PR `6e7dd96586ef847f2c41f40df62d92a5ea586e8b`. CI `40809994849`, pgTAP/DB `40809994889`, Playwright `40809994902` y Financial E2E `40809994699`: **4/4 SUCCESS**. | 170/170 pgTAP de pagos y 5/5 pgTAP de helpers staff; 40/40 API; y los jobs Playwright y Financial E2E de #604. | Smoke autenticado **multirol y Storage**: residente, admin autorizado y no autorizado; comprobar que los borradores, comprobantes, propuestas y recibos internos no se enumeran ni descargan fuera de su autorización. QA visual por rol y producción siguen pendientes. |
| 5 — Detalle/comprobante inmutable y privado | #589 merge `961f2f5e1c84dd4734e5cf3cf14bec9853a1b6fb`, #605 `c62e3eff70bc235936949c31db4604cfa7592a07` y PR #606 merge `1260631b7d8942c624707adfd644a8cdf7e84c39`; HEAD de #606 `e27dc2e18a374baaba39d5c358da49a431949530`. CI `40812735321`, pgTAP `40812735337`, Browser `40812735327` y Financial E2E `40812735265`: **4/4 SUCCESS**. | 33/33 API y 5/5 TypeScript reportados para #606; DOM de residente/revisión de #605; pgTAP, Browser/Playwright y Financial E2E de #606. La ruta GET ya diferencia 204/403/404. | Smoke R2 de objetos **históricos**: 204 sin prueba, 403 sin acceso y 404 para objeto faltante; validar headers privados/no-store/nosniff y la inmutabilidad tras envío. Después, QA visual autenticada por rol. |
| 7 — Referencia de operación y comentario opcional | PR #596, merge `ec3b9241a2366c0b7c985f5e62a7657eeca4a8cd`, HEAD de PR `d5b546bed387adf7b0c2a031424e474784316e7b`. CI `40794238997`, pgTAP `40794238821`, Playwright `40794239001` y Financial E2E `40794238990`: **4/4 SUCCESS**. | 13 pruebas web y 33 API focales reportadas; pruebas de copy/captura/detalle, y las etapas pgTAP, Playwright y Financial E2E de #596. | QA visual por rol para captura, corrección, detalle, recepción y revisión: referencia requerida u opcional según método, comentario siempre opcional y sin alterar ledger. |
| 12 — Saldo de obligación desde ledger (`12 − 5 = 7`) | PR #595, merge `40f6c9a1862900bb7bcbdc75bcc813c46f2e619c`, HEAD de PR `26a9eca5c5cc430d6d7da0dbd1dd990c1a95fb2d`. CI `40795264552`, pgTAP `40795266245`, Playwright `40795264739` y Financial E2E `40795264555`: **4/4 SUCCESS**. | Financial E2E autenticado de lifecycle que acredita `$12 - $5 = $7`; pruebas API de saldo/estado de cuenta y las etapas pgTAP y Playwright ya verdes de #595. | QA visual por rol del estado de cuenta y saldo estructurado; confirmar en entorno candidato que se conserva la autorización, aislamiento de condominio y que no aparece aplicación automática de crédito futuro. |
| 26 — Convenios: filtros, orden y paginación | PR #591, merge `5a5c0297d9b2556b8b49ff5ad1a9836af1a06b03`, HEAD de PR `6b74359af1dabf0d3324a8b6b6a75aae95c74db9`. CI `40770880345`, pgTAP/DB `40770880317`, Playwright `40770880361` y Financial E2E `40770880362`: **4/4 SUCCESS**. | 8/8 pgTAP local; API 516 y web 1057 reportados; pruebas de rutas de convenios y panel, más los jobs Playwright y Financial E2E de #591. | QA visual por rol de filtros unidad/persona/estado/importe/período/fecha, URL, orden y paginación; validar perfiles y latencia real antes de cualquier aceptación. |

## Riesgos y dependencias bloqueantes

| Dependencia | Riesgo para este candidato | Condición de salida humana (no ejecutada aquí) |
| --- | --- | --- |
| #569 — inventario de RPC privilegiados | La clasificación/revisión de funciones privilegiadas no está aprobada; no puede inferirse seguridad de un 4/4 histórico. | Revisión y decisión humana independiente del inventario y sus hallazgos. |
| #571 — auditoría humana independiente | Faltan dictamen AppSec, evidencia adversarial por tenant/rol y validación de Storage/R2; la automatización no la sustituye. | Sign-off de profesional humano independiente. |
| #573 — preflight/release | Sin backup/restore aislado validado, SHA de Pages certificado, smokes autenticados y aceptación del lote, no hay base para promover. | Preflight y aprobación explícita del Founder, con evidencia reproducible. |
| #612 — despliegue SQL automático | El estado/control del auto-deploy de base de datos sigue siendo un riesgo de promoción; este manifiesto no lo modifica ni lo resuelve. | Verificación humana del control de integración GitHub/Supabase y gate externo antes de integrar más SQL. |

**Las issues #569, #571, #573 y #612 siguen bloqueando el despliegue.** Todas
requieren revisión y aprobación humana o del Founder según corresponda. No se
propone en este documento ninguna solución ni cambio de producción para ellas.

## Rollback documental (no ejecutable desde este manifiesto)

Si un despliegue autorizado posterior necesitara revertirse, la referencia de
rollback documentada es el SHA productivo de Worker previamente verificado:
`9ae959d77f702f27cfa8ee52c6c095ad83744677` (24-oct-2026). La evidencia existente
no certifica un SHA de Cloudflare Pages; por ello, un operador autorizado debe
verificar el SHA productivo de Pages por su plano de control antes de definir una
acción equivalente.

El alcance de rollback es exclusivamente Worker/Pages al SHA productivo verificado,
siguiendo el runbook y la aprobación humana aplicables. **No tocar migraciones ya
aplicadas:** no se revierten, reejecutan ni alteran SQL, datos, RLS o permisos como
parte de este plan. Tras un rollback autorizado se deben conservar evidencia de SHA,
hora, responsable y smokes por rol, sin declarar el lote aceptado hasta nuevo
preflight, auditoría humana y aprobación del Founder.

## Declaración final

Este archivo es un manifiesto documental de candidato y de riesgos. No autoriza ni
ejecuta un despliegue, no sustituye auditoría humana y no sustituye la aprobación
del Founder. El estado de Release A permanece **BLOQUEADO / NO-GO**.
