/**
 * Regeneração de contratos de venda com histórico de versões.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateContractHTML } from '@/lib/contractTemplate';
import {
  ensureValidContractNumber,
  isValidStoredContractNumber,
} from '@/lib/contractNumber';
import { resolveLotMeasuresFromBlock } from '@/lib/lotChanfre';
import {
  formatClassicSellerInstallationText,
  normalizeSellerFromCompany,
} from '@/lib/contractSeller';

export const BLOCKS_CONTRACT_SELECT = `
  *,
  frente,
  area,
  fundo,
  lado_direito,
  lado_esquerdo,
  "Fundo",
  "Lado Dir.",
  "Lado Esq."
`;

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
  const b = block as Record<string, unknown>;
  const normalized = {
    ...b,
    frente: b.frente ?? b.Frente ?? '',
    area: b.area,
    segments_json: b.segments_json,
    Fundo: b['Fundo'] ?? b.Fundo ?? b.fundo ?? '',
    'Lado Dir.':
      b['Lado Dir.'] ??
      b['Lado Dir'] ??
      b.ladoDireito ??
      b.lado_dir ??
      b.lado_direito ??
      '',
    'Lado Esq.':
      b['Lado Esq.'] ??
      b['Lado Esq'] ??
      b.ladoEsquerdo ??
      b.lado_esq ??
      b.lado_esquerdo ??
      '',
  };
  const lotMeasures = resolveLotMeasuresFromBlock(normalized);
  return {
    ...normalized,
    frente: lotMeasures.sides.frente ?? normalized.frente,
    Fundo: lotMeasures.sides.fundo ?? normalized.Fundo,
    'Lado Dir.': lotMeasures.sides.ladoDireito ?? normalized['Lado Dir.'],
    'Lado Esq.': lotMeasures.sides.ladoEsquerdo ?? normalized['Lado Esq.'],
    chanfre: lotMeasures.chanfre?.total ?? null,
    chanfre_segments: lotMeasures.chanfre?.segments ?? [],
  };
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
  if (!ctx.project?.id && !contract.project_id) missing.push('Projeto');
  if (
    !ctx.tenant?.id &&
    !contract.tenant_id &&
    !contract.company_id
  ) {
    missing.push('Empresa');
  }

  const customerName =
    (ctx.customer?.name as string) ||
    (ctx.customer?.full_name as string) ||
    '';
  if (!customerName.trim()) missing.push('Nome do cliente');

  if (missing.length) {
    return {
      ok: false,
      missing,
      error: `Dados insuficientes para regenerar:\n${missing.map((m) => `• ${m}`).join('\n')}`,
    };
  }
  return { ok: true, missing: [] };
}

/** Apenas IDs do contrato — sem HTML/PDF embutidos para regeneração. */
export async function loadSaleContractContext(
  supabase: SupabaseClient,
  contractId: string,
) {
  const { data: contract, error } = await supabase
    .from('contracts')
    .select(
      'id, tenant_id, company_id, sale_id, customer_id, project_id, block_id, broker_id, contract_number, version, status, sale_value, down_payment, installments',
    )
    .eq('id', contractId)
    .single();

  if (error || !contract) {
    throw new Error('Contrato não encontrado.');
  }

  return contract as Record<string, unknown>;
}

async function fetchCompanyForRegeneration(
  supabase: SupabaseClient,
  contract: Record<string, unknown>,
  sale: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ids = [
    contract.company_id,
    contract.tenant_id,
    sale.company_id,
    sale.tenant_id,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);

  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.warn('[REGENERATE] companies fetch', id, error.message);
      continue;
    }
    if (data) return data as Record<string, unknown>;
  }
  return {};
}

async function insertRegeneratedContractRow(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let cleaned: Record<string, unknown> = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined),
  );

  for (let attempt = 0; attempt < 25; attempt++) {
    const { data, error } = await supabase
      .from('contracts')
      .insert([cleaned])
      .select(
        'id, contract_number, version, status, generated_html, html_content, pdf_url, created_at, regenerated_at, regenerated_by, regenerated_from, superseded_by, is_current',
      )
      .single();

    if (!error && data) {
      return data as Record<string, unknown>;
    }

    const missingCol = error?.message?.match(
      /Could not find the '(\w+)' column/i,
    )?.[1];
    if (missingCol && missingCol in cleaned) {
      const { [missingCol]: _removed, ...rest } = cleaned;
      cleaned = rest;
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
  const { data, error } = await supabase
    .from('contracts')
    .select(
      'id, contract_number, version, status, generated_html, html_content, pdf_url, created_at, regenerated_at, regenerated_by, regenerated_from, superseded_by, is_current',
    )
    .eq('sale_id', saleId)
    .order('version', { ascending: false });

  if (error) {
    console.warn('[CONTRACT_VERSIONS]', error.message);
    return [];
  }
  return (data || []) as SaleContractVersionRow[];
}

/** Busca entidades atuais no banco — não reutiliza HTML nem snapshots do contrato anterior. */
export async function loadFreshRegenerationEntities(
  supabase: SupabaseClient,
  contract: Record<string, unknown>,
) {
  const customerId = contract.customer_id as string | undefined;
  const saleId = contract.sale_id as string | undefined;

  let sale: Record<string, unknown> = {};
  if (saleId) {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .maybeSingle();
    if (data) sale = data as Record<string, unknown>;
  }

  const company = await fetchCompanyForRegeneration(supabase, contract, sale);

  let customer: Record<string, unknown> = {};
  if (customerId) {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .maybeSingle();
    if (data) customer = data as Record<string, unknown>;
  }

  let receipts_sum = 0;
  if (saleId) {
    const { data: recs } = await supabase
      .from('finance_receipts')
      .select('amount, due_date, status, installment_number')
      .eq('sale_id', saleId)
      .neq('status', 'cancelled');
    if (recs?.length) {
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
    const { data } = await supabase
      .from('blocks')
      .select(BLOCKS_CONTRACT_SELECT)
      .eq('id', blockId)
      .maybeSingle();
    if (data) block = data as Record<string, unknown>;
  }

  const projectId =
    (contract.project_id as string) ||
    (sale.project_id as string) ||
    (block.project_id as string) ||
    undefined;

  let project: Record<string, unknown> = {};
  if (projectId) {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();
    if (data) project = data as Record<string, unknown>;
  }

  const seller = normalizeSellerFromCompany(company);
  const sellerText = formatClassicSellerInstallationText(seller);
  console.log('REGENERATE_COMPANY_DATA', company);
  console.log('REGENERATE_SELLER_TEXT', sellerText);
  console.log('REGENERATE_CONTRACT_CUSTOMER_DATA', customer);
  console.log('REGENERATE_CONTRACT_SALE_DATA', { ...sale, receipts_sum });

  return {
    company,
    customer,
    sale,
    block: enrichBlockForContract(block),
    project,
    receipts_sum,
    seller,
  };
}

export async function buildFreshSaleContractHtml(
  supabase: SupabaseClient,
  contract: Record<string, unknown>,
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
  const fresh = await loadFreshRegenerationEntities(supabase, contract);
  const { company, customer, sale, block, project, receipts_sum } = fresh;

  const tenant = {
    ...company,
    id:
      (company.id as string) ||
      (contract.company_id as string) ||
      (contract.tenant_id as string),
  };
  const saleWithId = {
    ...sale,
    id: (sale.id as string) || (contract.sale_id as string),
  };
  const customerWithId = {
    ...customer,
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

  const html = generateContractHTML({
    tenant,
    customer: customerWithId,
    project: projData,
    block: blockWithId,
    sale: { ...saleWithId, receipts_sum },
    contractSnapshot: {
      contract_number: contractNumber,
      ...contractPayloadPartial,
    },
    contractDate: new Date().toISOString(),
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
  },
): Promise<{
  oldContract: SaleContractVersionRow;
  newContract: SaleContractVersionRow;
  versions: SaleContractVersionRow[];
}> {
  console.log('CONTRACT_REGENERATE_CLICK', { contractId: params.contractId });

  const contract = await loadSaleContractContext(supabase, params.contractId);
  const saleId = contract.sale_id as string;

  console.log('CONTRACT_REGENERATE_LOAD_DATA', {
    contractId: params.contractId,
    saleId,
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
  } = await buildFreshSaleContractHtml(supabase, contract);

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

  const oldVersion = Number(contract.version) || 1;
  const newVersion = oldVersion + 1;
  const now = new Date().toISOString();

  console.log('CONTRACT_REGENERATE_OLD_VERSION', {
    id: contract.id,
    version: oldVersion,
  });

  const newRow = await insertRegeneratedContractRow(supabase, {
    tenant_id: contract.tenant_id,
    company_id: contract.company_id || contract.tenant_id,
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
    generated_html: html,
    html_content: html,
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
  });

  const { error: supersedeErr } = await supabase
    .from('contracts')
    .update({
      status: 'superseded',
      is_current: false,
      superseded_by: newRow.id,
      regenerated_at: now,
    })
    .eq('id', contract.id);

  if (supersedeErr) {
    console.warn('[CONTRACT_SUPERSEDE]', supersedeErr.message);
  }

  await supabase
    .from('contracts')
    .update({ is_current: false })
    .eq('sale_id', saleId)
    .neq('id', newRow.id);

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
  console.log('REGENERATE_CONTRACT_SUCCESS', newRow);
  console.log('CONTRACT_REGENERATE_SUCCESS', {
    oldId: contract.id,
    newId: newRow.id,
    version: newVersion,
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
