import type { SupabaseClient } from '@supabase/supabase-js';

export type ProjectUpdateInput = {
  name: string;
  city: string;
  uf: string;
  address?: string | null;
  location?: string | null;
  neighborhood?: string | null;
  forum_city?: string | null;
};

export async function updateProjectWithFallback(
  client: SupabaseClient,
  projectId: string,
  input: ProjectUpdateInput,
): Promise<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }> {
  const base: Record<string, unknown> = {
    name: input.name,
    city: input.city,
    uf: input.uf,
    location: input.location,
    address: input.address ?? undefined,
    neighborhood: input.neighborhood ?? undefined,
    forum_city: input.forum_city ?? undefined,
    updated_at: new Date().toISOString(),
  };

  const payloads: Record<string, unknown>[] = [
    base,
    {
      name: input.name,
      city: input.city,
      uf: input.uf,
      location: input.location,
      updated_at: base.updated_at,
    },
    {
      name: input.name,
      location: input.location,
      updated_at: base.updated_at,
    },
  ];

  let lastError: { message: string; code?: string } | null = null;

  for (const payload of payloads) {
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );

    const { data, error } = await client
      .from('projects')
      .update(cleaned)
      .eq('id', projectId)
      .select('*')
      .single();

    if (!error && data) {
      return { data: data as Record<string, unknown>, error: null };
    }

    lastError = error;

    const missingCol = error?.message?.match(/Could not find the '(\w+)' column/i)?.[1];
    if (missingCol && missingCol in cleaned) {
      const { [missingCol]: _removed, ...withoutCol } = cleaned;
      const retry = await client
        .from('projects')
        .update(withoutCol)
        .eq('id', projectId)
        .select('*')
        .single();
      if (!retry.error && retry.data) {
        return { data: retry.data as Record<string, unknown>, error: null };
      }
      lastError = retry.error;
    }
  }

  return { data: null, error: lastError };
}
