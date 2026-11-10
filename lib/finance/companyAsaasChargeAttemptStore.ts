/**
 * Persistência da reserva anterior à chamada Asaas.
 * A tabela precisa existir antes de qualquer POST. Sem ela, a emissão para.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASAAS_CHARGE_ATTEMPT_LEASE_MS,
  buildAsaasChargeIdempotencyKey,
  type AsaasChargeAttemptRow,
  type AsaasChargeAttemptStatus,
  type GuardedAsaasCreatePorts,
} from '@/lib/finance/asaasChargeAttempt';

const TABLE = 'company_asaas_charge_attempts';

export class AsaasChargeAttemptSchemaError extends Error {
  constructor() {
    super('A reserva de cobrança Asaas não está disponível neste banco. Nenhuma cobrança foi enviada ao Asaas.');
    this.name = 'AsaasChargeAttemptSchemaError';
  }
}

type AttemptRecord = {
  status: AsaasChargeAttemptStatus;
  owner_token: string;
  lease_until: string;
  asaas_payment_id: string | null;
  idempotency_key: string;
};

function isMissingAttemptTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    message.includes('company_asaas_charge_attempts') ||
    message.includes('schema cache')
  );
}

function throwIfSchema(error: { code?: string; message?: string } | null): void {
  if (isMissingAttemptTable(error)) throw new AsaasChargeAttemptSchemaError();
  if (error) throw new Error(error.message || 'Falha ao reservar a cobrança Asaas.');
}

function mapAttempt(row: AttemptRecord | null): AsaasChargeAttemptRow | null {
  if (!row) return null;
  return {
    status: row.status,
    ownerToken: row.owner_token,
    leaseUntilMs: new Date(row.lease_until).getTime(),
    asaasPaymentId: row.asaas_payment_id,
    idempotencyKey: row.idempotency_key,
  };
}

export function createSupabaseAsaasChargeAttemptPorts<T>(
  admin: SupabaseClient,
  input: {
    companyId: string;
    installmentId: string;
    saleId?: string | null;
    projectId?: string | null;
    scheduleGroup?: string | null;
  },
): Omit<GuardedAsaasCreatePorts<T>, 'findRemote' | 'createRemote'> {
  const idempotencyKey = buildAsaasChargeIdempotencyKey(input.companyId, input.installmentId);
  const scope = () =>
    admin
      .from(TABLE)
      .select('status, owner_token, lease_until, asaas_payment_id, idempotency_key')
      .eq('company_id', input.companyId)
      .eq('installment_id', input.installmentId);

  return {
    now: () => Date.now(),
    leaseMs: ASAAS_CHARGE_ATTEMPT_LEASE_MS,
    newOwnerToken: () => crypto.randomUUID(),
    loadAttempt: async () => {
      const { data, error } = await scope().maybeSingle();
      throwIfSchema(error);
      return mapAttempt((data as AttemptRecord | null) ?? null);
    },
    insertAttempt: async (row) => {
      const { error } = await admin.from(TABLE).insert({
        company_id: input.companyId,
        installment_id: input.installmentId,
        sale_id: input.saleId || null,
        project_id: input.projectId || null,
        schedule_group: input.scheduleGroup || null,
        idempotency_key: idempotencyKey,
        status: 'reserved',
        owner_token: row.ownerToken,
        lease_until: new Date(row.leaseUntilMs).toISOString(),
      });
      if (!error) return 'inserted';
      if (error.code === '23505') return 'conflict';
      throwIfSchema(error);
      return 'conflict';
    },
    stealAttempt: async (ownerToken, leaseUntilMs) => {
      const current = await scope().maybeSingle();
      throwIfSchema(current.error);
      const row = current.data as AttemptRecord | null;
      if (!row) return false;
      const leaseOpen = new Date(row.lease_until).getTime() > Date.now();
      if (row.status === 'unknown' || row.status === 'completed') return false;
      const blocked = row.status === 'reserved' && leaseOpen && row.owner_token !== ownerToken;
      if (blocked) return false;
      const { data, error } = await admin
        .from(TABLE)
        .update({
          status: 'reserved',
          owner_token: ownerToken,
          lease_until: new Date(leaseUntilMs).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', input.companyId)
        .eq('installment_id', input.installmentId)
        .eq('owner_token', row.owner_token)
        .eq('status', row.status)
        .select('owner_token')
        .maybeSingle();
      throwIfSchema(error);
      return (data as { owner_token?: string } | null)?.owner_token === ownerToken;
    },
    confirmOwner: async (ownerToken) => {
      const { data, error } = await scope().eq('owner_token', ownerToken).maybeSingle();
      throwIfSchema(error);
      if (!data) return false;
      return new Date((data as AttemptRecord).lease_until).getTime() > Date.now();
    },
    markUnknown: async (ownerToken) => {
      const { error } = await admin
        .from(TABLE)
        .update({ status: 'unknown', updated_at: new Date().toISOString() })
        .eq('company_id', input.companyId)
        .eq('installment_id', input.installmentId)
        .eq('owner_token', ownerToken);
      throwIfSchema(error);
    },
    markFailed: async (ownerToken, message) => {
      const { error } = await admin
        .from(TABLE)
        .update({
          status: 'failed',
          last_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', input.companyId)
        .eq('installment_id', input.installmentId)
        .eq('owner_token', ownerToken);
      throwIfSchema(error);
    },
    markCompleted: async (ownerToken, asaasPaymentId) => {
      const { error } = await admin
        .from(TABLE)
        .update({
          status: 'completed',
          asaas_payment_id: asaasPaymentId,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', input.companyId)
        .eq('installment_id', input.installmentId);
      void ownerToken;
      throwIfSchema(error);
    },
  };
}
