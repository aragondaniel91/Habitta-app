# HABITTA — Estado vivo del proyecto / SDP

**Revisado manualmente:** 2026-10-24. **Repositorio:** `aragondaniel91/Habitta-app`.
**Lectura obligatoria** al iniciar una sesión nueva de ChatGPT, Claude o Codex. Este Markdown **no se sincroniza solo**: cada entrega debe actualizarlo mediante PR; el estado en GitHub (checks, issue, commit y deploy) es la fuente de verdad y debe reconsultarse. Prohibido inventar completitud.

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

**Baseline pública confirmada:** Production Worker `/health` responde `status=ok`, commit `9ae959d77f702f27cfa8ee52c6c095ad83744677` del 2026-10-24. En ese commit ya existen páginas operativas de `ResidentPaymentsPage.tsx` (incluye referencias a estados draft/correction_requested), `UnitsPage.tsx`, `ReceivablesPage.tsx` y `TreasuryPage.tsx`. Esto verifica **presencia del código de las superficies en la versión desplegada del backend** y su existencia en el árbol Git de esa versión, pero **no** demuestra funcionamiento por rol, UX completa, permiso RLS, ni que el bundle frontend servido se haya verificado en navegador en este checkpoint.

**Main vs producción:** `9748dfb44f2d294004fa4ac14494503d31eaa971` tiene 20 commits posteriores; hay cambios funcionales en unidades, estructura y vista de juntas, además de pruebas. No marcar novedades de main como publicadas sin evidencia del SHA de Worker/Pages correspondiente. Preview de juntas apagado por defecto.

**Nuevo método obligatorio por cada uno de los 30 puntos:**
- `DEPLOYED_BASE`: se identificó una funcionalidad parcial/relacionada en commit desplegado, **sin afirmar aceptación completa**.
- `IMPLEMENTED_MAIN`: existe funcionalidad no certificada como desplegada.
- `TESTED`: pruebas relevantes documentadas, incluyendo casos negativos según riesgo.
- `ACCEPTED`: criterio específico validado visual/funcionalmente por Founder o piloto.
- `RELEASED_VERIFIED`: comportamiento completo probado en URL productiva, con evidencia por rol y SHA.
- `NOT_VERIFIED`: no hay evidencia suficiente; no equivale a 'sin código'.

La primera conciliación debe revisar en producción con usuarios de prueba permitidos: dashboard (1-3), pagos (4-13), unidades/personas (14-17, 19-23), tesorería/CxC (25, 29, 30) y AI (18,28); anotar por número evidencias, capturas o pruebas, SHA, brecha concreta y decisión de aceptación. Evitar declaraciones agregadas inventadas de 0 o 30 puntos implementados. El issue #515 es el epic funcional; #573 sigue el release incremental; #571 la seguridad.

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
| 7 | Referencia y descripción en pagos | POR VERIFICAR | #516 |
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
| 23 | Fin de vínculo revoca activo, conserva historia | POR VERIFICAR | #518 |
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
