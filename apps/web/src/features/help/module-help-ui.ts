import type { AppRoute } from '../../navigation';
import type { ModuleHelpContent } from './module-help';

export function getModuleHelpContent(
  routeKey: AppRoute['key'],
  base: ModuleHelpContent,
): ModuleHelpContent {
  if (routeKey === 'team') {
    return {
      ...base,
      steps: base.steps.map((step) =>
        step.includes('Retirar/Eliminar acceso')
          ? 'Para retirar acceso definitivamente del condominio usa Quitar acceso y confirma; la cuenta global y el historial de acciones se conservan.'
          : step,
      ),
    };
  }

  if (routeKey === 'settings') {
    return {
      ...base,
      actions: [
        ...base.actions,
        'Revisar la Zona de peligro; sólo el propietario de la organización puede eliminar una residencia completa.',
      ],
      steps: [
        ...base.steps,
        'Si necesitas eliminar la residencia completa, baja a Zona de peligro. Sólo el propietario de la organización puede ejecutar esta acción; los administradores normales no pueden.',
        'Pulsa Quiero eliminar esta residencia y escribe exactamente ELIMINAR {nombre}, sustituyendo {nombre} por el nombre de la residencia que Habitta muestra en la frase de seguridad.',
        'Cuando la frase coincida exactamente, pulsa Revisar eliminación.',
        'Lee la segunda confirmación completa y pulsa Sí, eliminar residencia sólo cuando realmente quieras borrar permanentemente los datos de esa residencia.',
      ],
      beforeConfirm: [
        ...base.beforeConfirm,
        'Eliminar residencia es irreversible. Se eliminan unidades, personas, cuotas, pagos, recibos, tesorería, gastos, presupuestos, mantenimiento, documentos, solicitudes, anuncios, votaciones, auditoría y archivos privados asociados a la residencia.',
        'La eliminación requiere propietario de la organización, la frase exacta ELIMINAR {nombre} y una segunda confirmación. No compartas ni intentes saltar esas protecciones.',
        'La cuenta global de Habitta, el correo y la sesión del usuario no se eliminan junto con la residencia.',
      ],
      result: [
        ...base.result,
        'Después de una eliminación exitosa, la cuenta Habitta del usuario se conserva y el sistema limpia los archivos privados antes de volver al onboarding.',
        'Si la limpieza de archivos privados queda pendiente, Habitta conserva un registro de limpieza y permite continuar mientras el cleanup queda disponible para reintento seguro.',
      ],
      permissions: `${base.permissions} Eliminar una residencia completa está reservado al propietario de la organización; los administradores normales no pueden hacerlo y la autorización vuelve a validarse en el servidor.`,
    };
  }

  return base;
}
