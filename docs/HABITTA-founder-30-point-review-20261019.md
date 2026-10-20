# HABITTA · Revisión Founder 30 puntos · 2026-10-19

**Fuente de autoridad:** los 30 puntos expresos del Founder en la conversación del 19 de octubre y el checkpoint P2B. No confundir aprobación del diseño residente con cierre del módulo administrador.
**Evidencia de esta iteración:** AdminPaymentsPage reutiliza ResidentPaymentWizard, tabs Revisión/Movimientos/Métodos vía PageChromeExtension, propuestas y notas visibles en revisión. E2E real aislado del administrador, sin aprobación ni escritura del ledger. Todo local y sin commit/push/merge/deploy.
**Clases de estado:** LOCAL = implementado aquí, pendiente aceptación; BASE = previamente probado en laboratorio, sujeto a revisión visual; PARCIAL = cobertura incompleta; PENDIENTE = no se ha implementado/verificado en esta iteración; FINANCIERO = no habilitar sin diseño contable y pruebas específicas.

## Pagos, navegación y cartera
1. Atajos desde dashboard a pagos específicos — PARCIAL. Existen accesos genéricos a pagos y prioridades; falta deep-link autorizado a pago individual.
2. Acciones pendientes con monto y concepto — PARCIAL. Capturas propias ahora incluyen monto/método/pagador; cuando hay varios cargos, el concepto exacto requiere desglose.
3. Distinguir acciones pendientes de validaciones — LOCAL. Pestaña Revisión: bandeja de enviados vs mis capturas privadas por completar.
4. Borradores de residentes ocultos para todos los administradores — BASE. RLS y pruebas pgTAP de privacidad; UI limita la sección de capturas propias al autor, sin convertir borradores ajenos en revisables.
5. Detalle de enviados del residente en modo lectura — BASE. Solo draft/correction_requested se puede editar; sometidos/en revisión muestran detalle central.
6. Lentitud en Pagos, Cuotas y Gastos — PENDIENTE. Medir carga y latencia. Pagos sigue haciendo recolección exhaustiva de paginated receivables; candidato a carga diferida por unidad.
7. Explicar Referencia e Información adicional — LOCAL. Referencia de operación bancaria; nota opcional diferente del comprobante.
8. Información adicional visible al administrador — LOCAL. Revisor muestra notes, sujeto a confirmar payload real en E2E.
9. Pago guiado por tipo/concepto, una o varias cuotas, montos completos/parciales y comprobante — BASE para residente, LOCAL para administrador con componente compartido. No usar una sola transacción entre monedas diferentes ni aceptar sobrepago aún.
10. Reemplazar drawer lateral por modal o página — LOCAL para registro y revisión de pagos; PENDIENTE en otros módulos.
11. UX de creación de cuotas mensuales — PENDIENTE. Revisión de estructura y dimensionamiento antes de nueva fase.
12. Cuota de 12, abono de 5 y 7 pendiente — PENDIENTE verificar end-to-end en cuentas por cobrar y saldos por cuota; no inferir de la captura parcial.
13. Sobrepago 5 sobre cuota 4.50: 0.50 crédito general reusable — FINANCIERO. No eludir límite del wizard sin asiento de crédito, moneda, titular, uso/reversión y pgTAP.
24. Mantener patrón de Gastos como referencia UX — DIRECTRIZ. Consistencia premium con branding de HABITTA.
27. Pestañas por sección para reducir scroll — LOCAL en Pagos (3 pestañas con navegación de cabecera estándar); pendiente expandir a Cuotas/Personas/Unidades/Tesorería.
29. Links persona-unidad-deuda con cambio contextual de persona — PENDIENTE. Deep-links autorizados de lectura.
30. Cuentas por cobrar como apartado operativo distinto de estado de cuenta/reporte — PENDIENTE. Vista de cargos abiertos, vencimientos, saldo y acciones.

## Personas, unidades, onboarding
14. Crear, editar y eliminar unidades — PENDIENTE auditoría de capacidades existentes, referencias y regla de eliminación segura.
15. Onboarding autoguiado por tipo de administración — PENDIENTE diseño de checklist y configuración inicial.
16. Modelo Casas/Edificios/Torres sin obligar apartamentos — PENDIENTE auditoría de taxonomía y formulario.
17. Ajustes de residente solo sobre permisos/datos propios — PENDIENTE revisión de RBAC y UX.
19. Porcentaje patrimonial solo para propietarios — PENDIENTE aislar propiedad de tenencia/ocupación.
20. Personas en edificios/casas: junta/familia según modalidad — PENDIENTE diseño de roles.
21. Junta de condominio en edificios/casas — PENDIENTE módulo y permisos.
22. Todas las opciones de ocupación en relación unidad/persona — PENDIENTE auditar catálogo.
23. Cerrar vínculo elimina vigencia, conserva historial — PENDIENTE auditoría de consultas y UI.

## Tesorería, convenios e IA
18. Bot de soporte — PENDIENTE arquitectura de ayuda contextual sin fuga entre roles.
25. Tesorería: periodos conciliados, estado bancario y libro contable — PENDIENTE separar extracto/conciliación/asientos con trazabilidad.
26. Filtrado de convenios de pago como cartera de cargos — PENDIENTE.
28. IA residente y administración para explicar cambios, consultar reportes y soporte — PENDIENTE. Herramientas read-only, retrieval por condominio+rol, citas sobre datos contables verificables y permisos en servidor.

## Prioridad ejecutiva recomendada
- P0: cerrar pagos UX+seguridad, hacer visible monto/concepto y notas, revisar performance inicial, saldo remanente y diseñar crédito a favor antes de implementarlo.
- P1: cuotas mensuales, cartera/estado de cuenta, cruces persona/unidad, propiedad/ocupación, onboarding y juntas.
- P2: tesorería y conciliación avanzada, convenios, ajustes residente, agente inteligente con permisos.
- No considerar terminados los 30 acuerdos; Founder valida cambios visuales por módulos. No existe autorización para desplegar esta worktree.

## Ajuste de validación visual — 2026-10-19 (tarde)
- Solicitud Founder respaldada por captura real del portal administrador: indicaba 30 pagos por revisar pero la bandeja mostraba solo 6 por un corte fijo `slice(0, 6)`, sin continuación.
- Solución local: bandeja de revisión con 10 registros por página, búsqueda por unidad/pagador/referencia, información visible de rango y total y navegación Anterior/Siguiente. No oculta registros restantes ni carga páginas sin acceso.
- Cuatro indicadores reubicados a la parte superior y convertidos en botones accesibles `aria-pressed`, siguiendo patrón de Gastos: Aprobados y Reversados filtran Movimientos, Por revisar filtra bandeja y Mis registros por completar aísla capturas propias.
- Indicador de acciones propias usa solo borradores/correcciones del usuario actual, nunca borradores privados de otros residentes. Estado vacío explícito si no hay capturas personales.
- UI renombra «Vista de tesorería» a «Moneda de los pagos» para separar pagos de conciliación bancaria; elimina botón redundante «Métodos» del encabezado; «Configurar métodos» es botón primario azul dentro de su pestaña.
- Advertencia explícita cuando las cifras monetarias agregadas sólo consideran movimientos cargados con la paginación del historial.
- Playwright autenticado administrador: orden de indicadores, pestañas, filtros por tarjetas, paginación con rango 1–10/11–20, búsqueda vacía, métodos y modal central. PASS.
- Full web Vitest: 966/966 PASS; TypeScript y ESLint PASS; prettier y diff-check PASS. E2E final financiero autenticado: 4/4 PASS (administrador+residente).
- Archivos modificados: `apps/web/src/pages/AdminPaymentsPage.tsx`, `apps/web/src/payments.css`, `e2e/tests/financial-admin-review-ux.spec.ts`. No API, BD ni ledger modificados. Sin commit/push/merge/deploy; pendiente visual OK.


## Pago métodos UX + modal estándar — revisión 2026-10-19
- El administrador administra métodos desde su pestaña, en tabla con columnas Método, Moneda, Requisitos, Estado y Acciones (iconos accesibles: editar, activar/desactivar, eliminar). Se muestran activos e inactivos, no solo activos.
- «Configurar métodos» abre formulario de alta en `Dialog` centrado; el lápiz abre el mismo modal en modo edición; eliminar solicita `ConfirmDialog` centrado, y el servidor rechaza borrar un método referenciado por pagos (se desactiva en su lugar).
- El CRUD reutiliza POST/PATCH/DELETE existentes y conserva los guardarraíles de PostgreSQL/RLS y los pagos históricos; el usuario sin `canManage` no ve las acciones mutantes.
- Los detalles y recibos de pago que utilizaban paneles heredados se centran también.
- Se aplicó política de modales centrados por defecto a `components/Drawer.tsx`, con `centered={false}` explícito reservado a sidebars reales. Esto cubre los 18 usos ubicados en los módulos comunes (incluidos Gastos, Cuotas, Solicitudes y Mantenimiento), sin cambiar el payload ni las transiciones de negocio. La geometría común vive en `ux-contract.css`.
- Los overlays independientes que no emplean `Drawer`, `Dialog` ni las variantes centrales de Pagos deben auditarse individualmente antes de afirmar cobertura del 100% de toda Habitta.
- Evidencia Playwright en laboratorio aislado: ciclo completo crear→editar→desactivar→reactivar→eliminar método temporal, más vista responsive. Asimismo apertura y cierre centrados de Gastos y Cuotas en desktop (1280 px) y móvil (390 px), sin escritura financiera.
- Tests de contrato actualizados al diseño: `PaymentsDrawers.manual-method-types.dom.test.tsx`, `Drawer.test.tsx`, `hab317-live-payment-reversal.test.ts`. Pendiente aceptar visualmente antes de commit/PR.
- No commit, push, merge, despliegue, modificación productiva ni migración de BD en esta iteración.
