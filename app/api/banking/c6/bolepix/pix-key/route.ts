import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  C6BolepixPixKeyAccessError,
  maskC6BolepixPixKey,
  prepareC6BolepixPixKeyWrite,
  type C6BolepixPixKeyLookup,
} from '@/lib/banking/c6/c6BolepixV2PixKey';
import { C6BolepixV2ValidationError } from '@/lib/banking/c6/c6BolepixV2Validation';
import { isBankingCredentialsEncryptionConfigured } from '@/lib/banking/credentialsCrypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function failure(error: unknown): NextResponse {
  if (error instanceof C6BolepixPixKeyAccessError) {
    return NextResponse.json({ error: error.message, emissionEnabled: false }, { status: error.status });
  }
  if (error instanceof C6BolepixV2ValidationError) {
    return NextResponse.json({ error: error.message, emissionEnabled: false }, { status: 400 });
  }
  return NextResponse.json(
    { error: 'Não foi possível gravar a chave Pix.', emissionEnabled: false },
    { status: 500 },
  );
}

async function readLink(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
  financialAccountId: string,
): Promise<C6BolepixPixKeyLookup> {
  const { data: integration, error: integrationError } = await admin
    .from('bank_integrations')
    .select('id, company_id, provider')
    .eq('id', integrationId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (integrationError) {
    throw new C6BolepixPixKeyAccessError('Não foi possível verificar a integração C6.', 503);
  }

  const { data: account, error: accountError } = await admin
    .from('company_financial_accounts')
    .select('id, company_id, bank_integration_id, active')
    .eq('id', financialAccountId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (accountError) {
    throw new C6BolepixPixKeyAccessError('Não foi possível verificar a conta beneficiária.', 503);
  }

  const { data: key, error: keyError } = await admin
    .from('c6_bolepix_pix_keys')
    .select('encrypted_key, key_fingerprint')
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .maybeSingle();
  if (keyError) {
    throw new C6BolepixPixKeyAccessError('Não foi possível verificar a chave Pix.', 503);
  }

  return {
    integration: integration
      ? { companyId: String(integration.company_id), provider: String(integration.provider || '') }
      : null,
    account: account
      ? {
          companyId: String(account.company_id),
          integrationId: account.bank_integration_id ? String(account.bank_integration_id) : null,
          active: account.active === true,
        }
      : null,
    existing: key?.key_fingerprint
      ? { encryptedKey: String(key.encrypted_key || ''), fingerprint: String(key.key_fingerprint) }
      : null,
  };
}

export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  const url = new URL(request.url);
  const integrationId = clean(url.searchParams.get('integrationId'));
  const financialAccountId = clean(url.searchParams.get('financialAccountId'));
  if (!integrationId || !financialAccountId) {
    return NextResponse.json({ configured: false, mask: null, emissionEnabled: false });
  }
  try {
    const lookup = await readLink(auth.admin, auth.tenantId, integrationId, financialAccountId);
    if (
      !lookup.integration ||
      lookup.integration.companyId !== auth.tenantId ||
      lookup.integration.provider.toUpperCase() !== 'C6' ||
      !lookup.account ||
      lookup.account.companyId !== auth.tenantId ||
      lookup.account.integrationId !== integrationId ||
      !lookup.account.active
    ) {
      return NextResponse.json({
        configured: false,
        mask: null,
        emissionEnabled: false,
        error: 'A chave Pix precisa da conta beneficiária vinculada a esta integração C6.',
      });
    }
    const view = maskC6BolepixPixKey(
      lookup.existing
        ? { encryptedKey: lookup.existing.encryptedKey, fingerprint: lookup.existing.fingerprint }
        : null,
    );
    return NextResponse.json(view);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.', emissionEnabled: false }, { status: 400 });
  }

  const pixKey = clean(body.pixKey);
  const integrationId = clean(body.integrationId);
  const financialAccountId = clean(body.financialAccountId);
  const replace = body.replace === true;
  if (!integrationId || !financialAccountId) {
    return NextResponse.json(
      { error: 'Informe a integração C6 e a conta beneficiária.', emissionEnabled: false },
      { status: 400 },
    );
  }

  try {
    const lookup = await readLink(auth.admin, auth.tenantId, integrationId, financialAccountId);
    const prepared = prepareC6BolepixPixKeyWrite({
      role: auth.role,
      companyId: auth.tenantId,
      integrationId,
      financialAccountId,
      pixKey,
      replace,
      encryptionConfigured: isBankingCredentialsEncryptionConfigured(),
      lookup,
    });
    if (!prepared.unchanged) {
      const write = prepared.publicView.replaced
        ? await auth.admin
            .from('c6_bolepix_pix_keys')
            .update({
              encrypted_key: prepared.record.encryptedKey,
              key_fingerprint: prepared.record.fingerprint,
              updated_at: new Date().toISOString(),
            })
            .eq('company_id', auth.tenantId)
            .eq('integration_id', integrationId)
        : await auth.admin.from('c6_bolepix_pix_keys').insert({
            company_id: auth.tenantId,
            integration_id: integrationId,
            encrypted_key: prepared.record.encryptedKey,
            key_fingerprint: prepared.record.fingerprint,
          });
      if (write.error) {
        const duplicate = write.error.code === '23505';
        throw new C6BolepixPixKeyAccessError(
          duplicate
            ? 'Já existe uma chave Pix nesta integração. A substituição exige nova autorização do administrador.'
            : 'Não foi possível gravar a chave Pix.',
          duplicate ? 409 : 500,
        );
      }
    }
    return NextResponse.json({
      ...prepared.publicView,
      message: prepared.publicView.replaced
        ? 'Chave Pix substituída. A emissão Bolepix continua desligada.'
        : 'Chave Pix gravada de forma cifrada. A emissão Bolepix continua desligada.',
    });
  } catch (error) {
    return failure(error);
  }
}
