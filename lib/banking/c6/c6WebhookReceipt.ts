/**
 * Identificador da URL de recebimento. Não cadastra o webhook no C6
 * e não prova, sozinho, que a notificação veio do banco.
 */

import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { C6WebhookPublicStatus } from '@/lib/banking/c6/c6ConfigTypes';
import { sameSecret } from '@/lib/banking/c6/c6WebhookNotification';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isC6WebhookReceiptToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export const C6_WEBHOOK_PUBLIC_ORIGIN = 'https://www.svlotes.com.br';

export function c6WebhookReceiptPath(token: string): string {
  return `/api/banking/c6/webhook/${token}`;
}

export function c6WebhookPublicUrl(token: string): string {
  return `${C6_WEBHOOK_PUBLIC_ORIGIN}${c6WebhookReceiptPath(token)}`;
}

export function c6WebhookRegistrationLabel(
  confirmed: boolean,
): C6WebhookPublicStatus['registrationLabel'] {
  return confirmed ? 'Webhook cadastrado no Banco C6' : 'Não cadastrado no Banco C6';
}

export function readC6WebhookBankConfirmation(metadata: unknown): boolean {
  const c6 = asRecord(asRecord(metadata).c6);
  return (
    c6.webhook_bank_service === 'BANK_SLIP' &&
    typeof c6.webhook_bank_confirmed_at === 'string' &&
    Boolean(readToken(metadata))
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readToken(metadata: unknown): string {
  const token = asRecord(asRecord(metadata).c6).webhook_receipt_token;
  return typeof token === 'string' && isC6WebhookReceiptToken(token) ? token : '';
}

export async function ensureC6WebhookReceiptToken(
  admin: SupabaseClient,
  companyId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, provider, metadata')
    .eq('company_id', companyId)
    .eq('provider', 'C6');
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (rows.length !== 1) throw new Error('Integração C6 da empresa não encontrada.');
  const row = rows[0];
  if (String(row.company_id) !== companyId || String(row.provider) !== 'C6') {
    throw new Error('Integração C6 da empresa não encontrada.');
  }
  const current = readToken(row.metadata);
  if (current) return current;
  const metadata = asRecord(row.metadata);
  const c6 = asRecord(metadata.c6);
  const token = randomBytes(32).toString('base64url');
  const { error: updateError } = await admin
    .from('bank_integrations')
    .update({
      metadata: { ...metadata, c6: { ...c6, webhook_receipt_token: token } },
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('company_id', companyId)
    .eq('provider', 'C6');
  if (updateError) throw new Error(updateError.message);
  return token;
}

export type C6WebhookIntegration = {
  id: string;
  companyId: string;
  clientId: string;
  metadata: unknown;
};

export async function findC6IntegrationByReceiptToken(
  admin: SupabaseClient,
  token: string,
): Promise<C6WebhookIntegration | null> {
  if (!isC6WebhookReceiptToken(token)) return null;
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, provider, client_id, metadata')
    .eq('provider', 'C6');
  if (error) throw new Error(error.message);
  const matches = (data || []).filter((row) => {
    if (String(row.provider) !== 'C6') return false;
    return sameSecret(readToken(row.metadata), token);
  });
  if (matches.length !== 1) return null;
  const row = matches[0];
  return {
    id: String(row.id),
    companyId: String(row.company_id || ''),
    clientId: String(row.client_id || ''),
    metadata: row.metadata,
  };
}

export async function readC6WebhookPanel(
  admin: SupabaseClient,
  companyId: string,
): Promise<C6WebhookPublicStatus> {
  const empty: C6WebhookPublicStatus = {
    registeredAtBank: false,
    registrationLabel: c6WebhookRegistrationLabel(false),
    automaticReconciliation: 'Desligada',
    receiptPath: null,
    lastReceivedAt: null,
    lastProcessedAt: null,
    lastError: null,
  };
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, provider, metadata')
    .eq('company_id', companyId)
    .eq('provider', 'C6');
  if (error) throw new Error(error.message);
  if ((data || []).length !== 1) return empty;
  const row = data[0];
  const token = readToken(row.metadata);
  const { data: events, error: eventError } = await admin
    .from('bank_webhook_events')
    .select('created_at, processed_at, processing_status, error_message, provider, company_id')
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .order('created_at', { ascending: false })
    .limit(20);
  if (eventError) throw new Error(eventError.message);
  const rows = (events || []).filter(
    (event) => String(event.company_id || '') === companyId && String(event.provider) === 'C6',
  );
  const latest = rows[0];
  const processed = rows.find((event) =>
    ['PROCESSED', 'DUPLICATE', 'IGNORED'].includes(String(event.processing_status)),
  );
  const failed = rows.find((event) => String(event.processing_status) === 'FAILED');
  const confirmed = readC6WebhookBankConfirmation(row.metadata);
  return {
    ...empty,
    registeredAtBank: confirmed,
    registrationLabel: c6WebhookRegistrationLabel(confirmed),
    receiptPath: token ? c6WebhookReceiptPath(token) : null,
    lastReceivedAt: latest?.created_at ? String(latest.created_at) : null,
    lastProcessedAt: processed?.processed_at ? String(processed.processed_at) : null,
    lastError: failed?.error_message ? String(failed.error_message).slice(0, 180) : null,
  };
}
