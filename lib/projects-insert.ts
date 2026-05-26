import type { SupabaseClient } from '@supabase/supabase-js';

export type ProjectInsertInput = {
  name: string;
  city: string;
  uf: string;
  neighborhood?: string | null;
  address?: string | null;
  forum_city?: string | null;
  location?: string | null;
  tenant_id: string;
};

export async function insertProjectWithFallback(
  admin: SupabaseClient,
  input: ProjectInsertInput,
): Promise<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }> {
  const { tenant_id, ...rest } = input;
  const fullPayload: Record<string, unknown> = {
    ...rest,
    tenant_id,
    company_id: tenant_id,
    status: 'ACTIVE',
  };

  const payloads: Record<string, unknown>[] = [
    fullPayload,
    { ...fullPayload, address: undefined, company_id: undefined },
    {
      name: input.name,
      tenant_id,
      city: input.city,
      uf: input.uf,
    },
    { name: input.name, tenant_id },
  ];

  let lastError: { message: string; code?: string } | null = null;

  for (const payload of payloads) {
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    );

    const { data, error } = await admin.from('projects').insert([cleaned]).select('*').single();

    if (!error && data) {
      return { data: data as Record<string, unknown>, error: null };
    }

    lastError = error;

    const missingCol = error?.message?.match(/Could not find the '(\w+)' column/i)?.[1];
    if (missingCol && missingCol in cleaned) {
      const { [missingCol]: _removed, ...withoutCol } = cleaned;
      const retry = await admin.from('projects').insert([withoutCol]).select('*').single();
      if (!retry.error && retry.data) {
        return { data: retry.data as Record<string, unknown>, error: null };
      }
      lastError = retry.error;
    }
  }

  return { data: null, error: lastError };
}
