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
  /** null/omit = herdar modelo padrão da empresa. */
  contract_model?: string | null;
  financial_account_id?: string | null;
  lf_contract_config_json?: unknown;
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

  const lf =
    input.lf_contract_config_json !== undefined
      ? { lf_contract_config_json: input.lf_contract_config_json }
      : {};

  const payloads: Record<string, unknown>[] = [
    fullPayload,
    { ...fullPayload, address: undefined, company_id: undefined },
    {
      name: input.name,
      tenant_id,
      city: input.city,
      uf: input.uf,
      ...lf,
    },
    { name: input.name, tenant_id, ...lf },
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

    const missingCol =
      error?.message?.match(/Could not find the '(\w+)' column/i)?.[1] ||
      error?.message?.match(/column (?:[\w]+\.)?["']?(\w+)["']? does not exist/i)?.[1];
    if (missingCol && missingCol in cleaned) {
      if (missingCol === 'lf_contract_config_json') {
        return {
          data: null,
          error: {
            message:
              'A configuração contratual LF Imóveis ainda não está disponível neste banco. Aplique a migration no DEVELOP antes de salvar.',
            code: 'LF_CONTRACT_CONFIG_COLUMN_MISSING',
          },
        };
      }
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
