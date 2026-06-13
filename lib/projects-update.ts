import type { SupabaseClient } from '@supabase/supabase-js';

/** Colunas conhecidas em public.projects (migrations do projeto). */
export const PROJECT_UPDATE_KNOWN_COLUMNS = [
  'name',
  'city',
  'uf',
  'location',
  'neighborhood',
  'address',
  'forum_city',
] as const;

export type ProjectUpdateInput = {
  name: string;
  city: string;
  uf: string;
  address?: string | null;
  location?: string | null;
  neighborhood?: string | null;
  forum_city?: string | null;
  /** Alias de forum_city — nunca enviado como coluna separada. */
  contract_city?: string | null;
};

function cleanPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

function parseMissingColumn(message: string | undefined): string | null {
  if (!message) return null;
  const match = message.match(/Could not find the '(\w+)' column/i);
  return match?.[1] ?? null;
}

/** Monta payloads do mais completo ao mínimo, só com colunas reais de projects. */
export function buildProjectUpdatePayloads(input: ProjectUpdateInput): Record<string, unknown>[] {
  const forumCity = (input.forum_city ?? input.contract_city ?? input.city)?.trim() || undefined;
  const location =
    input.location?.trim() ||
    [input.city, input.uf].filter(Boolean).join(' - ');

  const full: Record<string, unknown> = {
    name: input.name.trim(),
    city: input.city.trim(),
    uf: input.uf.trim().toUpperCase(),
    location,
  };

  if (input.neighborhood?.trim()) full.neighborhood = input.neighborhood.trim();
  if (input.address?.trim()) full.address = input.address.trim();
  if (forumCity) full.forum_city = forumCity;

  return [
    full,
    {
      name: full.name,
      city: full.city,
      uf: full.uf,
      location: full.location,
    },
    {
      name: full.name,
      city: full.city,
      uf: full.uf,
    },
    {
      name: full.name,
      location: full.location,
    },
  ].map(cleanPayload);
}

export function formatProjectUpdateDbError(message: string): string {
  const m = (message || '').trim();
  if (!m) return 'Não foi possível salvar o projeto. Tente novamente.';

  if (m.includes('Could not find the') && m.includes('column')) {
    return 'Não foi possível salvar o projeto no momento. Tente novamente ou contate o suporte.';
  }
  if (/permission|policy|row-level security/i.test(m)) {
    return 'Sem permissão para editar este projeto.';
  }
  if (/violates|constraint|invalid input/i.test(m)) {
    return 'Dados inválidos. Verifique nome, cidade e UF.';
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(m)) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
  }

  return 'Não foi possível salvar o projeto. Tente novamente.';
}

async function tryUpdateWithColumnFallback(
  client: SupabaseClient,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }> {
  let current = { ...payload };

  while (Object.keys(current).length > 0) {
    const { data, error } = await client
      .from('projects')
      .update(current)
      .eq('id', projectId)
      .select('*')
      .single();

    if (!error && data) {
      return { data: data as Record<string, unknown>, error: null };
    }

    const missingCol = parseMissingColumn(error?.message);
    if (missingCol && missingCol in current) {
      const { [missingCol]: _removed, ...rest } = current;
      current = rest;
      continue;
    }

    return { data: null, error: error ?? { message: 'Falha ao atualizar projeto.' } };
  }

  return { data: null, error: { message: 'Nenhum campo válido para atualizar o projeto.' } };
}

export async function updateProjectWithFallback(
  client: SupabaseClient,
  projectId: string,
  input: ProjectUpdateInput,
): Promise<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }> {
  const payloads = buildProjectUpdatePayloads(input);
  let lastError: { message: string; code?: string } | null = null;

  for (const payload of payloads) {
    const result = await tryUpdateWithColumnFallback(client, projectId, payload);
    if (result.data) {
      return result;
    }
    lastError = result.error;
  }

  return { data: null, error: lastError };
}
