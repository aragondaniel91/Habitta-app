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
        'Si necesitas eliminar la residencia completa, baja a Zona de peligro y verifica primero que el panel permita la acción para tu cuenta.',
        'Pulsa Quiero eliminar esta residencia, escribe exactamente la frase de seguridad mostrada y usa Revisar eliminación.',
        'Lee la segunda confirmación completa y pulsa Sí, eliminar residencia sólo cuando realmente quieras borrar permanentemente los datos de esa residencia.',
      ],
      beforeConfirm: [
        ...base.beforeConfirm,
        'Eliminar residencia es irreversible para los datos del condominio: unidades, personas, finanzas, documentos, auditoría y archivos privados asociados.',
        'La eliminación requiere propietario de la organización, frase exacta y una segunda confirmación; no compartas ni intentes saltar esas protecciones.',
      ],
      result: [
        ...base.result,
        'Después de una eliminación exitosa, la cuenta Habitta del usuario se conserva y el sistema limpia los archivos privados antes de volver al onboarding; si la limpieza queda pendiente, Habitta muestra un estado explícito para continuar de forma segura.',
      ],
      permissions: `${base.permissions} Eliminar una residencia completa está reservado al propietario de la organización y vuelve a validarse en el servidor.`,
    };
  }

  return base;
}
