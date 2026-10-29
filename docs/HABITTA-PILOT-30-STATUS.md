# HABITTA — Matriz verificable del piloto (30 puntos)
**Fecha de corte:** 2026-10-28 (conciliación tras PRs #591 y #592) · **Epic:** [#515](https://github.com/aragondaniel91/Habitta-app/issues/515) · **Fuente de verdad:** issues, PRs, main, pipelines y despliegues.

## Regla de estado
- **Base parcial**: ya existe infraestructura o UX relacionada, pero **NO** equivale a aceptación del punto completo.
- **Candidato aislado**: trabajo local descrito en el issue, separado del `main` verificado; **no se presume integrado ni publicado**.
- **Pendiente**: falta implementación completa y/o verificación específica.
- **Investigación**: falta caso reproducible y alcance para certificar.
- **Planificado**: necesidad descrita en el epic, sin constancia de entrega ni decisión técnica/comercial final.
- **RELEASED_VERIFIED** requiere SHA y entorno reales, smoke por rol, aceptación y evidencia. **Ninguno de los 30 puntos del epic tiene a la fecha esa evidencia individual completa**; esto no significa que HABITTA carezca de funcionalidades en producción.

| Nº | Entregable original del piloto | Estado comprobable / brecha inmediata |
| --- | --- | --- |
| 1 | KPIs del dashboard con navegación a listados filtrados | **IMPLEMENTED_MAIN parcial:** PR #588 integra enlaces KPI y filtros contextuales; falta recorrido/aceptación por rol y verificación productiva. |
| 2 | Dashboard: monto, concepto, sujeto y estado visible | **IMPLEMENTED_MAIN / TESTED parcial:** #592 MERGED `afc304c` incluye monto, concepto, unidad y estado, 4/4 pipelines GREEN; pendiente aceptación UX/rol y release. |
| 3 | Diferenciar acciones del usuario y validacion administrativa | **IMPLEMENTED_MAIN / TESTED parcial:** #592 MERGED con privacidad en movimientos y `can_approve` independiente; 19/19 pruebas focales y 4/4 workflows; pendiente aceptación por rol y release. |
| 4 | Borradores residentes privados de admin hasta enviar | **Candidato aislado R6** [#522](https://github.com/aragondaniel91/Habitta-app/issues/522). SQL/RLS de pagos y eventos de auditoría, pgTAP y visual no certificados ni publicados como entrega del piloto. |
| 5 | Detalle inmutable de pago enviado, soporte/estado/comprobante | **IMPLEMENTED_MAIN / TESTED parcial:** PR #589 MERGED en `961f2f5`, comprobante inmutable tras envío, tests DB/Browser/Financial E2E GREEN; falta aceptación integral del detalle por rol y producción. |
| 6 | Rendimiento Pagos/Cuotas/Gastos p75/p95 y waterfall | Pendiente de medición reproducible y mejora cuantificada. |
| 7 | Referencia de operación vs descripción opcional | **IMPLEMENTED_MAIN / TESTED parcial:** PR #596 MERGED `ec3b924`; referencia según configuración de método, comentario para revisión opcional y consistencia en captura/corrección/detalle; 4/4 workflows GREEN. Falta aceptación visual por rol y release. |
| 8 | “Informacional” que no ve el administrador | **Investigación abierta** [#521](https://github.com/aragondaniel91/Habitta-app/issues/521); falta objeto, pantalla, rol y caso reproducible. |
| 9 | Asistente multi-cargo de pago residente; administrador revisa desglose; corrección | **Candidato aislado P1/P2B** [#516](https://github.com/aragondaniel91/Habitta-app/issues/516); sin pgTAP integrado ni aceptación visual y sin sobrepago resuelto. Mantener reversos auditados para pagos aprobados. |
| 10 | Modales centrados, páginas para flujos largos y tabs | Base parcial de UX; pendiente revisión global de Finanzas/Personas. |
| 11 | Operación de cuotas mensuales con estética Gastos | Pendiente de rediseño integral y verificación financiera. |
| 12 | Saldo por obligación calculado del ledger (12–5=7) | **IMPLEMENTED_MAIN / TESTED parcial:** PR #595 MERGED `40f6c9a`; E2E autenticado valida deuda $12 - pago aprobado $5 = saldo $7 según ledger, además del estado de cuenta estructurado; 4/4 workflows GREEN. Falta aceptación visual, integración en producción. |
| 13 | Sobrepago 5–4.50 y crédito 0.50 aplicado bajo reglas | **IMPLEMENTED_MAIN / TESTED parcial:** #587 ofrece créditos autorizados por unidad/moneda; PR #595 MERGED `40f6c9a` verifica E2E $5 sobre $4,50 = incremento exacto $0,50 en crédito. No certifica aplicación automática futura, aceptación visual ni release. |
| 14 | CRUD de unidades, desactivar/archivar con historial/auditoría | **IMPLEMENTED_MAIN parcial:** PR #586 incorpora creación/archivado/reactivación auditadas y aislamiento RLS. Validar recorrido CRUD y aceptación por rol antes de certificar el punto. |
| 15 | Onboarding topológico: edificios/apartamentos/casas | Corrección de topología [HAB-507 / #507](https://github.com/aragondaniel91/Habitta-app/issues/507) registrada; aceptación integral de todas las variantes pendiente. |
| 16 | Casa única/sin torre y conjunto de casas sin apartamento falso | Base de navegación de casas documentada en [#507](https://github.com/aragondaniel91/Habitta-app/issues/507); certificación por escenario pendiente. |
| 17 | Ajustes del residente limitados a rol/delegaciones | Pendiente de aceptación UX y pruebas RBAC específicas. |
| 18 | Asistente IA contextual para residente | **Planificado** [#520](https://github.com/aragondaniel91/Habitta-app/issues/520); sin autorización de acceso a datos o mutación autónoma. |
| 19 | Propiedad patrimonial y ocupación en entidades separadas | Base de tablas y roles existente; revisión de vigencias, sumas y reglas completa pendiente. |
| 20 | Personas y vínculos por topología | Base parcial; cerrar cobertura de roles, altas/bajas y autorizaciones. |
| 21 | Junta/comité o responsable de hogar configurable | Base parcial/preview de Junta; el flag debe mantenerse **OFF en el release** y su configuración real debe verificarse, no declararse apagada sin evidencia del entorno. |
| 22 | Membresías con períodos, roles y capacidades | Base parcial; catálogo, períodos, auditoría y autorización integral pendientes. |
| 23 | Fin de vínculo revoca acceso actual sin borrar historia | Pendiente de pruebas negativas de revocación y conservación histórica. |
| 24 | Estándar visual de Gastos en Finanzas y Personas | Base parcial; barrido coherente y aceptación visual final pendientes. |
| 25 | Tesorería: conciliaciones por período, extracto y libro auxiliar | Base de Tesorería existente; ampliación y conciliación exhaustiva pendientes. |
| 26 | Convenios: filtros de unidad/persona/estado/importe/período/fecha | **IMPLEMENTED_MAIN / TESTED parcial:** #591 MERGED `5a5c029`; filtros/orden/URL, paginación SQL RLS, importe exacto `numeric`, 8/8 pgTAP local, API516/web1057, 4/4 workflows GREEN. Pendiente visual, perfiles, latencia real y release. |
| 27 | Formularios simples centrados vs drawers interminables | Base parcial; aplicar coherentemente a la experiencia completa y accesibilidad. |
| 28 | Asistente IA de administración, reportes auditables y RAG | Planificado [#520](https://github.com/aragondaniel91/Habitta-app/issues/520); requiere autorización servidor, presupuesto y controles de IA. |
| 29 | Navegación profunda Personas ↔ Unidades ↔ CxC ↔ Pagos | **IMPLEMENTED_MAIN parcial:** PR #588 agrega vínculos y filtros contextuales; faltan recorrido bidireccional completo, roles y aceptación. |
| 30 | Workspace CxC: aging, deuda, crédito, saldos y cobranza | **IMPLEMENTED_MAIN parcial:** #587 añade crédito autorizado y drilldown al estado de cuenta; aging/cobranza/conciliación y aceptación siguen pendientes. |

## Integración de sprint #585 — 2026-10-28

- **#596 MERGED:** `ec3b9241a2366c0b7c985f5e62a7657eeca4a8cd` / head `d5b546bed387adf7b0c2a031424e474784316e7b`, 4/4 SUCCESS: CI 40794238997, pgTAP 40794238821, Browser 40794239001 y Financial E2E 40794238990; #7 avance funcional sin release.
- **#595 MERGED:** `40f6c9a1862900bb7bcbdc75bcc813c46f2e619c` / head `26a9eca5c5cc430d6d7da0dbd1dd990c1a95fb2d`, 4/4 SUCCESS: CI 40795264552, pgTAP 40795266245, Browser 40795264739 y Financial E2E 40795264555; #12/#13 recorridos financieros auténticos, sin aplicación de crédito futura ni release.
- **#23:** Candidato PR #594 sometido a revisión; P2 residuales en issue #597 (vínculos históricos, votación/avisos). No marcado completo ni desplegado.


- **#592 MERGED:** HEAD `106dc5919355bee8be2b9b72dc03725cf951c617`, 4/4 SUCCESS (CI 40770809733, pgTAP 40770809827, Playwright 40770809598, Financial E2E 40770809772), merge `afc304c6f9a5b04b433777c497119875caee3d4a`. Ítems #2/#3 avances parciales testeados.
- **#591 MERGED:** HEAD `6b74359af1dabf0d3324a8b6b6a75aae95c74db9`, 4/4 SUCCESS (CI 40770880345, pgTAP 40770880317, Playwright 40770880361, Financial E2E 40770880362), merge `5a5c0297d9b2556b8b49ff5ad1a9836af1a06b03`. Ítem #26 funcionalidad integrada, falta QA visual/rol y prod.

- **#586/#587/#588/#589 MERGED** con evidencia funcional parcial (no aceptación completa). #589 HEAD `cf40bcef0c63be88d141b785647c771218bf0e74` obtuvo los cuatro checks SUCCESS: CI 40766261988, pgTAP 40766262234, Playwright 40766261949, Financial E2E 40766262013; merge `961f2f5e1c84dd4734e5cf3cf14bec9853a1b6fb`.
- **#18 y #28 (IA)** pospuestos por decisión Founder; 28 ítems activos con fecha objetivo 30 oct. Ninguno se marca RELEASED_VERIFIED por estos merges. Auditoría humana #571 y Release #573 siguen bloqueando promoción a producción.

## Frente de entrega y evidencias

| Frente | Seguimiento | Estado al corte |
| --- | --- | --- |
| Seguridad pagos/drafts/auditoría | [#522](https://github.com/aragondaniel91/Habitta-app/issues/522) | El issue #522 describe un **R6 local etiquetado READY_FOR_FOUNDER en Delivery Mode**, pero retiene explícitamente Founder Accept, pgTAP real y visual autenticado: a efectos de integración, **BLOQUEADO / NO READY**. No pedir revisión visual mientras falten esos gates. |
| Multi-cargo y corrección | [#516](https://github.com/aragondaniel91/Habitta-app/issues/516) | Candidato local no certificado; el punto #13 de sobrepago no está implementado en el primer wizard. |
| UX/rendimiento | [#517](https://github.com/aragondaniel91/Habitta-app/issues/517) | Abierto, sin baseline p75/p95 verificado. |
| Topología/unidades/personas/junta | [#518](https://github.com/aragondaniel91/Habitta-app/issues/518) | Abierto. Existen capacidades base de estructura y navegación documentadas en [main](https://github.com/aragondaniel91/Habitta-app/blob/8a9c7044b4602e516fb41a5ba1b2c5eee9ee5cc8/apps/api/src/structure-routes.ts) y [#507](https://github.com/aragondaniel91/Habitta-app/issues/507), pero no entrega formal completa. |
| CxC/Tesorería | [#519](https://github.com/aragondaniel91/Habitta-app/issues/519) | Abierto. No sustituir con aceptación visual previa de módulos P4/P5/P6. |
| IA | [#520](https://github.com/aragondaniel91/Habitta-app/issues/520) | Planificado, sin prometer integración ni costos. |
| “Informacional” | [#521](https://github.com/aragondaniel91/Habitta-app/issues/521) | Reproducción pendiente. |

## Baseline técnico verificado (no confundir con 30 puntos certificados)
- **GitHub main (última conciliación):** [`40f6c9a1862900bb7bcbdc75bcc813c46f2e619c`](https://github.com/aragondaniel91/Habitta-app/commit/40f6c9a1862900bb7bcbdc75bcc813c46f2e619c) (#595/#596 integrados). Código integrado ≠ desplegado.
- **Cuatro workflows históricos de main sobre SHA #583 (NO sobre el HEAD actual):** [CI run 40752725714](https://github.com/aragondaniel91/Habitta-app/actions/runs/40752725714), [Supabase DB / pgTAP 40752725856](https://github.com/aragondaniel91/Habitta-app/actions/runs/40752725856), [Financial E2E 40752726258](https://github.com/aragondaniel91/Habitta-app/actions/runs/40752726258) y [Playwright 40752725491](https://github.com/aragondaniel91/Habitta-app/actions/runs/40752725491).
- **Pruebas de seguridad:** PR #582, #583 añadieron aislamiento real con Auth y Worker locales entre condominios de una organización y entre organizaciones distintas; la suite Financial E2E [run 40751849179](https://github.com/aragondaniel91/Habitta-app/actions/runs/40751849179) en HEAD del PR #583 reportó 33 passed / 20 skipped **en toda la suite**, con dos casos cross-org nuevos obligatorios, no 33 puntos del piloto. La fuente agregada de 20 skips no prueba cobertura de todos los escenarios del epic. Esta cifra **no es** progreso de 33/30 puntos.
- **API producción /health:** commit `9ae959d77f702f27cfa8ee52c6c095ad83744677` (2026-10-24). [Production Release run 40117141200](https://github.com/aragondaniel91/Habitta-app/actions/runs/40117141200) SUCCESS sobre ese commit; el endpoint productivo confirmó el mismo SHA el 28-oct. No se verificó nuevo deploy ni versión exacta de Cloudflare Pages.
- **RELEASE A BLOCKED:** [#573](https://github.com/aragondaniel91/Habitta-app/issues/573) y [#571](https://github.com/aragondaniel91/Habitta-app/issues/571) abiertos por auditoría independiente humana y revisión [#569](https://github.com/aragondaniel91/Habitta-app/pull/569) de funciones privilegiadas. No saltarse gates.
- **Aprobación visual Founder requerida sólo cuando exista candidato reproducible** que haya pasado pruebas reales, revisión y esté marcado READY_FOR_FOUNDER con URL/pantallas/casos. No pedir revisión de prototipos bloqueados. El despliegue protegido requiere auditoría y preflight antes de lanzamiento.

## Equivalencia de seguimiento

Las categorías de esta matriz describen **evidencia actual**, no un estado de ejecución SDP. Se mapean a `SPEC/BUILD/REVIEW/FOUNDER_ACCEPT/MERGED/RELEASED_VERIFIED`: *planificado* ≈ SPEC; *candidato aislado* ≈ BUILD/REVIEW (sin aceptación); *base parcial* indica funcionalidad preexistente que **no** autoriza FOUNDER_ACCEPT ni RELEASED_VERIFIED del punto; *investigación* necesita discovery y reproducción. Para todos los 30 ítems, el cierre completo y evidencia RELEASED_VERIFIED **siguen sin constar**.

Definiciones: P5 = módulo CxC existente (no equivale a #30); R6 = candidato local acumulado de seguridad de pagos (#522); P1/P2B = candidatos locales del asistente de pago (#516). La aprobación visual de otros módulos no se transfiere al alcance nuevo del epic.

## Siguiente secuencia sin loops

1. Preparar paquete de evidencia y revisión **humana** de seguridad #571, especialmente #569; no ejecutar cambios SQL privilegiados en producción.
2. Confirmar diff y candidato SHA para Release A, rollback, backup/restore, flag Junta OFF y pruebas por roles sobre release candidate; solo deploy al pasar gates.
3. Retomar **P0 del piloto**, primero privacidad RLS/auditoría #4 y detalle #5; ejecutar pgTAP de R6 en CI aislado, resolver, luego Founder visual específico si es necesario.
4. Cerrar asistente multi-cargo #9 + conciliación #12/#13 (requiere política real para crédito futuro), UX/rendimiento #1–3/#6 y dominio #14–23 según dependencias; después CxC/tesorería e IA.
5. Actualizar cada fila con evidencia `SPEC/BUILD/REVIEW/FOUNDER_ACCEPT/MERGED/RELEASED_VERIFIED` y SHA + aceptación; no usar “0/30 implementado” ni “30/30 terminado” sin soporte.

**Esta matriz es un estado de evidencia, no una afirmación de que todas las funcionalidades deban reconstruirse.**
