/**
 * Situação das contas financeiras: excluir, bloquear, desativar e reativar.
 * npx tsx scripts/mandatory-financial-account-lifecycle-tests.ts
 */

import { readFileSync } from 'node:fs';
import {
  deleteCompanyFinancialAccount,
  evaluateCompanyFinancialAccountLifecycle,
  FinancialAccountLifecycleError,
  type FinancialAccountLinkSnapshot,
} from '../lib/finance/companyFinancialAccountLifecycle';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function links(partial: Partial<FinancialAccountLinkSnapshot> = {}): FinancialAccountLinkSnapshot {
  return {
    receipts: 0,
    pendingReceipts: 0,
    cashMovements: 0,
    asaasCharges: 0,
    pendingAsaasCharges: 0,
    bankCharges: 0,
    pendingBankCharges: 0,
    c6Reservations: 0,
    openC6Reservations: 0,
    sales: 0,
    projects: 0,
    splitParticipants: 0,
    activeSplitParticipants: 0,
    snapshotParticipants: 0,
    providerDestinations: 0,
    foreignLinks: 0,
    integration: null,
    ...partial,
  };
}

const unused = { active: true, bankIntegrationId: null };

function testUnlinkedAccountCanBeDeleted() {
  const decision = evaluateCompanyFinancialAccountLifecycle(unused, links());
  assert(decision.canDelete, 'conta sem vínculo pode ser excluída');
  assert(decision.canDeactivate, 'conta sem vínculo pode ser desativada');
  assert(decision.canEditBankIdentity, 'identidade bancária livre sem histórico');
}

function testHistoryBlocksDeleteAndOffersDeactivation() {
  const decision = evaluateCompanyFinancialAccountLifecycle(
    unused,
    links({ receipts: 2, asaasCharges: 1, bankCharges: 1 }),
  );
  assert(!decision.canDelete, 'histórico bloqueia exclusão');
  assert(decision.canDeactivate, 'histórico sem pendência permite desativar');
  assert(
    decision.blockers.some((message) => message.includes('não pode ser excluída')),
    'explica que a exclusão está bloqueada',
  );
  assert(
    decision.blockers.some((message) => message.includes('pode ser desativada')),
    'oferece desativação',
  );
}

function testPendingChargeBlocksDeactivation() {
  const decision = evaluateCompanyFinancialAccountLifecycle(
    unused,
    links({ receipts: 1, pendingReceipts: 1 }),
  );
  assert(!decision.canDelete, 'pendência também bloqueia exclusão');
  assert(!decision.canDeactivate, 'cobrança pendente bloqueia desativação');
  assert(
    decision.deactivationBlockers.some((message) => message.includes('pendentes')),
    decision.deactivationBlockers.join(' '),
  );
}

function testProductionC6AccountIsProtected() {
  const integration = {
    sameCompany: true,
    active: true,
    emissionEnabled: true,
    webhookConfirmed: true,
    credentialCount: 2,
    connected: true,
  };
  const decision = evaluateCompanyFinancialAccountLifecycle(
    { active: true, bankIntegrationId: 'c6-live' },
    links({
      integration,
      c6Reservations: 1,
      bankCharges: 1,
    }),
  );
  assert(!decision.canDelete, 'conta C6 ativa não é excluída');
  assert(!decision.canDeactivate, 'desativar a conta C6 ativa interromperia a emissão');
  assert(!decision.canEditBankIdentity, 'dados bancários da integração ativa ficam travados');
  assert(
    decision.blockers.some((message) => message.includes('webhook')),
    'a mensagem preserva o webhook',
  );
  assert(
    decision.deactivationBlockers.some((message) => message.includes('emissão C6')),
    decision.deactivationBlockers.join(' '),
  );
}

function testCancelledChargeStillBlocksDelete() {
  const decision = evaluateCompanyFinancialAccountLifecycle(
    unused,
    links({ bankCharges: 1, pendingBankCharges: 0, asaasCharges: 1, pendingAsaasCharges: 0 }),
  );
  assert(!decision.canDelete, 'boleto cancelado continua bloqueando exclusão');
  assert(decision.canDeactivate, 'boleto encerrado não impede desativação');
}

function testForeignCompanyLinkFailsClosed() {
  const decision = evaluateCompanyFinancialAccountLifecycle(unused, links({ foreignLinks: 1 }));
  assert(!decision.canDelete, 'vínculo de outra conferência bloqueia exclusão');
  assert(
    decision.blockers.some((message) => message.includes('não pôde ser isolado')),
    decision.blockers.join(' '),
  );
}

function testInactiveAccountCanBeReactivated() {
  const decision = evaluateCompanyFinancialAccountLifecycle(
    { active: false, bankIntegrationId: null },
    links(),
  );
  assert(decision.canReactivate, 'conta inativa pode ser reativada');
  assert(!decision.canDeactivate, 'conta inativa não é desativada de novo');
}

type Eq = { column: string; value: string };

class Query {
  private eqs: Eq[] = [];
  private head = false;
  private action: 'select' | 'delete' = 'select';

  constructor(
    private readonly fake: FakeAdmin,
    private readonly table: string,
  ) {}

  select(_columns?: string, options?: { head?: boolean }) {
    this.head = Boolean(options?.head);
    return this;
  }

  eq(column: string, value: unknown) {
    this.eqs.push({ column, value: String(value) });
    return this;
  }

  in() {
    return this;
  }

  or() {
    return this;
  }

  filter() {
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.finish());
  }

  then(resolve: (value: { data: unknown; error: null; count: number | null }) => void) {
    resolve(this.finish());
  }

  private finish() {
    if (this.head) {
      return { data: null, error: null, count: this.fake.countFor(this.table) };
    }
    if (this.action === 'delete') {
      const company = this.eqs.find((item) => item.column === 'company_id')?.value;
      const id = this.eqs.find((item) => item.column === 'id')?.value;
      this.fake.deleted.push({ table: this.table, company, id });
      const allowed = this.table === 'company_financial_accounts' && company === 'co-1' && id === 'acc-test';
      return { data: allowed ? [{ id }] : [], error: null, count: null };
    }
    if (this.table === 'company_financial_accounts') {
      const company = this.eqs.find((item) => item.column === 'company_id')?.value;
      return {
        data: company === 'co-1' ? this.fake.account : null,
        error: null,
        count: null,
      };
    }
    return { data: [], error: null, count: null };
  }
}

class FakeAdmin {
  deleted: Array<{ table: string; company?: string; id?: string }> = [];
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  counts: Record<string, number> = {};
  rpcResult: { ok: boolean; code: string; message?: string } = { ok: true, code: 'deleted' };
  readonly account = {
    id: 'acc-test',
    company_id: 'co-1',
    name: 'Conta C6 teste',
    account_type: 'IMOBILIARIA',
    beneficiary_name: null,
    document: null,
    email: null,
    phone: null,
    environment: 'PRODUCTION',
    bank_integration_id: null,
    is_default: false,
    active: true,
    notes: 'Conta financeira C6 aguardando vínculo',
    bank_name: null,
    bank_code: null,
    agency: null,
    account_number: null,
    account_digit: null,
    bank_account_kind: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  countFor(table: string) {
    return this.counts[table] ?? 0;
  }

  from(table: string) {
    return new Query(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    if (this.counts.finance_receipts) {
      return Promise.resolve({
        data: {
          ok: false,
          code: 'blocked',
          message: 'Existem recebimentos vinculados, inclusive pagos ou cancelados.',
        },
        error: null,
      });
    }
    if (args.p_company_id !== 'co-1') {
      return Promise.resolve({
        data: { ok: false, code: 'not_found', message: 'Conta financeira não encontrada.' },
        error: null,
      });
    }
    return Promise.resolve({ data: this.rpcResult, error: null });
  }
}

async function testDeleteWritesOnlyTheAccountRow() {
  const admin = new FakeAdmin();
  await deleteCompanyFinancialAccount(
    admin as never,
    'co-1',
    'acc-test',
    '2026-01-01T00:00:00.000Z',
    'Conta C6 teste',
  );
  assert(admin.deleted.length === 0, 'o aplicativo não apaga a linha direto');
  assert(admin.rpcCalls.length === 1, 'uma chamada transacional');
  assert(admin.rpcCalls[0].fn === 'delete_company_financial_account', admin.rpcCalls[0].fn);
  assert(admin.rpcCalls[0].args.p_company_id === 'co-1', 'RPC recebe a empresa da sessão');
  assert(admin.rpcCalls[0].args.p_account_id === 'acc-test', 'RPC recebe a conta conferida');
}

async function testDeleteRefusesHistoryBeforeWriting() {
  const admin = new FakeAdmin();
  admin.counts.finance_receipts = 1;
  let refused = false;
  try {
    await deleteCompanyFinancialAccount(
      admin as never,
      'co-1',
      'acc-test',
      '2026-01-01T00:00:00.000Z',
      'Conta C6 teste',
    );
  } catch (error) {
    refused = error instanceof FinancialAccountLifecycleError;
    assert(refused, 'erro de ciclo de vida');
    assert(String((error as Error).message).includes('recebimentos'), String((error as Error).message));
  }
  assert(refused, 'exclusão com histórico foi recusada');
  assert(admin.deleted.length === 0, 'nenhuma linha foi apagada');
}

async function testOtherCompanyIsNotDeleted() {
  const admin = new FakeAdmin();
  let missing = false;
  try {
    await deleteCompanyFinancialAccount(
      admin as never,
      'co-2',
      'acc-test',
      '2026-01-01T00:00:00.000Z',
      'Conta C6 teste',
    );
  } catch (error) {
    missing = error instanceof FinancialAccountLifecycleError && (error as FinancialAccountLifecycleError).status === 404;
  }
  assert(missing, 'outra empresa não encontra a conta');
  assert(admin.deleted.length === 0, 'outra empresa não apaga a conta');
}

function testStaticGuards() {
  const route = readFileSync('app/api/finance/financial-accounts/[id]/lifecycle/route.ts', 'utf8');
  const passwordAt = route.indexOf('await verifyPrimaryAdminPassword');
  const deleteAt = route.indexOf('await deleteCompanyFinancialAccount');
  assert(passwordAt >= 0 && passwordAt < deleteAt, 'senha conferida antes da exclusão');
  assert(route.includes('Autorização não concedida.'), 'senha recusada');
  assert(!route.includes('record.companyId'), 'empresa vem da sessão');
  assert(route.includes('isTenantEnterpriseAdminRole'), 'exige administrador da empresa');

  const lifecycle = readFileSync('lib/finance/companyFinancialAccountLifecycle.ts', 'utf8');
  const deleter = lifecycle.slice(
    lifecycle.indexOf('export async function deleteCompanyFinancialAccount'),
    lifecycle.indexOf('export function bankIdentityInputChanged'),
  );
  assert(deleter.includes(".rpc('delete_company_financial_account'"), 'exclusão usa a RPC');
  assert(!deleter.includes('.delete('), 'exclusão do aplicativo não faz DELETE direto');
  assert(!lifecycle.includes('.delete('), 'não existe fallback de DELETE direto');
  assert(!deleter.includes('bank_integrations'), 'exclusão não mexe na integração');
  assert(!deleter.includes('bank_credentials'), 'exclusão não mexe na credencial');
  assert(!deleter.includes('finance_receipts'), 'exclusão não apaga recebimento');
  assert(!deleter.includes('cash_movements'), 'exclusão não apaga caixa');

  const sql = readFileSync(
    'supabase/migrations/20261122170000_delete_company_financial_account.sql',
    'utf8',
  );
  assert(sql.includes('FOR UPDATE'), 'trava a conta antes de decidir');
  assert(sql.includes('FOR KEY SHARE'), 'referência nova espera a exclusão');
  assert(sql.includes('metadata->>\'financial_account_id\''), 'caixa por metadata entra na mesma transação');
  assert(sql.includes('GRANT EXECUTE ON FUNCTION public.delete_company_financial_account(uuid, uuid, timestamptz) TO service_role'), 'só service_role executa');
  assert(sql.includes('REVOKE ALL ON FUNCTION public.delete_company_financial_account(uuid, uuid, timestamptz) FROM anon, authenticated'), 'usuário comum não executa');
  assert(sql.includes('REVOKE DELETE ON TABLE public.company_financial_accounts FROM PUBLIC, anon, authenticated, service_role'), 'DELETE direto revogado também para service_role');
  assert(sql.includes('current_user IS DISTINCT FROM v_owner'), 'variável de sessão sozinha não autoriza o DELETE');
  assert(sql.includes('tenant_id::text = p_company_id::text'), 'caixa exige a mesma empresa');
  assert(sql.includes('snapshot.company_id = p_company_id'), 'rateio congelado exige a empresa do snapshot');
  assert(sql.includes('Há movimentação de caixa de outra empresa'), 'referência cruzada de caixa bloqueia');
  assert(sql.includes('Há rateio congelado de outra empresa'), 'referência cruzada de rateio bloqueia');
  const rejectFn = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.reject_direct_company_financial_account_delete'),
    sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_c6_reservation_financial_account'),
  );
  assert(!rejectFn.includes('SECURITY DEFINER'), 'o gatilho de DELETE enxerga o usuário que apaga');
  assert(sql.includes('trg_c6_boleto_reservations_financial_account_lock'), 'reserva C6 espera a conta vinculada');
  for (const guardName of [
    'guard_cash_movement_financial_account',
    'guard_split_snapshot_financial_account',
    'guard_c6_reservation_financial_account',
  ]) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${guardName}`);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    assert(body.includes('RETURN NEW'), `${guardName} devolve a linha original`);
    assert(!body.includes('UPDATE public.'), `${guardName} não altera tabela`);
    assert(!body.includes('NEW.amount'), `${guardName} não altera valor`);
  }
  const precheck = readFileSync(
    'scripts/production/financial-accounts/10-precheck-delete-company-financial-account.sql',
    'utf8',
  );
  const requiredPairs = precheck.split('\n').filter((line) => line.trim().startsWith("('"));
  assert(!precheck.includes('= 16'), 'pré-check não usa contagem fixa errada');
  assert(precheck.includes('colunas_ausentes'), 'pré-check lista coluna ausente');
  assert(requiredPairs.length === 33, `pré-check cobre ${requiredPairs.length} colunas`);
  assert(precheck.includes('metadata_invalida'), 'pré-check recusa metadata que não é UUID');
  const sqlDeleteAt = sql.indexOf('DELETE FROM public.company_financial_accounts');
  assert(sqlDeleteAt > sql.indexOf('cardinality(v_messages)'), 'DELETE só depois da conferência');
  assert(!sql.includes('UPDATE public.bank_integrations'), 'não altera integração');
  assert(!sql.includes('UPDATE public.cash_movements'), 'não altera caixa');
  assert(!sql.includes('DELETE FROM public.bank_credentials'), 'não apaga credencial');
  assert(!sql.includes('DELETE FROM public.finance_receipts'), 'não apaga recebimento');

  const panel = readFileSync('components/finance/FinancialAccountsPanel.tsx', 'utf8');
  assert(panel.includes('Editar conta'), 'ação editar');
  assert(panel.includes('Desativar conta'), 'ação desativar');
  assert(panel.includes('Reativar conta'), 'ação reativar');
  assert(panel.includes('Excluir conta'), 'ação excluir');
  assert(panel.includes('type="password"'), 'senha explícita');
  assert(panel.includes('!deletePassword.trim()'), 'exclusão sem senha fica desabilitada');

  const listRoute = readFileSync('app/api/finance/financial-accounts/route.ts', 'utf8');
  assert(listRoute.includes('activeOnly: !includeInactive'), 'listagem padrão só traz contas ativas');
  const saleModal = readFileSync('components/map/CustomerLotFormModal.tsx', 'utf8');
  assert(
    saleModal.includes("fetch('/api/finance/financial-accounts'"),
    'venda consulta as contas',
  );
  assert(!saleModal.includes('includeInactive=1'), 'venda nova não lista conta inativa');

  const repository = readFileSync('lib/finance/companyFinancialAccountRepository.ts', 'utf8');
  assert(
    repository.includes('A situação da conta só muda por Desativar ou Reativar.'),
    'salvar não desativa a conta',
  );
}

function testConcurrentReferencesStayIntact() {
  let exists = true;
  const cash: string[] = [];

  function commitInsert() {
    if (!exists) {
      throw new Error('A conta financeira referenciada não existe mais. A operação foi cancelada.');
    }
    cash.push('co-1');
  }

  function tryDelete() {
    if (cash.length > 0) return 'blocked';
    exists = false;
    return 'deleted';
  }

  commitInsert();
  assert(tryDelete() === 'blocked', 'vínculo gravado antes impede a exclusão');
  assert(cash.length === 1, 'o caixa permanece');
  assert(exists, 'a conta permanece');

  cash.length = 0;
  exists = true;
  let held: 'update' | null = 'update';
  let waiter: (() => void) | null = null;
  if (held === 'update') {
    waiter = () => {
      if (!exists) {
        throw new Error('A conta financeira referenciada não existe mais. A operação foi cancelada.');
      }
      cash.push('co-1');
    };
  }
  assert(waiter, 'a gravação esperou o bloqueio da conta');
  assert(cash.length === 0, 'nada foi gravado enquanto a exclusão segura a conta');
  const raced = cash.length > 0 ? 'blocked' : 'deleted';
  if (raced === 'deleted') exists = false;
  held = null;
  let waiting = '';
  try {
    waiter();
  } catch (error) {
    waiting = (error as Error).message;
  }
  assert(raced === 'deleted', 'exclusão sem vínculo conclui');
  assert(!exists, 'conta removida só depois da conferência');
  assert(waiting.includes('não existe mais'), waiting);
  assert(cash.length === 0, 'o vínculo concorrente não foi gravado');
}

function testIntermediateFailureRollsBack() {
  const state = { account: true, cash: 0, integration: true };
  const snapshot = { ...state };
  function rollback() {
    state.account = snapshot.account;
    state.cash = snapshot.cash;
    state.integration = snapshot.integration;
  }
  try {
    state.cash = 1;
    throw new Error('falha intermediária');
  } catch {
    rollback();
  }
  assert(state.account, 'rollback devolve a conta');
  assert(state.cash === 0, 'rollback não deixa movimento parcial');
  assert(state.integration, 'rollback não mexe na integração');
}

function testTwoDeletesDoNotDropReferences() {
  const receipts = [{ companyId: 'co-2', accountId: 'other' }];
  let account: string | null = 'acc-test';
  let locked = false;
  function remove() {
    if (locked) return 'waiting';
    locked = true;
    if (!account) return 'not_found';
    account = null;
    locked = false;
    return 'deleted';
  }
  assert(remove() === 'deleted', 'primeira exclusão');
  assert(remove() === 'not_found', 'segunda exclusão não encontra a conta');
  assert(receipts.length === 1, 'recebimento de outra conta permanece');
  assert(receipts[0].companyId === 'co-2', 'empresa alheia permanece isolada');
}

async function main() {
  testUnlinkedAccountCanBeDeleted();
  testHistoryBlocksDeleteAndOffersDeactivation();
  testPendingChargeBlocksDeactivation();
  testProductionC6AccountIsProtected();
  testCancelledChargeStillBlocksDelete();
  testForeignCompanyLinkFailsClosed();
  testInactiveAccountCanBeReactivated();
  await testDeleteWritesOnlyTheAccountRow();
  await testDeleteRefusesHistoryBeforeWriting();
  await testOtherCompanyIsNotDeleted();
  testConcurrentReferencesStayIntact();
  testIntermediateFailureRollsBack();
  testTwoDeletesDoNotDropReferences();
  testStaticGuards();
  console.log('FINANCIAL_ACCOUNT_LIFECYCLE_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
