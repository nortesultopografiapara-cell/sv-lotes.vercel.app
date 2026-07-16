/**
 * Sincronização do extrato Asaas → cash_movements (tenant).
 * Escopo: company — nunca usa credencial Master SaaS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BankEnvironment } from '@/lib/banking/types';
import {
  mapCompanyAsaasFinancialTransaction,
  type MappedCompanyAsaasCashMovement,
} from '@/lib/finance/companyAsaasFinancialTransactions';
import {
  listAsaasCompanyFinancialTransactions,
  type AsaasCompanyFinancialTransaction,
} from '@/lib/finance/asaasCompanyClient';
import { buildCashMovementEntradaPayload } from '@/lib/finance/cashMovementsSchema';
import {
  getCompanyFinancialAccountById,
  listCompanyFinancialAccounts,
  loadAsaasApiKeyForFinancialAccount,
} from '@/lib/finance/companyFinancialAccountRepository';
import type { CompanyFinancialAccountResponse } from '@/lib/finance/companyFinancialAccountTypes';
import { getCompanyAsaasIntegrationConfig } from '@/lib/finance/asaasIntegrationRepository';
import { patchAsaasIntegrationMetadata } from '@/lib/finance/asaasIntegrationRepository';
import { isCompanyAsaasIntegrationReady } from '@/lib/finance/companyAsaasChargeTypes';
import type { AsaasIntegrationCashSyncMeta } from '@/lib/finance/asaasIntegrationConfig';

export type CompanyAsaasCashSyncScope = 'company';

export type CompanyAsaasCashSyncInput = {
  scope: CompanyAsaasCashSyncScope;
  companyId: string;
  financialAccountId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  userId?: string | null;
};

export type CompanyAsaasCashSyncResult = {
  ok: boolean;
  scope: CompanyAsaasCashSyncScope;
  companyId: string;
  financialAccountId: string;
  environment: BankEnvironment;
  period: { fromDate: string; toDate: string };
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  skippedDuplicate: number;
  skippedWebhookIncome: number;
  skippedReconciledPayment: number;
  skippedBeforeActivation: number;
  errors: number;
  errorMessages: string[];
  unknown: number;
  unknownTypes: string[];
  sampleTypes: string[];
  message: string;
  cashSync: AsaasIntegrationCashSyncMeta;
};

export type CompanyAsaasCashSyncDeps = {
  fetchTransactions?: (
    apiKey: string,
    environment: BankEnvironment,
    from: string,
    to: string,
  ) => Promise<AsaasCompanyFinancialTransaction[]>;
  mapTransaction?: typeof mapCompanyAsaasFinancialTransaction;
  getIntegration?: typeof getCompanyAsaasIntegrationConfig;
  resolveAccount?: typeof resolveFinancialAccountForSync;
  loadCredentials?: typeof loadAsaasApiKeyForFinancialAccount;
  patchMetadata?: typeof patchAsaasIntegrationMetadata;
};

const SYNC_LOCK_TTL_MS = 5 * 60 * 1000;
const FIRST_SYNC_LOOKBACK_DAYS = 90;
const INCREMENTAL_OVERLAP_DAYS = 1;

const activeSyncLocks = new Map<string, number>();

function money(value: number): number {
  return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
}

function formatDateOnly(value: Date): string {
  return value.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnly(d);
}

function acquireSyncLock(companyId: string, financialAccountId: string): boolean {
  const key = `${companyId}:${financialAccountId}`;
  const now = Date.now();
  const existing = activeSyncLocks.get(key);
  if (existing && now - existing < SYNC_LOCK_TTL_MS) return false;
  activeSyncLocks.set(key, now);
  return true;
}

function releaseSyncLock(companyId: string, financialAccountId: string): void {
  activeSyncLocks.delete(`${companyId}:${financialAccountId}`);
}

export function resolveCompanyAsaasCashSyncPeriod(input: {
  requestedFrom?: string | null;
  requestedTo?: string | null;
  accountConfiguredAt?: string | null;
  lastCashSyncAt?: string | null;
}): { fromDate: string; toDate: string } {
  const today = formatDateOnly(new Date());
  const toDate = String(input.requestedTo || today).split('T')[0] || today;

  if (input.requestedFrom) {
    return {
      fromDate: String(input.requestedFrom).split('T')[0],
      toDate,
    };
  }

  if (input.lastCashSyncAt) {
    const lastDay = String(input.lastCashSyncAt).split('T')[0];
    return {
      fromDate: addDays(lastDay, -INCREMENTAL_OVERLAP_DAYS),
      toDate,
    };
  }

  const configuredDay = input.accountConfiguredAt
    ? String(input.accountConfiguredAt).split('T')[0]
    : null;
  const lookbackStart = addDays(toDate, -FIRST_SYNC_LOOKBACK_DAYS);
  const fromDate =
    configuredDay && configuredDay > lookbackStart ? configuredDay : lookbackStart;

  return { fromDate, toDate };
}

async function resolveFinancialAccountForSync(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId?: string | null,
): Promise<CompanyFinancialAccountResponse> {
  if (financialAccountId) {
    const account = await getCompanyFinancialAccountById(admin, companyId, financialAccountId);
    if (!account || !account.active) {
      throw new Error('Conta financeira não encontrada ou inativa para esta empresa.');
    }
    if (!account.bankIntegrationId) {
      throw new Error('Conta financeira sem integração Asaas configurada.');
    }
    return account;
  }

  const accounts = await listCompanyFinancialAccounts(admin, companyId, { activeOnly: true });
  const ready = accounts.filter((account) => {
    const hasKey =
      account.environment === 'PRODUCTION'
        ? account.hasProductionApiKey
        : account.hasSandboxApiKey;
    return hasKey && account.bankIntegrationId && account.connectionStatus !== 'ERROR';
  });

  const selected = ready.find((a) => a.isDefault) || ready[0];
  if (!selected) {
    throw new Error('Nenhuma conta financeira Asaas ativa com API Key validada.');
  }
  return selected;
}

async function findExistingByAsaasMovementId(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string,
  asaasMovementId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('cash_movements')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'ativo')
    .filter('metadata->>asaas_movement_id', 'eq', asaasMovementId)
    .filter('metadata->>financial_account_id', 'eq', financialAccountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

async function isPaymentAlreadyReconciled(
  admin: SupabaseClient,
  companyId: string,
  paymentId?: string | null,
): Promise<boolean> {
  const id = String(paymentId || '').trim();
  if (!id) return false;

  const { data: charge, error: chargeErr } = await admin
    .from('company_asaas_charges')
    .select('id, cash_movement_id, installment_id')
    .eq('company_id', companyId)
    .eq('asaas_payment_id', id)
    .maybeSingle();
  if (chargeErr) throw new Error(chargeErr.message);

  if (charge?.cash_movement_id) return true;

  const { data: byPayment, error: paymentErr } = await admin
    .from('cash_movements')
    .select('id')
    .eq('company_id', companyId)
    .eq('type', 'entrada')
    .eq('status', 'ativo')
    .filter('metadata->>asaas_payment_id', 'eq', id)
    .limit(1)
    .maybeSingle();
  if (paymentErr) throw new Error(paymentErr.message);
  if (byPayment?.id) return true;

  if (charge?.installment_id) {
    const { data: byInstallment, error: instErr } = await admin
      .from('cash_movements')
      .select('id')
      .eq('company_id', companyId)
      .eq('type', 'entrada')
      .eq('status', 'ativo')
      .filter('metadata->>installment_id', 'eq', String(charge.installment_id))
      .filter('metadata->>provider', 'eq', 'ASAAS_COMPANY')
      .limit(1)
      .maybeSingle();
    if (instErr) throw new Error(instErr.message);
    if (byInstallment?.id) return true;
  }

  return false;
}

function buildCashMovementInsert(
  companyId: string,
  financialAccountId: string,
  environment: BankEnvironment,
  mapped: MappedCompanyAsaasCashMovement,
  userId?: string | null,
): Record<string, unknown> {
  const movementDate = String(mapped.movement_date || '').split('T')[0];
  const base = {
    tenant_id: companyId,
    company_id: companyId,
    type: mapped.type,
    category: mapped.category || 'Asaas',
    description: mapped.description || mapped.category || 'Movimentação Asaas',
    amount: money(mapped.amount || 0),
    movement_date: movementDate,
    status: 'ativo',
    created_by: userId ?? null,
    metadata: {
      ...(mapped.metadata || {}),
      provider: 'ASAAS_COMPANY_EXTRACT',
      financial_account_id: financialAccountId,
      environment,
      asaas_payment_id: mapped.asaas_payment_id ?? null,
      sync_scope: 'company',
    },
  };

  return mapped.type === 'entrada'
    ? buildCashMovementEntradaPayload(base)
    : base;
}

async function insertMappedCompanyCashMovement(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string,
  environment: BankEnvironment,
  mapped: MappedCompanyAsaasCashMovement,
  userId?: string | null,
): Promise<{ created: boolean; movementId: string | null }> {
  const movementId = String(mapped.metadata?.asaas_movement_id || '').trim();
  if (!movementId || mapped.skip || !mapped.type || !mapped.amount) {
    return { created: false, movementId: null };
  }

  const existingId = await findExistingByAsaasMovementId(
    admin,
    companyId,
    financialAccountId,
    movementId,
  );
  if (existingId) return { created: false, movementId: existingId };

  const payload = buildCashMovementInsert(
    companyId,
    financialAccountId,
    environment,
    mapped,
    userId,
  );

  const { data, error } = await admin
    .from('cash_movements')
    .insert([payload])
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const dup = await findExistingByAsaasMovementId(
        admin,
        companyId,
        financialAccountId,
        movementId,
      );
      if (dup) return { created: false, movementId: dup };
    }
    throw new Error(error.message);
  }

  return { created: true, movementId: data?.id ? String(data.id) : null };
}

export async function syncCompanyAsaasCashMovements(
  admin: SupabaseClient,
  input: CompanyAsaasCashSyncInput,
  deps: CompanyAsaasCashSyncDeps = {},
): Promise<CompanyAsaasCashSyncResult> {
  if (input.scope !== 'company') {
    throw new Error('Escopo de sincronização inválido.');
  }

  const companyId = String(input.companyId || '').trim();
  if (!companyId) throw new Error('Empresa não identificada.');

  const integration = await (deps.getIntegration ?? getCompanyAsaasIntegrationConfig)(
    admin,
    companyId,
  );
  if (!isCompanyAsaasIntegrationReady(integration)) {
    throw new Error('Integração Asaas da empresa não está ativa ou validada.');
  }

  const account = await (deps.resolveAccount ?? resolveFinancialAccountForSync)(
    admin,
    companyId,
    input.financialAccountId,
  );

  if (!acquireSyncLock(companyId, account.id)) {
    throw new Error('Já existe uma sincronização Asaas em andamento para esta conta.');
  }

  const fetchTransactions =
    deps?.fetchTransactions ?? listAsaasCompanyFinancialTransactions;
  const mapTransaction = deps?.mapTransaction ?? mapCompanyAsaasFinancialTransaction;

  let credentials: Awaited<ReturnType<typeof loadAsaasApiKeyForFinancialAccount>>;
  try {
    credentials = await (deps.loadCredentials ?? loadAsaasApiKeyForFinancialAccount)(
      admin,
      account.id,
      companyId,
      account.environment,
    );
  } finally {
    /* lock released in finally below */
  }

  if (credentials.financialAccountId !== account.id) {
    releaseSyncLock(companyId, account.id);
    throw new Error('Conta financeira não pertence à empresa autenticada.');
  }

  const period = resolveCompanyAsaasCashSyncPeriod({
    requestedFrom: input.fromDate,
    requestedTo: input.toDate,
    accountConfiguredAt: account.createdAt,
    lastCashSyncAt: integration.cashSync?.lastAt ?? null,
  });

  const activationDay = String(account.createdAt || '').split('T')[0] || null;

  let fetched = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let skippedDuplicate = 0;
  let skippedWebhookIncome = 0;
  let skippedReconciledPayment = 0;
  let skippedBeforeActivation = 0;
  let errors = 0;
  const errorMessages: string[] = [];
  let unknown = 0;
  const unknownTypes = new Set<string>();
  const typeSamples = new Map<string, number>();

  try {
    const transactions = await fetchTransactions(
      credentials.apiKey,
      credentials.environment,
      period.fromDate,
      period.toDate,
    );
    fetched = transactions.length;

    for (const tx of transactions) {
      const asaasType = String(tx.type || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
      typeSamples.set(asaasType, (typeSamples.get(asaasType) || 0) + 1);

      const movementDate = String(tx.date || '').split('T')[0];
      if (activationDay && movementDate && movementDate < activationDay) {
        skipped += 1;
        skippedBeforeActivation += 1;
        continue;
      }

      const mapped = mapTransaction(tx);
      if (mapped.skip) {
        skipped += 1;
        if (mapped.skipReason === 'webhook_income') {
          const paymentId = String(tx.paymentId || mapped.asaas_payment_id || '').trim();
          if (paymentId && (await isPaymentAlreadyReconciled(admin, companyId, paymentId))) {
            skippedReconciledPayment += 1;
          } else {
            skippedWebhookIncome += 1;
          }
        }
        if (mapped.skipReason === 'unknown_type') {
          unknown += 1;
          unknownTypes.add(asaasType);
        }
        continue;
      }

      const paymentId = String(tx.paymentId || mapped.asaas_payment_id || '').trim();
      if (paymentId && (await isPaymentAlreadyReconciled(admin, companyId, paymentId))) {
        skipped += 1;
        skippedReconciledPayment += 1;
        continue;
      }

      try {
        const result = await insertMappedCompanyCashMovement(
          admin,
          companyId,
          account.id,
          credentials.environment,
          mapped,
          input.userId,
        );
        if (result.created) {
          created += 1;
        } else {
          skipped += 1;
          skippedDuplicate += 1;
        }
      } catch (err) {
        errors += 1;
        const msg = err instanceof Error ? err.message : String(err);
        if (errorMessages.length < 5) errorMessages.push(msg);
      }
    }
  } catch (err) {
    releaseSyncLock(companyId, account.id);
    throw err;
  }

  releaseSyncLock(companyId, account.id);

  const sampleTypes = [...typeSamples.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([type, count]) => `${type}(${count})`);

  const messageParts: string[] = [];
  if (created > 0) messageParts.push(`${created} nova(s)`);
  if (skippedDuplicate > 0) messageParts.push(`${skippedDuplicate} já existente(s)`);
  if (skippedReconciledPayment > 0) {
    messageParts.push(`${skippedReconciledPayment} recebimento(s) já conciliado(s)`);
  }
  if (errors > 0) messageParts.push(`${errors} falha(s)`);

  const message =
    messageParts.length > 0
      ? `Sincronização concluída: ${messageParts.join(', ')}.`
      : 'Sincronização concluída: nenhuma movimentação nova.';

  const cashSync: AsaasIntegrationCashSyncMeta = {
    lastAt: new Date().toISOString(),
    financialAccountId: account.id,
    environment: credentials.environment,
    periodFrom: period.fromDate,
    periodTo: period.toDate,
    fetched,
    created,
    updated,
    skipped,
    errors,
    initiatedBy: input.userId ?? null,
    message,
  };

  await (deps.patchMetadata ?? patchAsaasIntegrationMetadata)(admin, companyId, { cashSync });

  return {
    ok: errors === 0 || created > 0 || skippedDuplicate > 0,
    scope: 'company',
    companyId,
    financialAccountId: account.id,
    environment: credentials.environment,
    period,
    fetched,
    created,
    updated,
    skipped,
    skippedDuplicate,
    skippedWebhookIncome,
    skippedReconciledPayment,
    skippedBeforeActivation,
    errors,
    errorMessages,
    unknown,
    unknownTypes: [...unknownTypes],
    sampleTypes,
    message,
    cashSync,
  };
}

/** Utilitário de teste — limpa locks em memória. */
export function resetCompanyAsaasCashSyncLocksForTests(): void {
  activeSyncLocks.clear();
}
