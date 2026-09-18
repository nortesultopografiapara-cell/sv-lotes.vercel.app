/**
 * Wiring server-side da reautenticação do Administrador Principal.
 * Client Auth efêmero: persistSession false, sem cookies da sessão do operador.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  PRIMARY_ADMIN_VERIFY_AUDIT_MODULE,
  PRIMARY_ADMIN_VERIFY_FAILURE_ACTION,
  buildPrimaryAdminVerifyAuditEvent,
  type PrimaryAdminReauthDeps,
  type PrimaryAdminVerifyResult,
} from '@/lib/primaryAdminReauth';
import { loadCompanyPrimaryAdminUserId } from '@/lib/companyPrimaryAdmin';

export const EPHEMERAL_AUTH_CLIENT_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

export function createEphemeralAuthClient(url: string, anonKey: string) {
  return createClient(url, anonKey, EPHEMERAL_AUTH_CLIENT_OPTIONS);
}

export async function verifyPasswordWithEphemeralAuth(input: {
  url: string;
  anonKey: string;
  email: string;
  password: string;
  serviceClient?: SupabaseClient | null;
}): Promise<{ userId: string | null; accessToken: string | null }> {
  const ephemeral = createEphemeralAuthClient(input.url, input.anonKey);
  try {
    const { data } = await ephemeral.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    const userId = data.user?.id ? String(data.user.id) : null;
    const accessToken = data.session?.access_token ? String(data.session.access_token) : null;
    if (accessToken && input.serviceClient) {
      try {
        await input.serviceClient.auth.admin.signOut(accessToken, 'local');
      } catch {
        /* best-effort: não devolver o token mesmo se a revogação falhar */
      }
    }
    try {
      await ephemeral.auth.signOut({ scope: 'local' });
    } catch {
      /* sessão local já é não persistente */
    }
    return { userId, accessToken: null };
  } catch {
    try {
      await ephemeral.auth.signOut({ scope: 'local' });
    } catch {
      /* ignore */
    }
    return { userId: null, accessToken: null };
  }
}

export function createPrimaryAdminReauthDeps(
  admin: SupabaseClient,
  authEnv: { url: string; anonKey: string },
  rateLimitStore?: PrimaryAdminReauthDeps['rateLimitStore'],
): PrimaryAdminReauthDeps {
  return {
    rateLimitStore,
    loadOperator: async (userId) => {
      const { data } = await admin
        .from('users')
        .select('id, tenant_id, role, status')
        .eq('id', userId)
        .maybeSingle();
      return (data as { id: string; tenant_id?: string | null; role?: string | null; status?: string | null } | null);
    },
    loadCompanyPrimaryAdminUserId: (companyId) => loadCompanyPrimaryAdminUserId(admin, companyId),
    loadUser: async (userId) => {
      const { data } = await admin
        .from('users')
        .select('id, tenant_id, role, status, email, full_name')
        .eq('id', userId)
        .maybeSingle();
      return data as {
        id: string;
        tenant_id?: string | null;
        role?: string | null;
        status?: string | null;
        email?: string | null;
        full_name?: string | null;
      } | null;
    },
    verifyPassword: async ({ email, password }) => {
      const result = await verifyPasswordWithEphemeralAuth({
        url: authEnv.url,
        anonKey: authEnv.anonKey,
        email,
        password,
        serviceClient: admin,
      });
      return { userId: result.userId };
    },
    countRecentFailures: async ({ tenantId, userId, sinceIso }) => {
      let query = admin
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('action', PRIMARY_ADMIN_VERIFY_FAILURE_ACTION)
        .gte('created_at', sinceIso);
      if (userId) query = query.eq('user_id', userId);
      const { count } = await query;
      return Number(count || 0);
    },
  };
}

export async function persistPrimaryAdminVerifyAudit(
  admin: SupabaseClient,
  result: PrimaryAdminVerifyResult,
): Promise<void> {
  const event = buildPrimaryAdminVerifyAuditEvent(result);
  if (!event) return;
  try {
    await admin.from('audit_logs').insert({
      tenant_id: event.tenantId,
      company_id: event.tenantId,
      user_id: event.requestedBy,
      action: event.action,
      module: PRIMARY_ADMIN_VERIFY_AUDIT_MODULE,
      reference_id: event.authorizedBy || null,
      description: event.action === PRIMARY_ADMIN_VERIFY_FAILURE_ACTION
        ? 'Verificação do Administrador Principal recusada.'
        : 'Verificação do Administrador Principal confirmada.',
    });
  } catch (err) {
    console.warn('[primary-admin-verify] audit_logs falhou', err instanceof Error ? err.message : err);
  }
}

export function getEphemeralAuthEnv(): { url: string; anonKey: string } | null {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey || url.includes('mock.supabase.co')) return null;
  return { url, anonKey };
}
