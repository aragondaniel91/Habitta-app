import type { AppRoute } from '../../navigation';

export type ImportKind = 'units' | 'people' | 'opening_balances';

export type ModuleHelpContent = {
  purpose: string;
  actions: string[];
  steps: string[];
  beforeConfirm: string[];
  result: string[];
  troubleshooting?: string[];
  tips: string[];
  permissions: string;
  importKinds?: ImportKind[];
};

export const MODULE_HELP: Record<AppRoute['key'], ModuleHelpContent> = {
  dashboard: {
    purpose:
      'Te da una lectura rápida de cobranza, pagos, morosidad, unidades y actividad reciente del condominio sin sustituir los módulos donde se ejecutan las operaciones.',
    actions: [
      'Revisar saldos y cobros por moneda.',
      'Detectar pagos pendientes de revisión y cartera vencida.',
      'Abrir rápidamente Cuotas, Pagos, Anuncios o Reportes desde los atajos.',
    ],
    steps: [
      'Confirma arriba que estás trabajando en el condominio correcto.',
      'Empieza por las tarjetas Saldo total pendiente, Cobrado este mes, Unidades activas y Morosidad.',
      'Si existen varias monedas, usa los botones de moneda y revisa cada una por separado; Habitta no las suma ni las convierte.',
      'En Prioridades, abre primero cualquier pago por revisar o alerta de cobranza que requiera acción.',
      'Revisa Pagos recientes y Últimos movimientos para confirmar qué ocurrió recientemente.',
      'Usa Crear cuota, Registrar pago, Enviar anuncio o Generar reporte para ir al módulo donde se completa la operación.',
      'Pulsa Actualizar datos después de una operación importante si quieres refrescar inmediatamente el resumen.',
    ],
    beforeConfirm: [
      'No interpretes como un total único cifras de monedas distintas; cambia la moneda y revísalas por separado.',
      'Si aparece Bandeja de pagos restringida, tu rol no tiene acceso a esa revisión y no es un error del Dashboard.',
    ],
    result: [
      'Debes poder identificar qué requiere atención sin modificar datos desde el Dashboard.',
      'Al abrir un atajo, Habitta te lleva al módulo correspondiente, donde la operación conserva su propia validación e historial.',
    ],
    troubleshooting: [
      'Si un bloque muestra una advertencia de actualización, pulsa Actualizar datos; los demás bloques pueden seguir disponibles.',
      'Si una cifra no coincide con lo esperado, abre el módulo financiero correspondiente y confirma moneda, estado y período antes de asumir un error.',
    ],
    tips: [
      'El Dashboard es un resumen operativo; usa Reportes para análisis y los módulos financieros para el detalle contable.',
      'Habitta no completa cifras faltantes con datos simulados.',
    ],
    permissions: 'Cada usuario ve únicamente los bloques y acciones permitidos por sus roles y por la autorización del servidor.',
  },
  units: {
    purpose:
      'Administra el inventario físico del condominio: casas, apartamentos, locales, depósitos, estacionamientos y, cuando aplica, su estructura por edificios o torres.',
    actions: [
      'Definir el tipo de propiedad y su estructura física.',
      'Crear, editar, archivar y reactivar unidades.',
      'Buscar unidades y revisar su propiedad, ocupación e historial.',
    ],
    steps: [
      'Confirma el condominio seleccionado y observa el botón superior: si dice Definir tipo de propiedad, pulsa allí antes de crear unidades.',
      'En una comunidad de casas no necesitas crear torres: después de definir la topología usa Nueva casa. En estructuras con edificios usa Configurar estructura cuando corresponda.',
      'Para crear una unidad pulsa Nueva unidad o Nueva casa, según el tipo de propiedad.',
      'Completa el código, tipo y demás datos del formulario; si la topología usa edificios, selecciona el edificio correcto.',
      'Guarda y verifica el mensaje Unidad creada o Unidad actualizada correctamente.',
      'Usa Buscar unidades y los filtros de estado, tipo y edificio para localizar un registro existente.',
      'Abre una unidad para revisar su detalle. Si deja de operar, archívala en vez de borrar información histórica; puede reactivarse después.',
    ],
    beforeConfirm: [
      'No inventes edificios para una comunidad de casas; la topología define qué estructura aplica.',
      'Confirma que el código y la ubicación identifican de forma inequívoca la unidad antes de guardar.',
      'Archivar una unidad cambia su estado operativo, pero no debe utilizarse para borrar su historial de propiedad u ocupación.',
    ],
    result: [
      'Una unidad nueva aparece en el Directorio de unidades y queda disponible para relacionarla con personas y operaciones posteriores.',
      'Una unidad archivada permanece en el historial y puede encontrarse usando el filtro Archivadas.',
    ],
    troubleshooting: [
      'Si Nueva unidad está deshabilitado, revisa si falta Definir tipo de propiedad o, en un edificio único, configurar exactamente un edificio.',
      'Si no encuentras una unidad, pulsa Limpiar filtros y vuelve a buscar por código, persona o ubicación.',
    ],
    tips: [
      'Usa códigos cortos y reconocibles; cuando existen edificios, el nombre del edificio completa el contexto.',
      'No reutilices identidades de unidades históricas para representar otra unidad física.',
    ],
    permissions:
      'Los roles administrativos autorizados pueden modificar el inventario; otros roles pueden tener acceso de consulta según su relación y permisos.',
    importKinds: ['units'],
  },
  people: {
    purpose:
      'Mantiene una sola identidad por persona y organiza, por separado, sus relaciones con unidades, roles en la comunidad, acceso digital y notas administrativas.',
    actions: [
      'Crear o editar personas y datos de contacto.',
      'Vincular una persona con una o varias unidades como propietario, ocupante o responsable de comunicaciones.',
      'Gestionar roles comunitarios, acceso digital, invitaciones e historial sin duplicar la persona.',
    ],
    steps: [
      'Busca primero a la persona por nombre, correo o teléfono para evitar crear un duplicado.',
      'Si no existe, crea la persona y guarda sus datos básicos; agrega correo si más adelante necesitará acceso a Habitta.',
      'Selecciona la persona y pulsa Vincular unidad para registrar la relación correcta con una unidad existente.',
      'Dentro de cada relación administra propiedad, ocupación y responsabilidades de comunicación como ciclos independientes; usa Historial para revisar relaciones anteriores.',
      'Si la persona tiene un rol institucional, abre Roles en la comunidad, completa Relación y Cargo o detalle, y pulsa Agregar relación.',
      'Para acceso digital abre Acceso digital, elige Rol que recibirá y Unidad vinculada, y pulsa Crear invitación. Debe existir una relación activa compatible y un correo válido.',
      'Usa Notas internas sólo para contexto administrativo autorizado; Guardar nota crea una nueva revisión y Limpiar nota no elimina el historial anterior.',
    ],
    beforeConfirm: [
      'Confirma que estás editando a la persona correcta y no una identidad duplicada.',
      'Antes de invitar, verifica que el rol digital coincida con una propiedad u ocupación activa de esa unidad.',
      'No guardes contraseñas, tokens, tarjetas ni secretos en Notas internas.',
    ],
    result: [
      'La persona conserva una sola ficha y cada relación queda visible en su resumen e historial.',
      'Al crear una invitación aparece Enlace seguro listo y, según el ambiente, el estado de entrega por correo.',
      'Cerrar una relación registra su fecha de fin; no borra la historia anterior.',
    ],
    troubleshooting: [
      'Si Crear invitación está deshabilitado, agrega un correo y confirma que exista propiedad activa u ocupación activa como inquilino en la unidad elegida.',
      'Si una unidad no aparece al vincular, confirma primero que esté activa en Unidades.',
    ],
    tips: [
      'Una persona puede relacionarse con varias unidades sin duplicar su identidad.',
      'Propiedad, ocupación, comunicaciones, rol comunitario y acceso digital representan cosas distintas aunque se vean juntas en el perfil.',
    ],
    permissions:
      'Administradores y asistentes autorizados gestionan personas y relaciones; notas privadas y ciertas acciones de acceso se restringen adicionalmente por rol.',
    importKinds: ['people'],
  },
  maintenance: {
    purpose:
      'Controla activos físicos, mantenimiento preventivo, inspecciones, órdenes de trabajo y evidencias/costos sin perder la trazabilidad técnica.',
    actions: [
      'Registrar activos y ubicarlos según la topología real del condominio.',
      'Crear planes recurrentes y órdenes de trabajo.',
      'Documentar servicios, evidencias y costos en el espacio financiero correspondiente.',
    ],
    steps: [
      'Elige primero el espacio Operaciones para activos, planes y órdenes, o Finanzas y evidencias para revisar la parte económica y soportes del mantenimiento.',
      'En Operaciones abre Activos y crea el equipo con Código, Nombre, Categoría y Tipo de ubicación; en comunidades de casas no se mostrará la opción Edificio o torre.',
      'Pulsa Crear activo y confirma que aparezca en el inventario con la ubicación correcta.',
      'Para trabajo recurrente crea un plan, selecciona el Activo, Tipo, Instrucciones, Frecuencia y próxima fecha.',
      'Crea o abre una orden de trabajo para programar y ejecutar la tarea; actualiza su estado conforme avanza realmente el trabajo.',
      'Antes de cerrar una orden, documenta el servicio realizado, proveedor y evidencia disponible.',
      'Si necesitas revisar costos o soportes asociados, cambia a Finanzas y evidencias y confirma siempre la moneda del registro.',
    ],
    beforeConfirm: [
      'Verifica activo, ubicación y fechas antes de crear un plan u orden; una programación incorrecta puede generar trabajo para el equipo equivocado.',
      'No retires un activo mientras tenga trabajo o historial que todavía deba revisarse.',
      'Registra cada costo con su moneda real; Habitta no mezcla USD, VES o EUR.',
    ],
    result: [
      'El activo queda disponible para planes y órdenes futuras con su historial técnico.',
      'Una orden completada conserva las evidencias y registros de servicio asociados.',
    ],
    troubleshooting: [
      'Si no aparece Edificio o torre, puede ser correcto para la topología del condominio; usa Área común o Unidad cuando corresponda.',
      'Si un activo no está disponible para un plan, revisa que no esté retirado.',
    ],
    tips: [
      'Usa códigos estables como BOMBA-01 o ASC-02 para localizar equipos rápidamente.',
      'La generación de trabajo recurrente está diseñada para evitar duplicados cuando se repite el proceso.',
    ],
    permissions:
      'Los roles de gestión pueden crear y actualizar mantenimiento; junta y contabilidad pueden tener acceso de consulta o a evidencia según autorización.',
  },
  fees: {
    purpose:
      'Gestiona cuotas y cuentas por cobrar: cargos ordinarios recurrentes, extraordinarios, puntuales, mora, saldos iniciales, estados de cuenta y otras herramientas de cobranza.',
    actions: [
      'Crear cargos sin mezclar monedas ni unidades.',
      'Configurar cuotas recurrentes y recargos por mora.',
      'Consultar cartera, emitir estados de cuenta e importar saldos iniciales.',
    ],
    steps: [
      'Confirma primero la moneda activa en Vista financiera; todas las cifras de esa vista pertenecen a esa moneda.',
      'Para crear un cobro pulsa Nueva cuota y elige el tipo correcto: ordinaria/recurrente, extraordinaria masiva o cargo puntual, según el motivo real.',
      'Si es una cuota ordinaria recurrente, utiliza el espacio de Cuotas ordinarias para configurar concepto, monto, moneda, periodicidad y alcance antes de generar obligaciones.',
      'Para un cargo extraordinario o puntual completa concepto, unidades/alcance, monto, moneda, emisión y vencimiento; usa la previsualización cuando el flujo la ofrezca.',
      'Para mora pulsa Recargos por mora, revisa la política y guarda sólo cuando la regla represente lo acordado por la administración.',
      'Para revisar una unidad o saldo usa los filtros de cartera y abre el cargo correspondiente; usa Estado de cuenta para generar la lectura detallada.',
      'Si estás migrando desde otra administración, usa Importar datos para Saldos iniciales y previsualiza el archivo antes de confirmar una única importación.',
    ],
    beforeConfirm: [
      'Confirma concepto, unidades afectadas, moneda, monto, fecha de emisión y vencimiento antes de publicar cualquier obligación.',
      'No conviertas un saldo histórico de una moneda a otra para hacerlo coincidir; cada moneda conserva su propio libro.',
      'Saldos iniciales representan historia previa: revisa el archivo y evita volver a importar el mismo conjunto de datos.',
    ],
    result: [
      'Los cargos creados aparecen en la cartera y actualizan sus resúmenes dentro de la misma moneda.',
      'Una política recurrente genera obligaciones según su configuración sin reescribir cargos históricos.',
      'El Estado de cuenta refleja débitos, créditos y saldo de la unidad con trazabilidad.',
    ],
    troubleshooting: [
      'Si Nueva cuota no ofrece la opción esperada, revisa si estás intentando crear una obligación ordinaria, extraordinaria o puntual y usa el flujo correspondiente.',
      'Si un total parece incorrecto, confirma primero moneda, filtros, estado de la obligación y pagos aplicados.',
    ],
    tips: [
      'Usa un concepto claro y consistente para que el estado de cuenta sea entendible por residentes y administración.',
      'Reversiones, transferencias de propiedad y ajustes deben conservar el historial en vez de borrar operaciones anteriores.',
    ],
    permissions: 'Sólo los roles financieros autorizados pueden crear o modificar obligaciones; otros roles ven únicamente la información permitida.',
    importKinds: ['opening_balances'],
  },
  payments: {
    purpose:
      'Registra comprobantes, valida pagos, aplica fondos a obligaciones y conserva recibos/reversos con trazabilidad por moneda.',
    actions: [
      'Configurar Métodos de pago por moneda.',
      'Registrar un pago y su comprobante.',
      'Revisar, corregir, aprobar, aplicar o revertir pagos según su estado y permisos.',
    ],
    steps: [
      'Selecciona la moneda que quieres revisar y confirma que exista al menos un método activo; si no existe, abre Métodos o Configurar y crea el canal de cobro.',
      'Pulsa Registrar pago, selecciona unidad, método, monto, moneda, fecha, referencia y comprobante cuando el método lo requiera.',
      'Guarda el pago y completa el paso de soporte si el flujo lo solicita; un borrador todavía no está aprobado ni aplicado.',
      'Si tu rol puede revisar pagos, abre Bandeja de revisión y selecciona un pago enviado.',
      'Compara visualmente monto, moneda, fecha, referencia, pagador y comprobante antes de aprobar o solicitar corrección.',
      'Después de aprobar, revisa cómo quedó aplicado a obligaciones o crédito disponible y abre el recibo cuando necesites la evidencia final.',
      'Si un pago aprobado fue incorrecto, usa el flujo de reverso permitido; no intentes compensarlo borrando historia.',
    ],
    beforeConfirm: [
      'Nunca apruebes sólo porque existe un comprobante: valida monto, moneda, referencia, fecha y correspondencia con la unidad.',
      'Confirma que el método seleccionado corresponde a la misma moneda del pago.',
      'Una aprobación afecta la cartera; una reversión debe conservar la operación original y su razón.',
    ],
    result: [
      'Un pago aprobado actualiza la cartera y conserva recibo, asignaciones y auditoría.',
      'Un pago enviado puede aparecer en Bandeja de revisión; un borrador o corrección permanece pendiente de acción.',
      'Un reverso aparece como reversado sin eliminar el pago original.',
    ],
    troubleshooting: [
      'Si la Bandeja de revisión dice Acceso restringido, tu rol no puede revisar pagos.',
      'Si Registrar pago no ofrece un método, abre Métodos y verifica que haya uno activo para la moneda seleccionada.',
    ],
    tips: [
      'Mantén métodos de pago con nombres reconocibles para evitar seleccionar la cuenta equivocada.',
      'No mezcles monedas ni apliques una tasa implícita para hacer cuadrar un pago.',
    ],
    permissions:
      'Registrar, revisar y aprobar son permisos distintos. La interfaz y el servidor limitan cada acción según el rol asignado.',
  },
  treasury: {
    purpose:
      'Controla cuentas bancarias y caja mediante movimientos inmutables, transferencias internas y conciliaciones contra estados de cuenta.',
    actions: [
      'Crear cuentas por moneda.',
      'Registrar depósitos, retiros, comisiones, ajustes y transferencias.',
      'Conciliar períodos y cerrar la conciliación cuando el banco y Habitta cuadren.',
    ],
    steps: [
      'Si es la primera vez, pulsa Nueva cuenta y registra nombre, tipo, moneda y saldo inicial según el formulario.',
      'Para una entrada, salida, comisión o ajuste pulsa Registrar movimiento y selecciona la cuenta y el tipo correcto.',
      'Para mover dinero entre dos cuentas usa Transferencia, no dos movimientos independientes; selecciona origen y destino correctos.',
      'Revisa Movimientos recientes para confirmar que el saldo se deriva de las filas registradas.',
      'Al recibir el estado de cuenta bancario pulsa Nueva conciliación, elige la cuenta y el período y registra los saldos solicitados.',
      'Compara la diferencia mostrada con el estado de cuenta y corrige registros faltantes mediante nuevos movimientos o reversos apropiados.',
      'Pulsa Cerrar únicamente cuando la conciliación esté lista para quedar como período cerrado.',
    ],
    beforeConfirm: [
      'Verifica cuenta, moneda, fecha, dirección y monto; los saldos no se editan manualmente.',
      'Una Transferencia mueve fondos entre cuentas y no debe registrarse como ingreso o gasto.',
      'No cierres una conciliación con diferencias que todavía no entiendes.',
    ],
    result: [
      'Cada movimiento modifica el saldo calculado de su cuenta sin reescribir filas anteriores.',
      'Una transferencia queda trazada como movimiento entre cuentas.',
      'Una conciliación cerrada permanece identificada como Cerrada y conserva el período revisado.',
    ],
    troubleshooting: [
      'Si Transferencia está deshabilitada, necesitas al menos dos cuentas configuradas.',
      'Si Nueva conciliación está deshabilitada, crea primero una cuenta.',
    ],
    tips: [
      'Corrige movimientos equivocados con mecanismos de reverso o ajuste, no borrando historia.',
      'Revisa cada moneda por separado; el total disponible nunca debe sumar monedas diferentes.',
    ],
    permissions: 'Administradores y contadores autorizados gestionan tesorería; la junta puede tener acceso de consulta.',
  },
  expenses: {
    purpose:
      'Registra egresos operativos con categoría, proveedor, soporte, aprobación, pago, anulación y trazabilidad por moneda.',
    actions: [
      'Administrar Categorías y proveedores.',
      'Registrar un gasto y adjuntar factura, recibo o soporte.',
      'Mover el gasto por su ciclo de revisión, aprobación, pago o anulación.',
    ],
    steps: [
      'Si falta la clasificación o el proveedor, pulsa Categorías y proveedores, escribe el nombre y usa Agregar.',
      'Pulsa Registrar gasto y completa descripción, categoría, proveedor, monto, moneda, fecha y los demás campos aplicables.',
      'Guarda el borrador y adjunta el comprobante cuando el flujo lo solicite; no cierres el proceso creyendo que un borrador ya está aprobado.',
      'Abre el gasto desde la lista y revisa su estado, eventos y archivos adjuntos.',
      'Cuando corresponda, envíalo a aprobación; el administrador autorizado debe revisar monto, moneda, proveedor y soporte antes de aprobar.',
      'Marca el gasto como pagado sólo cuando el desembolso haya ocurrido realmente y la evidencia sea consistente.',
      'Si debes anularlo, utiliza la acción de anulación y registra el motivo; el historial y eventos deben permanecer visibles.',
    ],
    beforeConfirm: [
      'Confirma que categoría, proveedor, monto y moneda correspondan al documento de soporte.',
      'No combines dos monedas en un mismo gasto ni uses un monto convertido como sustituto del original.',
      'Antes de anular, confirma que realmente deseas terminar el ciclo y que el motivo explique la decisión.',
    ],
    result: [
      'El gasto aparece con un estado explícito y su historial de eventos.',
      'Los soportes quedan asociados al gasto privado correspondiente.',
      'Un gasto pagado o anulado conserva su trazabilidad en vez de desaparecer.',
    ],
    troubleshooting: [
      'Si no puedes seleccionar una categoría o proveedor, abre Categorías y proveedores y confirma que exista un registro activo.',
      'Si una acción no aparece, revisa el estado actual del gasto y tus permisos; las transiciones permitidas dependen de ambos.',
    ],
    tips: [
      'Adjunta evidencia suficiente antes de pedir aprobación.',
      'Usa descripciones que permitan entender el gasto meses después sin depender de memoria personal.',
    ],
    permissions: 'Los permisos separan preparación, aprobación y otras transiciones; el servidor vuelve a validar cada operación.',
  },
  budgets: {
    purpose:
      'Planifica gastos por período, categoría y moneda, conserva versiones aprobadas y compara el presupuesto con la ejecución real.',
    actions: [
      'Crear presupuestos en borrador con líneas por categoría y moneda.',
      'Enviar a aprobación, aprobar o crear una revisión versionada.',
      'Abrir Ver ejecución para comparar presupuesto y gasto real.',
    ],
    steps: [
      'Pulsa Crear primer presupuesto o la acción para crear presupuesto y define Nombre, Desde y Hasta.',
      'En Líneas presupuestarias pulsa Agregar línea cuando necesites otra categoría; completa Categoría, Moneda, Monto y Nota.',
      'Pulsa Crear borrador y revisa el nuevo período antes de enviarlo.',
      'Si necesitas modificar un borrador, pulsa Revisar y crea la versión correspondiente; una versión aprobada se cambia mediante Crear revisión, no sobrescribiéndola.',
      'Cuando el contenido esté listo pulsa Enviar a aprobación.',
      'El rol autorizado debe revisar período, líneas y monedas y luego pulsar Aprobar.',
      'Cuando exista una versión aprobada, pulsa Ver ejecución para comparar Presupuesto, Real y Disponible por categoría y moneda.',
    ],
    beforeConfirm: [
      'Comprueba que Desde no sea posterior a Hasta y que cada línea tenga categoría, moneda de tres letras y monto mayor que cero.',
      'No consolides USD, VES o EUR en una misma línea o total; cada moneda se mantiene independiente.',
      'Aprobar convierte esa versión en referencia vigente para la comparación; revisa bien antes de hacerlo.',
    ],
    result: [
      'Crear borrador genera una versión inicial del período.',
      'Crear nueva versión o Crear revisión preserva las versiones anteriores en Historial de versiones.',
      'Ver ejecución usa únicamente gastos aprobados o pagados del período y no convierte monedas.',
    ],
    troubleshooting: [
      'Si no puedes guardar, revisa fechas y que todas las líneas tengan categoría, moneda y monto válido.',
      'Si Ver ejecución no aparece, el período todavía no tiene una versión aprobada.',
    ],
    tips: [
      'Usa Nota de versión para explicar por qué cambió un presupuesto.',
      'Revisa el Historial de versiones antes de crear otra revisión para evitar cambios duplicados.',
    ],
    permissions: 'Administradores y contadores pueden preparar presupuestos; la aprobación requiere el rol administrativo autorizado.',
  },
  reports: {
    purpose:
      'Convierte cargos, cobros y cartera en una lectura financiera por período, moneda y unidad, sin fabricar egresos ni conversiones.',
    actions: [
      'Cambiar el período entre 3, 6 y 12 meses.',
      'Cambiar la moneda del informe sin mezclar libros.',
      'Exportar CSV general o por panel para análisis externo.',
    ],
    steps: [
      'Selecciona el condominio correcto y, en Período del reporte, elige Últimos 3, 6 o 12 meses.',
      'En Moneda del informe pulsa USD, VES u otra moneda disponible para analizar únicamente ese libro.',
      'Revisa primero Cargos del período, Cobros aprobados, Tasa de recuperación y Cartera pendiente.',
      'Lee Cargos vs cobros y Antigüedad de saldos para entender tendencia y riesgo de cartera.',
      'Revisa Estados del período y Señales principales para detectar pagos en validación o saldos vencidos.',
      'Baja al detalle por unidad para identificar qué unidades concentran saldo pendiente.',
      'Pulsa Exportar CSV para el detalle principal o CSV dentro de cada panel cuando necesites trabajar los datos fuera de Habitta.',
    ],
    beforeConfirm: [
      'Antes de comparar dos cifras, confirma que pertenecen al mismo período y a la misma moneda.',
      'Recuerda que el reporte indica explícitamente cuando una fuente todavía no está integrada; no interpretes una ausencia como cero real.',
    ],
    result: [
      'Cambiar período o moneda recalcula la vista sin alterar ningún dato financiero.',
      'Exportar CSV descarga la información correspondiente a la moneda y período seleccionados.',
    ],
    troubleshooting: [
      'Si no hay información financiera, confirma que existan cargos o pagos en el condominio y moneda seleccionados.',
      'Si una gráfica está vacía, revisa el período y la moneda antes de asumir un problema de carga.',
    ],
    tips: [
      'Compara períodos equivalentes para evitar conclusiones engañosas.',
      'Los egresos no se completan con valores simulados cuando la fuente consolidada no está disponible.',
    ],
    permissions: 'El acceso a reportes depende del rol; la vista es de lectura y no modifica libros financieros.',
  },
  community: {
    purpose:
      'Resume la composición de la comunidad, la calidad del directorio y la estructura residencial usando términos que corresponden al tipo real de propiedad.',
    actions: [
      'Revisar unidades, personas y cobertura de contacto.',
      'Abrir el directorio para completar datos faltantes.',
      'Ir a Unidades, Solicitudes o Anuncios desde accesos operativos.',
    ],
    steps: [
      'Confirma el condominio y revisa Unidades activas, Personas activas, Cobertura de contacto y Sin contacto completo.',
      'Lee el panel de estructura: en una comunidad de casas las casas se gestionan directamente como unidades; Habitta no debe exigirte torres.',
      'Pulsa Ver unidades para revisar o corregir inventario y estructura desde Unidades.',
      'En Salud de los contactos revisa Con correo, Con teléfono y Sin ningún contacto.',
      'Pulsa Completar directorio o Abrir directorio para corregir personas con información incompleta.',
      'Usa Ver solicitudes para entrar al flujo de atención cuando haya requerimientos de la comunidad.',
      'Revisa Personas registradas y los accesos rápidos para confirmar que la información operativa tiene sentido antes de comunicarla.',
    ],
    beforeConfirm: [
      'No uses la vista Comunidad para modificar la topología: realiza cambios de estructura desde Unidades/Configurar estructura.',
      'Antes de comunicarte con residentes, revisa la cobertura de contacto y evita exponer datos privados en anuncios generales.',
    ],
    result: [
      'La vista refleja la estructura y el directorio actuales sin crear jerarquías físicas que no apliquen.',
      'Los botones de acción llevan al módulo responsable de modificar la información.',
    ],
    troubleshooting: [
      'Si la estructura aparece como pendiente o neutral, revisa el tipo de propiedad desde Unidades.',
      'Si la cobertura es baja, abre Personas y completa correo/teléfono en los registros correspondientes.',
    ],
    tips: [
      'Usa Comunidad como tablero de calidad operativa, no como sustituto de Personas o Unidades.',
      'Mantén contactos actualizados para que Anuncios y otros canales sean útiles.',
    ],
    permissions: 'La información y los accesos rápidos visibles se limitan según el rol del usuario.',
  },
  documents: {
    purpose:
      'Organiza archivos privados en carpetas y categorías, controla audiencia y retención, conserva versiones y registra descargas.',
    actions: [
      'Crear Nueva carpeta, Nueva categoría y Nuevo documento.',
      'Cargar versiones nuevas sin reemplazar el historial anterior.',
      'Descargar, vincular registros por UUID y archivar documentos manteniendo trazabilidad.',
    ],
    steps: [
      'Si necesitas organización previa, pulsa Nueva carpeta y define Nombre, Carpeta superior y Descripción; o Nueva categoría para definir visibilidad y retención predeterminadas.',
      'Pulsa Nuevo documento y completa Título, Carpeta, Categoría, Visibilidad, Retención y Descripción según corresponda.',
      'Si adjuntas el Archivo inicial, usa sólo PDF, JPG o PNG de hasta 10 MB y pulsa Crear documento.',
      'Selecciona el documento creado para abrir su detalle y revisar audiencia, versiones y registros relacionados.',
      'Para corregir o actualizar el archivo usa Nueva versión; agrega el archivo y una nota de versión en vez de sustituir el historial.',
      'Para obtener una copia usa Descargar; Habitta registra la descarga autorizada antes de entregar el archivo.',
      'Cuando el documento deje de estar vigente usa Archivar y confirma el diálogo; el historial y versiones permanecen intactos.',
    ],
    beforeConfirm: [
      'Confirma Visibilidad antes de crear o versionar un documento para no compartirlo con una audiencia incorrecta.',
      'Revisa formato y tamaño del archivo antes de cargarlo.',
      'Para vincular un registro, usa el UUID real del objeto; un texto o código visible no reemplaza el UUID.',
    ],
    result: [
      'Un documento creado aparece en la biblioteca y, si adjuntaste archivo inicial, tendrá su primera versión.',
      'Nueva versión incrementa el historial sin eliminar la anterior.',
      'Archivar cambia la vigencia del documento, pero conserva versiones y trazabilidad.',
    ],
    troubleshooting: [
      'Si un archivo es rechazado, confirma que sea PDF/JPG/PNG y no exceda 10 MB.',
      'Si el vínculo falla, revisa que el UUID tenga el formato completo xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.',
    ],
    tips: [
      'Usa categorías para aplicar audiencia y retención consistentes.',
      'No cargues un archivo corregido como documento duplicado si realmente corresponde a una nueva versión del mismo documento.',
    ],
    permissions:
      'Administración, contabilidad, asistentes autorizados y junta pueden gestionar según su rol; residentes sólo ven documentos permitidos por audiencia y relación activa.',
  },
  governance: {
    purpose:
      'Gestiona decisiones formales mediante propuestas, votaciones, reglas, asambleas, actas y acuerdos con quórum e historial.',
    actions: [
      'Trabajar en Propuestas y votaciones, Asambleas y actas o Acuerdos y seguimiento.',
      'Crear propuestas con opciones, reglas, quórum, cierre y soportes.',
      'Abrir votaciones, registrar votos elegibles y conservar resultados/decisiones.',
    ],
    steps: [
      'Elige arriba la sección correcta: Propuestas y votaciones, Asambleas y actas o Acuerdos y seguimiento.',
      'Para una decisión nueva ve a Propuestas y votaciones y pulsa Crear propuesta.',
      'Completa título, descripción, categoría, base de votación, quórum requerido, cierre de votación y presupuesto estimado si aplica.',
      'En Opciones de votación usa Agregar opción hasta tener todas las alternativas y pulsa Crear propuesta en borrador.',
      'Abre el borrador, adjunta documentos de soporte y revisa elegibilidad, reglas y fechas antes de cambiar su estado para aceptar votos.',
      'Durante una votación, cada usuario debe seleccionar una opción y, si la regla es por unidad, la unidad elegible correspondiente; confirma el mensaje de voto registrado.',
      'Después del cierre revisa resultados, quórum y decisión; usa las secciones de asamblea/acuerdos cuando necesites documentar el seguimiento formal.',
    ],
    beforeConfirm: [
      'No abras una votación hasta verificar opciones, elegibilidad, base de votación, quórum y fecha de cierre.',
      'No cambies reglas fundamentales después de abrir la votación; la trazabilidad de la decisión depende de reglas estables.',
      'Si hay presupuesto, confirma monto y moneda antes de publicar.',
    ],
    result: [
      'Crear propuesta en borrador genera una decisión todavía editable antes de abrirse.',
      'Los votos registrados permanecen asociados a la elegibilidad y reglas aplicables.',
      'Resultados, asambleas y acuerdos conservan la trazabilidad de la decisión comunitaria.',
    ],
    troubleshooting: [
      'Si Crear propuesta no está disponible, tu rol puede ser de participación/consulta sin facultad de gestión.',
      'Si no puedes votar, revisa la elegibilidad mostrada para tu usuario/unidad y el estado de la votación.',
    ],
    tips: [
      'Adjunta cotizaciones y soportes antes de pedir una decisión importante.',
      'Usa el seguimiento de acuerdos para separar la decisión tomada de su ejecución posterior.',
    ],
    permissions:
      'La creación y gestión requieren roles autorizados; cada votante sólo puede ejercer los votos que el servidor determine como elegibles.',
  },
  requests: {
    purpose:
      'Da seguimiento a solicitudes de residentes o áreas comunes desde su creación hasta resolución/cierre, con prioridad, responsable, comentarios, archivos e historial.',
    actions: [
      'Crear Nueva solicitud y administrar Categorías.',
      'Trabajar en vista Flujo o Lista y filtrar por estado, prioridad, categoría o asignación.',
      'Asignar, actualizar, comentar, resolver o cancelar conservando el historial.',
    ],
    steps: [
      'Si falta una clasificación, pulsa Categorías, completa Nombre, Código y Descripción y usa Agregar categoría.',
      'Pulsa Nueva solicitud y completa Título, Descripción, Categoría, Prioridad y Unidad o ubicación; el Solicitante puede quedar como Usuario actual.',
      'Usa Urgente sólo para riesgos de seguridad o daños activos y pulsa Crear solicitud.',
      'Localiza el caso usando Buscar solicitudes, filtros y la vista Flujo o Lista; abre la tarjeta/fila para ver el detalle.',
      'En el detalle actualiza estado, prioridad, categoría, responsable, fecha objetivo o resolución y guarda los cambios disponibles.',
      'Agrega Comentario para información visible según la configuración de visibilidad, o Nota interna cuando necesites coordinación administrativa privada.',
      'Si el caso debe cancelarse, escribe un Motivo de cancelación y pulsa Cancelar solicitud; el historial y motivo permanecen registrados.',
    ],
    beforeConfirm: [
      'Confirma Categoría, Prioridad y Unidad o ubicación para que el caso llegue al contexto correcto.',
      'No uses Urgente para acelerar solicitudes normales.',
      'Antes de cerrar/resolver, documenta la solución; antes de cancelar, escribe un motivo claro.',
    ],
    result: [
      'La solicitud aparece con número, estado y prioridad y puede seguirse en Flujo o Lista.',
      'Actualizaciones y comentarios se agregan a la línea de tiempo.',
      'Cancelar conserva todo el historial y registra el motivo en vez de eliminar el caso.',
    ],
    troubleshooting: [
      'Si no encuentras una solicitud, limpia o cambia los filtros de estado, prioridad, categoría y asignación.',
      'Si no puedes asignar a alguien, confirma que la persona tenga usuario vinculado y esté activa.',
    ],
    tips: [
      'Escribe en la descripción ubicación, momento y síntomas suficientes para que otra persona pueda actuar sin preguntarte de nuevo.',
      'Usa notas internas para coordinación del equipo y comentarios públicos sólo para información apropiada para el solicitante.',
    ],
    permissions: 'Residentes pueden crear/consultar según su acceso; el equipo autorizado gestiona asignación, estados, notas y categorías.',
  },
  announcements: {
    purpose:
      'Crea comunicaciones segmentadas, programadas o publicadas con audiencia, prioridad, adjuntos, lectura y trazabilidad.',
    actions: [
      'Crear Nuevo anuncio y definir su audiencia.',
      'Programar o publicar comunicados y retirar una programación cuando todavía sea editable.',
      'Consultar alcance, confirmaciones de lectura, archivos e historial.',
    ],
    steps: [
      'Pulsa Nuevo anuncio y redacta un título y contenido claros.',
      'Selecciona Prioridad y Audiencia; cuando la topología sea comunidad de casas no debe aparecer una audiencia de edificio que no aplique.',
      'Si seleccionas unidades o estructura, revisa cuidadosamente los destinatarios antes de guardar el borrador.',
      'Adjunta documentos privados antes de publicar cuando formen parte del comunicado.',
      'Si quieres publicación futura, usa Programación, elige fecha/hora y pulsa Programar; usa Retirar programación si necesitas volver a editar el calendario.',
      'Antes de publicar revisa nuevamente audiencia, prioridad, contenido y requerimiento de confirmación de lectura.',
      'Después de publicar revisa Alcance, Leídos y Confirmados; cuando deje de estar vigente usa Archivar anuncio, que conserva el historial.',
    ],
    beforeConfirm: [
      'La audiencia es crítica: confirma si el anuncio va a toda la comunidad, residentes específicos, unidades o estructura permitida.',
      'Reserva la prioridad urgente para eventos que realmente lo requieran.',
      'No publiques datos personales sensibles ni documentos dirigidos a otra audiencia.',
    ],
    result: [
      'Un borrador queda editable; uno programado espera la fecha definida; uno publicado pasa a ser visible para su audiencia.',
      'La lectura y confirmación se reflejan en Alcance cuando el comunicado está publicado.',
      'Archivar termina la vigencia sin borrar eventos ni adjuntos históricos.',
    ],
    troubleshooting: [
      'Si faltan opciones de edificio o unidad, revisa la topología y el inventario del condominio; algunas opciones se ocultan correctamente cuando no aplican.',
      'Si la publicación futura no es correcta, usa Retirar programación antes de volver a programar.',
    ],
    tips: [
      'Usa títulos que permitan reconocer el asunto desde una notificación.',
      'Revisa el historial de actividad cuando necesites demostrar cuándo se programó, publicó o archivó un comunicado.',
    ],
    permissions: 'Sólo roles autorizados crean, programan, publican o archivan; la audiencia y las relaciones activas limitan quién puede ver el contenido.',
  },
  team: {
    purpose:
      'Controla quién puede administrar el condominio, qué rol tiene y qué invitaciones administrativas siguen pendientes.',
    actions: [
      'Crear y enviar invitaciones administrativas.',
      'Cambiar roles, suspender, reactivar o retirar accesos.',
      'Revocar invitaciones pendientes y usar un enlace seguro de respaldo cuando sea necesario.',
    ],
    steps: [
      'En Nueva invitación pulsa o enfócate en Invitar administrador y escribe el Correo electrónico exacto de la persona.',
      'Selecciona el Rol administrativo mínimo que necesita y revisa la descripción del rol antes de seguir.',
      'Elige Fecha de expiración entre mañana y 90 días y pulsa Crear y enviar invitación.',
      'Confirma el mensaje de entrega. Si el correo no pudo enviarse, Habitta muestra Enlace seguro de respaldo; usa Copiar enlace o Abrir en mi correo para entregarlo de forma controlada.',
      'En Miembros del equipo localiza a la persona; para cambiar permisos selecciona el nuevo rol y pulsa Guardar rol.',
      'Para detener acceso temporalmente usa Suspender y confirma el diálogo; para devolverlo usa Reactivar cuando corresponda.',
      'Para retirar acceso definitivamente del condominio usa Retirar/Eliminar acceso según la acción mostrada y confirma; la cuenta global y el historial de acciones se conservan.',
    ],
    beforeConfirm: [
      'Comprueba dos veces el correo y el condominio antes de enviar una invitación.',
      'Asigna el rol mínimo necesario; no otorgues permisos administrativos amplios sólo por conveniencia.',
      'Antes de suspender o retirar, confirma que seleccionaste al miembro correcto y entiende la diferencia entre detener acceso temporalmente y retirarlo.',
    ],
    result: [
      'Una invitación nueva aparece como Pendiente hasta ser aceptada, revocada o vencida.',
      'Guardar rol actualiza los permisos del miembro para ese condominio.',
      'Suspender bloquea operación en el condominio; retirar acceso conserva la cuenta global y la trazabilidad histórica.',
    ],
    troubleshooting: [
      'Si el correo falla, no crees invitaciones repetidas de inmediato: usa el Enlace seguro de respaldo de la invitación ya creada.',
      'Si una invitación venció o fue revocada, crea una nueva sólo cuando realmente sea necesario.',
    ],
    tips: [
      'Nunca compartas una misma cuenta entre administradores.',
      'Revisa periódicamente miembros activos, suspendidos e invitaciones pendientes.',
    ],
    permissions: 'Sólo administradores con la facultad correspondiente pueden gestionar el equipo y los accesos del condominio.',
  },
  audit: {
    purpose:
      'Permite investigar actividad administrativa consolidada sin modificar el historial original; es un espacio de consulta read-only.',
    actions: [
      'Filtrar eventos por módulo, severidad, tipo de entidad, actor y fechas.',
      'Inspeccionar entidad, actor, severidad y Metadata segura.',
      'Recorrer páginas de eventos sin cambiar ninguna operación.',
    ],
    steps: [
      'Confirma el condominio en la barra superior y abre Sistema → Auditoría.',
      'Si buscas algo específico, selecciona Módulo y/o Severidad; usa Tipo de entidad cuando conozcas el tipo técnico del registro.',
      'Para filtrar por persona/usuario pega el UUID completo en Actor ID; también puedes pulsar el ID corto de un actor en una fila para prepararlo como filtro.',
      'Define Desde y Hasta sólo si necesitas acotar el período y pulsa Aplicar filtros.',
      'Abre Ver en Metadata segura cuando necesites el detalle sanitizado que el servidor permite mostrar.',
      'Pulsa Actualizar para refrescar la página actual sin cambiar los filtros.',
      'Usa Anterior y Siguiente para recorrer bloques de eventos; pulsa Limpiar para volver a todos los eventos.',
    ],
    beforeConfirm: [
      'Actor ID debe ser un UUID válido completo y Hasta no puede ser anterior a Desde.',
      'Una Advertencia significa que el evento merece atención; no prueba por sí sola un incidente o error.',
    ],
    result: [
      'Aplicar filtros reduce el conjunto de eventos y muestra cuántos filtros están activos.',
      'Ninguna acción del Registro de auditoría modifica el evento ni la entidad original.',
    ],
    troubleshooting: [
      'Si Actor ID es rechazado, copia el UUID completo en lugar del identificador abreviado que se muestra en la tabla.',
      'Si no aparecen eventos, pulsa Limpiar y vuelve a aplicar los filtros de uno en uno para identificar cuál excluye los resultados.',
    ],
    tips: [
      'Corrige cualquier problema desde el módulo de origen; Auditoría sólo explica qué ocurrió.',
      'La Metadata segura ya está limitada por el servidor para evitar exposición innecesaria de datos sensibles.',
    ],
    permissions: 'El workspace está reservado a administradores autorizados y el servidor valida nuevamente el acceso a los eventos.',
  },
  settings: {
    purpose:
      'Configura recordatorios globales del condominio y las preferencias personales de notificaciones, separando claramente lo administrable de lo restringido por rol.',
    actions: [
      'Activar o desactivar el canal de correo y recordatorios globales cuando el rol lo permita.',
      'Definir días de anticipación y zona horaria.',
      'Elegir, por evento, si quieres notificación En app y/o Correo.',
    ],
    steps: [
      'Revisa el encabezado: Preferencias sincronizadas significa que no tienes cambios personales pendientes; el contador indica cuántas preferencias modificaste.',
      'En Automatización de recordatorios verifica si el panel dice Administrable o Solo lectura.',
      'Si es Administrable, configura Canal de correo del condominio, Avisos de próximo vencimiento y Avisos de cuotas vencidas según la política real del condominio.',
      'Cuando próximo vencimiento esté activo, selecciona Días de anticipación entre 1 y 30 y confirma la Zona horaria real del condominio.',
      'En Canales por evento activa o desactiva En app y Correo para cada tipo de notificación que quieras recibir personalmente.',
      'Revisa la cantidad de preferencias modificadas y pulsa Guardar cambios.',
      'Espera el mensaje Configuración guardada correctamente antes de salir o cambiar de condominio.',
    ],
    beforeConfirm: [
      'Usa la zona horaria del condominio, no necesariamente la de tu computadora o ubicación personal.',
      'Desactivar Canal de correo del condominio puede impedir entregas por correo aunque una preferencia personal las solicite.',
      'Si el panel global está Solo lectura, no intentes forzar esos controles: modifica únicamente tus preferencias disponibles.',
    ],
    result: [
      'Guardar cambios sincroniza las preferencias modificadas y actualiza los indicadores de canales.',
      'Las reglas globales afectan la preparación de recordatorios; las preferencias personales determinan qué eventos recibe cada usuario por sus canales habilitados.',
    ],
    troubleshooting: [
      'Si no puedes editar Automatización de recordatorios, revisa tu rol; tus preferencias personales pueden seguir disponibles.',
      'Si esperas correo y no llega, confirma que el canal global de correo y la preferencia del evento estén activos antes de reportar un problema.',
    ],
    tips: [
      'No actives todos los correos por defecto si no son útiles; configura alertas que realmente requieran atención.',
      'Revisa configuración después de un cambio de administrador, política de cobranza o zona horaria.',
    ],
    permissions: 'Las reglas globales requieren rol administrativo; cada usuario autorizado puede ajustar sus preferencias personales disponibles.',
  },
};