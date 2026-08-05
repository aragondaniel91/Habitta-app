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
    permissions: 'La estructura puede ser administrada por propietarios de organización y administradores autorizados.',
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
    purpose:
      'Recibe, revisa y aplica comprobantes de pago a las obligaciones de cada unidad.',
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
    tips: ['No apruebes un pago sin soporte cuando sea obligatorio.', 'Revisa la moneda antes de aplicar una tasa.'],
    permissions: 'Los revisores y administradores autorizados gestionan la aprobación de pagos.',
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
    permissions: 'Contadores pueden preparar borradores; administradores autorizados aprueban o anulan.',
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
    tips: ['Compara períodos equivalentes.', 'Los egresos se incorporarán progresivamente al consolidado.'],
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
    steps: ['Revisa la cobertura de contacto.', 'Completa registros pendientes.', 'Utiliza los accesos rápidos para continuar.'],
    tips: ['Mantén correo y teléfono actualizados.', 'Evita publicar datos privados en anuncios generales.'],
    permissions: 'La información visible se limita según el rol del usuario.',
  },
  governance: {
    purpose:
      'Gestiona propuestas, presupuestos, quórum, votaciones y decisiones de la comunidad.',
    actions: [
      'Crear propuestas y opciones de voto.',
      'Adjuntar presupuestos o documentos.',
      'Abrir, cerrar y revisar resultados.',
    ],
    steps: ['Crea la propuesta en borrador.', 'Define elegibilidad, quórum y fecha de cierre.', 'Publica y revisa el resultado final.'],
    tips: ['Adjunta las cotizaciones relevantes.', 'No cambies reglas después de abrir la votación.'],
    permissions: 'La gestión corresponde a administradores y responsables de gobernanza; cada votante solo ejerce sus votos elegibles.',
  },
  requests: {
    purpose:
      'Da seguimiento a requerimientos, reportes y necesidades de residentes o áreas comunes.',
    actions: ['Crear solicitudes.', 'Asignar prioridad, responsable y fecha.', 'Comentar, resolver y cerrar casos.'],
    steps: ['Registra una descripción clara.', 'Asigna categoría y prioridad.', 'Actualiza el estado hasta su cierre.'],
    tips: ['Usa comentarios internos para coordinación administrativa.', 'Documenta la solución antes de cerrar.'],
    permissions: 'Residentes pueden crear y consultar sus casos; el equipo autorizado gestiona el flujo completo.',
  },
  announcements: {
    purpose:
      'Publica comunicaciones dirigidas a toda la comunidad o a audiencias específicas.',
    actions: ['Crear borradores.', 'Seleccionar audiencia y prioridad.', 'Programar, publicar y archivar.'],
    steps: ['Redacta un título y resumen claros.', 'Confirma la audiencia.', 'Previsualiza y publica o programa.'],
    tips: ['Reserva la prioridad urgente para eventos realmente críticos.', 'Evita incluir información personal sensible.'],
    permissions: 'Solo los roles autorizados pueden publicar comunicaciones.',
  },
  team: {
    purpose:
      'Controla quién administra el condominio y qué funciones puede utilizar cada integrante.',
    actions: ['Invitar administradores.', 'Asignar roles.', 'Revisar invitaciones pendientes o vencidas.'],
    steps: ['Selecciona el rol mínimo necesario.', 'Envía la invitación al correo correcto.', 'Revoca accesos que ya no correspondan.'],
    tips: ['No compartas cuentas entre personas.', 'Revisa accesos periódicamente.'],
    permissions: 'Solo propietarios de organización y administradores con facultad suficiente pueden gestionar accesos.',
  },
  settings: {
    purpose:
      'Configura preferencias, recordatorios, canales de notificación y parámetros del condominio.',
    actions: ['Activar o desactivar canales.', 'Definir anticipación de avisos.', 'Seleccionar zona horaria.'],
    steps: ['Revisa las reglas globales.', 'Ajusta tus preferencias personales.', 'Guarda y confirma el mensaje de éxito.'],
    tips: ['Usa la zona horaria real del condominio.', 'El correo depende de que el proveedor transaccional esté activo.'],
    permissions: 'Las reglas globales requieren rol administrativo; cada usuario puede ajustar sus preferencias personales.',
  },
};
