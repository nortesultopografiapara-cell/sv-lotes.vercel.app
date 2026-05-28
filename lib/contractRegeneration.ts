/**
 * Regeneração de contratos de venda com histórico de versões.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateContractHTML } from '@/lib/contractTemplate';
import {
  ensureValidContractNumber,
  isValidStoredContractNumber,
} from '@/lib/contractNumber';
import { resolveLotMeasuresFromBlock } from '@/lib/lotMeasures';

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
  if (!ctx.contract?.id) missing.push('Contrato');
  if (!ctx.sale?.id) missing.push('Venda');
  if (!ctx.customer?.id && !ctx.contract.customer_id) missing.push('Cliente');
  if (!ctx.block?.id && !ctx.contract.block_id) missing.push('Lote');
  if (!ctx.project?.id && !ctx.contract.project_id) missing.push('Projeto');
  if (!ctx.tenant?.id && !ctx.contract.tenant_id) missing.push('Empresa');

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

export async function loadSaleContractContext(
  supabase: SupabaseClient,
  contractId: string,
) {
  const { data: contract, error } = await supabase
    .from('contracts')
    .select(
      `
      *,
      customers:customer_id(*),
      sales:sale_id(*, projects:project_id(*), blocks:block_id(*)),
      projects:project_id(*),
      blocks:block_id(*, projects:project_id(*))
    `,
    )
    .eq('id', contractId)
    .single();

  if (error || !contract) {
    throw new Error('Contrato não encontrado.');
  }

  return contract as Record<string, unknown>;
}

export async function listSaleContractVersions(
  supabase: SupabaseClient,
  saleId: string,
): Promise<SaleContractVersionRow[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select(
      'id, contract_number, version, status, generated_html, pdf_url, created_at, regenerated_at, regenerated_by, regenerated_from, superseded_by',
    )
    .eq('sale_id', saleId)
    .order('version', { ascending: false });

  if (error) {
    console.warn('[CONTRACT_VERSIONS]', error.message);
    return [];
  }
  return (data || []) as SaleContractVersionRow[];
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
  const sale = (contract.sales as Record<string, unknown>) || {};
  const customer =
    (contract.customers as Record<string, unknown>) ||
    (contract.customer_id ? { id: contract.customer_id } : {});

  let receipts_sum = 0;
  if (contract.sale_id) {
    const { data: recs } = await supabase
      .from('finance_receipts')
      .select('amount')
      .eq('sale_id', contract.sale_id as string)
      .neq('status', 'cancelled');
    if (recs?.length) {
      receipts_sum = recs.reduce(
        (a, b) => a + Number((b as { amount?: number }).amount || 0),
        0,
      );
    }
  }

  let fetchedProject = contract.projects as Record<string, unknown> | undefined;
  const pid =
    (contract.project_id as string) ||
    (sale.project_id as string) ||
    ((sale.blocks as Record<string, unknown>)?.project_id as string);

  if (pid) {
    const { data: pj } = await supabase
      .from('projects')
      .select('*')
      .eq('id', pid)
      .maybeSingle();
    if (pj) fetchedProject = pj as Record<string, unknown>;
  }

  const projData =
    fetchedProject ||
    (sale.projects as Record<string, unknown>) ||
    ((contract.blocks as Record<string, unknown>)?.projects as Record<string, unknown>) ||
    {};

  const contractPayloadPartial = {
    project_name_snapshot: isValidSnapshot(contract.project_name_snapshot)
      ? contract.project_name_snapshot
      : (projData.name as string) || null,
    project_city_snapshot: isValidSnapshot(contract.project_city_snapshot)
      ? contract.project_city_snapshot
      : (projData.city as string) || null,
    project_uf_snapshot: isValidSnapshot(contract.project_uf_snapshot)
      ? contract.project_uf_snapshot
      : (projData.uf as string) || null,
    forum_city_snapshot: isValidSnapshot(contract.forum_city_snapshot)
      ? contract.forum_city_snapshot
      : (projData.forum_city as string) || (projData.city as string) || null,
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

  const blockId =
    (contract.block_id as string) ||
    ((contract.blocks as Record<string, unknown>)?.id as string) ||
    ((sale.blocks as Record<string, unknown>)?.id as string) ||
    (sale.block_id as string);

  let blockForTemplate =
    (contract.blocks as Record<string, unknown>) ||
    (sale.blocks as Record<string, unknown>) ||
    {};

  if (blockId) {
    const { data: freshBlock } = await supabase
      .from('blocks')
      .select(BLOCKS_CONTRACT_SELECT)
      .eq('id', blockId)
      .maybeSingle();
    if (freshBlock) blockForTemplate = freshBlock as Record<string, unknown>;
  }

  let tenant: Record<string, unknown> = {};
  const tid = (contract.tenant_id || contract.company_id) as string;
  if (tid) {
    const { data: t } = await supabase
      .from('companies')
      .select('*')
      .eq('id', tid)
      .maybeSingle();
    if (t) tenant = t as Record<string, unknown>;
  }

  const html = generateContractHTML({
    tenant,
    customer,
    project: projData,
    block: enrichBlockForContract(blockForTemplate),
    sale: { ...sale, receipts_sum },
    contractSnapshot: {
      ...contract,
      ...contractPayloadPartial,
      contract_number: contractNumber,
    },
    contractDate: new Date().toISOString(),
  });

  return {
    html,
    contractNumber,
    contractPayloadPartial,
    customer: customer as Record<string, unknown>,
    sale: sale as Record<string, unknown>,
    block: enrichBlockForContract(blockForTemplate),
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

  const { customer, sale, block, project, tenant } = await (async () => {
    const built = await buildFreshSaleContractHtml(supabase, contract);
    return {
      customer: built.customer,
      sale: built.sale,
      block: built.block,
      project: built.project,
      tenant: built.tenant,
    };
  })();

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

  const { html, contractNumber, contractPayloadPartial } =
    await buildFreshSaleContractHtml(supabase, contract);

  const { data: newRow, error: insertErr } = await supabase
    .from('contracts')
    .insert({
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
      status: 'ativo',
      version: newVersion,
      regenerated_from: contract.id,
      regenerated_at: now,
      regenerated_by: params.regeneratedByUserId || null,
      sale_value: sale.total_value ?? sale.agreed_price ?? contract.sale_value,
      down_payment: sale.down_payment ?? contract.down_payment,
      installments: sale.installments_count ?? contract.installments,
      ...contractPayloadPartial,
      created_at: now,
    })
    .select(
      'id, contract_number, version, status, generated_html, pdf_url, created_at, regenerated_at, regenerated_by, regenerated_from, superseded_by',
    )
    .single();

  if (insertErr || !newRow) {
    throw new Error(insertErr?.message || 'Falha ao criar nova versão do contrato');
  }

  const { error: supersedeErr } = await supabase
    .from('contracts')
    .update({
      status: 'superseded',
      superseded_by: newRow.id,
      regenerated_at: now,
    })
    .eq('id', contract.id);

  if (supersedeErr) {
    console.warn('[CONTRACT_SUPERSEDE]', supersedeErr.message);
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
