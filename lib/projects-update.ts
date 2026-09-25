import type { SupabaseClient } from '@supabase/supabase-js';
import { lfContractConfigPersistedEquals } from './lfImoveisContractConfig';

/** Colunas conhecidas em public.projects (migrations do projeto). */
export const PROJECT_UPDATE_KNOWN_COLUMNS = [
  'name',
  'city',
  'uf',
  'location',
  'neighborhood',
  'address',
  'forum_city',
  'financial_account_id',
  'contract_model',
  'seller_parties_json',
  'lf_contract_config_json',
] as const;

/** Não podem ser removidas pelo fallback de coluna — persistir ou falhar. */
export const PROJECT_UPDATE_PROTECTED_COLUMNS = ['lf_contract_config_json'] as const;

export const LF_CONTRACT_CONFIG_COLUMN_MISSING_CODE = 'LF_CONTRACT_CONFIG_COLUMN_MISSING';
export const LF_CONTRACT_CONFIG_PERSIST_CODE = 'LF_CONTRACT_CONFIG_PERSIST';

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
  financial_account_id?: string | null;
  /**
   * Modelo de contrato do empreendimento.
   * null / '' = herdar companies.contract_model.
   * undefined = não alterar o campo.
   */
  contract_model?: string | null;
  /**
   * PROMITENTES VENDEDORES do empreendimento (JSON).
   * undefined = não alterar. Usado pelo e-sign Mundo Novo (email/telefone).
   */
  seller_parties_json?: unknown;
  /**
   * Configuração contratual LF Imóveis (JSON).
   * undefined = não alterar. null = limpar (voltar ao fallback da empresa).
   */
  lf_contract_config_json?: unknown;
};

function cleanPayload(
  payload: Record<string, unknown>,
  keepNullKeys: string[] = [],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, v]) => {
      if (keepNullKeys.includes(key) && v === null) return true;
      return v !== undefined && v !== null && v !== '';
    }),
  );
}

function parseMissingColumn(message: string | undefined): string | null {
  if (!message) return null;
  const postgrest = message.match(/Could not find the '(\w+)' column/i);
  if (postgrest?.[1]) return postgrest[1];
  const postgres = message.match(
    /column (?:[\w]+\.)?["']?(\w+)["']? does not exist/i,
  );
  return postgres?.[1] ?? null;
}

function lfSpread(input: ProjectUpdateInput, full: Record<string, unknown>): Record<string, unknown> {
  return input.lf_contract_config_json !== undefined
    ? { lf_contract_config_json: full.lf_contract_config_json }
    : {};
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
  if (input.financial_account_id !== undefined) {
    full.financial_account_id = input.financial_account_id || null;
  }
  if (input.contract_model !== undefined) {
    const raw = input.contract_model;
    full.contract_model =
      raw == null || String(raw).trim() === '' ? null : String(raw).trim();
  }
  if (input.seller_parties_json !== undefined) {
    full.seller_parties_json = input.seller_parties_json;
  }
  if (input.lf_contract_config_json !== undefined) {
    full.lf_contract_config_json = input.lf_contract_config_json;
  }

  const lf = lfSpread(input, full);

  return [
    full,
    {
      name: full.name,
      city: full.city,
      uf: full.uf,
      location: full.location,
      ...(input.contract_model !== undefined
        ? { contract_model: full.contract_model }
        : {}),
      ...(input.seller_parties_json !== undefined
        ? { seller_parties_json: full.seller_parties_json }
        : {}),
      ...lf,
    },
    {
      name: full.name,
      city: full.city,
      uf: full.uf,
      ...lf,
    },
    {
      name: full.name,
      location: full.location,
      ...lf,
    },
  ].map((payload) =>
    cleanPayload(payload, [
      'contract_model',
      'seller_parties_json',
      'lf_contract_config_json',
    ]),
  );
}

export function formatProjectUpdateDbError(message: string): string {
  const m = (message || '').trim();
  if (!m) return 'Não foi possível salvar o projeto. Tente novamente.';

  if (/lf_contract_config/i.test(m) || /configuração contratual LF/i.test(m)) {
    return 'Não foi possível gravar a configuração contratual LF Imóveis. Recarregue a página e tente salvar novamente.';
  }
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
      if (
        (PROJECT_UPDATE_PROTECTED_COLUMNS as readonly string[]).includes(missingCol)
      ) {
        return {
          data: null,
          error: {
            message:
              'A configuração contratual LF Imóveis ainda não está disponível neste banco. Aplique a migration no DEVELOP antes de salvar.',
            code: LF_CONTRACT_CONFIG_COLUMN_MISSING_CODE,
          },
        };
      }
      const { [missingCol]: _removed, ...rest } = current;
      current = rest;
      continue;
    }

    return { data: null, error: error ?? { message: 'Falha ao atualizar projeto.' } };
  }

  return { data: null, error: { message: 'Nenhum campo válido para atualizar o projeto.' } };
}

async function persistLfContractConfig(
  client: SupabaseClient,
  projectId: string,
  wanted: unknown,
): Promise<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }> {
  const { data, error } = await client
    .from('projects')
    .update({ lf_contract_config_json: wanted })
    .eq('id', projectId)
    .select('*')
    .single();

  if (error || !data) {
    const missingCol = parseMissingColumn(error?.message);
    return {
      data: null,
      error: {
        message:
          missingCol === 'lf_contract_config_json'
            ? 'A configuração contratual LF Imóveis ainda não está disponível neste banco. Aplique a migration no DEVELOP antes de salvar.'
            : error?.message || 'Não foi possível gravar a configuração contratual LF Imóveis.',
        code:
          missingCol === 'lf_contract_config_json'
            ? LF_CONTRACT_CONFIG_COLUMN_MISSING_CODE
            : LF_CONTRACT_CONFIG_PERSIST_CODE,
      },
    };
  }

  const row = data as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(row, 'lf_contract_config_json')) {
    return {
      data: null,
      error: {
        message:
          'A configuração contratual LF Imóveis ainda não está disponível neste banco. Aplique a migration no DEVELOP antes de salvar.',
        code: LF_CONTRACT_CONFIG_COLUMN_MISSING_CODE,
      },
    };
  }
  if (!lfContractConfigPersistedEquals(row.lf_contract_config_json, wanted)) {
    return {
      data: null,
      error: {
        message: 'A configuração contratual LF Imóveis não foi gravada no projeto.',
        code: LF_CONTRACT_CONFIG_PERSIST_CODE,
      },
    };
  }
  return { data: row, error: null };
}

export async function updateProjectWithFallback(
  client: SupabaseClient,
  projectId: string,
  input: ProjectUpdateInput,
): Promise<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }> {
  const payloads = buildProjectUpdatePayloads(input);
  let lastError: { message: string; code?: string } | null = null;
  let firstSuccess: Record<string, unknown> | null = null;

  for (const payload of payloads) {
    const result = await tryUpdateWithColumnFallback(client, projectId, payload);
    if (result.data) {
      firstSuccess = result.data;
      break;
    }
    lastError = result.error;
  }

  if (!firstSuccess) {
    return { data: null, error: lastError };
  }

  if (input.lf_contract_config_json !== undefined) {
    if (
      lfContractConfigPersistedEquals(
        firstSuccess.lf_contract_config_json,
        input.lf_contract_config_json,
      )
    ) {
      return { data: firstSuccess, error: null };
    }
    return persistLfContractConfig(client, projectId, input.lf_contract_config_json);
  }

  return { data: firstSuccess, error: null };
}
