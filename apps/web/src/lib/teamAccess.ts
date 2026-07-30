import type { Session } from '@supabase/supabase-js';
import { apiRequest } from './api';
import { supabase } from '../supabase';

export type AdministrativeRole =
  'condominium_admin' | 'accountant' | 'assistant' | 'payment_reviewer';

export type TeamMember = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: AdministrativeRole;
  joined_at: string;
};

export type AdminInvitation = {
  id: string;
  condominium_id: string;
  email: string;
  intended_role: AdministrativeRole;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type AdminInvitationPreview = {
  id: string;
  email: string;
  condominium_id: string;
  condominium_name: string;
  intended_role: AdministrativeRole;
  status: AdminInvitation['status'];
  expires_at: string;
};

export type AdminInvitationDelivery = {
  status: 'disabled' | 'sent' | 'failed';
  recipient: string | null;
  providerId?: string;
};

export type CreatedAdminInvitation = {
  invitation: AdminInvitation;
  invitationUrl: string;
  emailDelivery: AdminInvitationDelivery;
};

export const ADMINISTRATIVE_ROLE_OPTIONS: Array<{
  value: AdministrativeRole;
  label: string;
  description: string;
}> = [
  {
    value: 'condominium_admin',
    label: 'Administrador del condominio',
    description: 'Control completo de estructura, equipo y configuración operativa.',
  },
  {
    value: 'accountant',
    label: 'Contabilidad',
    description: 'Acceso financiero para cuotas, pagos, saldos y reportes.',
  },
  {
    value: 'assistant',
    label: 'Asistente administrativo',
    description: 'Gestión operativa de residentes, unidades y comunicaciones.',
  },
  {
    value: 'payment_reviewer',
    label: 'Revisor de pagos',
    description: 'Revisión y aprobación de comprobantes sin administrar el equipo.',
  },
];

export function administrativeRoleLabel(role: AdministrativeRole) {
  return ADMINISTRATIVE_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

function requireSupabase() {
  if (!supabase) throw new Error('La configuración de Supabase no está disponible.');
  return supabase;
}

function translateTeamError(error: { message: string }) {
  const message = error.message.toLowerCase();
  if (message.includes('administrator required')) {
    return 'No tienes permisos para administrar el equipo de este condominio.';
  }
  if (message.includes('invalid email')) return 'Introduce un correo electrónico válido.';
  if (message.includes('invalid expiration')) {
    return 'La expiración debe estar entre una hora y 90 días.';
  }
  if (message.includes('invalid invitation')) {
    return 'La invitación no existe, venció o pertenece a otro correo.';
  }
  if (message.includes('not pending')) return 'La invitación ya no está pendiente.';
  return 'No pudimos completar la operación de equipo. Intenta nuevamente.';
}

export async function loadTeamAccess(condominiumId: string) {
  const client = requireSupabase();
  const [teamResult, invitationResult] = await Promise.all([
    client.rpc('list_condominium_team', { target_condominium_id: condominiumId }),
    client
      .from('admin_invitations')
      .select(
        'id,condominium_id,email,intended_role,status,expires_at,accepted_at,revoked_at,created_at',
      )
      .eq('condominium_id', condominiumId)
      .order('created_at', { ascending: false }),
  ]);

  if (teamResult.error) throw new Error(translateTeamError(teamResult.error));
  if (invitationResult.error) throw new Error(translateTeamError(invitationResult.error));

  return {
    members: (teamResult.data ?? []) as TeamMember[],
    invitations: (invitationResult.data ?? []) as AdminInvitation[],
  };
}

export async function createAdminInvitation({
  session,
  condominiumId,
  email,
  role,
  expiresAt,
}: {
  session: Session;
  condominiumId: string;
  email: string;
  role: AdministrativeRole;
  expiresAt?: string;
}) {
  return apiRequest<CreatedAdminInvitation>(
    `/v1/condominiums/${condominiumId}/admin-invitations`,
    session,
    {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        role,
        expiresAt: expiresAt || undefined,
      }),
    },
  );
}

export async function revokeAdminInvitation(invitationId: string) {
  const client = requireSupabase();
  const result = await client.rpc('revoke_admin_invitation', {
    target_invitation_id: invitationId,
  });
  if (result.error) throw new Error(translateTeamError(result.error));
}

export async function getAdminInvitationPreview(rawToken: string) {
  const client = requireSupabase();
  const result = await client.rpc('get_admin_invitation_preview', { raw_token: rawToken });
  if (result.error) throw new Error(translateTeamError(result.error));
  return result.data as AdminInvitationPreview;
}

export async function acceptAdminInvitation(rawToken: string) {
  const client = requireSupabase();
  const result = await client.rpc('accept_admin_invitation', { raw_token: rawToken });
  if (result.error) throw new Error(translateTeamError(result.error));
  return result.data as AdminInvitation;
}
