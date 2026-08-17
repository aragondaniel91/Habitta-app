import type { AppRoute } from '../../navigation';

export type ImportKind = 'units' | 'people' | 'opening_balances';

export type ModuleHelpContent = {
  purpose: string;
  actions: string[];
  steps: string[];
  tips: string[];
  permissions: string;
  importKinds?: ImportKind[];
};

export const MODULE_HELP: Record<AppRoute['key'], ModuleHelpContent> = {
  dashboard: {
    purpose:
      'Resume la situación financiera, operativa y comunitaria del condominio para saber qué requiere atención.',
    actions: [
      'Revisar saldos, pagos pendientes y alertas.',
      'Consultar la actividad reciente.',
      'Ir rápidamente al módulo donde debes actuar.',
    ],
    steps: [
      'Selecciona el condominio correcto en la barra superior.',
      'Revisa primero las tarjetas de alerta.',
      'Abre el módulo relacionado para completar la acción.',
    ],
    tips: ['El dashboard no reemplaza los reportes contables.', 'Los totales nunca mezclan monedas.'],
    permissions: 'Cada persona ve únicamente la información permitida por su rol.',
  },
  units: {
    purpose:
      'Organiza torres, edificios, apartamentos, casas, locales, depósitos y estacionamientos.',
    actions: [
      'Crear y editar torres o edificios.',
      'Registrar unidades y su ubicación.',
      'Definir tipo, piso, alícuota y estado.',
    ],
    steps: [
      'Crea primero las torres o edificios.',
      'Agrega las unidades manualmente o mediante CSV.',
      'Verifica códigos, tipos y porcentajes antes de continuar.',
    ],
    tips: [
      'Usa códigos únicos y fáciles de reconocer, como A-101.',
      'No reutilices el código de una unidad inactiva.',
    ],
    permissions:
      'La estructura puede ser administrada por propietarios de organización y administradores autorizados.',
    importKinds: ['units'],
  },
  people: {
    purpose:
      'Administra propietarios, inquilinos, familiares y personas autorizadas relacionadas con las unidades.',
    actions: [
      'Registrar personas y datos de contacto.',
      'Asignar propietarios e inquilinos a unidades.',
      'Mantener el historial de relaciones.',
    ],
    steps: [
      'Confirma que las unidades ya estén registradas.',
      'Agrega la persona o importa el archivo CSV.',
      'Selecciona la relación correcta con cada unidad.',
    ],
    tips: [
      'El correo ayuda a evitar personas duplicadas.',
      'El porcentaje de propiedad solo aplica a propietarios.',
    ],
    permissions: 'Administradores y asistentes autorizados pueden gestionar personas y relaciones.',
    importKinds: ['people'],
  },
  maintenance: {
    purpose:
      'Controla el inventario técnico, los planes recurrentes, las órdenes de trabajo y el historial de servicio del condominio.',
    actions: [
      'Registrar activos y su ubicación.',
      'Crear planes preventivos o de inspección.',
      'Abrir, programar, ejecutar y cerrar órdenes de trabajo.',
    ],
    steps: [
      'Registra primero los equipos o activos relevantes.',
      'Crea planes para las tareas recurrentes.',
      'Revisa las órdenes abiertas y documenta cada servicio antes de cerrar.',
    ],
    tips: [
      'No retires un activo hasta confirmar que su historial esté completo.',
      'Registra costos con su moneda; Habitta no mezcla USD, VES o EUR.',
      'La generación de órdenes vencidas puede repetirse sin crear duplicados.',
    ],
    permissions:
      'Propietarios de organización, administradores y asistentes pueden gestionar; junta y contabilidad tienen visibilidad de consulta.',
  },
  fees: {
    purpose:
      'Controla cuotas, cargos, saldos pendientes, créditos y cuentas por cobrar por unidad.',
    actions: [
      'Crear conceptos y obligaciones.',
      'Registrar cargos individuales o por lote.',
      'Importar saldos iniciales de la administración anterior.',
    ],
    steps: [
      'Configura los conceptos de cobro.',
      'Selecciona la moneda y las fechas correctas.',
      'Previsualiza antes de publicar cargos o saldos.',
    ],
    tips: [
      'No mezcles USD, VES o EUR en una misma cifra.',
      'Los saldos iniciales deben importarse una sola vez por archivo.',
    ],
    permissions: 'Los roles financieros autorizados pueden crear o revisar obligaciones.',
    importKinds: ['opening_balances'],
  },
  payments: {
    purpose: 'Recibe, revisa y aplica comprobantes de pago a las obligaciones de cada unidad.',
    actions: [
      'Registrar pagos y comprobantes.',
      'Solicitar correcciones o rechazar movimientos.',
      'Aprobar y distribuir pagos entre obligaciones.',
    ],
    steps: [
      'Abre el pago pendiente.',
      'Compara monto, fecha, referencia y soporte.',
      'Asigna el pago y aprueba únicamente cuando todo coincida.',
    ],
    tips: [
      'No apruebes un pago sin soporte cuando sea obligatorio.',
      'Revisa la moneda antes de aplicar una tasa.',
    ],
    permissions: 'Los revisores y administradores autorizados gestionan la aprobación de pagos.',
  },
  treasury: {
    purpose:
      'Controla las cuentas bancarias y de caja del condominio, sus movimientos y la conciliación con el estado de cuenta del banco.',
    actions: [
      'Crear cuentas de banco o caja por moneda.',
      'Registrar saldos iniciales, depósitos, retiros, comisiones y ajustes.',
      'Transferir entre cuentas y conciliar períodos.',
    ],
    steps: [
      'Crea la cuenta y registra su saldo inicial.',
      'Anota los movimientos del período.',
      'Abre la conciliación con los saldos del estado de cuenta y ciérrala al cuadrar.',
    ],
    tips: [
      'El saldo se calcula a partir de los movimientos: no se edita a mano.',
      'Una transferencia mueve dinero entre cuentas; no es un ingreso ni un gasto.',
      'Un movimiento equivocado se corrige con un reverso, nunca borrándolo.',
    ],
    permissions:
      'Administradores y contadores registran y concilian; la junta puede consultar los saldos.',
  },
  expenses: {
    purpose:
      'Registra egresos, proveedores, facturas, aprobaciones y pagos realizados por el condominio.',
    actions: [
      'Crear gastos en borrador.',
      'Clasificar por categoría y proveedor.',
      'Aprobar, pagar, anular y revisar la trazabilidad.',
    ],
    steps: [
      'Configura categorías y proveedores.',
      'Registra el gasto con monto, moneda y soporte.',
      'Envía a aprobación y completa el pago.',
    ],
    tips: ['Adjunta siempre factura, recibo o cotización.', 'No combines monedas en un mismo gasto.'],
    permissions:
      'Contadores pueden preparar borradores; administradores autorizados aprueban o anulan.',
  },
  budgets: {
    purpose:
      'Planifica los egresos del condominio por período, categoría y moneda, conservando versiones aprobadas y comparándolas con la ejecución real.',
    actions: [
      'Crear períodos y líneas presupuestarias.',
      'Enviar versiones a aprobación y crear revisiones sin reescribir el historial.',
      'Comparar el presupuesto aprobado con gastos reales por categoría y moneda.',
    ],
    steps: [
      'Define el período y agrega una línea por categoría y moneda.',
      'Revisa los montos y envía el borrador a aprobación.',
      'Cuando exista una versión aprobada, abre la ejecución para comparar presupuesto, gasto real y disponible.',
    ],
    tips: [
      'No combines USD, VES o EUR: cada moneda mantiene su propio presupuesto y ejecución.',
      'Una revisión crea una nueva versión; no modifica las cifras históricas ya aprobadas.',
      'Solo los gastos aprobados o pagados del período cuentan como ejecución real.',
    ],
    permissions:
      'Administradores y contadores pueden preparar presupuestos; la aprobación requiere autorización administrativa y la junta mantiene acceso de consulta.',
  },
  reports: {
    purpose:
      'Convierte la información financiera en indicadores de cobranza, cartera y comportamiento por unidad.',
    actions: [
      'Cambiar período y moneda.',
      'Revisar cargos, cobros y vencimientos.',
      'Exportar información para análisis externo.',
    ],
    steps: [
      'Selecciona moneda y período.',
      'Revisa las alertas y tendencias.',
      'Exporta el detalle cuando necesites trabajarlo fuera de Habitta.',
    ],
    tips: [
      'Compara períodos equivalentes.',
      'Los egresos se incorporarán progresivamente al consolidado.',
    ],
    permissions: 'El acceso depende del rol financiero asignado.',
  },
  community: {
    purpose:
      'Presenta una vista organizada de la comunidad, sus unidades, contactos y accesos principales.',
    actions: [
      'Consultar la composición del condominio.',
      'Detectar contactos incompletos.',
      'Ir a directorio, solicitudes o comunicaciones.',
    ],
    steps: [
      'Revisa la cobertura de contacto.',
      'Completa registros pendientes.',
      'Utiliza los accesos rápidos para continuar.',
    ],
    tips: [
      'Mantén correo y teléfono actualizados.',
      'Evita publicar datos privados en anuncios generales.',
    ],
    permissions: 'La información visible se limita según el rol del usuario.',
  },
  documents: {
    purpose:
      'Organiza documentos privados del condominio por carpetas y categorías, conservando versiones, permisos y trazabilidad de las descargas.',
    actions: [
      'Crear documentos, carpetas y categorías cuando tu rol lo permita.',
      'Agregar nuevas versiones sin reemplazar el historial anterior.',
      'Descargar archivos autorizados y consultar registros relacionados.',
    ],
    steps: [
      'Selecciona una carpeta o categoría para ubicar el documento.',
      'Confirma la audiencia antes de cargar o publicar una versión.',
      'Usa una nueva versión para corregir un archivo y archiva el documento cuando deje de estar vigente.',
    ],
    tips: [
      'Los archivos admitidos son PDF, JPG y PNG de hasta 10 MB.',
      'No borres versiones históricas: el módulo conserva la trazabilidad.',
      'Cada descarga autorizada queda registrada antes de entregar el archivo.',
    ],
    permissions:
      'Administración, contabilidad, asistentes autorizados y junta pueden gestionar la biblioteca; propietarios y residentes solo ven los documentos que su audiencia y relación activa permiten.',
  },
  governance: {
    purpose: 'Gestiona propuestas, presupuestos, quórum, votaciones y decisiones de la comunidad.',
    actions: [
      'Crear propuestas y opciones de voto.',
      'Adjuntar presupuestos o documentos.',
      'Abrir, cerrar y revisar resultados.',
    ],
    steps: [
      'Crea la propuesta en borrador.',
      'Define elegibilidad, quórum y fecha de cierre.',
      'Publica y revisa el resultado final.',
    ],
    tips: [
      'Adjunta las cotizaciones relevantes.',
      'No cambies reglas después de abrir la votación.',
    ],
    permissions:
      'La gestión corresponde a administradores y responsables de gobernanza; cada votante solo ejerce sus votos elegibles.',
  },
  requests: {
    purpose:
      'Da seguimiento a requerimientos, reportes y necesidades de residentes o áreas comunes.',
    actions: [
      'Crear solicitudes.',
      'Asignar prioridad, responsable y fecha.',
      'Comentar, resolver y cerrar casos.',
    ],
    steps: [
      'Registra una descripción clara.',
      'Asigna categoría y prioridad.',
      'Actualiza el estado hasta su cierre.',
    ],
    tips: [
      'Usa comentarios internos para coordinación administrativa.',
      'Documenta la solución antes de cerrar.',
    ],
    permissions:
      'Residentes pueden crear y consultar sus casos; el equipo autorizado gestiona el flujo completo.',
  },
  announcements: {
    purpose: 'Publica comunicaciones dirigidas a toda la comunidad o a audiencias específicas.',
    actions: [
      'Crear borradores.',
      'Seleccionar audiencia y prioridad.',
      'Programar, publicar y archivar.',
    ],
    steps: [
      'Redacta un título y resumen claros.',
      'Confirma la audiencia.',
      'Previsualiza y publica o programa.',
    ],
    tips: [
      'Reserva la prioridad urgente para eventos realmente críticos.',
      'Evita incluir información personal sensible.',
    ],
    permissions: 'Solo los roles autorizados pueden publicar comunicaciones.',
  },
  team: {
    purpose:
      'Controla quién administra el condominio y qué funciones puede utilizar cada integrante.',
    actions: ['Invitar administradores.', 'Asignar roles.', 'Revisar invitaciones pendientes o vencidas.'],
    steps: [
      'Selecciona el rol mínimo necesario.',
      'Envía la invitación al correo correcto.',
      'Revoca accesos que ya no correspondan.',
    ],
    tips: ['No compartas cuentas entre personas.', 'Revisa accesos periódicamente.'],
    permissions:
      'Solo propietarios de organización y administradores con facultad suficiente pueden gestionar accesos.',
  },
  audit: {
    purpose:
      'Consolida actividad administrativa de módulos críticos en un historial read-only para investigación y trazabilidad.',
    actions: [
      'Filtrar eventos por módulo, severidad, actor, entidad o fechas.',
      'Revisar la identidad de la entidad y del actor asociado.',
      'Consultar únicamente la metadata sanitizada que el servidor autoriza mostrar.',
    ],
    steps: [
      'Abre Sistema → Auditoría y confirma el condominio seleccionado.',
      'Aplica solo los filtros necesarios para reducir el conjunto de eventos.',
      'Usa Anterior y Siguiente para recorrer páginas sin modificar el historial.',
    ],
    tips: [
      'El registro es de solo lectura: las correcciones deben hacerse en el módulo de origen.',
      'Una advertencia indica un evento que merece revisión, no necesariamente un incidente de seguridad.',
      'La metadata mostrada ya fue limitada por el servidor para evitar exponer datos sensibles.',
    ],
    permissions:
      'Solo administradores de condominio autorizados pueden abrir el workspace; la base de datos vuelve a validar la autorización antes de devolver eventos.',
  },
  settings: {
    purpose:
      'Configura preferencias, recordatorios, canales de notificación y parámetros del condominio.',
    actions: [
      'Activar o desactivar canales.',
      'Definir anticipación de avisos.',
      'Seleccionar zona horaria.',
    ],
    steps: [
      'Revisa las reglas globales.',
      'Ajusta tus preferencias personales.',
      'Guarda y confirma el mensaje de éxito.',
    ],
    tips: [
      'Usa la zona horaria real del condominio.',
      'El correo depende de que el proveedor transaccional esté activo.',
    ],
    permissions:
      'Las reglas globales requieren rol administrativo; cada usuario puede ajustar sus preferencias personales.',
  },
};
