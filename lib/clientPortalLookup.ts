/**
 * Lookup cross-tenant do Portal do Cliente — somente leitura, isolado dos módulos admin.
 * Não importa services de vendas, contratos, financeiro ou Asaas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cpfCnpjIlikePatterns,
  isValidBrazilianTaxDocument,
  matchesCpfCnpj,
  normalizeCpfCnpj,
} from '@/lib/inputMasks';
import { normalizeDocument } from '@/lib/customerIdentity';
import { readStoredContractHtml } from '@/lib/contractHtmlGlobal';
import { parseMissingContractColumn } from '@/lib/contractRegeneration';
import { buildClientPortalLinkKey } from '@/lib/portal-cliente/linkKey';
import { maskCustomerName, maskPhone } from '@/lib/portal-cliente/masking';
import { resolveSaleLoteadoraDisplayName } from '@/lib/portal-cliente/saleLoteadora';
import type {
  ClientPortalLookupResponse,
  ClientPortalMaskedResult,
} from '@/lib/portal-cliente/types';
import type { ClientPortalLinkType } from '@/lib/portal-cliente/types';
import { createAdminSupabase } from '@/lib/supabase/server';

const CANCELLED_SALE_STATUSES = new Set([
  'cancelado',
  'cancelled',
  'canceled',
  'CANCELADO',
  'CANCELLED',
  'CANCELED',
]);

const ACTIVE_SAAS_CONTRACT_STATUSES = new Set([
  'active',
  'generated',
  'signed',
  'ACTIVE',
  'GENERATED',
  'SIGNED',
]);

type CustomerRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  cpf_cnpj?: string | null;
  document?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
};

type SaleRow = {
  id: string;
  customer_id?: string | null;
  project_id?: string | null;
  block_id?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  block_number?: string | null;
  lot_number?: string | null;
  status?: string | null;
};

type CompanyRow = {
  id: string;
  name?: string | null;
  fantasy_name?: string | null;
  razao_social?: string | null;
  phone?: string | null;
  representative_cpf?: string | null;
  legal_representative_cpf?: string | null;
};

type ProjectRow = {
  id: string;
  name?: string | null;
};

type BlockRow = {
  id: string;
  block_name?: string | null;
  number?: string | null;
  lot_number?: string | null;
};

type SubscriptionRow = {
  company_id: string;
  contract_status?: string | null;
};

/** Contexto opcional por venda — mesma resolução do Resumo da Venda. */
export type SaleLoteadoraLookupContext = {
  contractHtml?: string | null;
  tenantCompany?: CompanyRow | null;
  projectOwnerName?: string | null;
  explicitSellerName?: string | null;
};

const LOOKUP_CONTRACT_COLUMNS = [
  'id',
  'sale_id',
  'tenant_id',
  'company_id',
  'version',
  'created_at',
  'status',
  'generated_html',
  'html_content',
  'contract_html',
  'content',
  'html',
] as const;

function stripSelectColumn(select: string, column: string): string {
  return select
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part !== column)
    .join(', ');
}

function pickLatestContractRow(
  rows: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const va = Number(a.version) || 0;
    const vb = Number(b.version) || 0;
    if (vb !== va) return vb - va;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  })[0];
}

/**
 * Carrega HTML/tenant do contrato mais recente por sale_id (read-only).
 * Alinha a seleção de vínculo ao Resumo da Venda / Promitente Vendedor.
 */
export async function loadSaleLoteadoraContextsBySaleIds(
  admin: SupabaseClient,
  saleIds: string[],
  companyById: Map<string, CompanyRow>,
): Promise<Map<string, SaleLoteadoraLookupContext>> {
  const out = new Map<string, SaleLoteadoraLookupContext>();
  const uniqueSaleIds = Array.from(new Set(saleIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (uniqueSaleIds.length === 0) return out;

  let select = LOOKUP_CONTRACT_COLUMNS.join(', ');
  let rows: Array<Record<string, unknown>> = [];

  for (let attempt = 0; attempt < LOOKUP_CONTRACT_COLUMNS.length + 2; attempt++) {
    const { data, error } = await admin
      .from('contracts')
      .select(select)
      .in('sale_id', uniqueSaleIds);

    if (!error) {
      rows = (data as Array<Record<string, unknown>> | null) ?? [];
      break;
    }

    const missing = parseMissingContractColumn(error.message || '');
    if (!missing || !select.split(',').map((s) => s.trim()).includes(missing)) {
      console.error('[client-portal-lookup] contracts query error', error.message);
      break;
    }
    select = stripSelectColumn(select, missing);
    if (!select.trim()) break;
  }

  const bySale = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const saleId = String(row.sale_id || '').trim();
    if (!saleId) continue;
    const list = bySale.get(saleId) ?? [];
    list.push(row);
    bySale.set(saleId, list);
  }

  const missingTenantIds = new Set<string>();
  for (const [saleId, saleRows] of bySale) {
    const latest = pickLatestContractRow(saleRows);
    if (!latest) continue;
    const html = readStoredContractHtml(latest);
    const tenantId = String(latest.tenant_id || latest.company_id || '').trim();
    let tenantCompany: CompanyRow | null = null;
    if (tenantId) {
      tenantCompany = companyById.get(tenantId) ?? null;
      if (!tenantCompany) missingTenantIds.add(tenantId);
    }
    out.set(saleId, {
      contractHtml: html,
      tenantCompany,
    });
  }

  if (missingTenantIds.size > 0) {
    const loaded = await loadCompaniesByIds(admin, missingTenantIds);
    for (const company of loaded) {
      companyById.set(company.id, company);
    }
    for (const [saleId, ctx] of out) {
      const saleRows = bySale.get(saleId) ?? [];
      const latest = pickLatestContractRow(saleRows);
      const tenantId = String(latest?.tenant_id || latest?.company_id || '').trim();
      if (!tenantId) continue;
      const tenantCompany = companyById.get(tenantId) ?? null;
      out.set(saleId, { ...ctx, tenantCompany });
    }
  }

  return out;
}

function isGenericCompanyLabel(value: string): boolean {
  const n = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    !n ||
    n === 'empresa' ||
    n === 'loteadora' ||
    n === 'imobiliaria' ||
    n === 'nao informado' ||
    n === 'n/a' ||
    n === '-'
  );
}

/**
 * Nome da empresa no lookup do Portal (lista de vínculos).
 * Alinha ao contrato: fantasia → razão → name → “Não informado”.
 * Nunca retorna o genérico “Empresa”.
 */
export function resolveCompanyDisplayName(company?: CompanyRow | null): string {
  if (!company) return 'Não informado';
  for (const candidate of [
    String(company.fantasy_name || '').trim(),
    String(company.razao_social || '').trim(),
    String(company.name || '').trim(),
  ]) {
    if (!isGenericCompanyLabel(candidate)) return candidate;
  }
  return 'Não informado';
}

export function resolveQuadraLote(
  sale?: Pick<SaleRow, 'block_number' | 'lot_number'> | null,
  block?: Pick<BlockRow, 'block_name' | 'number' | 'lot_number'> | null,
): string | null {
  const quadra =
    String(sale?.block_number || '').trim() ||
    String(block?.block_name || '').trim() ||
    String(block?.number || '').trim();
  const lote = String(sale?.lot_number || '').trim() || String(block?.lot_number || '').trim();
  if (quadra && lote) return `QD ${quadra} LT ${lote}`;
  if (quadra) return `Quadra ${quadra}`;
  if (lote) return `Lote ${lote}`;
  return null;
}

function isSaleActive(status?: string | null): boolean {
  const key = String(status || '').trim();
  if (!key) return true;
  return !CANCELLED_SALE_STATUSES.has(key);
}

function isSaasContractActive(status?: string | null): boolean {
  const key = String(status || '').trim();
  if (!key) return false;
  return ACTIVE_SAAS_CONTRACT_STATUSES.has(key);
}

function companyRepMatchesDocument(company: CompanyRow, documentDigits: string): boolean {
  return (
    matchesCpfCnpj(documentDigits, company.representative_cpf) ||
    matchesCpfCnpj(documentDigits, company.legal_representative_cpf)
  );
}

function dedupeResults(results: ClientPortalMaskedResult[]): ClientPortalMaskedResult[] {
  const seen = new Set<string>();
  const out: ClientPortalMaskedResult[] = [];
  for (const row of results) {
    if (seen.has(row.linkKey)) continue;
    seen.add(row.linkKey);
    out.push(row);
  }
  return out;
}

export function buildMaskedResultsFromData(input: {
  customers: CustomerRow[];
  sales: SaleRow[];
  companies: CompanyRow[];
  projects: ProjectRow[];
  blocks: BlockRow[];
  saasCompanies: CompanyRow[];
  saasSubscriptions: SubscriptionRow[];
  /** Contexto por sale_id — HTML/tenant do contrato (mesma regra do dashboard). */
  saleLoteadoraBySaleId?: Record<string, SaleLoteadoraLookupContext | undefined>;
}): ClientPortalMaskedResult[] {
  const companyById = new Map(input.companies.map((c) => [c.id, c]));
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const blockById = new Map(input.blocks.map((b) => [b.id, b]));
  const salesByCustomer = new Map<string, SaleRow[]>();
  const saleLoteadoraBySaleId = input.saleLoteadoraBySaleId ?? {};

  for (const sale of input.sales) {
    if (!isSaleActive(sale.status)) continue;
    const customerId = String(sale.customer_id || '');
    if (!customerId) continue;
    const list = salesByCustomer.get(customerId) ?? [];
    list.push(sale);
    salesByCustomer.set(customerId, list);
  }

  const results: ClientPortalMaskedResult[] = [];
  const customersWithSale = new Set<string>();

  for (const customer of input.customers) {
    const customerSales = salesByCustomer.get(customer.id) ?? [];
    const maskedName = maskCustomerName(customer.name);
    const maskedPhone = maskPhone(customer.phone);

    for (const sale of customerSales) {
      customersWithSale.add(customer.id);
      const companyId = String(sale.company_id || sale.tenant_id || customer.company_id || customer.tenant_id || '');
      const company = companyById.get(companyId) ?? null;
      const project = sale.project_id ? projectById.get(sale.project_id) : null;
      const block = sale.block_id ? blockById.get(sale.block_id) : null;
      const loteadoraCtx = saleLoteadoraBySaleId[sale.id];

      results.push({
        linkKey: buildClientPortalLinkKey({
          linkType: 'lot_sale',
          companyId,
          customerId: customer.id,
          saleId: sale.id,
        }),
        customerNameMasked: maskedName,
        phoneMasked: maskedPhone,
        companyName: resolveSaleLoteadoraDisplayName({
          explicitSellerName: loteadoraCtx?.explicitSellerName,
          contractHtml: loteadoraCtx?.contractHtml,
          company: company as Record<string, unknown> | null,
          tenantCompany: (loteadoraCtx?.tenantCompany ?? null) as Record<string, unknown> | null,
          projectOwnerName: loteadoraCtx?.projectOwnerName,
        }),
        projectName: project?.name?.trim() || null,
        quadraLote: resolveQuadraLote(sale, block),
        linkType: 'lot_sale',
        linkLabel: null,
        status: 'Encontrado',
      });
    }

    if (customerSales.length === 0) {
      const companyId = String(customer.company_id || customer.tenant_id || '');
      if (!companyId) continue;
      const company = companyById.get(companyId) ?? null;
      results.push({
        linkKey: buildClientPortalLinkKey({
          linkType: 'customer_record',
          companyId,
          customerId: customer.id,
        }),
        customerNameMasked: maskedName,
        phoneMasked: maskedPhone,
        companyName: resolveSaleLoteadoraDisplayName({
          company: company as Record<string, unknown> | null,
        }),
        projectName: null,
        quadraLote: null,
        linkType: 'customer_record',
        linkLabel: null,
        status: 'Encontrado',
      });
    }
  }

  const activeSaasCompanyIds = new Set(
    input.saasSubscriptions
      .filter((sub) => isSaasContractActive(sub.contract_status))
      .map((sub) => sub.company_id),
  );

  for (const company of input.saasCompanies) {
    if (!activeSaasCompanyIds.has(company.id)) continue;
    results.push({
      linkKey: buildClientPortalLinkKey({
        linkType: 'saas_contract',
        companyId: company.id,
      }),
      customerNameMasked: maskCustomerName(company.name),
      phoneMasked: null,
      companyName: resolveSaleLoteadoraDisplayName({
        company: company as Record<string, unknown>,
      }),
      projectName: null,
      quadraLote: null,
      linkType: 'saas_contract',
      linkLabel: 'Contrato SaaS',
      status: 'Encontrado',
    });
  }

  return dedupeResults(results);
}

export type ClientPortalLinkContext = {
  linkKey: string;
  linkType: ClientPortalLinkType;
  customerId: string | null;
  companyId: string;
  saleId: string | null;
  phone: string | null;
  phoneMasked: string | null;
  masked: ClientPortalMaskedResult;
};

async function loadCompaniesByIds(
  admin: SupabaseClient,
  companyIds: Set<string>,
): Promise<CompanyRow[]> {
  if (companyIds.size === 0) return [];
  const { data } = await admin
    .from('companies')
    .select(
      'id, name, fantasy_name, razao_social, phone, representative_cpf, legal_representative_cpf',
    )
    .in('id', Array.from(companyIds));
  return (data as CompanyRow[] | null) ?? [];
}

/** Resolve vínculo interno a partir do linkKey — uso server-side OTP. */
export async function resolveClientPortalLinkContext(
  documentDigits: string,
  linkKey: string,
  adminClient?: SupabaseClient | null,
): Promise<ClientPortalLinkContext | null> {
  const lookup = await lookupClientPortalByDocument(documentDigits, adminClient);
  if (!lookup.found) return null;

  const masked = lookup.maskedResults.find((row) => row.linkKey === linkKey);
  if (!masked) return null;

  const { client: admin, configError } = adminClient
    ? { client: adminClient, configError: null }
    : createAdminSupabase();
  if (!admin || configError) return null;

  const customers = await findCustomersByDocument(admin, documentDigits);
  const saasCompanies = await findSaasCompaniesByRepresentative(admin, documentDigits);
  const customerIds = customers.map((c) => c.id);

  let sales: SaleRow[] = [];
  if (customerIds.length > 0) {
    const { data } = await admin
      .from('sales')
      .select(
        'id, customer_id, project_id, block_id, tenant_id, company_id, block_number, lot_number, status',
      )
      .in('customer_id', customerIds);
    sales = (data as SaleRow[] | null) ?? [];
  }

  for (const customer of customers) {
    const customerSales = sales.filter(
      (sale) => sale.customer_id === customer.id && isSaleActive(sale.status),
    );

    for (const sale of customerSales) {
      const companyId = String(
        sale.company_id || sale.tenant_id || customer.company_id || customer.tenant_id || '',
      );
      const key = buildClientPortalLinkKey({
        linkType: 'lot_sale',
        companyId,
        customerId: customer.id,
        saleId: sale.id,
      });
      if (key === linkKey) {
        return {
          linkKey,
          linkType: 'lot_sale',
          customerId: customer.id,
          companyId,
          saleId: sale.id,
          phone: customer.phone ?? null,
          phoneMasked: maskPhone(customer.phone),
          masked,
        };
      }
    }

    const companyId = String(customer.company_id || customer.tenant_id || '');
    const customerKey = buildClientPortalLinkKey({
      linkType: 'customer_record',
      companyId,
      customerId: customer.id,
    });
    if (customerKey === linkKey) {
      return {
        linkKey,
        linkType: 'customer_record',
        customerId: customer.id,
        companyId,
        saleId: null,
        phone: customer.phone ?? null,
        phoneMasked: maskPhone(customer.phone),
        masked,
      };
    }
  }

  for (const company of saasCompanies) {
    const saasKey = buildClientPortalLinkKey({
      linkType: 'saas_contract',
      companyId: company.id,
    });
    if (saasKey !== linkKey) continue;

    const companies = await loadCompaniesByIds(admin, new Set([company.id]));
    const fullCompany = companies[0] ?? company;
    return {
      linkKey,
      linkType: 'saas_contract',
      customerId: null,
      companyId: company.id,
      saleId: null,
      phone: fullCompany.phone ?? null,
      phoneMasked: maskPhone(fullCompany.phone),
      masked,
    };
  }

  return null;
}

async function findCustomersByDocument(
  admin: SupabaseClient,
  documentDigits: string,
): Promise<CustomerRow[]> {
  const patterns = cpfCnpjIlikePatterns(documentDigits);
  if (patterns.length === 0) return [];

  const orParts = patterns.flatMap((pattern) => [
    `cpf_cnpj.ilike.%${pattern}%`,
    `document.ilike.%${pattern}%`,
  ]);

  const { data, error } = await admin.from('customers').select(
    'id, name, phone, email, cpf_cnpj, document, tenant_id, company_id',
  ).or(orParts.join(','));

  if (error) {
    console.error('[client-portal-lookup] customers query error', error.message);
    return [];
  }

  return ((data as CustomerRow[] | null) ?? []).filter(
    (row) =>
      matchesCpfCnpj(documentDigits, row.cpf_cnpj) ||
      matchesCpfCnpj(documentDigits, row.document),
  );
}

async function findSaasCompaniesByRepresentative(
  admin: SupabaseClient,
  documentDigits: string,
): Promise<CompanyRow[]> {
  const patterns = cpfCnpjIlikePatterns(documentDigits);
  if (patterns.length === 0) return [];

  const orParts = patterns.flatMap((pattern) => [
    `representative_cpf.ilike.%${pattern}%`,
    `legal_representative_cpf.ilike.%${pattern}%`,
  ]);

  const { data, error } = await admin
    .from('companies')
    .select('id, name, fantasy_name, razao_social, representative_cpf, legal_representative_cpf')
    .or(orParts.join(','));

  if (error) {
    console.error('[client-portal-lookup] companies rep query error', error.message);
    return [];
  }

  return ((data as CompanyRow[] | null) ?? []).filter((row) =>
    companyRepMatchesDocument(row, documentDigits),
  );
}

export async function lookupClientPortalByDocument(
  cpfCnpjInput: string,
  adminClient?: SupabaseClient | null,
): Promise<ClientPortalLookupResponse> {
  const documentDigits = normalizeDocument(cpfCnpjInput);
  if (!isValidBrazilianTaxDocument(documentDigits)) {
    return { found: false };
  }

  const { client: admin, configError } = adminClient
    ? { client: adminClient, configError: null }
    : createAdminSupabase();

  if (!admin || configError) {
    console.error('[client-portal-lookup] supabase unavailable', configError);
    return { found: false };
  }

  const customers = await findCustomersByDocument(admin, documentDigits);
  const saasCompanies = await findSaasCompaniesByRepresentative(admin, documentDigits);

  const customerIds = customers.map((c) => c.id);
  let sales: SaleRow[] = [];

  if (customerIds.length > 0) {
    const { data: salesData, error: salesError } = await admin
      .from('sales')
      .select(
        'id, customer_id, project_id, block_id, tenant_id, company_id, block_number, lot_number, status',
      )
      .in('customer_id', customerIds);

    if (salesError) {
      console.error('[client-portal-lookup] sales query error', salesError.message);
    } else {
      sales = (salesData as SaleRow[] | null) ?? [];
    }
  }

  const companyIds = new Set<string>();
  const projectIds = new Set<string>();
  const blockIds = new Set<string>();

  for (const customer of customers) {
    if (customer.company_id) companyIds.add(customer.company_id);
    if (customer.tenant_id) companyIds.add(customer.tenant_id);
  }
  for (const sale of sales) {
    if (sale.company_id) companyIds.add(sale.company_id);
    if (sale.tenant_id) companyIds.add(sale.tenant_id);
    if (sale.project_id) projectIds.add(sale.project_id);
    if (sale.block_id) blockIds.add(sale.block_id);
  }
  for (const company of saasCompanies) {
    companyIds.add(company.id);
  }

  const [companiesRes, projectsRes, blocksRes, subscriptionsRes] = await Promise.all([
    companyIds.size > 0
      ? admin
          .from('companies')
          .select('id, name, fantasy_name, razao_social, representative_cpf, legal_representative_cpf')
          .in('id', Array.from(companyIds))
      : Promise.resolve({ data: [], error: null }),
    projectIds.size > 0
      ? admin.from('projects').select('id, name').in('id', Array.from(projectIds))
      : Promise.resolve({ data: [], error: null }),
    blockIds.size > 0
      ? admin.from('blocks').select('id, block_name, number, lot_number').in('id', Array.from(blockIds))
      : Promise.resolve({ data: [], error: null }),
    saasCompanies.length > 0
      ? admin
          .from('company_subscriptions')
          .select('company_id, contract_status')
          .in(
            'company_id',
            saasCompanies.map((c) => c.id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const companies = (companiesRes.data as CompanyRow[] | null) ?? [];
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const activeSaleIds = sales
    .filter((sale) => isSaleActive(sale.status))
    .map((sale) => sale.id);
  const saleLoteadoraMap = await loadSaleLoteadoraContextsBySaleIds(
    admin,
    activeSaleIds,
    companyById,
  );
  const saleLoteadoraBySaleId: Record<string, SaleLoteadoraLookupContext | undefined> = {};
  for (const [saleId, ctx] of saleLoteadoraMap) {
    saleLoteadoraBySaleId[saleId] = ctx;
  }

  const maskedResults = buildMaskedResultsFromData({
    customers,
    sales,
    companies: Array.from(companyById.values()),
    projects: (projectsRes.data as ProjectRow[] | null) ?? [],
    blocks: (blocksRes.data as BlockRow[] | null) ?? [],
    saasCompanies,
    saasSubscriptions: (subscriptionsRes.data as SubscriptionRow[] | null) ?? [],
    saleLoteadoraBySaleId,
  });

  if (maskedResults.length === 0) {
    return { found: false };
  }

  return { found: true, maskedResults };
}

/** Garante que a resposta pública não contenha campos sensíveis. */
export function sanitizeClientPortalLookupResponse(
  response: ClientPortalLookupResponse,
): ClientPortalLookupResponse {
  if (!response.found) return { found: false };

  return {
    found: true,
    maskedResults: response.maskedResults.map((row) => ({
      linkKey: row.linkKey,
      customerNameMasked: row.customerNameMasked,
      phoneMasked: row.phoneMasked,
      companyName: row.companyName,
      projectName: row.projectName,
      quadraLote: row.quadraLote,
      linkType: row.linkType,
      linkLabel: row.linkLabel,
      status: row.status,
    })),
  };
}

export function assertNoSensitiveLookupFields(response: ClientPortalLookupResponse): void {
  const json = JSON.stringify(response);
  const forbiddenPatterns = [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    /"email"\s*:/i,
    /"cpf_cnpj"\s*:/i,
    /"document"\s*:/i,
    /bank_slip/i,
    /pix_copy/i,
    /signature_token/i,
    /parcela/i,
    /installment/i,
    /contract_number/i,
    /"amount"\s*:/i,
    /"valor"\s*:/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(json)) {
      throw new Error(`Resposta do lookup contém campo sensível: ${pattern}`);
    }
  }
}
