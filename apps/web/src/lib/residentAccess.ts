import type { Session } from '@supabase/supabase-js';
import { apiRequest } from './api';
import { supabase } from '../supabase';

export type ResidentRole = 'owner' | 'tenant' | 'family_member' | 'authorized_occupant';

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

export type ResidentInvitationDelivery = {
  status: 'disabled' | 'sent' | 'failed';
  recipient: string | null;
  provider: string;
  mode: string;
  providerId?: string;
  errorCode?: string;
};

export type ResidentInvitationDeliveryEvent = {
  id: string;
  sequence_number: number;
  invitation_id: string;
  condominium_id: string;
  person_id: string;
  unit_id: string;
  event_type: 'email_sent' | 'email_failed' | 'email_disabled';
  provider: string;
  mode: string;
  error_code: string | null;
  provider_id: string | null;
  occurred_at: string;
};

export type CreatedResidentInvitation = {
  invitation: ResidentInvitation;
  invitationUrl: string;
  emailDelivery: ResidentInvitationDelivery;
  auditPersisted: boolean;
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
  if (
    message.includes('requires an active person with email') ||
    message.includes('profile with email')
  ) {
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
  session,
}: {
  condominiumId: string;
  personId: string;
  unitId: string;
  role: ResidentRole;
  session: Session;
}): Promise<CreatedResidentInvitation> {
  return apiRequest<CreatedResidentInvitation>(
    `/v1/condominiums/${condominiumId}/resident-invitations`,
    session,
    {
      method: 'POST',
      body: JSON.stringify({ personId, unitId, role }),
    },
  );
}

export async function listResidentInvitations(condominiumId: string, personId?: string) {
  const client = requireSupabase();
  let query = client
    .from('invitations')
    .select(
      'id,condominium_id,person_id,unit_id,email,intended_role,status,expires_at,accepted_at,revoked_at,created_at',
    )
    .eq('condominium_id', condominiumId)
    .order('created_at', { ascending: false });
  if (personId) query = query.eq('person_id', personId);
  const result = await query;
  if (result.error) throw new Error(residentError(result.error));
  return (result.data ?? []) as ResidentInvitation[];
}

export async function listResidentInvitationDeliveryEvents(
  condominiumId: string,
  personId?: string,
) {
  const client = requireSupabase();
  let query = client
    .from('resident_invitation_delivery_events')
    .select(
      'id,sequence_number,invitation_id,condominium_id,person_id,unit_id,event_type,provider,mode,error_code,provider_id,occurred_at',
    )
    .eq('condominium_id', condominiumId)
    .order('sequence_number', { ascending: false });
  if (personId) query = query.eq('person_id', personId);
  const result = await query;
  if (result.error) throw new Error(residentError(result.error));
  return (result.data ?? []) as ResidentInvitationDeliveryEvent[];
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

const residentRoleLabels: Record<ResidentRole, string> = {
  owner: 'Propietario',
  tenant: 'Inquilino',
  family_member: 'Familiar',
  authorized_occupant: 'Ocupante autorizado',
};

/**
 * Names a residential role for a person reading the screen.
 *
 * This used to be `role === 'owner' ? 'Propietario' : 'Inquilino'`, which was correct while owner
 * and tenant were the only two. Once family members and authorized occupants exist, that shape
 * silently labels both of them "Inquilino" -- a preview or history row telling somebody they
 * granted a tenancy they did not grant. A record has no default to be wrong about.
 */
export function residentRoleLabel(role: ResidentRole) {
  return residentRoleLabels[role] ?? role;
}

export function residentDeliveryLabel(event?: ResidentInvitationDeliveryEvent) {
  if (!event) return 'Sin intento de correo';
  if (event.event_type === 'email_sent') return 'Correo enviado';
  if (event.event_type === 'email_failed') return 'Error de envío';
  return 'Envío desactivado';
}
