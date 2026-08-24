# Matriz de paridad de formularios administrativos

Auditoría inicial de HAB-240 para #214. La columna de diálogos nativos se limita a los archivos
auditados; no sustituye una auditoría completa de toda la aplicación.

| Módulo | Formulario / Drawer auditado | Estado | Drawer compartido | Field compartido | Grid compartido | Actions compartidas | Responsive | Diálogo nativo | Migración | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Personas | People V3 identity + unit relationship workspaces | compliant | Sí | Sí | Sí | Sí | Desktop/tablet/mobile; KPI 3→2→1, drawers viewport-bound y textos largos protegidos | No encontrado | Completada | Conserva creación atómica, UUIDs y ciclos separados de propiedad, ocupación, comunicaciones, notas e invitaciones. |
| Pagos | PaymentCaptureDrawer | compliant | Sí | Sí | Sí | Sí | Grid móvil y footer sticky | No encontrado | Completada | El segundo paso conserva el borrador y no incorpora Cancelar. |
| Cuentas por cobrar | Receivables drawers + ChargeCreationChooser + LateFeeSettingsDrawer + FinancialIntegrityPanel + OwnershipTransferPanel + RecurringDuesWorkspace | compliant | Sí | Sí | Sí | Sí | Desktop/tablet/mobile; KPI 4→2→1, tabla→cards, drawers a ancho móvil y FormGrid 2/3→1 | Sólo impresión/PDF del estado de cuenta | Completada | Conserva cuotas ordinarias, extraordinarias y puntuales separadas; UUIDs; preview/idempotencia; mora explícita; saldos iniciales; transferencia de propiedad; solvencia y políticas FX sin conversiones ni revalorizaciones implícitas. |
| Gastos | ExpenseCaptureDrawer | compliant | Sí | Sí | Sí | Sí | 1–3 columnas y footer sticky | No encontrado | Completada | El segundo paso de comprobante conserva el borrador. |
| Tesorería | Account, Movement, Transfer y Reconciliation drawers | compliant | Sí | Sí | Sí | Sí | Grid móvil y footer sticky | No encontrado | Completada | Sin cambios a sobregiro, monedas, transferencias o conciliación. |
| Unidades | Units V3 editor + detail workspace + Structure Management topology/building editor | compliant | Sí | Sí | Sí | Sí | Desktop/tablet/mobile; KPI 4→2→1, filas→cards, drawers viewport-bound y textos largos protegidos | No encontrado | Completada | Conserva topología, UUIDs de edificio, archivo no destructivo, historial de propiedad/ocupación y validación de alícuota. |
| Solicitudes | RequestsPage create, categories y gestión operativa | compliant | Sí | Sí | Sí | Sí | FormGrid compartido 2→1 y acciones compartidas | No encontrado | Completada | Conserva workflow, optimistic versioning, UUIDs, visibilidad interna/pública, adjuntos privados y cancelación. |
| Anuncios | AnnouncementsPage create + editor | compliant | Sí | Sí | Sí | Sí | FormGrid compartido 2→1 y acciones compartidas | No encontrado | Completada | Conserva topología, UUIDs, publicación/programación/archivo, confirmación de lectura, optimistic versioning y adjuntos privados. |
| Mantenimiento | Asset, Plan, Work Order y Service Log forms | compliant | Sí | Sí | Sí | Sí | FormGrid compartido 2/3→1 y acciones compartidas | No encontrado | Completada | Conserva topología, UUIDs, optimistic versioning, transiciones y evidencia financiera de service logs. |
| Gobernanza | Propuestas, reglas de votación, asambleas y acuerdos | compliant | Sí | Sí | Sí | Sí | FormGrid compartido 2/3→1 y FormActions en editores principales | No encontrado | Completada | Conserva quórum/threshold, optimistic versioning, snapshots de elegibilidad, publicaciones e IDs operativos. |
| Presupuestos | Editor de período y líneas financieras especializadas | compliant | Sí | Parcial | Sí | Sí | ux-form + FormGrid 3→1; líneas financieras conservan grid especializado responsive | No encontrado | Completada | Conserva requestId, categoría, moneda, monto, revisiones, aprobación y actual-vs-budget sin conversiones implícitas. |
| Documentos | Community Documents: documento, carpeta, categoría, nueva versión y vínculo de registro | compliant | N/A — workspace inline | Sí | Sí | Sí | Workspace 3→2→1 paneles; FormGrid compartido 2→1; acciones y controles móviles a ancho completo | No; archivo usa ConfirmDialog compartido | Completada | Conserva API autenticada de documentos privados, roles de gestión, PDF/JPG/PNG hasta 10 MB, versiones inmutables, descargas auditadas, retención y vínculos por UUID. |

## Decisiones de esta primera migración

- `Field` mantiene su API. La metadata visual `required` / `optional` queda diferida: los inputs
  nativos continúan siendo la fuente de verdad para `required` y no se duplicó semántica.
- No se introdujeron `window.alert`, `window.confirm` ni `window.prompt` en los módulos migrados.
- El estado de cuenta de Cuentas por cobrar conserva `window.print()` exclusivamente para imprimir o
  guardar PDF; no se usa como confirmación de ninguna operación financiera.
- Los formularios con un borrador de pago o gasto ya creado sólo reciben la acción existente de
  finalizar; el cierre no se normaliza de forma que pueda ocultar ese estado remoto.
