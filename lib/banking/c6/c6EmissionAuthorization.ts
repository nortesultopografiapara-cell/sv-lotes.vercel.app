/**
 * Emissão C6 por empresa, persistida em bank_integrations.metadata.
 * Nasce desligada. Salvar credencial não liga. Não há flag global.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isC6BolepixV2LiveReceipt } from '@/lib/banking/c6/c6BolepixV2OpenApi';

type IntegrationRow = {
  id: string;
  company_id: string;
  provider: string;
  client_id: string | null;
  status?: string | null;
  metadata: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readC6EmissionEnabled(metadata: unknown): boolean {
  const box = asRecord(asRecord(metadata)?.c6);
  return box?.emission_enabled === true;
}

export function readC6BolepixActivationRequested(metadata: unknown): boolean {
  const box = asRecord(asRecord(metadata)?.c6);
  return box?.bolepix_activation_requested === true;
}

/** Recibos que o servidor aceita emitir agora. A lista compilada não basta sem o pedido do administrador. */
export async function filterC6BolepixAuthorizedReceipts(
  admin: SupabaseClient,
  companyId: string,
  receiptIds: string[],
): Promise<string[]> {
  const row = await loadOwnC6Integration(admin, companyId);
  if (!row || String(row.status || '').toUpperCase() === 'DISABLED') return [];
  if (!readC6BolepixActivationRequested(row.metadata)) return [];
  return receiptIds.filter((receiptId) => isC6BolepixV2LiveReceipt(companyId, row.id, receiptId));
}

function metadataWithActivationRequest(metadata: unknown, requested: boolean): Record<string, unknown> {
  const base = { ...(asRecord(metadata) || {}) };
  const c6 = { ...(asRecord(base.c6) || {}) };
  c6.bolepix_activation_requested = requested === true;
  if (requested) c6.bolepix_activation_requested_at = new Date().toISOString();
  base.c6 = c6;
  return base;
}

function metadataWithEmission(metadata: unknown, enabled: boolean): Record<string, unknown> {
  const base = { ...(asRecord(metadata) || {}) };
  const c6 = { ...(asRecord(base.c6) || {}) };
  c6.emission_enabled = enabled === true;
  c6.webhook_enabled = false;
  c6.settlement_enabled = false;
  base.c6 = c6;
  return base;
}

async function loadOwnC6Integration(
  admin: SupabaseClient,
  companyId: string,
): Promise<IntegrationRow | null> {
  const id = String(companyId || '').trim();
  if (!id) return null;
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, provider, client_id, status, metadata')
    .eq('company_id', id)
    .eq('provider', 'C6');
  if (error) throw new Error(error.message);
  const rows = (data || []) as IntegrationRow[];
  if (rows.length !== 1) return null;
  const row = rows[0];
  if (String(row.company_id) !== id || String(row.provider).toUpperCase() !== 'C6') return null;
  return row;
}

async function hasOwnCredentials(admin: SupabaseClient, integrationId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('bank_credentials')
    .select('credential_type, integration_id')
    .eq('integration_id', integrationId);
  if (error) throw new Error(error.message);
  const types = new Set((data || []).map((row) => String(row.credential_type || '')));
  return types.has('oauth') && types.has('certificate');
}

async function hasOwnLinkedAccount(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('company_financial_accounts')
    .select('id, company_id, bank_integration_id, active')
    .eq('company_id', companyId)
    .eq('bank_integration_id', integrationId)
    .eq('active', true);
  if (error) throw new Error(error.message);
  const rows = data || [];
  return (
    rows.length === 1 &&
    String(rows[0].company_id) === companyId &&
    String(rows[0].bank_integration_id) === integrationId
  );
}

/** Emissão real só com flag, credencial e conta da mesma empresa. */
export async function isC6EmissionActivated(
  admin: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const row = await loadOwnC6Integration(admin, companyId);
  if (!row || !readC6EmissionEnabled(row.metadata)) return false;
  if (!String(row.client_id || '').trim()) return false;
  if (!(await hasOwnCredentials(admin, row.id))) return false;
  return hasOwnLinkedAccount(admin, companyId, row.id);
}

export async function setC6CompanyEmissionEnabled(
  admin: SupabaseClient,
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const row = await loadOwnC6Integration(admin, companyId);
  if (!row) throw new Error('A empresa precisa de uma integração C6 própria.');
  if (enabled) {
    if (!String(row.client_id || '').trim()) {
      throw new Error('Informe o Client ID antes de ativar a emissão.');
    }
    if (!(await hasOwnCredentials(admin, row.id))) {
      throw new Error('Salve o Client Secret, o certificado e a chave antes de ativar a emissão.');
    }
    if (!(await hasOwnLinkedAccount(admin, companyId, row.id))) {
      throw new Error('Vincule uma conta financeira desta empresa antes de ativar a emissão.');
    }
  }
  const { data, error } = await admin
    .from('bank_integrations')
    .update({
      metadata: metadataWithEmission(row.metadata, enabled),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .select('id');
  if (error || !data?.length) throw new Error('Não foi possível atualizar a emissão C6 desta empresa.');
  try {
    await admin.from('audit_logs').insert({
      tenant_id: companyId,
      company_id: companyId,
      module: 'FINANCE',
      action: enabled ? 'C6_EMISSION_ENABLED' : 'C6_EMISSION_DISABLED',
      reference_id: row.id,
      description: enabled
        ? 'Administrador ativou a emissão C6 desta empresa.'
        : 'Administrador desativou a emissão C6 desta empresa.',
    });
  } catch (auditError) {
    console.warn('[c6 emission] audit', auditError);
  }
}

export async function readOwnC6PixConfigured(
  admin: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const row = await loadOwnC6Integration(admin, companyId);
  if (!row) return false;
  return hasOwnPixKey(admin, companyId, row.id);
}

async function hasOwnPixKey(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('c6_bolepix_pix_keys')
    .select('key_fingerprint')
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .maybeSingle();
  if (error) throw new Error('Não foi possível verificar a chave Pix.');
  return /^[a-f0-9]{12}$/.test(String(data?.key_fingerprint || ''));
}

/**
 * Registra o pedido da empresa autenticada. Não liga emission_enabled e não abre o POST.
 */
export async function requestC6BolepixCompanyActivation(
  admin: SupabaseClient,
  companyId: string,
): Promise<void> {
  const row = await loadOwnC6Integration(admin, companyId);
  if (!row) throw new Error('A empresa precisa de uma integração C6 própria.');
  if (String(row.status || '').toUpperCase() === 'DISABLED') {
    throw new Error('A integração C6 está desativada.');
  }
  if (!String(row.client_id || '').trim()) throw new Error('Informe o Client ID.');
  if (!(await hasOwnCredentials(admin, row.id))) {
    throw new Error('Salve o Client Secret e o certificado.');
  }
  if (!(await hasOwnLinkedAccount(admin, companyId, row.id))) {
    throw new Error('Vincule uma conta financeira desta empresa antes de solicitar a ativação.');
  }
  if (!(await hasOwnPixKey(admin, companyId, row.id))) {
    throw new Error('Cadastre a chave Pix EVP antes de solicitar a ativação.');
  }
  const { data, error } = await admin
    .from('bank_integrations')
    .update({
      metadata: metadataWithActivationRequest(row.metadata, true),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .select('id');
  if (error || !data?.length) throw new Error('Não foi possível registrar a solicitação desta empresa.');
  try {
    await admin.from('audit_logs').insert({
      tenant_id: companyId,
      company_id: companyId,
      module: 'FINANCE',
      action: 'C6_BOLEPIX_ACTIVATION_REQUESTED',
      reference_id: row.id,
      description: 'Administrador solicitou a ativação Bolepix desta empresa. O POST real permanece desligado.',
    });
  } catch (auditError) {
    console.warn('[c6 emission] audit', auditError);
  }
}

export async function clearC6BolepixActivationRequest(
  admin: SupabaseClient,
  companyId: string,
): Promise<void> {
  const row = await loadOwnC6Integration(admin, companyId);
  if (!row) throw new Error('A empresa precisa de uma integração C6 própria.');
  const { data, error } = await admin
    .from('bank_integrations')
    .update({
      metadata: metadataWithActivationRequest(row.metadata, false),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('company_id', companyId)
    .eq('provider', 'C6')
    .select('id');
  if (error || !data?.length) throw new Error('Não foi possível atualizar a solicitação desta empresa.');
}
