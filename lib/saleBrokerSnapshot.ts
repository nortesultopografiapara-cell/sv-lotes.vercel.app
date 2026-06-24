/**
 * Anexa dados do corretor ao objeto sale para geração de contrato.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BROKERS_COMMISSION_CONTRACT_SELECT,
  BROKERS_CONTRACT_SELECT,
} from '@/lib/brokersContractQuery';

export type BrokerSnapshot = {
  name: string;
  cpf: string;
  document: string;
  creci: string;
  role?: string;
};

export type ResolvedSaleBroker = {
  brokerId: string;
  hasBroker: boolean;
  nome: string;
  documento: string;
  creci: string;
  role: string;
};

const BROKER_ID_KEYS = [
  'broker_id',
  'brokerId',
  'corretor_id',
  'realtor_id',
] as const;

const BROKER_NAME_KEYS = ['name', 'nome', 'full_name', 'broker_name'] as const;

function clean(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text;
}

function isDevBrokerDiagnosticsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function logSaleBrokerResolutionDiagnostics(
  label: string,
  payload: Record<string, unknown>,
): void {
  if (!isDevBrokerDiagnosticsEnabled()) return;
  console.log(`[SALE_BROKER_RESOLVE] ${label}`, payload);
}

export function normalizeBrokerRelationRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === 'object');
    return first && typeof first === 'object'
      ? (first as Record<string, unknown>)
      : null;
  }
  if (typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

export function resolveBrokerDisplayName(
  ...sources: Array<Record<string, unknown> | null | undefined>
): string {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of BROKER_NAME_KEYS) {
      const name = clean(source[key]);
      if (name) return name;
    }
  }
  return '';
}

export function resolveSaleBrokerId(
  ...sources: Array<Record<string, unknown> | null | undefined>
): string {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of BROKER_ID_KEYS) {
      const id = clean(source[key]);
      if (id) return id;
    }
  }
  return '';
}

export function brokerRowToSnapshot(
  row: Record<string, unknown> | null | undefined,
): BrokerSnapshot | null {
  if (!row || typeof row !== 'object') return null;
  const name = resolveBrokerDisplayName(row);
  if (!name) return null;
  const cpf = clean(row.cpf || row.document);
  const creci = clean(row.creci);
  const role = clean(row.role);
  return {
    name,
    cpf,
    document: cpf,
    creci,
    role,
  };
}

export function resolveBrokerFromSaleRecord(
  sale: Record<string, unknown>,
  options?: {
    contract?: Record<string, unknown> | null;
    block?: Record<string, unknown> | null;
    contractSnapshot?: Record<string, unknown> | null;
  },
): ResolvedSaleBroker {
  const brokerId = resolveSaleBrokerId(
    sale,
    options?.contract,
    options?.block,
    options?.contractSnapshot,
  );

  const brokersRec = normalizeBrokerRelationRecord(sale.brokers);
  const brokerRec =
    normalizeBrokerRelationRecord(sale.broker) ?? brokersRec;
  const snapshotRec = normalizeBrokerRelationRecord(sale.broker_snapshot);

  const nome = resolveBrokerDisplayName(
    brokersRec,
    brokerRec,
    snapshotRec,
    sale,
  );

  const documento = clean(
    brokersRec?.document ??
      brokersRec?.cpf ??
      brokerRec?.document ??
      brokerRec?.cpf ??
      sale.broker_cpf,
  );
  const creci = clean(
    brokersRec?.creci ?? brokerRec?.creci ?? sale.broker_creci,
  );
  const role = clean(
    brokersRec?.role ?? brokerRec?.role ?? sale.broker_role,
  );

  const hasBroker = Boolean(nome || brokerId);

  logSaleBrokerResolutionDiagnostics('record', {
    brokerId: brokerId || null,
    nome: nome || null,
    hasBroker,
    sourceKeys: {
      sale_broker_id: clean(sale.broker_id) || null,
      contract_broker_id: clean(options?.contract?.broker_id) || null,
      block_broker_id: clean(options?.block?.broker_id) || null,
      broker_name: clean(sale.broker_name) || null,
    },
  });

  return {
    brokerId,
    hasBroker: hasBroker && Boolean(nome),
    nome,
    documento,
    creci,
    role,
  };
}

export function attachBrokerSnapshotToSale(
  sale: Record<string, unknown>,
  broker: BrokerSnapshot | null | undefined,
): Record<string, unknown> {
  if (!broker?.name) return sale;
  return {
    ...sale,
    brokers: broker,
    broker: broker,
    broker_name: broker.name,
    broker_cpf: broker.cpf,
    broker_creci: broker.creci,
    broker_role: broker.role || null,
  };
}

async function fetchBrokerRowById(
  supabase: SupabaseClient,
  brokerId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('brokers')
    .select(BROKERS_CONTRACT_SELECT)
    .eq('id', brokerId)
    .maybeSingle();

  if (error) {
    logSaleBrokerResolutionDiagnostics('fetch_error', {
      brokerId,
      message: error.message,
    });
    return null;
  }

  return (data as Record<string, unknown>) || null;
}

async function resolveBrokerIdFromCommission(
  supabase: SupabaseClient,
  saleId: string,
): Promise<{ brokerId: string; row: Record<string, unknown> | null }> {
  const { data, error } = await supabase
    .from('broker_commissions')
    .select(BROKERS_COMMISSION_CONTRACT_SELECT)
    .eq('sale_id', saleId)
    .not('broker_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { brokerId: '', row: null };
  }

  const row = data as Record<string, unknown>;
  const brokerId = clean(row.broker_id);
  const joinedBroker = normalizeBrokerRelationRecord(row.brokers);
  return { brokerId, row: joinedBroker };
}

export async function enrichSaleWithBrokerForContract(
  supabase: SupabaseClient,
  sale: Record<string, unknown>,
  options?: {
    contract?: Record<string, unknown> | null;
    block?: Record<string, unknown> | null;
    contractSnapshot?: Record<string, unknown> | null;
  },
): Promise<Record<string, unknown>> {
  const resolved = resolveBrokerFromSaleRecord(sale, options);
  if (resolved.nome) {
    return attachBrokerSnapshotToSale(
      sale,
      brokerRowToSnapshot({
        name: resolved.nome,
        cpf: resolved.documento,
        document: resolved.documento,
        creci: resolved.creci,
        role: resolved.role,
      }),
    );
  }

  let brokerId = resolved.brokerId;
  let brokerRow: Record<string, unknown> | null = null;

  if (!brokerId) {
    const saleId = clean(sale.id);
    if (saleId) {
      const fromCommission = await resolveBrokerIdFromCommission(supabase, saleId);
      brokerId = fromCommission.brokerId;
      brokerRow = fromCommission.row;
    }
  }

  if (!brokerId) return sale;

  if (!brokerRow) {
    brokerRow = await fetchBrokerRowById(supabase, brokerId);
  }

  const snapshot = brokerRowToSnapshot(brokerRow);
  logSaleBrokerResolutionDiagnostics('enriched', {
    brokerId,
    fetchedName: snapshot?.name || null,
  });

  return attachBrokerSnapshotToSale(
    {
      ...sale,
      broker_id: sale.broker_id || brokerId,
    },
    snapshot,
  );
}
