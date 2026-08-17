import { supabase } from '../../supabase';

export type AssemblyActionAssignee = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
};

export async function loadAssemblyActionAssignees(condominiumId: string) {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');

  const client = supabase;
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
