import { getSupabaseConfigStatus, type SupabaseConfigStatus } from '@/lib/supabase-config';

export function getServerSupabaseConfigStatus(): SupabaseConfigStatus {
  const base = getSupabaseConfigStatus();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const issues = [...base.issues];
  if (!serviceKey) {
    issues.push(
      'SUPABASE_SERVICE_ROLE_KEY ausente no servidor (necessária para /api/projects em produção).',
    );
  }
  return {
    ...base,
    hasServiceRole: Boolean(serviceKey),
    issues,
  };
}

export function getServerConfigErrorMessage(): string | null {
  const status = getServerSupabaseConfigStatus();
  if (!status.url || status.isMockUrl) {
    return 'NEXT_PUBLIC_SUPABASE_URL inválida ou ausente no servidor.';
  }
  if (!status.hasServiceRole) {
    return 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor (.env.local / Vercel).';
  }
  return null;
}
