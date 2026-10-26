# HABITTA — Estado vivo del proyecto / SDP

**Revisado manualmente:** 2026-10-24. **Repositorio:** `aragondaniel91/Habitta-app`.
**Lectura obligatoria** al iniciar una sesión nueva de ChatGPT, Claude o Codex. Este Markdown **no se sincroniza solo**: cada entrega debe actualizarlo mediante PR; el estado en GitHub (checks, issue, commit y deploy) es la fuente de verdad y debe reconsultarse. Prohibido inventar completitud.

## Checkpoint SDP verificado — 2026-10-26 (sesión de continuidad)

**Fuente de verdad: GitHub, lectura de 2026-10-26.** Este checkpoint sustituye el resumen histórico anterior cuando difieran; NO presupone despliegue de producción ni aceptación de cambios funcionales.

| Elemento | Estado real y evidencia |
| --- | --- |
| `main` | HEAD `7e42d1e097a162a10cee67f0dfb1cf18b248dfa8` — merge PR [#545](https://github.com/aragondaniel91/Habitta-app/pull/545), 2026-10-26 |
| Topología / cobro por edificio #545 | **MERGED en main**, NO equivale a release verificado ni a flujo comercial extremo a extremo |
| Siguiente PR activo | [#559](https://github.com/aragondaniel91/Habitta-app/pull/559), OPEN, no draft, head `0b19dc2477346fb114f48217c57396b212750897` |
| #559 calidad | **PASS en SHA exacto**: CI run `40379661278`, pgTAP `40379661386`, Playwright `40379661489`, Financial E2E `40379661204` |
| #559 review SDP | **IN_REVIEW** — revisiones formales de GitHub: ninguna al consultar; Claude independiente NO certificado en esta sesión; aprobación visual Founder indicada en descripción del PR (2026-10-26) |
| #559 alcance | Directorio físico autenticado **solo lectura** + juntas/modos **ilustrativos**; NO juntas persistentes, delegaciones financieras ni release |
| PR anterior | [#557](https://github.com/aragondaniel91/Habitta-app/pull/557) OPEN DRAFT, superseded por #559; no duplicar integración |
| Seguridad transversal | [#528](https://github.com/aragondaniel91/Habitta-app/issues/528) OPEN, **P0 de control de release** previo al cambio Supabase 2026-10-30: inventario GRANT/RLS, pruebas de roles/tenancy, migración reproducible y despliegue seguro. Su etiqueta histórica P1 no equivale a cierre |
| SDP operativo | [#549](https://github.com/aragondaniel91/Habitta-app/issues/549) OPEN / BLOCKED: ejecución real Codex + revisión Claude no certificada; no atribuirles trabajo no ejecutado |
| Administración mixta | [#553](https://github.com/aragondaniel91/Habitta-app/issues/553) OPEN, P1 / BACKLOG; fases de autonomía financiera requieren contratos, decisión Founder y pruebas separadas |
| Producción | **NO VERIFICADA / NO AUTORIZADA** para #559 y nuevas capacidades |
| Próxima acción | Conseguir revisión independiente real del diff #559; validar SDP 4/4 y permisos, resolver comentarios; solo entonces considerar merge protegido. En paralelo priorizar #528 con pruebas concretas; después #553/#552 (juntas y permisos), planes y onboarding |

**Decisión de priorización SDP:** cerrar de forma segura el PR de integración #559 antes de introducir cambios funcionales adicionales; #528 tiene urgencia de seguridad por fecha y bloquea nuevas migraciones/release hasta validar GRANT/RLS. La aprobación visual no autoriza producción. Conservar los 30 requerimientos sin marcarlos DONE por inferencia.

**Nueva política de solicitudes del Founder:** petición general de disciplina de intake, deduplicación, prioridad, issue, estado y PR protegido recibida el 2026-10-26. Es una reiteración del contrato ya versionado por PR #548, por lo que **no se crea feature duplicada**. Se ejecutará sobre cada solicitud funcional futura.

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

| 2026-10-26 | Recuperación SDP desde GitHub | #545 merged a main `7e42d1e`; #559 OPEN `0b19dc2` con 4 workflows exitosos; revisión Claude independiente no certificada. Próxima: reviewer #559, SDP gate, #528 Supabase, sin deploy. |

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
