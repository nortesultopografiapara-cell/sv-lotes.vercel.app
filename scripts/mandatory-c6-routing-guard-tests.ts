/**
 * C6 não pode cair no fluxo de cobrança Asaas ou Inter.
 * npx tsx scripts/mandatory-c6-routing-guard-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { C6EmissionNotHomologatedError } from '../lib/banking/c6/c6EmitGuard';
import {
  assertChargesAccountMayEmit,
  normalizeChargesEmitProvider,
} from '../lib/charges/chargeProviderRouting';
import { resolveFinancialAccountSecrets } from '../lib/finance/financialAccountCredentialResolver';
import { createCompanyBoletoCharge } from '../lib/finance/asaasCompanyChargeService';
import { getSaleChargesSummary } from '../lib/finance/saleChargesService';
import { resolveSaleChargesProvider } from '../lib/finance/saleChargesProvider';
import { resolveLotSwapActiveExternalChargeProvider } from '../lib/finance/saleLotSwapExternalCharges';
import { ExternalChargeMutationDisabledError } from '../lib/finance/externalCharges/types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

type Row = Record<string, unknown>;

function createAdmin(tables: Record<string, Row[]>) {
  const sensitiveReads: string[] = [];
  const writes: string[] = [];
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    const api = {
      select(columns: string) {
        if (/encrypted_payload/i.test(columns)) sensitiveReads.push(table);
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''));
        return api;
      },
      neq() {
        return api;
      },
      or() {
        return api;
      },
      in(column: string, values: unknown[]) {
        const allowed = new Set(values.map((value) => String(value ?? '')));
        filters.push((row) => allowed.has(String(row[column] ?? '')));
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      insert() {
        writes.push(table);
        throw new Error(`escrita indevida em ${table}`);
      },
      update() {
        writes.push(table);
        throw new Error(`escrita indevida em ${table}`);
      },
      delete() {
        writes.push(table);
        throw new Error(`escrita indevida em ${table}`);
      },
      maybeSingle: async () => {
        const rows = (tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
        return { data: rows[0] ?? null, error: null };
      },
      then(onFulfilled: (value: { data: Row[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        const rows = (tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      },
    };
    return api;
  }
  return { admin: { from } as never, sensitiveReads, writes };
}

function account(id: string, integrationId: string | null): Row {
  return {
    id,
    company_id: 'co-1',
    name: id,
    account_type: 'IMOBILIARIA',
    beneficiary_name: null,
    document: null,
    email: null,
    phone: null,
    environment: 'SANDBOX',
    bank_integration_id: integrationId,
    is_default: false,
    active: true,
    notes: null,
    created_at: '2026-11-21T00:00:00Z',
    updated_at: '2026-11-21T00:00:00Z',
  };
}

function integration(id: string, provider: string): Row {
  return {
    id,
    company_id: 'co-1',
    provider,
    status: 'ACTIVE',
    metadata: {},
  };
}

function sale(id: string, financialAccountId: string | null, companyId = 'co-1'): Row {
  return {
    id,
    company_id: companyId,
    tenant_id: companyId,
    financial_account_id: financialAccountId,
    project_id: null,
    projects: null,
  };
}

function baseTables(): Record<string, Row[]> {
  return {
    sales: [
      sale('sale-asaas', 'fa-asaas'),
      sale('sale-asaas-alias', 'fa-asaas-alias'),
      sale('sale-inter', 'fa-inter'),
      sale('sale-c6', 'fa-c6'),
      sale('sale-sicoob', 'fa-sicoob'),
      sale('sale-unlinked', 'fa-plain'),
      sale('sale-empty', null),
      sale('sale-other', 'fa-asaas', 'co-2'),
    ],
    company_financial_accounts: [
      account('fa-asaas', 'int-asaas'),
      account('fa-asaas-alias', 'int-asaas-alias'),
      account('fa-inter', 'int-inter'),
      account('fa-c6', 'int-c6'),
      account('fa-sicoob', 'int-sicoob'),
      account('fa-plain', null),
    ],
    bank_integrations: [
      integration('int-asaas', 'ASAAS_COMPANY'),
      integration('int-asaas-alias', 'ASAAS'),
      integration('int-inter', 'INTER'),
      integration('int-c6', 'C6'),
      integration('int-sicoob', 'SICOOB'),
    ],
    bank_credentials: [
      {
        integration_id: 'int-c6',
        credential_type: 'oauth',
        encrypted_payload: 'v1:ciphertext-de-teste',
      },
    ],
    financial_account_provider_destinations: [],
    finance_receipts: [
      {
        id: 'receipt-c6',
        sale_id: 'sale-c6',
        company_id: 'co-1',
        tenant_id: 'co-1',
        financial_account_id: 'fa-c6',
        installment_number: 1,
        due_date: '2026-12-20',
        amount: 100,
        status: 'pendente',
        schedule_group: null,
        project_id: null,
      },
    ],
    company_asaas_charges: [],
    contracts: [],
    customers: [],
    projects: [],
    blocks: [],
    companies: [],
  };
}

async function expectC6(run: () => Promise<unknown>, message: string) {
  let refused = false;
  try {
    await run();
  } catch (error) {
    refused = error instanceof C6EmissionNotHomologatedError;
  }
  assert(refused, message);
}

async function main() {
  const routed = createAdmin(baseTables());
  const asaas = await resolveSaleChargesProvider(routed.admin, 'co-1', 'sale-asaas');
  assert(asaas.provider === 'ASAAS_COMPANY' && asaas.financialAccountId === 'fa-asaas', 'Asaas permanece Asaas');
  const alias = await resolveSaleChargesProvider(routed.admin, 'co-1', 'sale-asaas-alias');
  assert(alias.provider === 'ASAAS_COMPANY', 'alias ASAAS permanece Asaas');
  const inter = await resolveSaleChargesProvider(routed.admin, 'co-1', 'sale-inter');
  assert(inter.provider === 'INTER' && inter.bankIntegrationId === 'int-inter', 'Inter permanece Inter');
  const plain = await resolveSaleChargesProvider(routed.admin, 'co-1', 'sale-unlinked');
  assert(plain.provider === 'ASAAS_COMPANY' && plain.bankIntegrationId === null, 'conta sem vínculo permanece Asaas');
  const empty = await resolveSaleChargesProvider(routed.admin, 'co-1', 'sale-empty');
  assert(
    empty.provider === 'ASAAS_COMPANY' && empty.financialAccountId === 'fa-asaas',
    'venda sem conta própria continua na conta Asaas da empresa',
  );
  const onlyC6Tables = baseTables();
  onlyC6Tables.sales = [sale('sale-default-c6', null)];
  onlyC6Tables.company_financial_accounts = [account('fa-c6', 'int-c6')];
  onlyC6Tables.bank_integrations = [integration('int-c6', 'C6')];
  const onlyC6 = createAdmin(onlyC6Tables);
  await expectC6(
    () => resolveSaleChargesProvider(onlyC6.admin, 'co-1', 'sale-default-c6'),
    'conta padrão C6 não vira Asaas',
  );
  const sicoob = await resolveSaleChargesProvider(routed.admin, 'co-1', 'sale-sicoob');
  assert(sicoob.provider === 'ASAAS_COMPANY', 'provider antigo fora do C6 conserva o fallback');
  await expectC6(
    () => resolveSaleChargesProvider(routed.admin, 'co-1', 'sale-c6'),
    'conta C6 não é resolvida como Asaas nem Inter',
  );
  let isolated = false;
  try {
    await resolveSaleChargesProvider(routed.admin, 'co-1', 'sale-other');
  } catch (error) {
    isolated = error instanceof Error && error.message.includes('não pertence');
  }
  assert(isolated, 'venda de outra empresa continua recusada');
  assert(routed.sensitiveReads.length === 0, 'resolver C6 não lê ciphertext');
  assert(routed.writes.length === 0, 'resolver não grava');

  const charge = createAdmin(baseTables());
  await expectC6(
    () => createCompanyBoletoCharge(charge.admin, {
      companyId: 'co-1',
      installmentId: 'receipt-c6',
      billingType: 'BOLETO',
    }),
    'emissão Asaas recusa a parcela da conta C6',
  );
  assert(charge.sensitiveReads.length === 0, 'emissão C6 não lê ciphertext Asaas');
  assert(charge.writes.length === 0, 'emissão C6 não grava cobrança');

  const summary = createAdmin(baseTables());
  await expectC6(
    () => getSaleChargesSummary(summary.admin, 'co-1', 'sale-c6'),
    'resumo da venda C6 recusa antes do beneficiário Asaas',
  );
  assert(summary.sensitiveReads.length === 0, 'resumo C6 não consulta commercialInfo');

  const secrets = createAdmin(baseTables());
  await expectC6(
    () => resolveFinancialAccountSecrets(secrets.admin, 'co-1', 'fa-c6'),
    'credencial C6 não cai na API key Asaas nem no certificado Inter',
  );
  assert(secrets.sensitiveReads.length === 0, 'resolução de segredo C6 não lê ciphertext');

  const lotSwap = createAdmin(baseTables());
  const active = await resolveLotSwapActiveExternalChargeProvider(lotSwap.admin, 'co-1', 'sale-c6');
  const lotProvider = active.provider;
  assert(active.code === 'C6' && lotProvider !== null, 'troca de lote identifica C6');
  if (!lotProvider) throw new Error('troca de lote identifica C6');
  assert(lotProvider.code !== 'ASAAS' && lotProvider.code !== 'INTER', 'troca de lote não usa Asaas nem Inter');
  assert(lotProvider.supportsGeneration === false, 'C6 não gera na troca de lote');
  let lotBlocked = false;
  try {
    await lotProvider.generateMissingCharges(lotSwap.admin, {
      companyId: 'co-1',
      saleId: 'sale-c6',
      receiptIds: ['receipt-c6'],
    });
  } catch (error) {
    lotBlocked = error instanceof ExternalChargeMutationDisabledError;
  }
  assert(lotBlocked, 'troca de lote não emite cobrança C6');
  assert(lotSwap.sensitiveReads.length === 0, 'troca de lote C6 não lê ciphertext');

  assert(normalizeChargesEmitProvider('INTER') === 'INTER', 'classificação Inter intacta');
  assert(normalizeChargesEmitProvider('ASAAS') === 'ASAAS_COMPANY', 'classificação Asaas intacta');
  assert(normalizeChargesEmitProvider(null) === 'ASAAS_COMPANY', 'conta sem provider continua Asaas');
  assertChargesAccountMayEmit('ASAAS');
  assertChargesAccountMayEmit('ASAAS_COMPANY');
  assertChargesAccountMayEmit('INTER');
  assertChargesAccountMayEmit(null);
  await expectC6(async () => {
    assertChargesAccountMayEmit('C6');
  }, 'ação de emissão recusa o provider bruto C6');

  const root = path.join(__dirname, '..');
  const keyFn = fs.readFileSync(path.join(root, 'lib/finance/companyFinancialAccountRepository.ts'), 'utf8');
  const keyStart = keyFn.indexOf('export async function loadAsaasApiKeyForFinancialAccount');
  const keyBody = keyFn.slice(keyStart);
  assert(
    keyBody.indexOf('throwIfC6EmissionAttempt') >= 0 &&
      keyBody.indexOf('throwIfC6EmissionAttempt') < keyBody.indexOf("select('encrypted_payload')"),
    'a chave Asaas só é lida depois da recusa C6',
  );
  const panel = fs.readFileSync(path.join(root, 'components/sales/SaleChargesPanel.tsx'), 'utf8');
  const blockedAt = panel.indexOf('C6_CHARGES_ROUTE_BLOCKED_CODE');
  const asaasSummaryAt = panel.indexOf('/api/finance/asaas/sale-charges?');
  assert(blockedAt > 0 && blockedAt < asaasSummaryAt, 'painel não abre o resumo Asaas quando o C6 é recusado');
  const route = fs.readFileSync(path.join(root, 'app/api/finance/sale-charges/provider/route.ts'), 'utf8');
  assert(route.includes('C6_CHARGES_ROUTE_BLOCKED_CODE') && route.includes('status: 409'), 'rota devolve a recusa C6');
  const chargesUi = fs.readFileSync(path.join(root, 'components/charges/ChargesPageClient.tsx'), 'utf8');
  const fetchAt = chargesUi.indexOf("fetch('/api/finance/asaas/create-charge'");
  const guardAt = chargesUi.lastIndexOf('isC6ChargesAccount', fetchAt);
  assert(guardAt > 0 && guardAt < fetchAt, 'central de cobranças recusa C6 antes do fetch Asaas');

  const webhook = fs.readFileSync(path.join(root, 'lib/finance/companyAsaasWebhookHandler.ts'), 'utf8');
  const settlement = fs.readFileSync(path.join(root, 'lib/banking/inter/interPaymentSettlement.ts'), 'utf8');
  assert(!webhook.includes('throwIfC6EmissionAttempt'), 'webhook Asaas permanece sem ramo C6');
  assert(!settlement.includes('throwIfC6EmissionAttempt'), 'liquidação Inter permanece sem ramo C6');

  console.log('C6_ROUTING_GUARD_OK');
}

void main();
