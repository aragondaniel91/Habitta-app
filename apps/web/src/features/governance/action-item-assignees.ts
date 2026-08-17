import { supabase } from '../../supabase';

export type AssemblyActionAssignee = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
};

export type AssemblyActionAssigneeLabel = {
  user_id: string;
  display_name: string;
};

const clientOrThrow = () => {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');
  return supabase;
};

export async function loadAssemblyActionAssignees(condominiumId: string) {
  const client = clientOrThrow();
  const result = await client.rpc('list_assembly_action_assignees', {
    target_condominium: condominiumId,
  });

  if (result.error) {
    const message = result.error.message.toLowerCase();
    if (message.includes('not authorized')) {
      throw new Error('No tienes permisos para enumerar responsables de acuerdos.');
    }
    throw new Error('No se pudieron cargar los responsables válidos.');
  }

  return (result.data ?? []) as AssemblyActionAssignee[];
}

export async function loadAssemblyActionAssigneeLabels(condominiumId: string) {
  const client = clientOrThrow();
  const result = await client.rpc('list_assembly_action_item_assignee_labels', {
    target_condominium: condominiumId,
  });

  if (result.error) {
    const message = result.error.message.toLowerCase();
    if (message.includes('not authorized')) {
      throw new Error('No tienes permisos para ver los responsables de estos acuerdos.');
    }
    throw new Error('No se pudieron cargar los nombres de los responsables.');
  }

  return (result.data ?? []) as AssemblyActionAssigneeLabel[];
}
