/**
 * P3 — busca de cessionário e preview A → B.
 * Sem INSERT/UPDATE/DELETE. Sem cancelar/gerar cobrança. Sem RPC da Troca.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { searchCustomers, normalizeDocument } from '@/lib/customerIdentity';
import { cpfCnpjIlikePatterns } from '@/lib/inputMasks';
import { loadLotSwapCallerProfile } from '@/lib/finance/saleLotSwapPreviewService';
import {
  loadSaleTitleTransferPreview,
  TitleTransferPreviewError,
  type TitleTransferPreviewPayload,
} from '@/lib/finance/saleTitleTransferPreviewService';
import {
  applyDocumentalAgio,
  assertTitleTransferContractUnchanged,
  assertTitleTransferNewTitular,
  assertTitleTransferSaleStillActive,
  assertTitleTransferTitularUnchanged,
  customerBelongsToTitleTransferCompany,
  matchesTitleTransferCustomerSearch,
  parseDeclaredAgioAmount,
  parseTitleTransferDate,
  resolveNextPreviousTransferId,
  titleTransferOpenChargesNotice,
  TITLE_TRANSFER_CUSTOMER_CROSS_TENANT,
  TITLE_TRANSFER_CUSTOMER_NOT_FOUND,
  TITLE_TRANSFER_FUTURE_EXECUTION_ITEMS,
  type TitleTransferAssigneeSearchRow,
  type TitleTransferPartyCard,
} from '@/lib/finance/saleTitleTransferPlan';
import {
  assertTitleTransferCallerOwnsCompany,
  mapTitleTransferPreviewUserMessage,
  TITLE_TRANSFER_CROSS_TENANT,
  TITLE_TRANSFER_ORIGIN_MISMATCH,
  TITLE_TRANSFER_SALE_NOT_FOUND,
} from '@/lib/finance/saleTitleTransferPreview';

export type TitleTransferPlanPayload = {
  mutation: false;
  persistTransfer: false;
  persistSale: false;
  persistLot: false;
  persistContract: false;
  persistReceipts: false;
  persistCharges: false;
  remoteApiCalled: false;
  cancelCharges: false;
  generateCharges: false;
  confirmation: {
    from: TitleTransferPartyCard;
    to: TitleTransferPartyCard;
    property: TitleTransferPreviewPayload['current']['property'];
    saleId: string;
    blockId: string;
    salePrice: number;
    finance: TitleTransferPreviewPayload['current']['finance'];
    transferDate: string;
    declaredAgioAmount: number;
    notes: string | null;
  };
  futureExecution: {
    saleId: string;
    blockId: string;
    lotStatus: string | null;
    previousTransferId: string | null;
    items: readonly string[];
  };
  openChargesNotice: string | null;
  preview: TitleTransferPreviewPayload;
};

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function todayIsoSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function mapAssignee(row: Record<string, unknown>, currentTitularId: string | null): TitleTransferAssigneeSearchRow {
  const id = String(row.id || '').trim();
  return {
    id,
    name: text(row.name),
    document: text(row.cpf_cnpj) || text(row.document),
    phone: text(row.phone),
    email: text(row.email),
    isCurrentTitular: Boolean(currentTitularId && id === currentTitularId),
  };
}

function customerSearchOrFilters(raw: string): string {
  const orFilters = [`name.ilike.%${raw}%`, `email.ilike.%${raw}%`];
  const digits = normalizeDocument(raw);
  if (digits.length >= 3) {
    for (const pattern of cpfCnpjIlikePatterns(raw)) {
      orFilters.push(`cpf_cnpj.ilike.%${pattern}%`);
      orFilters.push(`document.ilike.%${pattern}%`);
    }
  }
  return orFilters.join(',');
}

async function loadSaleCompanyContext(
  admin: SupabaseClient,
  input: { saleId: string; userId: string },
): Promise<{ companyId: string; currentTitularId: string | null }> {
  const saleId = String(input.saleId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!saleId) {
    throw new TitleTransferPreviewError('saleId obrigatório.', 'SALE_ID_REQUIRED', 400);
  }
  if (!userId) {
    throw new TitleTransferPreviewError(
      'Sessão ou autorização inválida.',
      'UNAUTHORIZED',
      401,
    );
  }
  const profile = await loadLotSwapCallerProfile(admin, userId);
  if (!profile) {
    throw new TitleTransferPreviewError(
      'Sessão ou autorização inválida.',
      'NO_PROFILE',
      403,
    );
  }
  const saleRes = await admin
    .from('sales')
    .select('id, customer_id, tenant_id, company_id, status')
    .eq('id', saleId)
    .maybeSingle();
  if (saleRes.error || !saleRes.data) {
    throw new TitleTransferPreviewError(
      'Venda não encontrada.',
      TITLE_TRANSFER_SALE_NOT_FOUND,
      404,
    );
  }
  const sale = saleRes.data as Record<string, unknown>;
  const companyId = String(sale.company_id || sale.tenant_id || '').trim();
  const callerRole = String(profile.role || '').trim();
  const callerTenant = String(
    profile.tenant_id || (profile as { company_id?: string }).company_id || '',
  ).trim();
  const tenantGuard = assertTitleTransferCallerOwnsCompany({
    callerTenantId: callerTenant,
    resourceCompanyId: companyId,
    callerRole,
  });
  if (!tenantGuard.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: TITLE_TRANSFER_CROSS_TENANT }),
      TITLE_TRANSFER_CROSS_TENANT,
      403,
    );
  }
  return {
    companyId,
    currentTitularId: text(sale.customer_id),
  };
}

function keepCompanyCustomers(
  rows: Array<Record<string, unknown>>,
  companyId: string,
  query: string,
  currentTitularId: string | null,
): TitleTransferAssigneeSearchRow[] {
  const seen = new Set<string>();
  const out: TitleTransferAssigneeSearchRow[] = [];
  for (const row of rows) {
    const id = String(row.id || '').trim();
    if (!id || seen.has(id)) continue;
    if (
      !customerBelongsToTitleTransferCompany({
        companyId: text(row.company_id),
        tenantId: text(row.tenant_id),
        saleCompanyId: companyId,
      })
    ) {
      continue;
    }
    if (!matchesTitleTransferCustomerSearch(row, query)) continue;
    seen.add(id);
    out.push(mapAssignee(row, currentTitularId));
  }
  return out.slice(0, 15);
}

export async function searchTitleTransferCustomers(
  admin: SupabaseClient,
  input: { saleId: string; userId: string; query: string },
): Promise<{ mutation: false; customers: TitleTransferAssigneeSearchRow[] }> {
  const query = String(input.query || '').trim();
  if (query.length < 2) {
    return { mutation: false, customers: [] };
  }
  const { companyId, currentTitularId } = await loadSaleCompanyContext(admin, input);

  const byTenant = await searchCustomers(admin, {
    query,
    tenantId: companyId,
    isSuperAdmin: false,
    limit: 15,
  });

  const companyQuery = await admin
    .from('customers')
    .select('id, name, cpf_cnpj, document, phone, email, tenant_id, company_id')
    .eq('company_id', companyId)
    .or(customerSearchOrFilters(query))
    .order('name', { ascending: true })
    .limit(15);

  const merged = [
    ...((byTenant || []) as Array<Record<string, unknown>>),
    ...(((companyQuery.error ? [] : companyQuery.data) || []) as Array<Record<string, unknown>>),
  ];
  return {
    mutation: false,
    customers: keepCompanyCustomers(merged, companyId, query, currentTitularId),
  };
}

export async function prepareTitleTransferPlanPreview(
  admin: SupabaseClient,
  input: {
    saleId: string;
    userId: string;
    toCustomerId?: string | null;
    transferDate?: string | null;
    declaredAgioAmount?: string | number | null;
    notes?: string | null;
    expectedContractId?: string | null;
    expectedFromCustomerId?: string | null;
    expectedBlockId?: string | null;
    todayIso?: string;
  },
): Promise<TitleTransferPlanPayload> {
  const preview = await loadSaleTitleTransferPreview(admin, {
    saleId: input.saleId,
    userId: input.userId,
    todayIso: input.todayIso,
  });

  const saleGuard = assertTitleTransferSaleStillActive(preview.current.saleStatus);
  if (!saleGuard.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: saleGuard.code }),
      saleGuard.code,
      409,
    );
  }

  const expectedBlockId = String(input.expectedBlockId || '').trim();
  if (expectedBlockId && expectedBlockId !== preview.current.property.blockId) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: TITLE_TRANSFER_ORIGIN_MISMATCH }),
      TITLE_TRANSFER_ORIGIN_MISMATCH,
      409,
    );
  }

  const contractGuard = assertTitleTransferContractUnchanged({
    expectedContractId: input.expectedContractId,
    currentContractId: preview.current.contract.id,
  });
  if (!contractGuard.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: contractGuard.code }),
      contractGuard.code,
      409,
    );
  }

  const titularUnchanged = assertTitleTransferTitularUnchanged({
    expectedFromCustomerId: input.expectedFromCustomerId,
    currentTitularId: preview.current.titular.id,
  });
  if (!titularUnchanged.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: titularUnchanged.code }),
      titularUnchanged.code,
      409,
    );
  }

  const toCustomerId = String(input.toCustomerId || '').trim();
  const customerRes = toCustomerId
    ? await admin
        .from('customers')
        .select('id, name, cpf_cnpj, document, phone, email, tenant_id, company_id')
        .eq('id', toCustomerId)
        .maybeSingle()
    : { data: null, error: null };

  const customer = (customerRes.data || null) as Record<string, unknown> | null;
  const titularGuard = assertTitleTransferNewTitular({
    fromCustomerId: preview.current.titular.id,
    toCustomerId,
    customerExists: Boolean(customer && text(customer.id)),
    customerCompanyId: text(customer?.company_id),
    customerTenantId: text(customer?.tenant_id),
    saleCompanyId: preview.current.companyId,
  });
  if (!titularGuard.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: titularGuard.code }),
      titularGuard.code || 'TITLE_TRANSFER_CUSTOMER_REQUIRED',
      titularGuard.code === TITLE_TRANSFER_CUSTOMER_CROSS_TENANT
        ? 403
        : titularGuard.code === TITLE_TRANSFER_CUSTOMER_NOT_FOUND
          ? 404
          : 400,
    );
  }

  const agio = parseDeclaredAgioAmount(input.declaredAgioAmount);
  if (!agio.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: agio.code }),
      agio.code,
      400,
    );
  }
  const date = parseTitleTransferDate(
    input.transferDate,
    input.todayIso || todayIsoSaoPaulo(),
  );
  if (!date.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: date.code }),
      date.code,
      400,
    );
  }

  const documental = applyDocumentalAgio({
    finance: preview.current.finance,
    salePrice: preview.current.salePrice,
    declaredAgioAmount: agio.amount,
  });
  const previousTransferId = resolveNextPreviousTransferId(preview.history.chain);
  const notes = text(input.notes);

  return {
    mutation: false,
    persistTransfer: false,
    persistSale: false,
    persistLot: false,
    persistContract: false,
    persistReceipts: false,
    persistCharges: false,
    remoteApiCalled: false,
    cancelCharges: false,
    generateCharges: false,
    confirmation: {
      from: {
        id: String(preview.current.titular.id || ''),
        name: preview.current.titular.name,
        document: preview.current.titular.document,
      },
      to: {
        id: String(customer?.id || toCustomerId),
        name: text(customer?.name),
        document: text(customer?.cpf_cnpj) || text(customer?.document),
        phone: text(customer?.phone),
        email: text(customer?.email),
      },
      property: preview.current.property,
      saleId: preview.current.saleId,
      blockId: preview.current.property.blockId,
      salePrice: documental.salePrice,
      finance: documental.finance,
      transferDate: date.date,
      declaredAgioAmount: documental.declaredAgioAmount,
      notes,
    },
    futureExecution: {
      saleId: preview.current.saleId,
      blockId: preview.current.property.blockId,
      lotStatus: preview.current.property.status,
      previousTransferId,
      items: [...TITLE_TRANSFER_FUTURE_EXECUTION_ITEMS],
    },
    openChargesNotice: titleTransferOpenChargesNotice(preview.externalCharges.open.length),
    preview,
  };
}
