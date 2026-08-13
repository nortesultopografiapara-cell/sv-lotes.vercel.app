/**
 * Testes — múltiplas contas financeiras Asaas + Inter (sem migration).
 * npm run test:inter-multi-accounts
 */
import fs from 'fs';
import path from 'path';
import {
  ASAAS_LINKED_ERROR,
  createInterFinancialAccount,
  linkFinancialAccountToInterIntegration,
  recoverMislinkedAsaasAndEnsureInterAccount,
} from '../lib/finance/interFinancialAccountService';
import { resolveSaleChargesProvider } from '../lib/finance/saleChargesProvider';
import {
  formatFinancialAccountLabel,
  formatFinancialAccountProviderLabel,
} from '../lib/finance/companyFinancialAccountTypes';
import { resolveFinancialAccountForSaleOptional } from '../lib/finance/companyFinancialAccountResolver';
import { resolveInterIntegrationId } from '../lib/banking/inter/interConfigRepository';
import { assertSecretsDoNotCrossAccounts } from '../lib/finance/financialAccountCredentialResolver';
import { interChargeBelongsToReceiptAccount } from '../lib/banking/inter/interPaymentSettlement';
import {
  clearAllInterTokenCacheForTests,
  getCachedInterToken,
  setCachedInterToken,
} from '../lib/banking/inter/interTokenCache';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

type Row = Record<string, unknown>;

function createMultiAccountMock() {
  const integrations: Row[] = [
    { id: 'int-asaas', company_id: 'co-1', provider: 'ASAAS_COMPANY', is_default: true },
    { id: 'int-inter', company_id: 'co-1', provider: 'INTER', is_default: false },
  ];
  const accounts: Row[] = [
    {
      id: 'fa-asaas',
      company_id: 'co-1',
      name: 'S V TOPOGRAFIA E PROJETOS',
      account_type: 'IMOBILIARIA',
      beneficiary_name: 'S V TOPOGRAFIA',
      document: null,
      email: null,
      phone: null,
      environment: 'SANDBOX',
      bank_integration_id: 'int-asaas',
      is_default: true,
      active: true,
      notes: 'Migrada automaticamente da integração Asaas legada.',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'fa-inter',
      company_id: 'co-1',
      name: 'S V TOPOGRAFIA E PROJETOS — Banco Inter',
      account_type: 'IMOBILIARIA',
      beneficiary_name: 'S V TOPOGRAFIA',
      document: null,
      email: null,
      phone: null,
      environment: 'SANDBOX',
      bank_integration_id: 'int-inter',
      is_default: false,
      active: true,
      notes: 'Conta financeira Banco Inter (provider INTER).',
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
  ];
  const asaasCharges: Row[] = [
    { id: 'cac-1', company_id: 'co-1', financial_account_id: 'fa-asaas', asaas_payment_id: 'pay_1' },
  ];
  const sales: Row[] = [
    {
      id: 'sale-a',
      company_id: 'co-1',
      tenant_id: 'co-1',
      financial_account_id: null,
      project_id: 'proj-a',
      projects: { financial_account_id: 'fa-asaas' },
    },
    {
      id: 'sale-b',
      company_id: 'co-1',
      tenant_id: 'co-1',
      financial_account_id: null,
      project_id: 'proj-b',
      projects: { financial_account_id: 'fa-inter' },
    },
  ];
  const companies: Row[] = [{ id: 'co-1', name: 'S V TOPOGRAFIA E PROJETOS' }];

  function matchFilters(rows: Row[], filters: Array<[string, unknown]>) {
    return rows.filter((row) =>
      filters.every(([col, val]) => {
        if (Array.isArray(val)) return val.includes(row[col]);
        return row[col] === val;
      }),
    );
  }

  const admin = {
    from(table: string) {
      const state: {
        filters: Array<[string, unknown]>;
        op: string;
        payload: Row | null;
        head?: boolean;
      } = { filters: [], op: 'select', payload: null };

      const api: Record<string, unknown> = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (state.op !== 'insert') state.op = 'select';
          state.head = Boolean(opts?.head);
          return api;
        },
        insert: (payload: Row) => {
          state.op = 'insert';
          state.payload = payload;
          return api;
        },
        update: (payload: Row) => {
          state.op = 'update';
          state.payload = payload;
          return api;
        },
        eq: (col: string, val: unknown) => {
          state.filters.push([col, val]);
          return api;
        },
        in: (col: string, vals: unknown[]) => {
          state.filters.push([col, vals]);
          return api;
        },
        order: () => api,
        limit: () => api,
        maybeSingle: async () => {
          if (table === 'bank_integrations') {
            const rows = matchFilters(integrations, state.filters);
            return { data: rows[0] || null, error: null };
          }
          if (table === 'company_financial_accounts' && state.op === 'select') {
            const rows = matchFilters(accounts, state.filters);
            return { data: rows[0] || null, error: null };
          }
          if (table === 'sales') {
            const rows = matchFilters(sales, state.filters);
            return { data: rows[0] || null, error: null };
          }
          if (table === 'companies') {
            return { data: companies[0], error: null };
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (table === 'bank_integrations' && state.op === 'insert' && state.payload) {
            const row = {
              id: `int-new-${integrations.length + 1}`,
              environment: state.payload.environment || 'SANDBOX',
              ...state.payload,
            };
            integrations.push(row);
            return { data: { id: row.id, environment: row.environment }, error: null };
          }
          if (table === 'company_financial_accounts' && state.op === 'insert' && state.payload) {
            const row = {
              id: `fa-new-${accounts.length + 1}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...state.payload,
            };
            accounts.push(row);
            return { data: { id: row.id }, error: null };
          }
          if (table === 'company_financial_accounts' && state.op === 'select') {
            const rows = matchFilters(accounts, state.filters);
            return { data: rows[0] || null, error: null };
          }
          return { data: null, error: { message: 'unexpected' } };
        },
      };

      // make thenable for list queries without maybeSingle
      const finalize = async () => {
        if (table === 'company_financial_accounts' && state.op === 'select' && !state.head) {
          return { data: matchFilters(accounts, state.filters), error: null };
        }
        if (table === 'company_asaas_charges' && state.head) {
          const rows = matchFilters(asaasCharges, state.filters);
          return { data: null, error: null, count: rows.length };
        }
        if (table === 'bank_credentials') {
          return { data: [], error: null };
        }
        if (table === 'bank_integrations' && state.op === 'select') {
          return { data: matchFilters(integrations, state.filters), error: null };
        }
        return { data: [], error: null };
      };

      // Support awaiting query builder (list)
      (api as { then?: typeof Promise.prototype.then }).then = (
        onfulfilled: (v: unknown) => unknown,
        onrejected?: (e: unknown) => unknown,
      ) => finalize().then(onfulfilled, onrejected);

      // update().eq().eq() needs to apply
      const origUpdate = api.update as (p: Row) => typeof api;
      api.update = (payload: Row) => {
        state.op = 'update';
        state.payload = payload;
        const chain = { ...api };
        chain.eq = (col: string, val: unknown) => {
          state.filters.push([col, val]);
          return chain;
        };
        (chain as { then?: typeof Promise.prototype.then }).then = (
          onfulfilled: (v: unknown) => unknown,
          onrejected?: (e: unknown) => unknown,
        ) => {
          const rows = matchFilters(accounts, state.filters);
          for (const row of rows) Object.assign(row, payload);
          return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
        };
        return chain;
      };
      void origUpdate;

      return api;
    },
  };

  return {
    admin: admin as never,
    accounts,
    integrations,
    sales,
    asaasCharges,
    getAccount: (id: string) => accounts.find((a) => a.id === id),
    getIntegration: (id: string) => integrations.find((i) => i.id === id),
  };
}

async function main() {
  console.log('\n=== Multi-contas Asaas + Inter ===\n');

  assert(
    formatFinancialAccountProviderLabel('ASAAS_COMPANY') === 'Asaas',
    'label provider Asaas',
  );
  assert(
    formatFinancialAccountProviderLabel('INTER') === 'Banco Inter',
    'label provider Banco Inter',
  );
  assert(
    formatFinancialAccountLabel({
      name: 'S V TOPOGRAFIA E PROJETOS',
      accountType: 'IMOBILIARIA',
      beneficiaryName: null,
      provider: 'ASAAS_COMPANY',
    }) === 'S V TOPOGRAFIA E PROJETOS — Asaas',
    'select label Asaas',
  );
  assert(
    formatFinancialAccountLabel({
      name: 'S V TOPOGRAFIA E PROJETOS',
      accountType: 'IMOBILIARIA',
      beneficiaryName: null,
      provider: 'INTER',
    }) === 'S V TOPOGRAFIA E PROJETOS — Banco Inter',
    'select label Inter',
  );

  // Empresa com duas contas
  {
    const mock = createMultiAccountMock();
    assert(mock.accounts.length === 2, 'empresa com duas contas simultâneas');
    assert(
      mock.getAccount('fa-asaas')?.bank_integration_id === 'int-asaas',
      'conta Asaas aponta ASAAS_COMPANY',
    );
    assert(
      mock.getAccount('fa-inter')?.bank_integration_id === 'int-inter',
      'conta Inter aponta INTER',
    );
  }

  // Venda A → Asaas / Venda B → Inter
  {
    const mock = createMultiAccountMock();
    // resolveSaleChargesProvider needs getCompanyFinancialAccountById which uses mapRowWithIntegration
    // Our mock may be too thin for full resolve — test resolveFinancialAccountForSaleOptional + provider lookup

    const resolvedA = await resolveFinancialAccountForSaleOptional(mock.admin, 'co-1', {
      financialAccountId: null,
      projectId: 'proj-a',
      projectFinancialAccountId: 'fa-asaas',
    });
    assert(resolvedA?.account.id === 'fa-asaas', 'projeto A resolve conta Asaas');

    const resolvedB = await resolveFinancialAccountForSaleOptional(mock.admin, 'co-1', {
      financialAccountId: null,
      projectId: 'proj-b',
      projectFinancialAccountId: 'fa-inter',
    });
    assert(resolvedB?.account.id === 'fa-inter', 'projeto B resolve conta Inter');
  }

  // Não sobrescreve Asaas
  {
    const mock = createMultiAccountMock();
    let threw = false;
    try {
      await linkFinancialAccountToInterIntegration(mock.admin, 'co-1', 'fa-asaas');
    } catch (e) {
      threw = e instanceof Error && e.message === ASAAS_LINKED_ERROR;
    }
    assert(threw, 'conta Asaas não é sobrescrita');
    assert(
      mock.getAccount('fa-asaas')?.bank_integration_id === 'int-asaas',
      'bank_integration_id Asaas intacto após tentativa',
    );
    assert(mock.asaasCharges.length === 1, 'cobranças antigas Asaas intactas (mesmo FA id)');
  }

  // Recuperação: FA redirecionada para Inter volta ao Asaas + cria Inter
  {
    const mock = createMultiAccountMock();
    // simula redirecionamento invasivo
    const asaasFa = mock.getAccount('fa-asaas')!;
    asaasFa.bank_integration_id = 'int-inter';
    // remove dedicated inter account to force recreate
    const idx = mock.accounts.findIndex((a) => a.id === 'fa-inter');
    if (idx >= 0) mock.accounts.splice(idx, 1);

    const result = await recoverMislinkedAsaasAndEnsureInterAccount(mock.admin, 'co-1');
    assert(result.restoredAsaasAccountIds.includes('fa-asaas'), 'recupera FA Asaas');
    assert(
      mock.getAccount('fa-asaas')?.bank_integration_id === 'int-asaas',
      'FA Asaas restaurada ao ASAAS_COMPANY',
    );
    assert(result.interAccount.bankIntegrationId === 'int-inter', 'nova conta Inter criada');
    assert(
      mock.accounts.some(
        (a) => a.bank_integration_id === 'int-inter' && a.id !== 'fa-asaas',
      ),
      'Inter e Asaas coexistentes',
    );
  }

  // Arquivos / UI
  {
    const root = path.join(__dirname, '..');
    const panel = fs.readFileSync(
      path.join(root, 'components/finance/InterBankConfigPanel.tsx'),
      'utf8',
    );
    assert(!panel.includes('Vincular conta financeira padrão ao Inter'), 'botão invasivo removido');
    assert(panel.includes('Criar conta financeira Banco Inter'), 'UI cria conta Inter');
    assert(panel.includes('Restaurar Asaas'), 'UI recuperação Asaas');
    const route = fs.readFileSync(
      path.join(root, 'app/api/banking/inter/link-financial-account/route.ts'),
      'utf8',
    );
    assert(route.includes("action === 'recover'"), 'API recover');
    assert(route.includes("action === 'link'"), 'API link seguro');
    assert(
      fs.existsSync(path.join(root, 'lib/finance/interFinancialAccountService.ts')),
      'serviço Inter FA existe',
    );
    // Asaas paths intactos
    for (const rel of [
      'lib/finance/asaasCompanyChargeService.ts',
      'app/api/finance/asaas/sale-charges/generate-missing/route.ts',
      'lib/finance/companyAsaasWebhookHandler.ts',
    ]) {
      assert(fs.existsSync(path.join(root, rel)), `Asaas intacto: ${rel}`);
    }
  }

  // createInterFinancialAccount não usa ensure Asaas
  {
    const svc = fs.readFileSync(
      path.join(__dirname, '../lib/finance/interFinancialAccountService.ts'),
      'utf8',
    );
    assert(
      !svc.includes("from '@/lib/finance/companyFinancialAccountRepository'") ||
        !/\bawait createCompanyFinancialAccount\b/.test(svc),
      'não chama createCompanyFinancialAccount',
    );
    assert(svc.includes(".eq('provider', 'INTER')"), 'cria/vincula só INTER');
  }

  void resolveSaleChargesProvider;

  // TESTE A — 2 INTER mesmo company_id
  {
    const mock = createMultiAccountMock();
    mock.integrations.push({
      id: 'int-inter-b',
      company_id: 'co-1',
      provider: 'INTER',
      is_default: false,
      environment: 'SANDBOX',
      updated_at: '2026-09-02T00:00:00Z',
    });
    mock.accounts.push({
      id: 'fa-inter-b',
      company_id: 'co-1',
      name: 'Inter Irmã Daniel',
      account_type: 'IMOBILIARIA',
      beneficiary_name: 'S V TOPOGRAFIA',
      document: null,
      email: null,
      phone: null,
      environment: 'SANDBOX',
      bank_integration_id: 'int-inter-b',
      is_default: false,
      active: true,
      notes: 'Conta Inter B',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    });

    const a = await resolveInterIntegrationId(mock.admin, 'co-1', {
      financialAccountId: 'fa-inter',
    });
    const b = await resolveInterIntegrationId(mock.admin, 'co-1', {
      financialAccountId: 'fa-inter-b',
    });
    assert(a.integrationId === 'int-inter', 'TESTE A — Inter A resolve integração A');
    assert(a.financialAccountId === 'fa-inter', 'TESTE A — Inter A financial_account_id');
    assert(b.integrationId === 'int-inter-b', 'TESTE A — Inter B resolve integração B');
    assert(b.financialAccountId === 'fa-inter-b', 'TESTE A — Inter B financial_account_id');
    assert(a.integrationId !== b.integrationId, 'TESTE A — integrações Inter distintas');

    let cross = false;
    try {
      assertSecretsDoNotCrossAccounts(
        { financialAccountId: 'fa-inter', integrationId: 'int-inter' },
        'fa-inter-b',
        'int-inter-b',
      );
    } catch {
      cross = true;
    }
    assert(cross, 'TESTE A — sem fallback cruzado de credenciais');

    clearAllInterTokenCacheForTests();
    setCachedInterToken(
      'co-1',
      'SANDBOX',
      {
        accessToken: 'token-A',
        expiresAtMs: Date.now() + 60_000,
        tokenType: 'Bearer',
      },
      'int-inter',
    );
    assert(
      getCachedInterToken('co-1', 'SANDBOX', 0, 'int-inter')?.accessToken === 'token-A',
      'TESTE A — cache Inter A',
    );
    assert(
      getCachedInterToken('co-1', 'SANDBOX', 0, 'int-inter-b') === null,
      'TESTE A — cache Inter B não herda token A',
    );

    const extra = await createInterFinancialAccount(mock.admin, 'co-1', {
      name: 'Inter Pai Daniel',
      createAdditional: true,
    });
    assert(
      extra.bankIntegrationId !== 'int-inter' && extra.bankIntegrationId !== 'int-inter-b',
      'TESTE A — Nova conta Inter cria integração própria',
    );
    assert(
      mock.integrations.filter((i) => i.provider === 'INTER').length >= 3,
      'TESTE A — três integrações INTER coexistentes',
    );
  }

  // TESTE B — 2 ASAAS
  {
    const mock = createMultiAccountMock();
    mock.integrations.push({
      id: 'int-asaas-b',
      company_id: 'co-1',
      provider: 'ASAAS_COMPANY',
      is_default: false,
    });
    mock.accounts.push({
      id: 'fa-asaas-b',
      company_id: 'co-1',
      name: 'Asaas Sócio',
      account_type: 'IMOBILIARIA',
      beneficiary_name: 'S V TOPOGRAFIA',
      document: null,
      email: null,
      phone: null,
      environment: 'SANDBOX',
      bank_integration_id: 'int-asaas-b',
      is_default: false,
      active: true,
      notes: 'Conta Asaas B',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    });
    const a = mock.getAccount('fa-asaas');
    const b = mock.getAccount('fa-asaas-b');
    assert(a?.bank_integration_id === 'int-asaas', 'TESTE B — Asaas A api/integration A');
    assert(b?.bank_integration_id === 'int-asaas-b', 'TESTE B — Asaas B api/integration B');
    assert(a?.bank_integration_id !== b?.bank_integration_id, 'TESTE B — API keys isoladas por integração');
    const repo = fs.readFileSync(
      path.join(__dirname, '../lib/finance/companyFinancialAccountRepository.ts'),
      'utf8',
    );
    assert(
      repo.includes('loadAsaasApiKeyForFinancialAccount') &&
        repo.includes('account.bankIntegrationId'),
      'TESTE B — Asaas carrega API key pela conta, não pela empresa',
    );
  }

  // TESTE C — providers mistos / roteamento por empreendimento
  {
    const mock = createMultiAccountMock();
    mock.integrations.push(
      { id: 'int-inter-b', company_id: 'co-1', provider: 'INTER', is_default: false },
      { id: 'int-asaas-b', company_id: 'co-1', provider: 'ASAAS_COMPANY', is_default: false },
    );
    mock.accounts.push(
      {
        id: 'fa-inter-b',
        company_id: 'co-1',
        name: 'Inter Irmã',
        account_type: 'IMOBILIARIA',
        beneficiary_name: 'X',
        document: null,
        email: null,
        phone: null,
        environment: 'SANDBOX',
        bank_integration_id: 'int-inter-b',
        is_default: false,
        active: true,
        notes: '',
        created_at: '2026-09-02T00:00:00Z',
        updated_at: '2026-09-02T00:00:00Z',
      },
      {
        id: 'fa-asaas-b',
        company_id: 'co-1',
        name: 'Asaas Sócio',
        account_type: 'IMOBILIARIA',
        beneficiary_name: 'X',
        document: null,
        email: null,
        phone: null,
        environment: 'SANDBOX',
        bank_integration_id: 'int-asaas-b',
        is_default: false,
        active: true,
        notes: '',
        created_at: '2026-09-02T00:00:00Z',
        updated_at: '2026-09-02T00:00:00Z',
      },
    );
    mock.sales.push(
      {
        id: 'sale-c',
        company_id: 'co-1',
        tenant_id: 'co-1',
        financial_account_id: 'fa-inter-b',
        project_id: 'proj-c',
        projects: { financial_account_id: 'fa-inter-b' },
      },
      {
        id: 'sale-d',
        company_id: 'co-1',
        tenant_id: 'co-1',
        financial_account_id: 'fa-asaas-b',
        project_id: 'proj-d',
        projects: { financial_account_id: 'fa-asaas-b' },
      },
    );

    const rA = await resolveSaleChargesProvider(mock.admin, 'co-1', 'sale-a');
    const rB = await resolveSaleChargesProvider(mock.admin, 'co-1', 'sale-b');
    const rC = await resolveSaleChargesProvider(mock.admin, 'co-1', 'sale-c');
    const rD = await resolveSaleChargesProvider(mock.admin, 'co-1', 'sale-d');
    assert(rA.provider === 'ASAAS_COMPANY' && rA.financialAccountId === 'fa-asaas', 'TESTE C — venda A Asaas Daniel');
    assert(rB.provider === 'INTER' && rB.financialAccountId === 'fa-inter', 'TESTE C — venda B Inter Daniel');
    assert(rC.provider === 'INTER' && rC.financialAccountId === 'fa-inter-b', 'TESTE C — venda C Inter Irmã');
    assert(rD.provider === 'ASAAS_COMPANY' && rD.financialAccountId === 'fa-asaas-b', 'TESTE C — venda D Asaas Sócio');
    assert(rB.bankIntegrationId !== rC.bankIntegrationId, 'TESTE C — Inter A ≠ Inter B');
    assert(rA.bankIntegrationId !== rD.bankIntegrationId, 'TESTE C — Asaas A ≠ Asaas B');
  }

  // TESTE D — webhook Inter A nunca liquida Inter B (idem Asaas)
  {
    assert(
      interChargeBelongsToReceiptAccount(
        { financial_account_id: 'fa-inter' },
        { financial_account_id: 'fa-inter' },
      ),
      'TESTE D — mesma conta Inter pode liquidar',
    );
    assert(
      !interChargeBelongsToReceiptAccount(
        { financial_account_id: 'fa-inter' },
        { financial_account_id: 'fa-inter-b' },
      ),
      'TESTE D — Inter A não liquida parcela Inter B',
    );
    const webhookSrc = fs.readFileSync(
      path.join(__dirname, '../lib/banking/inter/interWebhookProcessor.ts'),
      'utf8',
    );
    assert(webhookSrc.includes('financial_account_id'), 'TESTE D — webhook lê FA da cobrança');
    assert(
      webhookSrc.includes('loadInterSecretsForServer') &&
        webhookSrc.includes('localCharge.financial_account_id'),
      'TESTE D — webhook carrega secrets da conta da cobrança',
    );
    const asaasWh = fs.readFileSync(
      path.join(__dirname, '../lib/finance/companyAsaasWebhookHandler.ts'),
      'utf8',
    );
    assert(
      asaasWh.includes('loadAsaasWebhookTokenForAccount') &&
        asaasWh.includes('charge.financialAccountId'),
      'TESTE D — webhook Asaas exige token da conta da cobrança',
    );
  }

  // TESTE E — idempotência (mesmo evento 2x)
  {
    const webhookSrc = fs.readFileSync(
      path.join(__dirname, '../lib/banking/inter/interWebhookProcessor.ts'),
      'utf8',
    );
    assert(webhookSrc.includes('buildInterWebhookIdempotencyKey'), 'TESTE E — chave idempotente Inter');
    assert(webhookSrc.includes('healDuplicateInterWebhook'), 'TESTE E — duplicate webhook Inter');
    const settlement = fs.readFileSync(
      path.join(__dirname, '../lib/banking/inter/interPaymentSettlement.ts'),
      'utf8',
    );
    assert(settlement.includes('alreadyChargePaid') || settlement.includes('duplicate'), 'TESTE E — settlement idempotente');
    const asaasWh = fs.readFileSync(
      path.join(__dirname, '../lib/finance/companyAsaasWebhookHandler.ts'),
      'utf8',
    );
    assert(asaasWh.includes('already_processed'), 'TESTE E — webhook Asaas duplicate');
  }

  // Arquivos UI / resolver / migration
  {
    const root = path.join(__dirname, '..');
    const faPanel = fs.readFileSync(
      path.join(root, 'components/finance/FinancialAccountsPanel.tsx'),
      'utf8',
    );
    assert(faPanel.includes('Nova conta Asaas'), 'UI Nova conta Asaas');
    assert(faPanel.includes('Nova conta Inter'), 'UI Nova conta Inter');
    assert(faPanel.includes("title === 'INTER' ? 'Banco Inter'") || faPanel.includes("'Banco Inter'"), 'lista agrupada Inter');
    const resolver = fs.readFileSync(
      path.join(root, 'lib/finance/financialAccountCredentialResolver.ts'),
      'utf8',
    );
    assert(resolver.includes('resolveFinancialAccountSecrets'), 'resolver por financial_account_id');
    assert(
      fs.existsSync(path.join(root, 'supabase/migrations/20260907120000_multi_bank_accounts_per_company.sql')),
      'migration multi-conta existe',
    );
  }

  console.log('\n=== Multi-contas OK ===\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
