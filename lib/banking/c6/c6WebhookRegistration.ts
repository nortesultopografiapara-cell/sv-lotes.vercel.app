/**
 * Cadastro BANK_SLIP no Banco C6. A URL já preparada é a única enviada.
 * A tela só fica como cadastrada depois que a consulta oficial confirma.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  c6WebhookPublicUrl,
  isC6WebhookReceiptToken,
  readC6WebhookPanel,
  type C6WebhookPublicStatus,
} from '@/lib/banking/c6/c6WebhookReceipt';
import { sameSecret } from '@/lib/banking/c6/c6WebhookNotification';

export type C6WebhookBankCall = {
  httpStatus: number;
  body: unknown;
};

export type C6WebhookRegistrationOutcome =
  | 'not-prepared'
  | 'confirmed'
  | 'conflict'
  | 'auth-failed'
  | 'temporary'
  | 'consulted';

export type C6WebhookRegistrationResult = {
  outcome: C6WebhookRegistrationOutcome;
  message: string;
  webhook: C6WebhookPublicStatus;
};

type RegistrationRow = {
  id?: string;
  company_id?: string;
  provider?: string;
  metadata?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function walkBank(
  value: unknown,
  found: { urls: string[]; services: string[]; clientIds: string[] },
) {
  if (typeof value === 'string') {
    if (value.startsWith('https://')) found.urls.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkBank(item, found);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'service' && typeof item === 'string') found.services.push(item.trim());
    if ((key === 'client_id' || key === 'clientId') && typeof item === 'string' && item.trim()) {
      found.clientIds.push(item.trim());
    }
    walkBank(item, found);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function classifyHttp(status: number): 'auth' | 'temporary' | 'ok' | 'absent' | 'other' {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404 || status === 204) return 'absent';
  if (status === 408 || status === 429 || status >= 500) return 'temporary';
  if (status === 200) return 'ok';
  return 'other';
}

async function loadOwnRow(admin: SupabaseClient, companyId: string): Promise<RegistrationRow | null> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, provider, metadata')
    .eq('company_id', companyId)
    .eq('provider', 'C6');
  if (error) throw new Error('Integração C6 da empresa não encontrada.');
  const rows = (data || []).filter(
    (row) => String(row.company_id || '') === companyId && String(row.provider || '') === 'C6',
  );
  if (rows.length !== 1) return null;
  return rows[0];
}

async function writeConfirmation(
  admin: SupabaseClient,
  row: RegistrationRow,
  companyId: string,
  confirmed: boolean,
): Promise<void> {
  const metadata = asRecord(row.metadata);
  const c6 = asRecord(metadata.c6);
  const nextC6 = { ...c6 };
  if (confirmed) {
    nextC6.webhook_bank_confirmed_at = new Date().toISOString();
    nextC6.webhook_bank_service = 'BANK_SLIP';
  } else {
    delete nextC6.webhook_bank_confirmed_at;
    delete nextC6.webhook_bank_service;
  }
  if (
    nextC6.emission_enabled !== c6.emission_enabled ||
    nextC6.webhook_enabled !== c6.webhook_enabled ||
    nextC6.settlement_enabled !== c6.settlement_enabled ||
    nextC6.webhook_receipt_token !== c6.webhook_receipt_token
  ) {
    throw new Error('A confirmação do webhook alteraria a emissão ou a URL.');
  }
  const { error } = await admin
    .from('bank_integrations')
    .update({
      metadata: { ...metadata, c6: nextC6 },
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('company_id', companyId)
    .eq('provider', 'C6');
  if (error) throw new Error('Não foi possível gravar a confirmação do webhook C6.');
  row.metadata = { ...metadata, c6: nextC6 };
}

function clientField(clientIds: string[], clientId: string): 'absent' | 'match' | 'mismatch' {
  if (clientIds.length === 0) return 'absent';
  if (clientIds.length === 1 && sameSecret(clientIds[0], clientId)) return 'match';
  return 'mismatch';
}

export async function syncC6BankSlipWebhook(
  admin: SupabaseClient,
  input: {
    companyId: string;
    clientId: string;
    mode: 'register' | 'consult';
    consult: (target: { url: string }) => Promise<C6WebhookBankCall>;
    register: (target: { url: string }) => Promise<C6WebhookBankCall>;
  },
): Promise<C6WebhookRegistrationResult> {
  const companyId = String(input.companyId || '').trim();
  const row = await loadOwnRow(admin, companyId);
  const finish = async (
    outcome: C6WebhookRegistrationOutcome,
    message: string,
  ): Promise<C6WebhookRegistrationResult> => ({
    outcome,
    message,
    webhook: await readC6WebhookPanel(admin, companyId),
  });
  if (!row?.id) return finish('not-prepared', 'Prepare a URL antes de cadastrar o webhook.');
  const token = asRecord(asRecord(row.metadata).c6).webhook_receipt_token;
  if (typeof token !== 'string' || !isC6WebhookReceiptToken(token)) {
    return finish('not-prepared', 'Prepare a URL antes de cadastrar o webhook.');
  }
  const url = c6WebhookPublicUrl(token);
  let consulted: C6WebhookBankCall;
  try {
    consulted = await input.consult({ url });
  } catch {
    return finish('temporary', 'O Banco C6 não respondeu. O cadastro não foi alterado.');
  }
  const consultClass = classifyHttp(consulted.httpStatus);
  if (consultClass === 'auth') {
    return finish('auth-failed', 'Autenticação recusada pelo Banco C6.');
  }
  if (consultClass === 'temporary') {
    return finish('temporary', 'O Banco C6 não respondeu. O cadastro não foi alterado.');
  }
  if (consultClass === 'other') {
    return finish('temporary', 'O Banco C6 recusou a consulta. O cadastro não foi alterado.');
  }

  const found = { urls: [] as string[], services: [] as string[], clientIds: [] as string[] };
  if (consultClass === 'ok') walkBank(consulted.body, found);
  const urls = unique(found.urls);
  const services = unique(found.services);
  const client = clientField(unique(found.clientIds), input.clientId);
  const serviceOk = services.length === 0 || (services.length === 1 && services[0] === 'BANK_SLIP');
  const exact = urls.length === 1 && urls[0] === url && serviceOk;
  if (urls.length > 0 && (!exact || client === 'mismatch')) {
    await writeConfirmation(admin, row, companyId, false);
    return finish('conflict', 'Já existe outro webhook BANK_SLIP nesta aplicação. Ele não foi alterado.');
  }
  if (exact && client !== 'mismatch') {
    await writeConfirmation(admin, row, companyId, true);
    return finish('confirmed', 'Webhook cadastrado no Banco C6.');
  }
  if (input.mode === 'consult') {
    await writeConfirmation(admin, row, companyId, false);
    return finish('consulted', 'O Banco C6 ainda não tem esta URL.');
  }

  let posted: C6WebhookBankCall;
  try {
    posted = await input.register({ url });
  } catch {
    return finish('temporary', 'O Banco C6 não respondeu. O cadastro não foi alterado.');
  }
  const postClass = classifyHttp(posted.httpStatus);
  if (postClass === 'auth') return finish('auth-failed', 'Autenticação recusada pelo Banco C6.');
  if (posted.httpStatus === 409) {
    return finish('conflict', 'Já existe outro webhook BANK_SLIP nesta aplicação. Ele não foi alterado.');
  }
  if (postClass !== 'ok') {
    return finish('temporary', 'O Banco C6 não concluiu o cadastro. Nada foi confirmado.');
  }

  let again: C6WebhookBankCall;
  try {
    again = await input.consult({ url });
  } catch {
    return finish('temporary', 'O Banco C6 não confirmou o cadastro. A tela permanece sem essa confirmação.');
  }
  if (classifyHttp(again.httpStatus) !== 'ok') {
    return finish('temporary', 'O Banco C6 não confirmou o cadastro. A tela permanece sem essa confirmação.');
  }
  const confirmed = { urls: [] as string[], services: [] as string[], clientIds: [] as string[] };
  walkBank(again.body, confirmed);
  const confirmedUrls = unique(confirmed.urls);
  const confirmedServices = unique(confirmed.services);
  const confirmedClient = clientField(unique(confirmed.clientIds), input.clientId);
  const confirmedServiceOk =
    confirmedServices.length === 0 || (confirmedServices.length === 1 && confirmedServices[0] === 'BANK_SLIP');
  const confirmedExact =
    confirmedUrls.length === 1 &&
    confirmedUrls[0] === url &&
    confirmedServiceOk &&
    confirmedClient !== 'mismatch';
  if (!confirmedExact) {
    await writeConfirmation(admin, row, companyId, false);
    return finish('conflict', 'O Banco C6 não confirmou esta URL. Nenhum webhook foi substituído.');
  }
  await writeConfirmation(admin, row, companyId, true);
  return finish('confirmed', 'Webhook cadastrado no Banco C6.');
}
