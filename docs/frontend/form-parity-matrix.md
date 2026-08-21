# Matriz de paridad de formularios administrativos

Auditoría inicial de HAB-240 para #214. La columna de diálogos nativos se limita a los archivos
auditados; no sustituye una auditoría completa de toda la aplicación.

| Módulo | Formulario / Drawer auditado | Estado | Drawer compartido | Field compartido | Grid compartido | Actions compartidas | Responsive | Diálogo nativo | Migración | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Personas | Crear y editar People V2 | compliant | Sí | Sí | Sí | Sí | 1–3 columnas y acciones móviles | No encontrado | Completada | Referencia visual; conserva la mutación atómica de HAB-235. |
| Pagos | PaymentCaptureDrawer | compliant | Sí | Sí | Sí | Sí | Grid móvil y footer sticky | No encontrado | Completada | El segundo paso conserva el borrador y no incorpora Cancelar. |
| Cuentas por cobrar | FinancialAdministrationDrawer, ChargeCreationChooser, LateFeeSettingsDrawer | deferred | Sí, parcial | Sí, parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | Varios drawers financieros; no se migra para no ampliar lógica de cargos. |
| Gastos | ExpenseCaptureDrawer | compliant | Sí | Sí | Sí | Sí | 1–3 columnas y footer sticky | No encontrado | Completada | El segundo paso de comprobante conserva el borrador. |
| Tesorería | Account, Movement, Transfer y Reconciliation drawers | compliant | Sí | Sí | Sí | Sí | Grid móvil y footer sticky | No encontrado | Completada | Sin cambios a sobregiro, monedas, transferencias o conciliación. |
| Unidades | Units V2 editor + Structure Management unit editor | compliant | Sí | Sí | Sí | Sí | Grid compartido 2→1 y DialogFooter móvil | No encontrado | Completada | Conserva topología, UUIDs de edificio, archivo de unidad y validación de alícuota. |
| Solicitudes | RequestsPage formularios | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | Requiere una migración propia y acotada. |
| Anuncios | AnnouncementsPage editor | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | Mantener comportamiento histórico de publicaciones. |
| Mantenimiento | MaintenancePageBase editor | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | Se revisará junto con sus selectores de topología. |
| Gobernanza | GovernancePage formularios | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | Pendiente de alcance separado. |
| Presupuestos | BudgetsPage formularios | deferred | Parcial | Parcial | No | No | Pendiente de prueba específica | No encontrado | Sólo auditoría | No tocar cálculos ni aprobaciones financieras en esta fase. |

## Decisiones de esta primera migración

- `Field` mantiene su API. La metadata visual `required` / `optional` queda diferida: los inputs
  nativos continúan siendo la fuente de verdad para `required` y no se duplicó semántica.
- No se introdujeron `window.alert`, `window.confirm` ni `window.prompt` en los módulos migrados.
- Los formularios con un borrador de pago o gasto ya creado sólo reciben la acción existente de
  finalizar; el cierre no se normaliza de forma que pueda ocultar ese estado remoto.
