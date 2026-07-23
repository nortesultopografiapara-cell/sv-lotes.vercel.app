import { NextResponse } from 'next/server';
import { getCorporateFinanceServiceClient } from '@/lib/master/corporateFinance/apiAuth';
import { requireCorporateAsaasWebhookToken } from '@/lib/master/corporateFinance/asaas/domain';
import { processCorporateAsaasWebhook } from '@/lib/master/corporateFinance/asaas/webhookSettlement';
import { sanitizeCorporateAsaasErrorMessage } from '@/lib/master/corporateFinance/asaas/validation';

function extractAccessToken(request: Request): string {
  const headerToken =
    request.headers.get('asaas-access-token') ||
    request.headers.get('x-webhook-token') ||
    '';
  if (headerToken.trim()) return headerToken.trim();
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

/**
 * Webhook dedicado — somente cobranças master_corporate_asaas_*.
 * Não processa SaaS nem tenant.
 */
export async function POST(request: Request) {
  let expected: string;
  try {
    expected = requireCorporateAsaasWebhookToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token webhook ausente.';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const provided = extractAccessToken(request);
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await processCorporateAsaasWebhook(supabaseAdmin, body);
    return NextResponse.json(
      { ok: result.ok, result: result.result, message: result.message },
      { status: result.status },
    );
  } catch (err) {
    const message = sanitizeCorporateAsaasErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
