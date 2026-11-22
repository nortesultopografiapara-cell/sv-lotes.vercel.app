/**
 * Situação da conta financeira da empresa.
 * Desativar e excluir não apagam integração, credencial, webhook nem dados de outra empresa.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCompanyFinancialAccountById } from './companyFinancialAccountRepository';

const TERMINAL_CHARGE = ['PAID', 'CANCELLED', 'CANCELED', 'REFUNDED', 'RECEIVED', 'CONFIRMED'];
const TERMINAL_RECEIPT = ['pago', 'paid', 'cancelado', 'canceled', 'cancelled', 'cancelada'];
const OPEN_C6_RESERVATION = ['RESERVED', 'PROCESSING', 'UNKNOWN'];

export type FinancialAccountLinkSnapshot = {
  receipts: number;
  pendingReceipts: number;
  cashMovements: number;
  asaasCharges: number;
  pendingAsaasCharges: number;
  bankCharges: number;
  pendingBankCharges: number;
  c6Reservations: number;
  openC6Reservations: number;
  sales: number;
  projects: number;
  splitParticipants: number;
  activeSplitParticipants: number;
  snapshotParticipants: number;
  providerDestinations: number;
  foreignLinks: number;
  integration: {
    sameCompany: boolean;
    active: boolean;
    emissionEnabled: boolean;
    webhookConfirmed: boolean;
    credentialCount: number;
    connected: boolean;
  } | null;
};

export type FinancialAccountLifecycleDecision = {
  canDelete: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
  canEditBankIdentity: boolean;
  blockers: string[];
  deactivationBlockers: string[];
  bankIdentityBlockers: string[];
};

export class FinancialAccountLifecycleError extends Error {
  readonly status: number;
  readonly decision: FinancialAccountLifecycleDecision | null;

  constructor(
    message: string,
    status: number,
    decision: FinancialAccountLifecycleDecision | null = null,
  ) {
    super(message);
    this.name = 'FinancialAccountLifecycleError';
    this.status = status;
    this.decision = decision;
  }
}

type AccountRef = {
  id: string;
  companyId: string;
  active: boolean;
  bankIntegrationId: string | null;
  updatedAt: string;
};

function emptyLinks(): FinancialAccountLinkSnapshot {
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
  };
}

function integrationInUse(links: FinancialAccountLinkSnapshot): boolean {
  const integration = links.integration;
  if (!integration) return false;
  if (!integration.sameCompany) return true;
  return (
    integration.active ||
    integration.emissionEnabled ||
    integration.webhookConfirmed ||
    integration.connected ||
    integration.credentialCount > 0
  );
}

function hasHistory(links: FinancialAccountLinkSnapshot): boolean {
  return (
    links.receipts > 0 ||
    links.cashMovements > 0 ||
    links.asaasCharges > 0 ||
    links.bankCharges > 0 ||
    links.c6Reservations > 0 ||
    links.sales > 0 ||
    links.projects > 0 ||
    links.splitParticipants > 0 ||
    links.snapshotParticipants > 0 ||
    links.providerDestinations > 0 ||
    links.foreignLinks > 0
  );
}

export function evaluateCompanyFinancialAccountLifecycle(
  account: Pick<AccountRef, 'active' | 'bankIntegrationId'>,
  links: FinancialAccountLinkSnapshot,
): FinancialAccountLifecycleDecision {
  const blockers: string[] = [];
  const deactivationBlockers: string[] = [];
  const bankIdentityBlockers: string[] = [];

  if (links.foreignLinks > 0) {
    blockers.push('Há vínculo que não pôde ser isolado nesta empresa. A exclusão foi recusada.');
  }
  if (links.receipts > 0) {
    blockers.push('Existem recebimentos vinculados, inclusive pagos ou cancelados.');
  }
  if (links.cashMovements > 0) {
    blockers.push('Existem movimentações de caixa vinculadas.');
  }
  if (links.asaasCharges > 0) {
    blockers.push('Existem cobranças Asaas vinculadas, inclusive canceladas.');
  }
  if (links.bankCharges > 0) {
    blockers.push('Existem boletos ou cobranças bancárias vinculados, inclusive cancelados.');
  }
  if (links.c6Reservations > 0) {
    blockers.push('Existem reservas de boleto C6 vinculadas à integração desta conta.');
  }
  if (links.sales > 0) blockers.push('Existem vendas vinculadas.');
  if (links.projects > 0) blockers.push('Existem empreendimentos vinculados.');
  if (links.splitParticipants > 0) blockers.push('Existem rateios de empreendimento vinculados.');
  if (links.snapshotParticipants > 0) blockers.push('Existem rateios congelados de vendas vinculados.');
  if (links.providerDestinations > 0) {
    blockers.push('Existe destino de rateio ou carteira vinculado.');
  }
  if (account.bankIntegrationId && !links.integration) {
    blockers.push('Não foi possível confirmar a integração vinculada. A exclusão foi recusada.');
  }
  if (account.bankIntegrationId && links.integration && !links.integration.sameCompany) {
    blockers.push('A integração vinculada não pertence a esta empresa. A exclusão foi recusada.');
  }
  if (integrationInUse(links)) {
    blockers.push(
      'A conta está vinculada à integração bancária ativa. Credenciais, webhook e registros bancários não são removidos por esta ação.',
    );
  }

  if (links.pendingReceipts > 0) {
    deactivationBlockers.push('Existem recebimentos pendentes nesta conta.');
  }
  if (links.pendingAsaasCharges > 0) {
    deactivationBlockers.push('Existem cobranças Asaas em aberto nesta conta.');
  }
  if (links.pendingBankCharges > 0) {
    deactivationBlockers.push('Existem boletos ou cobranças bancárias em aberto nesta conta.');
  }
  if (links.openC6Reservations > 0) {
    deactivationBlockers.push('Existe emissão C6 ainda em andamento nesta integração.');
  }
  if (links.activeSplitParticipants > 0) {
    deactivationBlockers.push('Existe rateio ativo que ainda depende desta conta.');
  }
  if (links.integration?.emissionEnabled) {
    deactivationBlockers.push(
      'Esta conta sustenta a emissão C6 ativa. Desativá-la interromperia a emissão. A emissão, o webhook e as credenciais não foram alterados.',
    );
  }

  if (hasHistory(links) || integrationInUse(links) || (account.bankIntegrationId && !links.integration)) {
    bankIdentityBlockers.push(
      'Banco, agência e conta não podem ser alterados porque já existe histórico ou uma integração ativa que depende desses dados.',
    );
  }

  const canDelete = blockers.length === 0;
  const canDeactivate = account.active && deactivationBlockers.length === 0;
  if (!canDelete && canDeactivate) {
    blockers.push(
      'A conta não pode ser excluída. Ela pode ser desativada: deixa de entrar em novas vendas e cobranças e permanece no histórico.',
    );
  }

  return {
    canDelete,
    canDeactivate,
    canReactivate: !account.active,
    canEditBankIdentity: bankIdentityBlockers.length === 0,
    blockers,
    deactivationBlockers,
    bankIdentityBlockers,
  };
}

type Filter = { column: string; value: string; op: 'eq' | 'in' | 'or' | 'filter' };

async function countRows(
  admin: SupabaseClient,
  table: string,
  filters: Filter[],
): Promise<number> {
  let query = admin.from(table).select('id', { count: 'exact', head: true });
  for (const filter of filters) {
    if (filter.op === 'eq') query = query.eq(filter.column, filter.value);
    else if (filter.op === 'in') query = query.in(filter.column, filter.value.split(','));
    else if (filter.op === 'or') query = query.or(filter.value);
    else query = query.filter(filter.column, 'eq', filter.value);
  }
  const { count, error } = await query;
  if (error) {
    throw new FinancialAccountLifecycleError(
      'Não foi possível confirmar os vínculos desta conta. Nenhuma exclusão ou desativação foi feita.',
      503,
    );
  }
  return count ?? 0;
}

function companyFilter(companyId: string): Filter {
  return { column: 'company_id', value: companyId, op: 'eq' };
}

async function ownedCount(
  admin: SupabaseClient,
  table: string,
  accountId: string,
  companyId: string,
  options?: {
    accountColumn?: string;
    accountOp?: Filter['op'];
    companyColumn?: string;
    extra?: Filter[];
  },
): Promise<{ owned: number; foreignLinks: number }> {
  const accountColumn = options?.accountColumn || 'financial_account_id';
  const base: Filter[] = [
    { column: accountColumn, value: accountId, op: options?.accountOp || 'eq' },
    ...(options?.extra || []),
  ];
  const total = await countRows(admin, table, base);
  const company: Filter =
    options?.companyColumn === 'tenant_id'
      ? { column: 'tenant_id', value: companyId, op: 'eq' }
      : options?.companyColumn === 'company_or_tenant'
        ? {
            column: 'company_id',
            value: `company_id.eq.${companyId},tenant_id.eq.${companyId}`,
            op: 'or',
          }
        : { column: 'company_id', value: companyId, op: 'eq' };
  const owned = await countRows(admin, table, [...base, company]);
  return { owned, foreignLinks: Math.max(0, total - owned) };
}

export async function loadCompanyFinancialAccountLinks(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
  bankIntegrationId: string | null,
): Promise<FinancialAccountLinkSnapshot> {
  const links = emptyLinks();
  const receiptScope = { companyColumn: 'company_or_tenant' as const };
  const tenantScope = { companyColumn: 'tenant_id' as const };
  const groups = await Promise.all([
    ownedCount(admin, 'finance_receipts', accountId, companyId, receiptScope),
    ownedCount(admin, 'finance_receipts', accountId, companyId, {
      ...receiptScope,
      extra: [{ column: 'status', value: TERMINAL_RECEIPT.join(','), op: 'in' }],
    }),
    ownedCount(admin, 'cash_movements', accountId, companyId, {
      accountColumn: 'metadata->>financial_account_id',
      accountOp: 'filter',
    }),
    ownedCount(admin, 'company_asaas_charges', accountId, companyId),
    ownedCount(admin, 'company_asaas_charges', accountId, companyId, {
      extra: [{ column: 'status', value: TERMINAL_CHARGE.join(','), op: 'in' }],
    }),
    ownedCount(admin, 'bank_charges', accountId, companyId),
    ownedCount(admin, 'bank_charges', accountId, companyId, {
      extra: [{ column: 'status', value: TERMINAL_CHARGE.join(','), op: 'in' }],
    }),
    ownedCount(admin, 'sales', accountId, companyId, tenantScope),
    ownedCount(admin, 'projects', accountId, companyId, tenantScope),
    ownedCount(admin, 'project_revenue_split_participants', accountId, companyId),
    ownedCount(admin, 'project_revenue_split_participants', accountId, companyId, {
      extra: [{ column: 'active', value: 'true', op: 'eq' }],
    }),
    ownedCount(admin, 'sale_revenue_split_snapshot_participants', accountId, companyId),
    ownedCount(admin, 'financial_account_provider_destinations', accountId, companyId),
  ]);

  const [
    receipts,
    terminalReceipts,
    cash,
    asaas,
    terminalAsaas,
    bank,
    terminalBank,
    sales,
    projects,
    splits,
    activeSplits,
    snapshots,
    destinations,
  ] = groups;

  links.receipts = receipts.owned;
  links.pendingReceipts = Math.max(0, receipts.owned - terminalReceipts.owned);
  links.cashMovements = cash.owned;
  links.asaasCharges = asaas.owned;
  links.pendingAsaasCharges = Math.max(0, asaas.owned - terminalAsaas.owned);
  links.bankCharges = bank.owned;
  links.pendingBankCharges = Math.max(0, bank.owned - terminalBank.owned);
  links.sales = sales.owned;
  links.projects = projects.owned;
  links.splitParticipants = splits.owned;
  links.activeSplitParticipants = activeSplits.owned;
  links.snapshotParticipants = snapshots.owned;
  links.providerDestinations = destinations.owned;
  links.foreignLinks = [receipts, cash, asaas, bank, sales, projects, splits, snapshots, destinations].reduce(
    (sum, group) => sum + group.foreignLinks,
    0,
  );

  if (!bankIntegrationId) return links;

  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, active, status, metadata')
    .eq('id', bankIntegrationId)
    .maybeSingle();
  if (error) {
    throw new FinancialAccountLifecycleError(
      'Não foi possível confirmar a integração desta conta. Nenhuma exclusão ou desativação foi feita.',
      503,
    );
  }
  if (!data) return links;

  const row = data as {
    company_id?: string;
    active?: boolean;
    status?: string;
    metadata?: { c6?: { emission_enabled?: boolean; webhook_bank_confirmed_at?: string } };
  };
  const credentialCount = await countRows(admin, 'bank_credentials', [
    { column: 'integration_id', value: bankIntegrationId, op: 'eq' },
  ]);
  const reservations = await countRows(admin, 'c6_boleto_reservations', [
    { column: 'integration_id', value: bankIntegrationId, op: 'eq' },
    companyFilter(companyId),
  ]);
  const openReservations = await countRows(admin, 'c6_boleto_reservations', [
    { column: 'integration_id', value: bankIntegrationId, op: 'eq' },
    companyFilter(companyId),
    { column: 'status', value: OPEN_C6_RESERVATION.join(','), op: 'in' },
  ]);
  const status = String(row.status || '').toUpperCase();
  links.c6Reservations = reservations;
  links.openC6Reservations = openReservations;
  links.integration = {
    sameCompany: String(row.company_id || '') === companyId,
    active: row.active !== false,
    emissionEnabled: row.metadata?.c6?.emission_enabled === true,
    webhookConfirmed: Boolean(row.metadata?.c6?.webhook_bank_confirmed_at),
    credentialCount,
    connected: status === 'CONNECTED' || status === 'ACTIVE',
  };
  return links;
}

async function loadOwnAccount(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
): Promise<AccountRef & { name: string }> {
  const account = await getCompanyFinancialAccountById(admin, companyId, accountId);
  if (!account || account.companyId !== companyId) {
    throw new FinancialAccountLifecycleError('Conta financeira não encontrada.', 404);
  }
  return {
    id: account.id,
    companyId: account.companyId,
    name: account.name,
    active: account.active,
    bankIntegrationId: account.bankIntegrationId,
    updatedAt: account.updatedAt,
  };
}

export async function inspectCompanyFinancialAccount(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
): Promise<{ accountName: string; updatedAt: string; decision: FinancialAccountLifecycleDecision }> {
  const account = await loadOwnAccount(admin, companyId, accountId);
  const links = await loadCompanyFinancialAccountLinks(
    admin,
    companyId,
    account.id,
    account.bankIntegrationId,
  );
  return {
    accountName: account.name,
    updatedAt: account.updatedAt,
    decision: evaluateCompanyFinancialAccountLifecycle(account, links),
  };
}

function decisionError(decision: FinancialAccountLifecycleDecision, messages: string[]): never {
  const message = messages.filter(Boolean).join(' ');
  throw new FinancialAccountLifecycleError(message, 409, decision);
}

async function compareAccountWrite(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
  expectedUpdatedAt: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('company_financial_accounts')
    .update({ ...patch, updated_at: now })
    .eq('id', accountId)
    .eq('company_id', companyId)
    .eq('updated_at', expectedUpdatedAt)
    .select('id');
  if (error) {
    throw new FinancialAccountLifecycleError(
      'A conta não foi alterada. Um vínculo de integridade impediu a operação.',
      409,
    );
  }
  if (!data || data.length !== 1) {
    throw new FinancialAccountLifecycleError(
      'A conta foi alterada por outra operação. Atualize a tela e tente de novo.',
      409,
    );
  }
}

export async function setCompanyFinancialAccountActive(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
  active: boolean,
  expectedUpdatedAt: string,
): Promise<FinancialAccountLifecycleDecision> {
  const account = await loadOwnAccount(admin, companyId, accountId);
  if (account.updatedAt !== expectedUpdatedAt) {
    throw new FinancialAccountLifecycleError(
      'A conta foi alterada por outra operação. Atualize a tela e tente de novo.',
      409,
    );
  }
  const links = await loadCompanyFinancialAccountLinks(
    admin,
    companyId,
    account.id,
    account.bankIntegrationId,
  );
  const decision = evaluateCompanyFinancialAccountLifecycle(account, links);
  if (active && !decision.canReactivate) {
    decisionError(decision, ['A conta já está ativa.']);
  }
  if (!active && !decision.canDeactivate) {
    decisionError(decision, decision.deactivationBlockers);
  }
  await compareAccountWrite(admin, companyId, account.id, expectedUpdatedAt, {
    active,
    ...(active ? {} : { is_default: false }),
  });
  return evaluateCompanyFinancialAccountLifecycle({ ...account, active }, links);
}

export async function deleteCompanyFinancialAccount(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
  expectedUpdatedAt: string,
  confirmation: string,
): Promise<void> {
  const account = await loadOwnAccount(admin, companyId, accountId);
  if (confirmation.trim() !== account.name.trim()) {
    throw new FinancialAccountLifecycleError(
      'Digite o nome exato da conta para confirmar a exclusão.',
      422,
    );
  }
  if (account.updatedAt !== expectedUpdatedAt) {
    throw new FinancialAccountLifecycleError(
      'A conta foi alterada por outra operação. Atualize a tela e tente de novo.',
      409,
    );
  }
  const { data, error } = await admin.rpc('delete_company_financial_account', {
    p_company_id: companyId,
    p_account_id: account.id,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    throw new FinancialAccountLifecycleError(
      'A exclusão não foi executada. A conferência transacional está indisponível.',
      503,
    );
  }
  const payload = (typeof data === 'string' ? JSON.parse(data) : data) as {
    ok?: boolean;
    code?: string;
    message?: string;
  } | null;
  if (payload?.ok === true && payload.code === 'deleted') return;
  const status = payload?.code === 'not_found' ? 404 : payload?.code === 'invalid' ? 422 : 409;
  throw new FinancialAccountLifecycleError(
    payload?.message || 'A conta não foi excluída.',
    status,
  );
}

export function bankIdentityInputChanged(
  existing: {
    bankName?: string | null;
    bankCode?: string | null;
    agency?: string | null;
    accountNumber?: string | null;
    accountDigit?: string | null;
    bankAccountKind?: string | null;
  },
  input: {
    bankName?: string | null;
    bankCode?: string | null;
    agency?: string | null;
    accountNumber?: string | null;
    accountDigit?: string | null;
    bankAccountKind?: string | null;
  },
): boolean {
  const same = (left: unknown, right: unknown) => String(left ?? '').trim() === String(right ?? '').trim();
  if (input.bankName !== undefined && !same(input.bankName, existing.bankName)) return true;
  if (input.bankCode !== undefined && !same(input.bankCode, existing.bankCode)) return true;
  if (input.agency !== undefined && !same(input.agency, existing.agency)) return true;
  if (input.accountNumber !== undefined && !same(input.accountNumber, existing.accountNumber)) return true;
  if (input.accountDigit !== undefined && !same(input.accountDigit, existing.accountDigit)) return true;
  if (input.bankAccountKind !== undefined && !same(input.bankAccountKind, existing.bankAccountKind)) return true;
  return false;
}

export async function assertFinancialAccountBankIdentityChange(
  admin: SupabaseClient,
  companyId: string,
  accountId: string,
): Promise<void> {
  const inspected = await inspectCompanyFinancialAccount(admin, companyId, accountId);
  if (!inspected.decision.canEditBankIdentity) {
    throw new FinancialAccountLifecycleError(
      inspected.decision.bankIdentityBlockers.join(' '),
      409,
      inspected.decision,
    );
  }
}
