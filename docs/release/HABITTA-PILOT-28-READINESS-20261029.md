# HABITTA — Readiness verificable del release del piloto (28 puntos sin IA)
**Auditoría:** 2026-10-29 · **Base GitHub:** `5cd71481a1099fc6c6092d885a9511e580355df9` · **Prod Worker consultado en vivo:** `9ae959d77f702f27cfa8ee52c6c095ad83744677` (build 2026-10-24T17:43:57Z).

**Estado:** NO-GO para un despliegue en este momento. Documento de ingeniería, NO aprobación de ciberseguridad, visual ni autorización de release.

## Qué se comprobó hoy
- GitHub compare `9ae959d...5cd7148`: 53 commits por delante, 0 por detrás y **10 migraciones SQL añadidas al árbol**, con modificaciones web/API/SQL/security; **las diez ya constan aplicadas en la historia de BD productiva**, aunque el Worker sigue viejo. No tratar la rama principal como un lote aislado.
- GitHub Actions PUSH sobre exactamente `5cd71481a1099fc6c6092d885a9511e580355df9`: CI **40880853473**, Database/pgTAP **40880853470**, Playwright **40880853294**, Financial E2E **40880853496**: los cuatro `success`. CI no certifica la cobertura funcional total ni reemplaza appsec humano.
- Live API `https://habitta-api-prod.aragondaniel91.workers.dev/health` respondió `status=ok`, `environment=production`, `commit=9ae959d...`, `buildTimestamp=2026-10-24T17:43:57Z`; endpoint privado de organizaciones sin token => HTTP 401; ruta desconocida => HTTP 404. Estos son smokes públicos **no autenticados** (excepto la negativa 401), no E2E productivos.
- `https://app.mihabitta.com` y `https://admin.mihabitta.com` respondieron HTTP 200 con cabeceras de seguridad. **No hay evidencia de SHA/asset→commit de Cloudflare Pages**; no declarar frontend actualizado ni un punto formalmente RELEASED_VERIFIED. **Migraciones productivas CONSULTADAS directamente en Habitta Production** (`kgsfaahixbcwcmykmhat`): 202 entradas, incluidos los diez archivos `20261028*`; corroborado con SELECT read-only en `supabase_migrations.schema_migrations`. **Historial aplicado no prueba por sí solo compatibilidad funcional ni ausencia de drift**.
- `.github/workflows/production-release.yml` valida un ref ancestro de `main`, ejecuta `supabase db push`, despliega Worker+Pages y smokes. **No tiene selector de puntos**. Para lotes independientes seleccionar/refactorizar un SHA ancestral válido o proponer ruta segura de release aprobado; no despachar `main` entero bajo nombre "A".
- `#569` DRAFT: inventario SECURITY DEFINER no apto, revisión encontró divulgación de `proconfig`, clasificación insegura de `search_path`, ausencia de semántica de default PUBLIC EXECUTE y falta de transacción RO/timeout. Fue bloqueada una reparación propuesta; **no eludir el control**, requerir autor humano autorizado y revisión independiente.
- `#571` sigue OPEN, falta aprobación de seguridad de profesional humano independiente; `#573` OPEN, sin preflight/restore/rollback aprobado.

## Security Advisor live — 2026-10-29 (advertencias ≠ hallazgos explotables)
Lectura no invasiva de `get_advisors(security)` sobre Habitta Production: 13 tablas RLS sin policies (INFO), 27 funciones con search_path mutable (WARN), 193 SECURITY DEFINER ejecutables por anon (WARN), 309 ejecutables por authenticated (WARN), una advertencia de protección de contraseñas filtradas (WARN). Requiere clasificación por firma de revisor independiente #571; **no copiar `proconfig` ni secretos a logs**, no asumir que todos sean vulnerabilidades. [Supabase Advisors](https://supabase.com/docs/guides/database/database-linter).

## Matriz de los 28 puntos del epic #515
**Convención:** "No certificado" indica que no existe evidencia individual de release + smoke por rol; NO implica que la capacidad no exista previamente en producción. **A** = código candidato verificable para el próximo lote una vez completados gates; **B** = QA/integración acotada por cerrar; **C** = producto/contrato/requisitos materiales pendientes. Ningún lote se puede desplegar hoy sin #571/#573.

| # | Funcionalidad | Implementación en main | Pruebas / aceptación visual | ¿En producción? | ¿Listo técnico para publicar hoy? | Falta exactamente | Lote |
|---|---|---|---|---|---|---|---|
| 1 | KPI dashboard → listados filtrados | #588 integrado, navegación parcial | Pruebas de enlaces; recorrido autenticado/UX pendiente | **No certificado** | No: cerrar validación focal | Completar ida/vuelta y validar por rol | B |
| 2 | Dashboard monto/concepto/unidad/estado | #592 integrado | 19 pruebas focales y 4/4; visual por rol pendiente | **No certificado** | Candidato de código, NO listo para deploy | Founder UX y smoke autenticado | A |
| 3 | Acciones propias vs revisión admin | #592 integrado, can_approve independiente | 19 focales y 4/4; visual pendiente | **No certificado** | Candidato de código, NO listo para deploy | Verificar estados/autoría y no autoaprobación | A |
| 4 | Borradores privados hasta submitted | #604 + R6/RLS integrados | 170 pgTAP +5 helper; API40 y 4/4; visual pendiente | **No certificado** | Candidato de código, NO listo para deploy | Smoke multirol/Storage en staging y seguridad humana | A |
| 5 | Detalle, comprobante, estado inmutable | #589/#605/#606 integrados | DOM, API33, 4/4; visual/objetos históricos pendiente | **No certificado** | Candidato de código, NO listo para deploy | Smoke R2 histórico 204/403/404 y revisión por rol | A |
| 6 | Rendimiento Pagos/Cuotas/Gastos | #607 optimiza solo Gastos | Bench sintético -58,7%; no p75/p95 reales | **No certificado** | No: alcance incompleto | p75/p95 autenticados de los tres módulos y resto de optimización | C |
| 7 | Referencia vs descripción opcional | #596 integrado | Web13/API33/4 workflows; visual pendiente | **No certificado** | Candidato de código, NO listo para deploy | Aceptación residente/corrección/revisor | A |
| 8 | Informacional no visible a admin | Investigación #521 | Sin caso reproducido | **No certificado** | No: alcance incompleto | Registrar objeto, rol, pantalla y reproducir | C |
| 9 | Wizard multicargo con revisión y corrección | #603/#605 y wizard existente | SQL46, DOM3, 4/4; E2E negocio/visual integral pendiente | **No certificado** | No: cerrar validación focal | QA Auth extremo a extremo, desglose/corrección y aceptación | B |
| 10 | Modales, páginas largas y tabs | Base UX parcial | Barrido global no acreditado | **No certificado** | No: alcance incompleto | Auditoría UX y accesibilidad transversal | C |
| 11 | Cuotas mensuales con UX Gastos | Base parcial | Sin cierre financiero/visual | **No certificado** | No: alcance incompleto | Rediseño completo, publicar y probar ledger | C |
| 12 | Saldo por obligación desde ledger | #595 integrado | E2E 12−5=7 y 4/4; visual pendiente | **No certificado** | Candidato de código, NO listo para deploy | Aceptación estados/CxC por rol | A |
| 13 | Sobrepago y aplicación del crédito | #587/#595 calculan crédito 0,50 | E2E crédito 0,50; aplicación futura no probada | **No certificado** | No: alcance incompleto | Contrato de aplicación del crédito y flujo E2E posterior | C |
| 14 | CRUD unidades/archivar con historial | #586 integrado parcialmente | Tests de SQL/RLS; aceptación CRUD pendiente | **No certificado** | No: cerrar validación focal | Recorrido rol+auditoría+archivado/reactivación | B |
| 15 | Topologías edificios/apartamentos/casas | Base #507 en main | Aceptación variantes pendiente | **No certificado** | No: alcance incompleto | E2E onboarding para 3 variantes | C |
| 16 | Casa sin torre/apartamento ficticio | Base topológica en main | E2E final por modalidad pendiente | **No certificado** | No: alcance incompleto | Validar no crear unidades fantasma | C |
| 17 | Ajustes residente según delegación | Base parcial | Matriz RBAC/visual incompleta | **No certificado** | No: alcance incompleto | Completar pantallas por rol y negativos | C |
| 19 | Propiedad patrimonial y ocupación | Tablas base | Sin cierre vigencias y sumas | **No certificado** | No: alcance incompleto | Modelo relación/porcentaje/vigencia | C |
| 20 | Personas y vínculos topológicos | Base parcial | Casos altas/bajas/autorizaciones abiertos | **No certificado** | No: alcance incompleto | Cerrar matriz de permisos | C |
| 21 | Junta/comité o responsable configurable | Preview y base; flag OFF obligatorio | No habilitable productivamente | **No certificado** | No: alcance incompleto | E2E auth + configuración real + aceptación | C |
| 22 | Membresías con períodos y capacidades | Base parcial | Sin cobertura integral | **No certificado** | No: alcance incompleto | Catálogo, auditoría y autorización | C |
| 23 | Fin de vínculo revoca acceso manteniendo historia | #594/#600/#601 controles parciales | pgTAP negativo; decisión #597 abierta | **No certificado** | No: alcance incompleto | Definir voto histórico e intradía, luego probar | C |
| 24 | Estética Gastos en Finanzas y Personas | Base parcial | Barrido/aceptación pendientes | **No certificado** | No: alcance incompleto | Cierre visual completo | C |
| 25 | Tesorería conciliación y libro auxiliar | Base existente | Sin cierre de extractos/reconciliación | **No certificado** | No: alcance incompleto | Cierre período, conciliación real, E2E | C |
| 26 | Filtros y orden convenios | #591 integrado | 8 pgTAP; API/web y 4/4; visual pendiente | **No certificado** | Candidato de código, NO listo para deploy | Validación autenticada por rol/latencia | A |
| 27 | Formularios cortos vs drawers largos | Base parcial | Accesibilidad y cobertura pendiente | **No certificado** | No: alcance incompleto | Revisión consistente del producto | C |
| 29 | Enlaces Personas ↔ Unidades ↔ CxC ↔ Pagos | #588 enlaces parciales | No recorrido bidireccional íntegro | **No certificado** | No: cerrar validación focal | E2E links/URL/RBAC | B |
| 30 | CxC aging, deuda, créditos y cobranza | #587 crédito/drilldown parcial | Sin aging/cobranza integral | **No certificado** | No: alcance incompleto | Completar workspace y reconciliación | C |

## Balance por evidencia
- 7 candidatos A de código y pruebas focales, **0** de ellos aprobados como paquete de release listo.
- 4 B con integración/validación específica pendiente; 17 C con trabajo/decisiones sustanciales pendientes.
- 28/28 requieren evidencia de aceptación individual y/o smoke completo del alcance; **0/28** formalmente RELEASED_VERIFIED en el registro. Hay capacidades preexistentes publicadas, su existencia NO se niega.
- IA #18/#28 excluidas deliberadamente hasta siguiente fase.

## Release A — paquete de revisión propuesto (no ejecución)
**Candidatos de código:** #2 #3 #4 #5 #7 #12 #26. No afirmar que el alcance funcional de cada punto está cerrado; algunos son slices sólidos de un punto mayor. Revalidar dependencias y migraciones antes de congelar un SHA.

**Release A security/release gates pendientes, orden:**
1. Resolver PR #569 mediante implementador/revisor humano autorizado; clasificar firmas/ACL por rol, search_path, leaks, service_role, policies y default grants. #571: revisar OAuth/JWT/RBAC, tenant BOLA/IDOR, Storage/R2 históricos, finanzas/concurrencia, supply-chain, backups/restore, logs, CORS/CSRF/abuso, incidentes y findings por prioridad. Registrar dictamen firmado por profesional independiente, separado del ingeniero y Founder.
2. Congelar release candidate **SHA exacto**, con manifiesto de archivos/migraciones/grants y checklist de revertibilidad. Las diez migraciones del diff **YA constan en la BD productiva**: comprobar compatibilidad con Worker/Pages antiguos, deriva efectiva, órdenes de aplicación, `supabase migration list --linked` y `supabase db push --dry-run` bajo revisión. **No aplicar SQL ahora ni intentar rollback destructivo de migraciones**.
3. Verificar bandera `VITE_ENABLE_BOARD_GROUPS_PREVIEW=false` en **build candidato**, no inferir valor productivo de `.env.example`.
4. Ensayo backup cifrado y restauración real a instancia aislada, RPO/RTO, rollback Worker/Pages y mitigación de SQL no reversible. Comprobar que no se introducen GRANTs implícitos al publicar migraciones (regla permanente de grants/RLS Supabase Oct 30 (véase [#528](https://github.com/aragondaniel91/Habitta-app/issues/528))).
5. Ejecutar smokes autenticados/financieros y visuales: admin, residente, revisor independiente, unidades por topología, detalles 204/403/404, borradores privados, roles adversarios, convenios, ledger 12−5=7 y límites de crédito. Capturar evidencia redacted, no usar datos de clientes.
6. Obtener aprobación **humana independiente** de #571 y **Founder** del lote #573; disparar workflow protegido solo tras GO. Verificar Worker `/health` con SHA candidato y Pages deployment `commit-hash`, migraciones aplicadas, métricas de errores y smoke por rol. Registrar todo antes de `RELEASED_VERIFIED`.

## Release B
#1, #9, #14, #29: primero completar recorridos autenticados, seguridad/UX y decisiones localizadas. Integrar en rama aislada y certificar los cuatro workflows del HEAD real. No confundir "wizard existe" con acceptance del flujo multicargo completo.

## Release C
#6, #8, #10, #11, #13, #15, #16, #17, #19, #20, #21, #22, #23, #24, #25, #27, #30. Requieren implementación integral, reproducción, evidencia de p75/p95, o políticas del Founder (voto histórico y revocación intradía; crédito futuro). Mantener preview de juntas deshabilitado.

## Handoff
**Responsable engineering:** completar manifest, QA/staging, correcciones técnicas y backup/restore drill. **Revisor AppSec humano cualificado e independiente:** calificar hallazgos y firmar #571. **Founder:** aceptar pantallas y políticas de negocio; autorizar el lote específico. **Release engineer:** ejecutar y verificar SHA/rollback tras todos los gates.

Refs: [#515](https://github.com/aragondaniel91/Habitta-app/issues/515), [#571](https://github.com/aragondaniel91/Habitta-app/issues/571), [#573](https://github.com/aragondaniel91/Habitta-app/issues/573), [#585](https://github.com/aragondaniel91/Habitta-app/issues/585), [#597](https://github.com/aragondaniel91/Habitta-app/issues/597), [#569](https://github.com/aragondaniel91/Habitta-app/pull/569).
