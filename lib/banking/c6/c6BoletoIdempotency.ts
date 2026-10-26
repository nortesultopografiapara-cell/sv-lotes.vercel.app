/**
 * Idempotência persistente B_01: empresa + integração + external_reference_id.
 * Usa bank_integrations.metadata (coluna já existente). Sem migration.
 *
 * A rota bloqueada (HTTP 409) apenas CONSULTA. Reserva/gravação fica para
 * emissão autorizada futura — preparar agora não pode queimar a referência.
 *
 * Limitação: update JSON sem RPC CAS não é atômico sob corrida extrema.
 * Unicidade estrita no banco exigiria índice UNIQUE (migration futura).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { C6BoletoValidationError } from '@/lib/banking/c6/c6BoletoValidation';

export const C6_HOMOLOG_IDEMPOTENCY_META_KEY = 'c6_homolog_idempotency';

export type C6HomologIdempotencyStatus = 'reserved' | 'emitted';

export type C6HomologIdempotencyEntry = {
  status: C6HomologIdempotencyStatus;
  companyId: string;
  integrationId: string;
  externalReferenceId: string;
  at: string;
  httpStatus: number | null;
};

export type C6HomologIdempotencyIndex = Record<string, C6HomologIdempotencyEntry>;

export function c6HomologIdempotencyKey(
  companyId: string,
  integrationId: string,
  externalReferenceId: string,
): string {
  return `${String(companyId || '').trim()}::${String(integrationId || '').trim()}::${String(externalReferenceId || '').trim()}`;
}

export function parseC6HomologIdempotency(
  metadata: unknown,
): C6HomologIdempotencyIndex {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const raw = (metadata as Record<string, unknown>)[C6_HOMOLOG_IDEMPOTENCY_META_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: C6HomologIdempotencyIndex = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const status = String(row.status || '');
    if (status !== 'reserved' && status !== 'emitted') continue;
    const companyId = String(row.companyId || '').trim();
    const integrationId = String(row.integrationId || '').trim();
    const externalReferenceId = String(row.externalReferenceId || key).trim();
    if (!companyId || !integrationId || !externalReferenceId) continue;
    out[c6HomologIdempotencyKey(companyId, integrationId, externalReferenceId)] = {
      status,
      companyId,
      integrationId,
      externalReferenceId,
      at: String(row.at || ''),
      httpStatus: typeof row.httpStatus === 'number' ? row.httpStatus : null,
    };
  }
  return out;
}

export function assertC6HomologRefAvailable(
  index: C6HomologIdempotencyIndex,
  companyId: string,
  integrationId: string,
  externalReferenceId: string,
): void {
  const key = c6HomologIdempotencyKey(companyId, integrationId, externalReferenceId);
  const existing = index[key];
  if (!existing) return;
  throw new C6BoletoValidationError(
    `external_reference_id já ${existing.status === 'emitted' ? 'emitido' : 'reservado'} para esta empresa/integração.`,
    ['external_reference_id'],
  );
}

export function mergeC6HomologIdempotencyMetadata(
  metadata: unknown,
  entry: C6HomologIdempotencyEntry,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const current = parseC6HomologIdempotency(base);
  const key = c6HomologIdempotencyKey(
    entry.companyId,
    entry.integrationId,
    entry.externalReferenceId,
  );
  current[key] = entry;
  const serializable: Record<string, C6HomologIdempotencyEntry> = {};
  for (const [k, v] of Object.entries(current)) serializable[k] = v;
  return {
    ...base,
    [C6_HOMOLOG_IDEMPOTENCY_META_KEY]: serializable,
  };
}

export async function loadC6HomologIdempotency(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
): Promise<{ metadata: Record<string, unknown>; index: C6HomologIdempotencyIndex }> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, metadata')
    .eq('id', integrationId)
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) {
    return { metadata: {}, index: {} };
  }
  const metadata =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  return { metadata, index: parseC6HomologIdempotency(metadata) };
}

/**
 * Reserva persistente — somente para emissão autorizada futura.
 * Não chamar na rota 409 de preparação.
 */
export async function reserveC6HomologIdempotency(
  admin: SupabaseClient,
  entry: C6HomologIdempotencyEntry,
): Promise<void> {
  const { metadata, index } = await loadC6HomologIdempotency(
    admin,
    entry.companyId,
    entry.integrationId,
  );
  assertC6HomologRefAvailable(
    index,
    entry.companyId,
    entry.integrationId,
    entry.externalReferenceId,
  );
  const next = mergeC6HomologIdempotencyMetadata(metadata, entry);
  const { error } = await admin
    .from('bank_integrations')
    .update({ metadata: next, updated_at: new Date().toISOString() })
    .eq('id', entry.integrationId)
    .eq('company_id', entry.companyId)
    .eq('provider', 'C6');
  if (error) throw new Error(error.message);
}
