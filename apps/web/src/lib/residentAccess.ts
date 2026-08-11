import { supabase } from '../supabase';

export type ResidentRole = 'owner' | 'tenant';

export type ResidentInvitation = {
  id: string;
  condominium_id: string;
  person_id: string;
  unit_id: string;
  email: string;
  intended_role: ResidentRole;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ResidentInvitationPreview = {
  id: string;
  condominium_id: string;
  condominium_name: string;
  person_id: string;
  person_name: string;
  unit_id: string;
  unit_code: string;
  email: string;
  intended_role: ResidentRole;
  status: ResidentInvitation['status'];
  expires_at: string;
};

export type CreatedResidentInvitation = {
  invitation: ResidentInvitation;
  invitationUrl: string;
};

function requireSupabase() {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');
  return supabase;
}

function residentError(error: { message: string }) {
  const message = error.message.toLowerCase();
  if (message.includes('active ownership assignment')) {
    return 'La persona ya no tiene una asignación activa como propietario en esa unidad.';
  }
  if (message.includes('active tenant assignment')) {
    return 'La persona ya no tiene una asignación activa como inquilino en esa unidad.';
  }
  if (message.includes('requires an active person with email') || message.includes('profile with email')) {
    return 'La persona necesita un correo válido antes de poder recibir acceso.';
  }
  if (message.includes('already linked')) {
    return 'Este perfil ya está vinculado a otra cuenta de Habitta.';
  }
  if (message.includes('invalid invitation') || message.includes('no longer active')) {
    return 'La invitación no es válida, venció o la asignación ya no está activa.';
  }
  if (message.includes('denied')) return 'No tienes permisos para administrar este acceso.';
  return 'No pudimos completar la invitación. Intenta nuevamente.';
}

export async function createResidentInvitation({
  condominiumId,
  personId,
  unitId,
  role,
}: {
  condominiumId: string;
  personId: string;
  unitId: string;
  role: ResidentRole;
}): Promise<CreatedResidentInvitation> {
  const client = requireSupabase();
  const result = await client.rpc('create_resident_invitation', {
    target_condominium_id: condominiumId,
    target_person_id: personId,
    target_unit_id: unitId,
    target_role: role,
    target_expires_at: null,
  });
  if (result.error) throw new Error(residentError(result.error));
  const data = result.data as { invitation: ResidentInvitation; raw_token: string };
  return {
    invitation: data.invitation,
    invitationUrl: `${window.location.origin}/invite/${encodeURIComponent(data.raw_token)}`,
  };
}

export async function listResidentInvitations(condominiumId: string, personId?: string) {
  const client = requireSupabase();
  let query = client
    .from('invitations')
    .select('id,condominium_id,person_id,unit_id,email,intended_role,status,expires_at,accepted_at,revoked_at,created_at')
    .eq('condominium_id', condominiumId)
    .order('created_at', { ascending: false });
  if (personId) query = query.eq('person_id', personId);
  const result = await query;
  if (result.error) throw new Error(residentError(result.error));
  return (result.data ?? []) as ResidentInvitation[];
}

export async function revokeResidentInvitation(invitationId: string) {
  const client = requireSupabase();
  const result = await client.rpc('revoke_resident_invitation', {
    target_invitation_id: invitationId,
  });
  if (result.error) throw new Error(residentError(result.error));
  return result.data as ResidentInvitation;
}

export async function getResidentInvitationPreview(rawToken: string) {
  const client = requireSupabase();
  const result = await client.rpc('get_resident_invitation_preview', { raw_token: rawToken });
  if (result.error) throw new Error(residentError(result.error));
  const preview = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!preview) throw new Error('La invitación no existe o ya no está disponible.');
  return preview as ResidentInvitationPreview;
}

export async function acceptResidentInvitation(rawToken: string) {
  const client = requireSupabase();
  const result = await client.rpc('accept_invitation', { raw_token: rawToken });
  if (result.error) throw new Error(residentError(result.error));
  return result.data as ResidentInvitation;
}

export function residentRoleLabel(role: ResidentRole) {
  return role === 'owner' ? 'Propietario' : 'Inquilino';
}
