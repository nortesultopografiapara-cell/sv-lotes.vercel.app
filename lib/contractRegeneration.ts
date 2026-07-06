/**
 * Regeneração de contratos de venda com histórico de versões.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { mergeCustomerData, normalizeDocument } from '@/lib/customerIdentity';
import {
  assertCustomerValidForContract,
  validateCustomerForContract,
} from '@/lib/validateCustomerForContract';
import { logLotAuditEvent, lotAuditContextFromBlock } from '@/lib/lotAudit';
import { generateContractHTML } from '@/lib/contractTemplate';
import {
  enrichSaleWithBrokerForContract,
} from '@/lib/saleBrokerSnapshot';
import {
  ensureValidContractNumber,
  isValidStoredContractNumber,
} from '@/lib/contractNumber';
import {
  getNormalizedLotMeasuresDisplay,
  normalizeBlockForContractRegeneration,
} from '@/lib/blockLotNormalize';
import { resolveLotMeasuresFromBlock } from '@/lib/lotChanfre';
import {
  auditMissingCompanyFields,
  formatClassicSellerInstallationText,
  normalizeSellerFromCompany,
} from '@/lib/contractSeller';

const PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Colunas aceitas para persistir HTML (ordem de preferência). */
const CONTRACT_HTML_STORAGE_COLUMNS = [
  'generated_html',
  'contract_html',
  'content',
  'html',
] as const;

/** Nunca enviar no insert/update — ausente em vários ambientes de produção. */
const CONTRACT_HTML_SKIP_COLUMNS = new Set(['html_content']);

/** Detecta coluna ausente (PostgREST e Postgres nativo). */
export function parseMissingContractColumn(
  errorMessage?: string | null,
): string | null {
  if (!errorMessage) return null;
  const patterns = [
    /Could not find the '(\w+)' column/i,
    /column (?:contracts\.)?["']?(\w+)["']? does not exist/i,
    /column "(\w+)" of relation "contracts" does not exist/i,
  ];
  for (const re of patterns) {
    const m = errorMessage.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Monta campos de HTML para insert sem html_content.
 * Usa a coluna já presente no contrato-fonte, se houver.
 */
export function buildRegeneratedContractHtmlFields(
  html: string,
  sourceContract?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (sourceContract && typeof sourceContract === 'object') {
    for (const col of CONTRACT_HTML_STORAGE_COLUMNS) {
      if (col in sourceContract) {
        return { [col]: html };
      }
    }
  }
  return { generated_html: html };
}

function stripPayloadColumn(
  payload: Record<string, unknown>,
  missingCol: string,
  op: 'insert' | 'update',
): Record<string, unknown> {
  if (missingCol === 'html_content') {
    console.warn('REGENERATE_HTML_COLUMN_MISSING', { column: missingCol, op });
    if (op === 'insert') {
      console.warn('REGENERATE_INSERT_RETRY_WITHOUT_HTML_CONTENT');
    }
  }
  const { [missingCol]: _removed, ...rest } = payload;
  return rest;
}

function attachHtmlToContractRow(
  row: Record<string, unknown>,
  html: string,
): Record<string, unknown> {
  const hasStoredHtml = CONTRACT_HTML_STORAGE_COLUMNS.some((col) => {
    const v = row[col];
    return typeof v === 'string' && v.trim().length > 0;
  });
  if (hasStoredHtml) return row;
  return { ...row, generated_html: html };
}

/** HTML persistido no contrato (generated_html ou coluna legada). */
export function readStoredContractHtml(
  contract: Record<string, unknown> | null | undefined,
): string | null {
  if (!contract || typeof contract !== 'object') return null;
  for (const col of CONTRACT_HTML_STORAGE_COLUMNS) {
    const v = contract[col];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v;
    }
  }
  return null;
}

/** Select enxuto para preview HTML — evita select('*') no fast path. */
export const CONTRACT_HTML_PREVIEW_SELECT =
  'id, generated_html, updated_at, needs_regenerar, tenant_id, company_id';

/**
 * Carrega contrato para preview HTML (fast path).
 * Campos mínimos: id, generated_html, updated_at (+ tenant para sessão).
 */
export async function loadContractHtmlPreviewRow(
  supabase: SupabaseClient,
  contractId: string,
): Promise<Record<string, unknown>> {
  const receivedId = String(contractId || '').trim();
  if (!receivedId) {
    throw new ContractNotFoundError(receivedId, { detail: 'ID do contrato vazio.' });
  }

  const runLookup = async (
    field: 'id' | 'contract_number',
    value: string,
  ) => {
    const { data, error } = await supabase
      .from('contracts')
      .select(CONTRACT_HTML_PREVIEW_SELECT)
      .eq(field, value)
      .maybeSingle();

    if (error) {
      throw new ContractNotFoundError(receivedId, {
        lookup: field,
        supabaseCode: error.code,
        supabaseMessage: error.message,
        detail: `Erro ao buscar contrato: ${error.message}`,
      });
    }

    return data as Record<string, unknown> | null;
  };

  let contract: Record<string, unknown> | null = null;

  if (isUuid(receivedId)) {
    contract = await runLookup('id', receivedId);
  }

  if (!contract) {
    contract = await runLookup('contract_number', receivedId);
  }

  if (!contract && !isUuid(receivedId)) {
    contract = await runLookup('id', receivedId);
  }

  if (!contract) {
    throw new ContractNotFoundError(receivedId, {
      detail: 'Contrato não encontrado.',
    });
  }

  if (!contract.tenant_id && contract.company_id) {
    contract.tenant_id = contract.company_id;
  }

  return contract;
}

export class ContractNotFoundError extends Error {
  readonly receivedId: string;
  readonly lookup: 'id' | 'contract_number';
  readonly supabaseCode?: string;
  readonly supabaseMessage?: string;

  constructor(
    receivedId: string,
    options?: {
      lookup?: 'id' | 'contract_number';
      supabaseCode?: string;
      supabaseMessage?: string;
      detail?: string;
    },
  ) {
    super(options?.detail || 'Contrato não encontrado.');
    this.name = 'ContractNotFoundError';
    this.receivedId = receivedId;
    this.lookup = options?.lookup || 'id';
    this.supabaseCode = options?.supabaseCode;
    this.supabaseMessage = options?.supabaseMessage;
  }
}

function isUuid(value: string): boolean {
  return UUID_RE.test(String(value || '').trim());
}

export type RegenerationSession = {
  contractTenantId: string;
  activeTenantId: string;
  callerRole: string;
};

/** Empresa do contrato deve ser a mesma da sessão logada (ou impersonação ativa). */
export function resolveRegenerationSession(
  contract: Record<string, unknown>,
  options: {
    callerTenantId: string | null;
    callerRole: string;
    impersonatingTenantId?: string | null;
  },
): RegenerationSession {
  const contractTenantId = String(contract.tenant_id || '').trim();
  if (!contractTenantId) {
    throw new Error('Contrato sem tenant_id — não é possível identificar a empresa.');
  }

  const role = String(options.callerRole || '').toUpperCase();
  const isPlatformAdmin = PLATFORM_ADMIN_ROLES.has(role);

  let activeTenantId = String(
    options.callerTenantId || contract.company_id || '',
  ).trim();

  if (isPlatformAdmin && options.impersonatingTenantId) {
    activeTenantId = String(options.impersonatingTenantId).trim();
  }

  if (!activeTenantId) {
    throw new Error(
      'Empresa logada não identificada. Faça login novamente ou selecione a empresa no painel.',
    );
  }

  if (activeTenantId !== contractTenantId) {
    throw new Error(
      `Este contrato pertence a outra empresa (tenant ${contractTenantId}). Sessão ativa: ${activeTenantId}.`,
    );
  }

  return { contractTenantId, activeTenantId, callerRole: role };
}

export type ContractRegenerateValidation = {
  ok: boolean;
  missing: string[];
  error?: string;
};

export type SaleContractVersionRow = {
  id: string;
  contract_number: string;
  version: number;
  status: string;
  generated_html?: string | null;
  pdf_url?: string | null;
  created_at: string;
  regenerated_at?: string | null;
  regenerated_by?: string | null;
  regenerated_from?: string | null;
  superseded_by?: string | null;
  is_current?: boolean | null;
};

export function enrichBlockForContract(
  block: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!block || typeof block !== 'object') return {};

  console.log('REGENERATE_LOT_RAW_DATA', block);

  const normalized = normalizeBlockForContractRegeneration(block);
  const lotMeasures = resolveLotMeasuresFromBlock(normalized);
  const display = getNormalizedLotMeasuresDisplay(normalized);

  const enriched = {
    ...normalized,
    frente:
      lotMeasures.sides.frente ??
      normalized.frente ??
      display.frente,
    Fundo:
      lotMeasures.sides.fundo ??
      normalized.Fundo ??
      display.fundo,
    fundo:
      lotMeasures.sides.fundo ??
      normalized.fundo ??
      display.fundo,
    'Lado Dir.':
      lotMeasures.sides.ladoDireito ??
      normalized['Lado Dir.'] ??
      display.ladoDireito,
    'Lado Esq.':
      lotMeasures.sides.ladoEsquerdo ??
      normalized['Lado Esq.'] ??
      display.ladoEsquerdo,
    lado_direito:
      lotMeasures.sides.ladoDireito ??
      normalized.lado_direito ??
      display.ladoDireito,
    lado_esquerdo:
      lotMeasures.sides.ladoEsquerdo ??
      normalized.lado_esquerdo ??
      display.ladoEsquerdo,
    chanfre: lotMeasures.chanfre?.total ?? null,
    chanfre_segments: lotMeasures.chanfre?.segments ?? [],
  };

  console.log('REGENERATE_LOT_MEASURES_NORMALIZED', {
    display,
    resolved: lotMeasures.sides,
    chanfre: lotMeasures.chanfre,
    enriched: {
      frente: enriched.frente,
      fundo: enriched.fundo,
      lado_direito: enriched.lado_direito,
      lado_esquerdo: enriched.lado_esquerdo,
    },
  });

  return enriched;
}

/** Carrega bloco/lote por ID — select('*') para compatibilidade com schema de produção. */
export async function fetchBlockForContractRegeneration(
  supabase: SupabaseClient,
  blockId: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .maybeSingle();

  if (error) {
    console.warn('REGENERATE_BLOCK_QUERY_WARN', {
      blockId,
      message: error.message,
      code: error.code,
    });
    return {};
  }

  if (!data) {
    console.warn('REGENERATE_BLOCK_NOT_FOUND', { blockId, tenantId });
    return {};
  }

  const row = data as Record<string, unknown>;
  const rowTenant = row.tenant_id ? String(row.tenant_id) : '';
  if (rowTenant && rowTenant !== tenantId) {
    throw new Error(
      `Lote não pertence à empresa do contrato (tenant ${tenantId}).`,
    );
  }
  if (!rowTenant) {
    console.warn('REGENERATE_ENTITY_LEGACY_NO_TENANT', {
      table: 'blocks',
      id: blockId,
      tenantId,
    });
  }

  return row;
}

function isValidSnapshot(val: unknown): boolean {
  return (
    typeof val === 'string' &&
    val.trim() !== '' &&
    !val.includes('não informad')
  );
}

export function validateSaleContractRegeneration(ctx: {
  contract: Record<string, unknown>;
  customer: Record<string, unknown> | null;
  sale: Record<string, unknown> | null;
  block: Record<string, unknown> | null;
  project: Record<string, unknown> | null;
  tenant: Record<string, unknown> | null;
}): ContractRegenerateValidation {
  const missing: string[] = [];
  const contract = ctx.contract;
  if (!contract?.id) missing.push('Contrato');
  if (!ctx.sale?.id && !contract.sale_id) missing.push('Venda');
  if (!ctx.customer?.id && !contract.customer_id) missing.push('Cliente');
  if (!ctx.block?.id && !contract.block_id) missing.push('Lote');
  const hasProject =
    !!ctx.project?.id ||
    !!contract.project_id ||
    !!(ctx.sale as Record<string, unknown>)?.project_id ||
    !!(ctx.block as Record<string, unknown>)?.project_id;
  if (!hasProject) missing.push('Projeto');
  if (
    !ctx.tenant?.id &&
    !contract.tenant_id &&
    !contract.company_id
  ) {
    missing.push('Empresa');
  }

  const customerValidation = validateCustomerForContract(ctx.customer);
  if (!customerValidation.valid) {
    missing.push(...customerValidation.missingRequired);
  }

  if (missing.length) {
    return {
      ok: false,
      missing,
      error: `Dados insuficientes para regenerar:\n${missing.map((m) => `• ${m}`).join('\n')}`,
    };
  }
  return { ok: true, missing: [] };
}

/**
 * Busca contrato por UUID (id) ou, em fallback, por contract_number.
 * Usa select('*') para não falhar quando colunas opcionais não existem no schema.
 */
export async function loadSaleContractContext(
  supabase: SupabaseClient,
  contractId: string,
): Promise<Record<string, unknown>> {
  const receivedId = String(contractId || '').trim();
  console.log('REGENERATE_ID_RECEIVED', receivedId);

  if (!receivedId) {
    throw new ContractNotFoundError(receivedId, { detail: 'ID do contrato vazio.' });
  }

  const runLookup = async (
    field: 'id' | 'contract_number',
    value: string,
  ) => {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq(field, value)
      .maybeSingle();

    console.log('CONTRACT_QUERY_RESULT', {
      field,
      value,
      found: !!data,
      error: error?.message,
      code: error?.code,
      id: (data as Record<string, unknown> | null)?.id,
      contract_number: (data as Record<string, unknown> | null)?.contract_number,
      tenant_id: (data as Record<string, unknown> | null)?.tenant_id,
      company_id: (data as Record<string, unknown> | null)?.company_id,
    });
    console.log('CONTRACT_EXISTS', !!data);

    if (error) {
      console.error('CONTRACT_QUERY_ERROR', {
        field,
        value,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw new ContractNotFoundError(receivedId, {
        lookup: field,
        supabaseCode: error.code,
        supabaseMessage: error.message,
        detail: `Erro ao buscar contrato: ${error.message}`,
      });
    }

    return data as Record<string, unknown> | null;
  };

  let contract: Record<string, unknown> | null = null;

  if (isUuid(receivedId)) {
    contract = await runLookup('id', receivedId);
  }

  if (!contract) {
    console.warn('REGENERATE_CONTRACT_FALLBACK_NUMBER', { receivedId });
    contract = await runLookup('contract_number', receivedId);
  }

  if (!contract && !isUuid(receivedId)) {
    contract = await runLookup('id', receivedId);
  }

  if (!contract) {
    throw new ContractNotFoundError(receivedId, {
      detail: 'Contrato não encontrado.',
    });
  }

  if (!contract.tenant_id && contract.company_id) {
    contract.tenant_id = contract.company_id;
  }

  return contract;
}

/**
 * Carrega entidade por ID; se tiver tenant_id, deve coincidir com o contrato.
 * Registros legados sem tenant_id são aceitos quando o contrato já referencia o ID.
 */
async function fetchScopedEntity(
  supabase: SupabaseClient,
  table: 'sales' | 'customers' | 'blocks' | 'projects',
  id: string,
  tenantId: string,
  label: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar ${label}: ${error.message}`);
  }
  if (!data) {
    console.warn('REGENERATE_ENTITY_NOT_FOUND', { table, id, tenantId });
    return {};
  }

  const row = data as Record<string, unknown>;
  const rowTenant = row.tenant_id ? String(row.tenant_id) : '';
  if (rowTenant && rowTenant !== tenantId) {
    throw new Error(
      `${label} não pertence à empresa do contrato (tenant ${tenantId}).`,
    );
  }
  if (!rowTenant) {
    console.warn('REGENERATE_ENTITY_LEGACY_NO_TENANT', { table, id, tenantId });
  }

  return row;
}

/** Empresa vendedora: exclusivamente pelo tenant_id do contrato (= empresa logada). */
async function fetchCompanyForTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Record<string, unknown>> {
  console.log('REGENERATE_COMPANY_START', { tenantId });

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (error || !data) {
    console.error('REGENERATE_COMPANY_NOT_FOUND', {
      tenantId,
      message: error?.message,
    });
    throw new Error(
      `Empresa não encontrada para tenant_id=${tenantId}. ${error?.message || ''}`.trim(),
    );
  }

  const company = data as Record<string, unknown>;
  console.log('REGENERATE_COMPANY_FOUND', {
    id: company.id,
    fantasy_name: company.fantasy_name,
    razao_social: company.razao_social,
    city: company.city,
    state: company.state,
  });

  const missingFields = auditMissingCompanyFields(company);
  if (missingFields.length > 0) {
    console.warn('REGENERATE_COMPANY_MISSING_FIELDS', missingFields);
  }

  console.log('REGENERATE_COMPANY_DATA', company);
  return company;
}

async function updateContractRowWithFallback(
  supabase: SupabaseClient,
  contractId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  let cleaned: Record<string, unknown> = { ...payload };

  for (let attempt = 0; attempt < 25; attempt++) {
    const { error } = await supabase
      .from('contracts')
      .update(cleaned)
      .eq('id', contractId);

    if (!error) return;

    const missingCol = parseMissingContractColumn(error.message);
    if (missingCol && missingCol in cleaned) {
      cleaned = stripPayloadColumn(cleaned, missingCol, 'update');
      console.warn('[REGENERATE] update retry sem coluna', missingCol);
      continue;
    }

    throw new Error(error.message);
  }
}

async function insertRegeneratedContractRow(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  htmlForResponse?: string,
): Promise<Record<string, unknown>> {
  let cleaned: Record<string, unknown> = Object.fromEntries(
    Object.entries(payload).filter(
      ([key, v]) =>
        v !== undefined && !CONTRACT_HTML_SKIP_COLUMNS.has(key),
    ),
  );

  for (let attempt = 0; attempt < 25; attempt++) {
    const { data, error } = await supabase
      .from('contracts')
      .insert([cleaned])
      .select('*')
      .single();

    if (!error && data) {
      const row = data as Record<string, unknown>;
      return htmlForResponse
        ? attachHtmlToContractRow(row, htmlForResponse)
        : row;
    }

    const missingCol = parseMissingContractColumn(error?.message);
    if (missingCol && missingCol in cleaned) {
      cleaned = stripPayloadColumn(cleaned, missingCol, 'insert');
      console.warn('[REGENERATE] insert retry sem coluna', missingCol);
      continue;
    }

    throw new Error(error?.message || 'Falha ao criar nova versão do contrato');
  }

  throw new Error('Falha ao criar nova versão do contrato após várias tentativas');
}

export async function listSaleContractVersions(
  supabase: SupabaseClient,
  saleId: string,
): Promise<SaleContractVersionRow[]> {
  let { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('sale_id', saleId)
    .order('version', { ascending: false });

  if (error?.message?.match(/version|Could not find/i)) {
    ({ data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false }));
  }

  if (error) {
    console.warn('[CONTRACT_VERSIONS]', error.message);
    return [];
  }

  const rows = (data || []) as SaleContractVersionRow[];
  return rows.sort(
    (a, b) =>
      Number(b.version) - Number(a.version) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** Busca entidades atuais no banco — isoladas por tenant_id; sem HTML/PDF antigo. */
export async function loadFreshRegenerationEntities(
  supabase: SupabaseClient,
  contract: Record<string, unknown>,
  session: RegenerationSession,
) {
  const tenantId = session.contractTenantId;
  const customerId = contract.customer_id as string | undefined;
  const saleId = contract.sale_id as string | undefined;

  const company = await fetchCompanyForTenant(supabase, tenantId);

  let sale: Record<string, unknown> = {};
  if (saleId) {
    sale = await fetchScopedEntity(supabase, 'sales', saleId, tenantId, 'Venda');
  }

  let customer: Record<string, unknown> = {};
  if (customerId) {
    customer = await fetchScopedEntity(
      supabase,
      'customers',
      customerId,
      tenantId,
      'Cliente',
    );

    const doc = normalizeDocument(
      String(customer.cpf_cnpj || customer.document || ''),
    );
    if (doc.length >= 11) {
      let clientQuery = supabase
        .from('clients')
        .select('*')
        .eq('cpf_cnpj', doc);
      clientQuery = clientQuery.eq('tenant_id', tenantId);
      const { data: clientRow } = await clientQuery.maybeSingle();
      if (clientRow) {
        customer = mergeCustomerData(customer, clientRow);
      }
    }
  }

  let receipts_sum = 0;
  let finance_receipts: Array<Record<string, unknown>> = [];
  if (saleId) {
    let recQuery = supabase
      .from('finance_receipts')
      .select('amount, due_date, status, installment_number')
      .eq('sale_id', saleId)
      .neq('status', 'cancelado');
    recQuery = recQuery.eq('tenant_id', tenantId);
    let { data: recs, error: recErr } = await recQuery;

    if (recErr?.message?.includes('tenant_id')) {
      const fallback = await supabase
        .from('finance_receipts')
        .select('amount, due_date, status, installment_number')
        .eq('sale_id', saleId)
        .neq('status', 'cancelado');
      recs = fallback.data;
      recErr = fallback.error;
    }

    if (recErr) {
      console.warn('REGENERATE_RECEIPTS_LOAD', recErr.message);
    } else if (recs?.length) {
      finance_receipts = recs as Array<Record<string, unknown>>;
      receipts_sum = recs.reduce(
        (a, b) => a + Number((b as { amount?: number }).amount || 0),
        0,
      );
    }
  }

  const blockId =
    (contract.block_id as string) ||
    (sale.block_id as string) ||
    undefined;

  let block: Record<string, unknown> = {};
  if (blockId) {
    block = await fetchBlockForContractRegeneration(
      supabase,
      blockId,
      tenantId,
    );
  }

  sale = await enrichSaleWithBrokerForContract(supabase, sale, {
    contract,
    block,
  });

  const projectId =
    (contract.project_id as string) ||
    (sale.project_id as string) ||
    (block.project_id as string) ||
    undefined;

  let project: Record<string, unknown> = {};
  if (projectId) {
    project = await fetchScopedEntity(
      supabase,
      'projects',
      projectId,
      tenantId,
      'Projeto',
    );
  }

  const seller = normalizeSellerFromCompany(company);
  const sellerText = formatClassicSellerInstallationText(seller);
  console.log('REGENERATE_SELLER_TEXT', sellerText);
  console.log('REGENERATE_CONTRACT_CUSTOMER_DATA', customer);
  console.log('REGENERATE_CONTRACT_SALE_DATA', { ...sale, receipts_sum });

  let projectBlocks: Array<Record<string, unknown>> = [];
  let streetGuides: Array<Record<string, unknown>> = [];
  if (projectId) {
    const [{ data: blocks }, { data: guides }] = await Promise.all([
      supabase.from('blocks').select('*').eq('project_id', projectId),
      supabase.from('street_guides').select('*').eq('project_id', projectId),
    ]);
    projectBlocks = (blocks || []) as Array<Record<string, unknown>>;
    streetGuides = (guides || []) as Array<Record<string, unknown>>;
  }

  return {
    company,
    customer,
    sale,
    block: enrichBlockForContract(block),
    project,
    receipts_sum,
    finance_receipts,
    seller,
    projectBlocks,
    streetGuides,
  };
}

export async function buildFreshSaleContractHtml(
  supabase: SupabaseClient,
  contract: Record<string, unknown>,
  session: RegenerationSession,
): Promise<{
  html: string;
  contractNumber: string;
  contractPayloadPartial: Record<string, unknown>;
  customer: Record<string, unknown>;
  sale: Record<string, unknown>;
  block: Record<string, unknown>;
  project: Record<string, unknown>;
  tenant: Record<string, unknown>;
  receipts_sum: number;
}> {
  const fresh = await loadFreshRegenerationEntities(supabase, contract, session);
  const {
    company,
    customer,
    sale,
    block,
    project,
    receipts_sum,
    finance_receipts,
    projectBlocks,
    streetGuides,
  } = fresh;

  const tenant = {
    ...company,
    id: session.contractTenantId,
  };
  const saleWithId = {
    ...sale,
    id: (sale.id as string) || (contract.sale_id as string),
  };
  const customerWithId = {
    ...mergeCustomerData(customer, sale, contract.customers as Record<string, unknown>),
    id: (customer.id as string) || (contract.customer_id as string),
  };
  const blockWithId = {
    ...block,
    id: (block.id as string) || (contract.block_id as string),
  };
  const projectWithId = {
    ...project,
    id: (project.id as string) || (contract.project_id as string),
  };

  const projData = projectWithId;
  const contractPayloadPartial = {
    project_name_snapshot: (projData.name as string) || null,
    project_city_snapshot: (projData.city as string) || null,
    project_uf_snapshot: (projData.uf as string) || null,
    forum_city_snapshot:
      (projData.forum_city as string) || (projData.city as string) || null,
  };

  let contractNumber = String(contract.contract_number || '');
  if (!isValidStoredContractNumber(contractNumber)) {
    contractNumber = await ensureValidContractNumber(supabase, {
      id: contract.id as string,
      contract_number: contractNumber,
      tenant_id: contract.tenant_id as string,
      company_id: (contract.company_id || contract.tenant_id) as string,
    });
  }

  console.log('REGENERATE_TEMPLATE_USED', 'current_contract_template');

  assertCustomerValidForContract(customerWithId);

  const html = generateContractHTML({
    tenant,
    customer: customerWithId,
    project: projData,
    block: blockWithId,
    sale: {
      ...saleWithId,
      receipts_sum,
      finance_receipts,
    },
    financeReceipts: finance_receipts,
    contractSnapshot: {
      contract_number: contractNumber,
      ...contractPayloadPartial,
    },
    projectBlocks,
    streetGuides,
    manualConfrontants: null,
  });

  console.log('REGENERATE_HTML_GENERATED', {
    contractNumber,
    htmlLength: html.length,
    tenantId: session.contractTenantId,
  });

  return {
    html,
    contractNumber,
    contractPayloadPartial,
    customer: customerWithId,
    sale: saleWithId,
    block: blockWithId,
    project: projData,
    tenant,
    receipts_sum,
  };
}

export async function regenerateSaleContract(
  supabase: SupabaseClient,
  params: {
    contractId: string;
    regeneratedByUserId?: string | null;
    session: RegenerationSession;
  },
): Promise<{
  oldContract: SaleContractVersionRow;
  newContract: SaleContractVersionRow;
  versions: SaleContractVersionRow[];
}> {
  console.log('REGENERATE_CONTRACT_START', {
    contractId: params.contractId,
    tenantId: params.session.contractTenantId,
  });
  console.log('CONTRACT_REGENERATE_CLICK', { contractId: params.contractId });

  const contract = await loadSaleContractContext(supabase, params.contractId);
  const saleId = contract.sale_id as string;
  const tenantId = params.session.contractTenantId;

  if (!saleId) {
    throw new Error('Contrato sem sale_id — não é possível regenerar.');
  }

  console.log('CONTRACT_REGENERATE_LOAD_DATA', {
    contractId: params.contractId,
    saleId,
    tenantId,
    activeTenantId: params.session.activeTenantId,
  });

  const {
    html,
    contractNumber,
    contractPayloadPartial,
    customer,
    sale,
    block,
    project,
    tenant,
  } = await buildFreshSaleContractHtml(supabase, contract, params.session);

  const validation = validateSaleContractRegeneration({
    contract,
    customer,
    sale,
    block,
    project,
    tenant,
  });
  if (!validation.ok) {
    throw new Error(validation.error || 'Validação falhou');
  }

  const existingVersions = await listSaleContractVersions(supabase, saleId);
  const maxVersion = existingVersions.reduce(
    (max, row) => Math.max(max, Number(row.version) || 0),
    Number(contract.version) || 0,
  );
  const newVersion = maxVersion + 1;
  const now = new Date().toISOString();

  console.log('CONTRACT_REGENERATE_OLD_VERSION', {
    id: contract.id,
    version: maxVersion,
  });

  const htmlFields = buildRegeneratedContractHtmlFields(html, contract);

  const newRow = await insertRegeneratedContractRow(
    supabase,
    {
    tenant_id: tenantId,
    company_id: tenantId,
    sale_id: saleId,
    customer_id: contract.customer_id,
    project_id:
      contract.project_id ||
      sale.project_id ||
      (block.id as string) ||
      null,
    block_id: contract.block_id || block.id || sale.block_id,
    broker_id: contract.broker_id || sale.broker_id || null,
    contract_number: contractNumber,
    ...htmlFields,
    pdf_url: null,
    status: 'ativo',
    is_current: true,
    needs_regenerar: false,
    version: newVersion,
    regenerated_from: contract.id,
    regenerated_at: now,
    regenerated_by: params.regeneratedByUserId || null,
    sale_value: sale.total_value ?? sale.agreed_price ?? contract.sale_value,
    down_payment: sale.down_payment ?? contract.down_payment,
    installments: sale.installments_count ?? contract.installments,
    ...contractPayloadPartial,
    created_at: now,
    },
    html,
  );

  await updateContractRowWithFallback(supabase, contract.id as string, {
    status: 'superseded',
    is_current: false,
    superseded_by: newRow.id,
    regenerated_at: now,
    pdf_url: null,
  });

  for (const ver of existingVersions) {
    if (ver.id === newRow.id || ver.id === contract.id) continue;
    try {
      await updateContractRowWithFallback(supabase, ver.id, {
        is_current: false,
      });
    } catch (e) {
      console.warn('[REGENERATE] is_current em versão anterior', ver.id, e);
    }
  }

  if (contract.block_id || block.id) {
    await supabase
      .from('blocks')
      .update({ contract_id: newRow.id })
      .eq('id', (contract.block_id || block.id) as string);
  }

  const versions = await listSaleContractVersions(supabase, saleId);

  console.log('CONTRACT_REGENERATE_NEW_VERSION', {
    id: newRow.id,
    version: newVersion,
  });
  console.log('REGENERATE_PDF_GENERATED', {
    mode: 'client_html2pdf',
    contractId: newRow.id,
    note: 'PDF é gerado no navegador a partir do HTML atualizado (generated_html).',
  });
  console.log('REGENERATE_CONTRACT_SUCCESS', newRow);
  console.log('CONTRACT_REGENERATE_SUCCESS', {
    oldId: contract.id,
    newId: newRow.id,
    version: newVersion,
  });

  void logLotAuditEvent(supabase, {
    ...lotAuditContextFromBlock(block, {
      companyId: tenantId,
      projectId: (contract.project_id as string) ?? null,
      saleId,
      contractId: newRow.id as string,
    }),
    userId: params.regeneratedByUserId ?? null,
    action: 'contract_regenerated',
    title: 'Contrato regenerado',
    description: `Contrato nº ${contractNumber} (versão ${newVersion})`,
    oldData: { contract_id: contract.id, version: maxVersion },
    newData: { contract_id: newRow.id, version: newVersion },
    source: 'contract_flow',
  });

  return {
    oldContract: {
      ...(contract as unknown as SaleContractVersionRow),
      status: 'superseded',
      superseded_by: newRow.id,
    },
    newContract: newRow as SaleContractVersionRow,
    versions,
  };
}
