# Matriz de paridad de formularios administrativos

Auditoría inicial de HAB-240 para #214. La columna de diálogos nativos se limita a los archivos
auditados; no sustituye una auditoría completa de toda la aplicación.

| Módulo | Formulario / Drawer auditado | Estado | Drawer compartido | Field compartido | Grid compartido | Actions compartidas | Responsive | Diálogo nativo | Migración | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Personas | People V3 identity + unit relationship workspaces | compliant | Sí | Sí | Sí | Sí | Desktop/tablet/mobile; KPI 3→2→1, drawers viewport-bound y textos largos protegidos | No encontrado | Completada | Conserva creación atómica, UUIDs y ciclos separados de propiedad, ocupación, comunicaciones, notas e invitaciones. |
| Pagos | PaymentCaptureDrawer | compliant | Sí | Sí | Sí | Sí | Grid móvil y footer sticky | No encontrado | Completada | El segundo paso conserva el borrador y no incorpora Cancelar. |
| Cuentas por cobrar | FinancialAdministrationDrawer, ChargeCreationChooser, LateFeeSettingsDrawer | deferred | Sí, parcial | Sí, parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | Varios drawers financieros; no se migra para no ampliar lógica de cargos. |
| Gastos | ExpenseCaptureDrawer | compliant | Sí | Sí | Sí | Sí | 1–3 columnas y footer sticky | No encontrado | Completada | El segundo paso de comprobante conserva el borrador. |
| Tesorería | Account, Movement, Transfer y Reconciliation drawers | compliant | Sí | Sí | Sí | Sí | Grid móvil y footer sticky | No encontrado | Completada | Sin cambios a sobregiro, monedas, transferencias o conciliación. |
| Unidades | Units V3 editor + detail workspace + Structure Management topology/building editor | compliant | Sí | Sí | Sí | Sí | Desktop/tablet/mobile; KPI 4→2→1, filas→cards, drawers viewport-bound y textos largos protegidos | No encontrado | Completada | Conserva topología, UUIDs de edificio, archivo no destructivo, historial de propiedad/ocupación y validación de alícuota. |
| Solicitudes | RequestsPage create, categories y gestión operativa | compliant | Sí | Sí | Sí | Sí | FormGrid compartido 2→1 y acciones compartidas | No encontrado | Completada | Conserva workflow, optimistic versioning, UUIDs, visibilidad interna/pública, adjuntos privados y cancelación. |
| Anuncios | AnnouncementsPage create + editor | compliant | Sí | Sí | Sí | Sí | FormGrid compartido 2→1 y acciones compartidas | No encontrado | Completada | Conserva topología, UUIDs, publicación/programación/archivo, confirmación de lectura, optimistic versioning y adjuntos privados. |
| Mantenimiento | Asset, Plan, Work Order y Service Log forms | compliant | Sí | Sí | Sí | Sí | FormGrid compartido 2/3→1 y acciones compartidas | No encontrado | Completada | Conserva topología, UUIDs, optimistic versioning, transiciones y evidencia financiera de service logs. |
| Gobernanza | GovernancePage formularios | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | Pendiente de alcance separado. |
| Presupuestos | BudgetsPage formularios | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | No tocar cálculos ni aprobaciones financieras en esta fase. |

## Decisiones de esta primera migración

- `Field` mantiene su API. La metadata visual `required` / `optional` queda diferida: los inputs
  nativos continúan siendo la fuente de verdad para `required` y no se duplicó semántica.
- No se introdujeron `window.alert`, `window.confirm` ni `window.prompt` en los módulos migrados.
- Los formularios con un borrador de pago o gasto ya creado sólo reciben la acción existente de
  finalizar; el cierre no se normaliza de forma que pueda ocultar ese estado remoto.
