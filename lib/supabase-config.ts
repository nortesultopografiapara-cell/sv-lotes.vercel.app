const MOCK_URL = 'https://mock.supabase.co';

export type SupabaseConfigStatus = {
  configured: boolean;
  url: string;
  hasAnonKey: boolean;
  hasServiceRole: boolean;
  isMockUrl: boolean;
  issues: string[];
};

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const issues: string[] = [];

  if (!url) {
    issues.push('NEXT_PUBLIC_SUPABASE_URL não está definida.');
  } else if (!url.startsWith('https://') || !url.includes('supabase')) {
    issues.push('NEXT_PUBLIC_SUPABASE_URL não parece uma URL válida do Supabase.');
  }
  if (url === MOCK_URL) {
    issues.push('URL aponta para mock.supabase.co (placeholder inválido).');
  }
  if (!anonKey) {
    issues.push('NEXT_PUBLIC_SUPABASE_ANON_KEY não está definida.');
  }
  if (!serviceKey && typeof window === 'undefined') {
    issues.push(
      'SUPABASE_SERVICE_ROLE_KEY ausente no servidor (necessária para /api/projects em produção).',
    );
  }

  const configured = Boolean(url && anonKey && url !== MOCK_URL);

  return {
    configured,
    url,
    hasAnonKey: Boolean(anonKey),
    hasServiceRole: Boolean(serviceKey),
    isMockUrl: !url || url === MOCK_URL,
    issues,
  };
}

export function getClientConfigErrorMessage(): string | null {
  const status = getSupabaseConfigStatus();
  if (status.url && status.hasAnonKey && !status.isMockUrl) return null;
  return (
    'Supabase não configurado. Copie .env.example para .env.local e preencha ' +
    'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY. Reinicie o servidor (npm run dev).'
  );
}

export function getServerConfigErrorMessage(): string | null {
  const status = getSupabaseConfigStatus();
  if (!status.url || status.isMockUrl) {
    return 'NEXT_PUBLIC_SUPABASE_URL inválida ou ausente no servidor.';
  }
  if (!status.hasServiceRole) {
    return 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor (.env.local / Vercel).';
  }
  return null;
}
