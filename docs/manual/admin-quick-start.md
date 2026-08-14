# Habitta — Guía rápida del administrador

Estado: **Disponible hoy** para la aplicación web administrativa.

Esta guía cubre el recorrido recomendado desde el primer acceso hasta la operación diaria. Los nombres exactos de algunas acciones pueden evolucionar, pero los principios de seguridad, trazabilidad y separación de monedas deben mantenerse.

## 1. Primer acceso

1. Inicia sesión con tu cuenta individual de Habitta.
2. Si todavía no administras un condominio, completa el onboarding para crear o seleccionar la organización y registrar el primer condominio.
3. Confirma que estás trabajando en el condominio correcto antes de cargar estructura, personas o finanzas.
4. No compartas cuentas entre administradores. Cada integrante debe usar su propio acceso para conservar auditoría y permisos.

## 2. Configurar la estructura

Abre **Unidades**.

Orden recomendado:

1. Registra torres o edificios cuando apliquen.
2. Crea apartamentos, casas, locales, depósitos o estacionamientos.
3. Define códigos únicos, ubicación, tipo, piso y alícuota cuando corresponda.
4. Verifica la estructura antes de importar o registrar personas y saldos.

Para cargas iniciales grandes, usa las herramientas de importación disponibles y revisa la previsualización antes de confirmar.

## 3. Registrar personas y relaciones

Abre **Personas**.

1. Registra propietarios, inquilinos y otros contactos autorizados.
2. Vincula cada persona a la unidad correcta mediante la relación correspondiente.
3. Mantén vigentes las fechas/estados de propiedad u ocupación; Habitta utiliza esas relaciones para decidir acceso residente.
4. Usa correos reales y evita duplicados.

Un inquilino de piloto permanece sujeto a la política de delegación activa y al modo read-only definido por el backend.

## 4. Configurar el equipo administrativo

Abre **Equipo / Accesos** cuando tu rol lo permita.

1. Invita a cada integrante con el rol mínimo necesario.
2. Revisa cuidadosamente el correo antes de enviar la invitación: el envío administrativo es transaccional real.
3. No otorgues rol de administrador completo para resolver necesidades que correspondan a contabilidad, revisión de pagos o asistencia.
4. Revoca accesos que ya no correspondan.

La UI ayuda a prevenir acciones no autorizadas, pero API y RLS son la autoridad final.

## 5. Preparar cuotas y cuentas por cobrar

Abre **Cuotas**.

1. Configura conceptos de cobro.
2. Registra obligaciones con moneda, fechas y descripción correctas.
3. Si estás migrando desde otra administración, utiliza el flujo de saldos iniciales una sola vez por lote válido.
4. Comprueba siempre USD, VES, EUR u otras monedas por separado.

No uses una cifra convertida manualmente para sustituir el saldo original de otra moneda.

## 6. Registrar y revisar pagos

Abre **Pagos**.

Flujo general:

1. Registra o recibe el pago/comprobante.
2. Confirma unidad, pagador, fecha, monto, moneda, referencia y soporte.
3. Si requiere corrección, no lo apruebes: utiliza el estado correspondiente.
4. Aprueba únicamente cuando la evidencia coincida.
5. Revisa el recibo/resultado y la aplicación contra las obligaciones.

La carga de un comprobante nunca debe equivaler automáticamente a aprobar o contabilizar un pago.

## 7. Controlar gastos y proveedores

Abre **Gastos**.

1. Registra el gasto con descripción, categoría, proveedor, monto y moneda.
2. Adjunta factura, recibo, cotización u otra evidencia cuando corresponda.
3. Conserva el gasto como borrador mientras falten datos.
4. Sigue el flujo de aprobación/pago existente; no borres un gasto finalizado para corregirlo.

La experiencia de captura de comprobantes continúa recibiendo mejoras dentro del roadmap de go-live.

## 8. Tesorería

Abre **Tesorería**.

1. Configura cuentas bancarias o de caja por moneda.
2. Registra saldos iniciales y movimientos autorizados.
3. Usa transferencias internas para mover dinero entre cuentas; no las registres como ingreso/gasto duplicado.
4. Conciliaciones y reversos deben preservar la trazabilidad.

## 9. Mantenimiento

Abre **Mantenimiento**.

1. Registra activos/equipos relevantes.
2. Crea planes preventivos o inspecciones recurrentes.
3. Gestiona órdenes de trabajo desde apertura hasta cierre.
4. Documenta costos, proveedor, resultado e historial técnico cuando aplique.

## 10. Comunidad y atención

### Solicitudes

Usa **Solicitudes** para recibir y dar seguimiento a requerimientos. Mantén categoría, prioridad, responsable, fechas y estado actualizados. Documenta la solución antes de cerrar.

### Anuncios

Usa **Anuncios** para comunicaciones dirigidas. Confirma audiencia, prioridad y vigencia antes de publicar. Reserva `urgent` para situaciones realmente críticas.

### Comunidad

Usa **Comunidad** como punto de consulta de información compartida y accesos relacionados con residentes.

## 11. Gobernanza

Abre **Votaciones**.

La aplicación actual permite trabajar con propuestas, documentos de soporte, opciones, quórum, elegibilidad, apertura/cierre y resultados según las reglas implementadas. No cambies reglas sustanciales después de abrir una votación.

La gestión completa de asambleas, agenda, asistencia, actas y resoluciones permanece en el roadmap hasta que el módulo correspondiente sea integrado.

## 12. Reportes

Abre **Reportes** para revisar la información consolidada que la aplicación expone actualmente. Selecciona período y moneda de forma explícita y exporta el detalle cuando necesites análisis externo.

No interpretes como “total global” una cifra que pertenezca solo a una moneda.

## 13. Configuración y notificaciones

Abre **Configuración** para preferencias, zona horaria y canales disponibles. Revisa qué eventos generan notificaciones y evita asumir que un correo enviado por un flujo transaccional equivale a una notificación masiva general.

## Rutina diaria recomendada

1. Abre el dashboard administrativo.
2. Revisa saldos y prioridades.
3. Atiende pagos pendientes de revisión.
4. Revisa solicitudes/operación.
5. Verifica anuncios o eventos de gobernanza que requieran acción.
6. Registra gastos/movimientos del día con soporte.
7. Corrige errores mediante los flujos permitidos, no eliminando historial.

## Antes de invitar al piloto

- confirma que la estructura y personas del condominio sean correctas;
- valida saldos iniciales y monedas;
- verifica roles del equipo;
- prueba al menos una cuenta owner y una cuenta tenant con datos reales de prueba;
- no dependas del dominio preview como listo mientras el gate HTTPS canónico continúe reportando 403;
- revisa [Estado de funcionalidades](./feature-status.md) para no prometer capacidades aún planificadas.
