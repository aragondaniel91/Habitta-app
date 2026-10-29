# HABITTA — Estado vivo del proyecto / SDP

**Revisado manualmente:** 2026-10-28. **Repositorio:** `aragondaniel91/Habitta-app`.
**Lectura obligatoria** al iniciar una sesión nueva de ChatGPT, Claude o Codex. Este Markdown **no se sincroniza solo**: cada entrega debe actualizarlo mediante PR; el estado en GitHub (checks, issue, commit y deploy) es la fuente de verdad y debe reconsultarse. Prohibido inventar completitud.

## SDP — seguridad de vínculos #597 integrada en main (2026-10-28)

- **GitHub main comprobado:** `fdbef1be2f5c540bce72e700f10aedaa14d3baee` (último merge #601), incluyendo PR #600 merge `f21052524a3efa62fd0376835dd1c74aa761d36c`. Reconsultar GitHub al retomar; código integrado **NO** significa publicado.
- **#600, acceso a configuración de mora y documentos:** HEAD `b6e97c9cab7855a829390c1c69cc80a77c20a503` con 4/4 workflows SUCCESS (CI 40800776078, pgTAP 40800776251, Playwright 40800776096, Financial E2E 40800776273), **24/24 pgTAP local** bajo rollback con migraciones #594. Rechaza propietario/inquilino con vínculo caducado, inquilino con fecha de inicio futura, lectura cross-tenant; conserva acceso staff/board e incluye pruebas de versiones/descarga de documentos de expropietarios. Revisión independiente inicial P2 de inicio futuro, reparado y revisado en segundo commit.
- **#601, Anuncios y adjuntos:** HEAD `ae0d8d7242c253d68976b042bba64754a2d6210f` con 4/4 SUCCESS (CI 40801177541, pgTAP 40801177554, Playwright 40801177576, Financial E2E 40801177552). **51/51 pgTAP local** y 6/6 API tests; protege envíos, lecturas, destinatarios históricos, adjuntos y acuses con relaciones vigentes, con snapshot de destinatarios preservado para auditoría. Revisión independiente sin hallazgos accionables. SQL probado en DB sintética local con rollback; se aisló temporalmente un fixture antiguo expirado ajeno al suite.
- **Integración posterior a los merges:** worktree limpio en `fdbef1b`, 5/5 paquetes TypeScript y 49/49 pruebas API focales PASS.
- **Brechas por decidir antes de cerrar #23:** [issue #597](https://github.com/aragondaniel91/Habitta-app/issues/597): voto congelado tras transferencia de la última unidad y revocación intradía (actual `ends_at` es date inclusivo; requiere política temporal); aceptación de UX y roles; #571 firma humana independiente sigue requerida.
- **Producción no promovida:** Worker /health verificado nuevamente en `9ae959d77f702f27cfa8ee52c6c095ad83744677` (build 2026-10-24), SHA Pages no acreditado. #571 auditoría humana de ciberseguridad y #573 release preflight son gates bloqueantes. No declarar 28/28 ni #23 RELEASED_VERIFIED; IA #18/#28 diferidos.

## Checkpoint local piloto #12/#13 (#516/#519) — 2026-10-28

- **Estado: CANDIDATE parcial, no aceptado ni liberado.** Desde el SHA base `151ee9b701da6789f810e04c1172ba9026021804`, se conectó el drawer existente de estado de cuenta al RPC autorizado `get_unit_account_statement`; no se creó un ledger, crédito, aplicación futura ni conversión nuevos.
- **Prueba prevista (solo Supabase/Worker local):** residente presenta USD 5.00 contra cargo USD 12.00 y revisor independiente aprueba: CxC conserva USD 7.00. Luego USD 5.00 contra USD 4.50: CxC administrativo y estado de cuenta del residente muestran USD 0.50 sin aplicar, separado por moneda. El caso niega al administrador de otro condominio el estado de cuenta y no le enumera créditos.
- **Límites:** la prueba usa aprobación normal, RLS y token del llamante; no hay bypass de `approve_payment`, RLS/grants nuevos, minting, aplicación silenciosa ni FX. Ejecución, CI, revisión humana y Founder Accept siguen pendientes; producción no fue consultada ni modificada.

## Sprint #585 — cierre de integración #594 (2026-10-28)

- **GitHub main HEAD:** `8e8ddcdf9fac063f62e7857dfd4dddbd6706507d`, PR #594 MERGED (seguridad de roles por vínculo vigente). También incluye #595 `40f6c9a1862900bb7bcbdc75bcc813c46f2e619c`, #596 `ec3b9241a2366c0b7c985f5e62a7657eeca4a8cd` y #598 `2f09b506f0081f5e8a7f929ee8b10cf4a440115c`. Reconsultar GitHub al retomar.
- **#594 exact-HEAD:** `5a572cfe890fc694741b4e8788fcb3ef9e3378df` con CI 40796127866, Supabase DB 40796127832, Playwright 40796127831 y Financial E2E 40796128113 — 4/4 SUCCESS. Local PostgreSQL **24/24 pgTAP** con rollback, incluyendo salvaguarda de acceso a conceptos financieros sin ampliar audiencia; suites heredadas de documentos/governance validadas. Claude Code en revisión independiente estática previa aprobó merge sin P0/P1 y dio seguimientos P2, registrados en [#597](https://github.com/aragondaniel91/Habitta-app/issues/597). **No equivale a cierre integral del punto #23**.
- **Integración combinada de main** comprobada en worktree limpio sobre `8e8ddcd`: 5/5 TypeScript packages, 43/43 tests API focales, 13/13 tests web focales, `git diff --check` PASS.
- **Producción NO promovida:** Worker `/health` verificado nuevamente en `9ae959d77f702f27cfa8ee52c6c095ad83744677` (build 2026-10-24); Pages SHA no certificado. #571 (aprobación humana de seguridad) y #573 (release preflight) siguen bloqueando deployment. Puntos #18/#28 (IA) siguen pospuestos.

## Sprint #585 — evidencias integradas (2026-10-28, PRs #595/#596)

- **Main comprobado tras merge #595:** `40f6c9a1862900bb7bcbdc75bcc813c46f2e619c`. Incluye PR #596 merge `ec3b9241a2366c0b7c985f5e62a7657eeca4a8cd` (campos de pagos) y PR #595 merge `40f6c9a1862900bb7bcbdc75bcc813c46f2e619c` (saldos y créditos). Reconsultar GitHub al retomar.
- **#596 / punto #7:** HEAD `d5b546bed387adf7b0c2a031424e474784316e7b`, 4/4 pipelines SUCCESS (CI 40794238997, pgTAP 40794238821, Playwright 40794239001, Financial E2E 40794238990), 13 web/33 API pruebas focales PASS. Referencia requerida u opcional según método de pago, comentario siempre opcional; recepción y revisión muestran valores sin modificar ledger.
- **#595 / puntos #12/#13:** HEAD `26a9eca5c5cc430d6d7da0dbd1dd990c1a95fb2d`, 4/4 SUCCESS (CI 40795264552, pgTAP 40795266245, Playwright 40795264739, Financial E2E 40795264555). Estado de cuenta con autorización y mensajes saneados; E2E: $12 - $5 = $7 deuda y $5 - $4,50 = $0,50 incremento de crédito a favor autorizado por unidad/moneda, con aislamiento entre condominios. No aplica automáticamente créditos futuros.
- **Seguridad / punto #23:** PR #594 candidato separado; sigue sin certificar aplicación de reglas para miembros históricos y sin resolver el modelo de votación/fin de vigencia intradía. Riesgos residuales documentados en [#597](https://github.com/aragondaniel91/Habitta-app/issues/597).
- **Release:** integración en main **no implica deploy**. Último Worker productivo confirmado por /health en esta sesión: `9ae959d77f702f27cfa8ee52c6c095ad83744677` (2026-10-24). SHA productivo de Pages no comprobado. #571 revisión humana independiente y #573 preflight siguen bloqueando promoción; 28/28 no se declaran ACCEPTED o RELEASED_VERIFIED.

## Integración consolidada sprint #585 — 2026-10-28 (último merge #591)

- **Main luego de #591:** `5a5c0297d9b2556b8b49ff5ad1a9836af1a06b03` (squash; incluye #592 `afc304c6f9a5b04b433777c497119875caee3d4a`, #590 `d44002ec1ad8ee312a01db29e02510f613e55275`, #589 `961f2f5e1c84dd4734e5cf3cf14bec9853a1b6fb`). Reconsultar HEAD al retomar.
- **#592 dashboard #2/#3**, PR HEAD `106dc5919355bee8be2b9b72dc03725cf951c617`: CI 40770809733, Supabase DB 40770809827, Playwright 40770809598 y Financial E2E 40770809772 SUCCESS. 19/19 pruebas locales. Revisión independiente corrigió privacidad de pagos del residente y aprobación independiente `can_approve`. **IMPLEMENTED_MAIN / TESTED parcial**, pendiente Founder Accept por rol.
- **#591 convenios #26**, PR HEAD `6b74359af1dabf0d3324a8b6b6a75aae95c74db9`: CI 40770880345, Supabase DB 40770880317, Playwright 40770880361, Financial E2E 40770880362 SUCCESS. SQL `SECURITY INVOKER` con RLS, REVOKE/GRANT explícitos, paginación/count en BD y `numeric` exacto. Test local API 516 / web 1057, 8/8 pgTAP local, re-revisión independiente sin hallazgos introducidos por la reparación. **IMPLEMENTED_MAIN / TESTED parcial**, pendiente verificación visual/operacional y producción.
- **No se ha desplegado ni autorizado release** de estos merges. Última API productiva verificada `9ae959d77f702f27cfa8ee52c6c095ad83744677` (2026-10-24), Pages SHA aún sin comprobar. No sustituir aprobación humana #571 ni preflight #573.
- **Matriz 28 no-IA:** la integración de una parte funcional no es aceptación integral del ítem; siguen 28 pendientes de cierre individual RELEASED_VERIFIED. Puntos IA #18 y #28 pospuestos al próximo ciclo.

## Sprint #585 — checkpoint de integración verificado (2026-10-28)

### PR #592 — dashboard de acciones (integrado a main, no desplegado)

- Puntos piloto #2/#3: tarjetas financieras residentes y administrativas con monto, concepto, unidad y estado comprensibles, separando correcciones propias de revisión administrativa.
- Revisión SDP halló privacidad transversal en lista de movimientos recientes y falsa señal de aprobación propia. Se corrigió filtrando los movimientos recientes del residente por autor y computando aprobaciones administrativas exclusivamente con `can_approve === true`; los pagos bloqueados por independencia se muestran como pendientes de otro revisor.
- Pruebas focales locales 19/19 PASS, typecheck PASS; 4 workflows GREEN sobre `106dc5919355bee8be2b9b72dc03725cf951c617`; merge `afc304c6f9a5b04b433777c497119875caee3d4a`. #571/#573 siguen bloqueando producción.


- **Main HEAD luego de PR #589:** `961f2f5e1c84dd4734e5cf3cf14bec9853a1b6fb` ([merge #589](https://github.com/aragondaniel91/Habitta-app/pull/589)); incluye #586 (archivado auditado), #587 (crédito a favor visible) y #588 (KPI y vínculos contextuales). Se debe volver a consultar GitHub al retomar.
- **#589:** código SQL/UX y pruebas corregidas para que un comprobante enviado (`submitted`/`under_review`) sea inmutable; reemplazo únicamente en `draft`/`correction_requested`. HEAD `cf40bcef0c63be88d141b785647c771218bf0e74` con CI run 40766261988 SUCCESS, Supabase DB run 40766262234 SUCCESS, Playwright run 40766261949 SUCCESS y Financial E2E run 40766262013 SUCCESS. Revisión estática adicional en worktree separado; esto **NO** reemplaza auditoría humana #571.
- **Evidencia por ítem**: #1/#29 reciben navegación parcial (#588); #5/#9 endurecimiento del comprobante (#589); #13/#30 visualización de crédito parcial (#587); #14 auditoría de archivado parcial (#586). No declarar ninguno `ACCEPTED` o `RELEASED_VERIFIED` sin pruebas/aceptación individual.
- **Objetivo del sprint:** 28 puntos sin IA para el 2026-10-30 (#585). #18/#28 pospuestos. Estado de la tarea y pendientes en [#585](https://github.com/aragondaniel91/Habitta-app/issues/585); `main` y producción son entidades distintas.
- **Release:** #571 (revisión humana de ciberseguridad) y #573 (preflight/release) abiertos; último Worker productivo comprobado sigue `9ae959d77f702f27cfa8ee52c6c095ad83744677` del 2026-10-24; SHA de Pages no confirmado. **NO desplegado** por estas integraciones.

## SDP — correcciones tras revisión Claude del PR #559 (2026-10-26)

- **Issue/PR:** #518/#553, [PR #559](https://github.com/aragondaniel91/Habitta-app/pull/559); rama `hab-557-main-integration`; builder Codex CLI desde worktree aislado `C:\Development\Reviews\Habitta-PR559`; commit `6bc23cb` (confirmar SHA completo en PR).
- **Estado:** **IN_REVIEW / DRAFT**. Claude Code revisó de forma independiente HEAD anterior `0b19dc2` y emitió **CHANGES REQUIRED**, documentado en [comentario](https://github.com/aragondaniel91/Habitta-app/pull/559#issuecomment-6429296463). Las correcciones presentes aún **no tienen revisión Claude nueva**.
- **Cambios verificables:** `VITE_ENABLE_BOARD_GROUPS_PREVIEW` controla la ruta de demostración, **deshabilitada por defecto**; etiquetas explícitas para indicadores, listas, perfiles y juntas ficticias; texto neutral sobre facturación dependiente de modalidad; defensa ante respuesta API no-lista; corrección del texto de ayuda; pruebas unitarias focalizadas. No hay cambio en schema, RLS o ledger. La vista autenticada del directorio real sigue siendo parte de la propuesta, pero el preview queda oculto por defecto.
- **Verificación:** `git diff --check` PASS en checkout local; pruebas ejecutables locales **NO EJECUTADAS** (sin node_modules en worktree aislado); cuatro CI obligatorios sobre nuevo HEAD **PENDIENTES**. Auditoría parcial #528 todavía no constituye cierre del gate de producción.
- **Pendientes:** validar CI exacto y pruebas focalizadas, re-review Claude de `6bc23cb`, resolver hallazgos restantes (end-to-end autenticado, minimización de datos de endpoint compartido, fixture visual y workaround registry), confirmar visual Founder cuando se habilite demo, control #528 de cambios de BD y preflight de release. **NO MERGE / NO PRODUCTION** sin gates SDP.

### SDP #559 — Segunda revisión Claude y correcciones incrementales (2026-10-26)

- **Claude independiente** re-revisó solo-lectura `0b19dc2..6bc23cb` desde Daragon-PC; veredicto **CHANGES REQUIRED**: el control por feature flag y las etiquetas de demo quedaron correctos; detectó riesgos de typecheck al indexar `matrixLabels[route.key]` y E2E sin flag. Informó otros pendientes de baja prioridad sobre data minimization, help y paridad.
- **Correcciones posteriores:** commit `6179a2e` normaliza Prettier tras fallo real en quality; commit `29029b8de370ea1ee03484f8f801a034784cc815` corrige indexado tipado en test y habilita flag en Playwright local solo al disponer de credenciales del test de juntas. El código original del PR sigue fuera de producción.
- **Nuevo HEAD y gates:** SHA `29029b8de370ea1ee03484f8f801a034784cc815`; los cuatro workflows **PASS** al verificarse el SHA `812fbbc9` (la nueva actualización documental requiere revalidación de HEAD), no afirmar PASS. Revisión Claude del HEAD completo posterior a las correcciones **PENDIENTE**. PR #559 en **DRAFT**.
- **Limitaciones de aceptación:** pruebas reales con credenciales del directorio, control de acceso mismo-condominio para no-admins, minimización de columnas sin romper endpoint compartido, scripts de fixtures y justificación del registry CI requieren seguimiento. #528 GRANT/RLS efectivo y preflight de migraciones siguen bloqueando liberación automática; no hubo merge ni despliegue.

### SDP #559 — Revisión independiente final (2026-10-26)

- **SHA revisado:** `812fbbc9f2268d02ecd437e36ccc43d9f4d6eaae`. Claude Code revisó el diff desde main en worktree independiente, **solo lectura**. **Veredicto: apto para MERGE con `VITE_ENABLE_BOARD_GROUPS_PREVIEW` apagado; NO apto para habilitar el demo en producción**. Sin cambio de permisos/ledger; no se desplegó.
- **GitHub CI en ese SHA:** quality PASS, pgTAP PASS, Financial E2E PASS, public-browser PASS. Claude validó estáticamente flag por defecto desactivado, fallback de URL directa, avisos de datos ficticios, texto contable neutro, parsing seguro, correcciones TypeScript y configuración E2E local.
- **No confundir aprobación de integración con liberación de demo:** para habilitar flag hacen falta E2E autenticado real sin mocks, prueba de acceso denegado a no-admin del mismo condominio, minimización segura de columnas del endpoint compartido, validación visual y gate Supabase #528.
- **Deuda no bloqueante para merge:** actualizar matriz de paridad para lectura autenticada de edificios, ajustar ayuda que sugiere una confirmación inexistente, documentar registry Docker Hub CI. No declarar lo anterior DONE.
- **Próxima acción:** merge protegido del PR #559 solo con bandera apagada si los gates de su nuevo SHA siguen verdes; registrar SHA de merge y después realizar release preflight separado. `main` no equivale a producción.

## Resumen / continuidad inmediata

| Elemento | Estado |
| --- | --- |
| Trabajo activo | HAB-PILOT-004 C2 — cobrar a edificios completos como unidades financieras |
| Issue principal | [#518](https://github.com/aragondaniel91/Habitta-app/issues/518) |
| Pull request activo | [#545](https://github.com/aragondaniel91/Habitta-app/pull/545) — **DRAFT** en última consulta |
| SHA candidato observado | `39e385c82009c86c3f0d64e1d1d5814eadbd4cfc` — **reconfirmar HEAD al retomarlo** |
| CI para dicho SHA | PASS, run 40119908045 |
| Supabase Database Tests | PASS, run 40119908037 |
| Financial E2E | PASS, run 40119908062 |
| Playwright Browser Tests | PASS, run 40119908088 |
| SDP 4/4 | **NO CERTIFICADO**; cuatro CI verdes no prueban por sí solos el SDP |
| Claude reviewer / Founder visual | **Pendientes de verificación / aceptación** |
| Producción | No consta liberación del PR #545 |
| Último checkpoint | [Comentario SDP del PR](https://github.com/aragondaniel91/Habitta-app/pull/545#issuecomment-6388711172) |
| Próxima acción | Auditar permisos de junta/delegados, conteo de unidades facturables por plan, onboarding y E2E de cuota→pago→CxC→estado de cuenta→tesorería por edificio |
| Riesgo transversal P0 | [#528 permisos Supabase](https://github.com/aragondaniel91/Habitta-app/issues/528): GRANT mínimos y RLS probados antes del 2026-10-30 |

### Contrato de topología

1. Condominio de edificio → unidades cobrables **apartamentos**.
2. Condominio general con 10 edificios → **10 unidades cobrables de tipo edificio**, cada edificio físico vinculado una sola vez. Junta/representante es contacto autorizado **sin porcentaje de propiedad implícito**.
3. Condominio general de casas → unidades cobrables **casas**. Prohibidos apartamentos/torres ficticios.

Mantener `units.id` como clave financiera y `buildings` como entidad física. Nunca replicar una obligación del edificio a sus apartamentos, ni cambiar automáticamente la granularidad contable de clientes existentes. Rechazar duplicados/cross-tenant en BD y probar RLS. Véase [modelo detallado](architecture/HAB-PILOT-004-billable-entity-model.md).

## Conciliación funcional: producción ≠ cierre formal del piloto (2026-10-27)

**Corrección importante al indicador '0/30 released':** el inventario de los 30 requisitos registra **cero cierres formalmente certificados por ítem**, no significa que no existan funcionalidades publicadas. No debe usarse '0/30' como porcentaje de producto disponible. Requiere conciliación por comportamiento observable y aceptación de cada punto.

**Baseline pública confirmada:** Production Worker `/health` responde `status=ok`, commit `9ae959d77f702f27cfa8ee52c6c095ad83744677` del 2026-10-24. En el árbol Git de ese commit existen archivos frontend `ResidentPaymentsPage.tsx` (con referencias a draft/correction_requested), `UnitsPage.tsx`, `ReceivablesPage.tsx` y `TreasuryPage.tsx`. El SHA de `/health` acredita únicamente el **Worker backend**; aún NO se verificó el SHA publicado de Cloudflare Pages/frontend. La existencia de esos archivos **no** demuestra que las páginas estén publicadas, operativas o aceptadas por rol, ni que las políticas RLS sean correctas.

**Main vs Worker productivo:** `main` (`9748dfb44f2d294004fa4ac14494503d31eaa971`) está 20 commits por delante del SHA `9ae959d77f702f27cfa8ee52c6c095ad83744677` desplegado el 2026-10-24. Hay cambios funcionales en unidades, estructura y vista de juntas, además de pruebas. No marcar novedades de main como publicadas sin evidencia independiente de SHA de Worker y de Pages. En main, el preview de juntas está apagado por defecto.

**Nuevo método obligatorio por cada uno de los 30 puntos:**
- `DEPLOYED_BASE`: se comprobó el SHA de despliegue del componente correspondiente (Worker para backend y Pages para frontend) y el código relacionado, **sin afirmar aceptación completa**.
- `IMPLEMENTED_MAIN`: existe funcionalidad no certificada como desplegada.
- `TESTED`: pruebas relevantes documentadas, incluyendo casos negativos según riesgo.
- `ACCEPTED`: criterio específico validado visual/funcionalmente por Founder o piloto.
- `RELEASED_VERIFIED`: comportamiento completo probado en URL productiva, con evidencia por rol y SHA.
- `NOT_VERIFIED`: no hay evidencia suficiente; no equivale a 'sin código'.

Los estados anteriores son **etiquetas de evidencia acumulativas**, no niveles exclusivos: un punto puede tener `IMPLEMENTED_MAIN` y `TESTED` sin `ACCEPTED` ni `RELEASED_VERIFIED`. El vocabulario histórico de la tabla se conserva como síntesis: `POR VERIFICAR` equivale a `NOT_VERIFIED`, `PARCIAL` y `EN CURSO` implican evidencia aún incompleta, y `RELEASED` solo se asigna si existe `RELEASED_VERIFIED` con SHA y comportamiento productivo probado. La primera conciliación debe cubrir **los 30 puntos sin excepciones**: dashboard (1-3), pagos (4-13), unidades/personas (14-17, 19-23), IA (18,28), UX transversal (24,26,27), tesorería/CxC (25,29,30); anotar por número evidencias, capturas o pruebas, SHA, brecha concreta y decisión de aceptación. Evitar declaraciones agregadas inventadas de 0 o 30 puntos implementados. El issue #515 es el epic funcional; #573 sigue el release incremental; #571 la seguridad.

## Backlog maestro: 30 puntos del piloto

**Interpretación de estados:** `POR VERIFICAR` indica que no se demostró cierre, no necesariamente ausencia de código. `PARCIAL` indica evidencia técnica o desarrollo sin aceptación integral. `EN CURSO` es trabajo activo. Solo `RELEASED` con SHA y evidencia de producción permite cerrar el ítem.

| # | Petición original resumida | Estado comprobable | Tracking |
| --- | --- | --- | --- |
| 1 | Atajos dashboard a pagos filtrados | POR VERIFICAR | #517 |
| 2 | Acciones pendientes con monto/concepto | POR VERIFICAR | #515 |
| 3 | Separación acciones vs validaciones | POR VERIFICAR | #515 |
| 4 | Borradores privados del residente | PARCIAL; revalidar RLS | #515 #522 |
| 5 | Detalle enviado inmutable para residente | PARCIAL; revalidar estados | #516 |
| 6 | Latencia Pagos/Cuotas/Gastos | POR MEDIR | #517 |
| 7 | Referencia y descripción en pagos | CANDIDATO LOCAL: referencia de operación condicional por método y comentario separado; pendiente pruebas/aceptación | #516 |
| 8 | Informacional invisible al admin | POR REPRODUCIR | #521 |
| 9 | Wizard multicuota y revisión/corrección | PARCIAL | #516 |
| 10 | Modales centrados y páginas para flujos largos | POR VERIFICAR | #517 |
| 11 | Operación cuotas mensuales UX | POR VERIFICAR | #517 |
| 12 | Saldo restante 12−5=7 | TEST FOCAL PASS; UX POR VERIFICAR | #516 |
| 13 | Sobrepago 5−4.5=.50 y reutilización | LEDGER TEST PASS; UX/USO PENDIENTE | #516 |
| 14 | Crear/editar/archivar unidades | PARCIAL | #518 |
| 15 | Onboarding admin | POR VERIFICAR | #518 #483 |
| 16 | Casas/edificios sin apartamentos ficticios | EN CURSO — PR #545 | #518 |
| 17 | Ajustes de residente por permisos | POR VERIFICAR | #517 |
| 18 | Chatbot soporte | ESPECIFICADO, NO LANZADO | #520 |
| 19 | % propiedad solo propietarios | PARCIAL, AUTORIZACIÓN PENDIENTE | #518 |
| 20 | Personas: junta de edificios y familia casas | POR VERIFICAR | #518 |
| 21 | Módulo junta/comité de condominio | POR VERIFICAR | #518 |
| 22 | Opciones de ocupación en vínculos | POR VERIFICAR | #518 |
| 23 | Fin de vínculo revoca activo, conserva historia | CANDIDATO PARCIAL LOCAL; pgTAP pendiente de ejecución. El cierre efectivo de propiedad/ocupación conserva historia y revoca accesos derivados; no hay aceptación, merge ni despliegue. Junta/representante de directorio no es grant de `board_member`, y `ends_at` es inclusivo hasta fin de día: requieren decisión de enlace/granularidad para revocación de junta y cierre intradía. | #518 |
| 24 | Patrón visual de Gastos para otros módulos | POR VERIFICAR | #517 |
| 25 | Tesorería conciliaciones, extractos, libros | PARCIAL | #519 |
| 26 | Filtrar convenios como cartera de cargos | POR VERIFICAR | #517 |
| 27 | Pestañas para evitar scroll interminable | POR VERIFICAR | #517 |
| 28 | IA para explicar cuotas y generar reportes | ESPECIFICADO, NO LANZADO | #520 |
| 29 | Atajos Personas/Unidades/CxC y búsqueda | PARCIAL | #517 |
| 30 | CxC workspace de cobranza separado de estado cuenta | PARCIAL | #519 |

## Otras iniciativas críticas

- [#515](https://github.com/aragondaniel91/Habitta-app/issues/515): épica original de los 30 puntos y criterios de aceptación.
- [#516](https://github.com/aragondaniel91/Habitta-app/issues/516): pagos multicuota, borradores, revisión y crédito. La [verdad financiera](financial-truth-foundation-2026-10-23.md) documenta pruebas focalizadas $12−$5=$7 y $5−$4.50=$0.50; wizard de sobrepago/reutilización **no cerrado**.
- [#517](https://github.com/aragondaniel91/Habitta-app/issues/517): UX, dashboards, rendimiento, filtros.
- [#518](https://github.com/aragondaniel91/Habitta-app/issues/518): topología, unidades, personas y juntas.
- [#519](https://github.com/aragondaniel91/Habitta-app/issues/519): cobranza/CxC y tesorería.
- [#520](https://github.com/aragondaniel91/Habitta-app/issues/520): IA autorizada, inicialmente de solo lectura.
- [#483](https://github.com/aragondaniel91/Habitta-app/issues/483): onboarding comercial / Platform Admin.
- [#528](https://github.com/aragondaniel91/Habitta-app/issues/528): Supabase 30/10, GRANT/RLS y aislamiento.

## Nueva entrega de documentación — PR #547

- **Fecha:** 2026-10-24. **Estado:** MERGED en `main` (merge `64ae537e728803cca29474470f4f480a22749169`; verificado previamente).
- Corrige el contrato de arquitectura para distinguir la situación histórica de la implementación candidata en PR #545. **No incorpora nuevas funciones ni concede permisos**, no cambia contabilidad ni producción.
- **Próximo paso:** continuar la certificación técnica de #545.

## Política obligatoria de ingreso y priorización de solicitudes nuevas

**La expresión del Founder “agrega”, “mejora”, “falta”, “necesitamos” o la descripción de un bug/feature inicia un intake**, incluso si se intercala en otro trabajo. El agente debe:

1. Buscar duplicados, implementaciones existentes e issues relacionados; conservar intacta la numeración de los 30 puntos originales.
2. Evaluar con SDP impacto en seguridad/integridad financiera, desbloqueo del piloto, ingreso comercial, UX, complejidad, dependencias y esfuerzo. Prioridades: **P0** seguridad/datos/finanzas/bloqueo grave; **P1** crítico para clientes/lanzamiento/ingresos; **P2** UX u operación importante; **P3** complementario.
3. Crear un issue nuevo o ampliar uno existente con criterios de aceptación y pruebas por rol/topología. No crear duplicados; dar ID estable a nuevos requerimientos.
4. Registrar cada solicitud en una sección `Nuevas solicitudes (después de los 30)` de este archivo con **ID/issue, prioridad, estado, responsable, dependencia, próxima acción y evidencia**. Si GitHub no está accesible, marcar explícitamente “pendiente de registrar” y no fingir persistencia.
5. Repriorizar respetando dependencias y trabajo activo; una idea nueva no desplaza una entrega segura por defecto. No pasar de backlog a implementación o producción sin los gates correspondientes.
6. Actualizar este documento mediante un PR protegido **en la misma entrega** (o PR documental vinculado), y comunicar al Founder la prioridad asignada.

**Estados:** BACKLOG, READY, IN_PROGRESS, BLOCKED, IN_REVIEW, DONE (con evidencia real de merge/release cuando corresponda). El estado DONE no puede inferirse de que hay código o de que un agente afirmó éxito.

### Nuevas solicitudes (después de los 30)

| ID | Feature/corrección | Prioridad | Estado | Issue / PR | Dependencias y próxima acción |
| --- | --- | --- | --- | --- | --- |
| — | Sin solicitudes adicionales registradas en este documento al corte del 2026-10-24 | — | — | — | Agregar aquí cada nuevo requerimiento; no sobrescribir los 30 originales |

## Protocolo de actualización continua SDP — OBLIGATORIO

**DISCOVER:** al abrir cualquier chat, leer este documento en `main`, verificar último estado vivo de #545, #515 y branches/CI/deploy. No asumir que este checkpoint sigue siendo HEAD.

**SPECIFY:** antes de BUILD, definir resultado visible, límites, dependencias, negativos RBAC/RLS, prueba financiera, rollback y Founder gates.

**BUILD:** Codex construye en branch/worktree aislado, registra archivos y pruebas; Claude realiza revisión **independiente** del SHA, no se acepta informe autorreferencial.

**VERIFY:** exigir los cuatro workflows, tests locales relevantes, pgTAP y verificación multi-tenant, SDP 4/4 con evidencia, Founder visual cuando aplique; no etiquetar PASS sin ejecución.

**RELEASE:** solo si gates y autorizaciones aplicables están completos. Preservar contratos congelados y ledger inmutable. No hacer cambios destructivos, monetarios, planes/costos de proveedor o producción sin puerta adecuada.

**RECORD:** actualizar esta tabla y «Resumen», anotando SHA, issue/PR, estado y fecha. **Ningún PR funcional debe considerarse finalizado sin actualizar este archivo** en el mismo PR o PR documental asociado. Evitar escribir sobre `main` directamente: mantener branch protection.

### Checkpoint verificado — Entrega A (2026-10-28)

- **GitHub main**: `1cc806672a8236f114b618fe80a71ed6c0839dbd` (PR #579 merged); workflows de CI, Supabase Database Tests, Financial E2E y Playwright **SUCCESS** sobre ese mismo SHA.
- **Hardening integrado**: PR #575 (rechazo de payload no-array del directorio), #576 (JSON malformado → 502), #577 (pgTAP de UPDATE cross-tenant denegado), #578 (rechazo de filas de otro condominio / asignaciones ajenas), #579 (pruebas de ocupantes ajenos e identidad de condominio faltante). Estos merges NO equivalen a despliegue productivo ni a aceptación de los 30 puntos.
- **Producción**: último workflow `Production Release` exitoso apunta a `9ae959d77f702f27cfa8ee52c6c095ad83744677` (2026-10-24). No se verificó un release posterior.
- **P0 BLOCKED**: issue #571 abierto; requiere pruebas adversariales autenticadas de rol/tenant en staging autorizado con datos sintéticos y aprobación de profesional humano independiente; PR #569 de inventario privileged RPC sigue draft y no debe utilizarse como si estuviera aprobado.
- **Próximo trabajo real**: clasificar controles aún sin evidencia, ejecutar los negativos autenticados entre tenant A/B en entorno aislado y cerrar hallazgos con PR independientes. Promoción protegida sólo con gates y signoff completos. No etiquetar ningún ítem de #515 como RELEASED sin evidencia de producción.

### Release A — autenticación real en entorno aislado (28-oct-2026)

- **Trabajo propuesto**: PR de pruebas E2E autenticadas en `e2e/tests/financial-release-a-tenant-isolation.spec.ts`: Supabase Auth local, dos administradores de condominios y un residente restringido de la fixture financiera existente; peticiones por el Worker local; controles de lectura `units` y `units-directory` en ambos sentidos y PATCH ajeno con verificación posterior de invariancia.
- **Entorno de ejecución**: GitHub Actions `Financial E2E` con Supabase `localhost:54321` y Worker `localhost:8787`, datos sintéticos que se eliminan después. No usar llaves de producción, no incluir tokens ni rastros autenticados en artifacts.
- **Estado**: IN_REVIEW / NO APROBADO hasta que el run realmente ejecute los nuevos casos, pase los cuatro controles, revisión independiente y merge; registrar evidencia exacta en #571/#573.
- **Alcance no cubierto**: ambos condominios son de la misma organización; faltan cruces entre organizaciones, storage/documentos, otros roles y pruebas adversariales externas. Auditoría humana independiente #571 y revisión de RPC #569 siguen bloqueando producción. Un CI verde no cambia estos estados por sí solo.

### Release A — extensión de pruebas entre organizaciones (28-oct-2026)

- **Evidencia previa confirmada**: PR #582 MERGED, commit `3013718f6ad31b3a07e4365923f98eca26703427`; pipeline Financial E2E del HEAD `a64f689b90a1bbeb8935d322ffcc38be61641511` SUCCESS, 31 passed/20 skipped para toda la suite. Los casos nuevos con auth real fueron obligatorios en CI y el PR obtuvo cuatro checks SUCCESS. Esto comprueba dos condominios de la misma organización, no organizaciones distintas.
- **Nueva cobertura propuesta**: mantener A/B dentro de la organización principal; agregar **organización C independiente**, condominio C, unidad C-301 y usuario administrador C con Supabase Auth local. Probar GET de unidades y directorio entre A/C en ambos sentidos; PATCH autorizado positivo de C, PATCH ajeno y combinaciones de URL de condominio propio + ID de unidad de otra organización, con verificación de estado y restauración.
- **Seguridad operacional**: exclusivamente Supabase y Worker locales, identidades ficticias; reset de fixture local al final del workflow; sin secrets de producción y sin artifacts de trazas autenticadas. No se crean migraciones ni se modifican grants/RLS de producción.
- **Estado**: IN_REVIEW / NO ACEPTADO hasta éxito real de pruebas, cuatro checks, revisión independiente y merge. La revisión humana integral #571 y PR #569 sobre funciones privilegiadas siguen bloqueando producción; cobertura E2E no los sustituye.

### Candidato local — filtros de convenios #585 (2026-10-28)

- **Estado:** DEVELOPMENT_CANDIDATE solamente. Implementación local de filtros validados de unidad, persona responsable, estado, importe, período y fecha; orden, paginación, persistencia de URL y estados accesibles de carga, vacío y restablecimiento.
- **Límites preservados:** no modifica ledger financiero, grants, RLS ni RBAC; es una mejora de lectura del workspace de convenios.
- **No producción:** no hay PR integrado, CI remoto, aceptación Founder ni despliegue verificado. No declarar RELEASED_VERIFIED ni usarlo como evidencia de producción hasta superar esos gates.

### Matriz de los 30 puntos del piloto — 2026-10-28

La conciliación individual con estados de evidencia (base parcial, candidato aislado, pendiente, investigación, planificado), gates pendientes de Founder y publicación está en [`docs/HABITTA-PILOT-30-STATUS.md`](./HABITTA-PILOT-30-STATUS.md), ligada a [#515](https://github.com/aragondaniel91/Habitta-app/issues/515). **Ninguno de los 30 puntos tiene constancia individual RELEASED_VERIFIED en el epic al corte**, aunque hay productos y módulos base ya existentes. `main` integra #583 SHA `8a9c7044b4602e516fb41a5ba1b2c5eee9ee5cc8` con los cuatro workflows SUCCESS, pero la API productiva permanece en `9ae959d77f702f27cfa8ee52c6c095ad83744677` y los gates de Release A [#573](https://github.com/aragondaniel91/Habitta-app/issues/573), auditoría humana [#571](https://github.com/aragondaniel91/Habitta-app/issues/571) y revisión privilegiada [#569](https://github.com/aragondaniel91/Habitta-app/pull/569) siguen abiertos. La versión exacta desplegada de Cloudflare Pages no está verificada. No solicitar revisión visual de candidatas R6/P1 sin pgTAP autenticado, revisión y entregable navegable.

### Registro de entregas

| Fecha | Tarea | Resultado y siguiente acción |
| --- | --- | --- |
| 2026-10-24 | Recuperación después de chat interrumpido | Identificado PR #545 y 4 workflows verdes para `39e385c`; checkpoint SDP registrado. Próximo: Junta/delegados, planes, onboarding y E2E; sin prueba de aceptación final. |
| 2026-10-24 | Crear tracking canónico | Documento inicial de 30 puntos; completar con cada entrega futura. |
| 2026-10-24 | Gobierno de nuevos requerimientos | Regla SDP para registrar y priorizar cada nueva solicitud; PR documental en preparación. |

### Plantilla para añadir al registro

```text
Fecha / asunto / issue:
Estado: DISCOVERY | SPEC | BUILD | REVIEW | BLOCKED | READY_FOR_FOUNDER | MERGED | RELEASED
Agente responsable y reviewer:
PR / branch / SHA:
Qué cambió (verificable):
CI / pgTAP / Financial E2E / Playwright / SDP n/4:
RLS/GRANT y casos negativos:
Aceptación Founder:
Producción verificada (sí/no, SHA):
Bloqueos / riesgos:
Próxima acción específica:
Ítems # actualizados:
```

**Prompt de recuperación universal:** «Trabaja en aragondaniel91/Habitta-app. Lee `docs/HABITTA-LIVE-STATUS.md` desde main; verifica el estado vivo de GitHub, CI, PR activo y contratos SDP. Continúa la siguiente acción sin repetir investigación innecesaria. Actualiza el documento como parte de cada entrega, sin asumir que una sesión anterior completó algo que no está evidenciado».
