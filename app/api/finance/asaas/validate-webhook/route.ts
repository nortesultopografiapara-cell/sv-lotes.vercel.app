import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { runAsaasValidateWebhook } from '@/lib/finance/asaasIntegrationService';
import {
  isFinancialAccountRequiredError,
  parseFinancialAccountIdFromRecord,
} from '@/lib/finance/financialAccountRequired';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const financialAccountId = parseFinancialAccountIdFromRecord(body);
    const validation = await runAsaasValidateWebhook(auth.admin, auth.tenantId, {
      financialAccountId,
    });
    return NextResponse.json({ validation });
  } catch (err) {
    console.error('[finance/asaas/validate-webhook]', err);
    const message = err instanceof Error ? err.message : 'Erro ao validar webhook.';
    return NextResponse.json(
      { error: message },
      { status: isFinancialAccountRequiredError(err) ? 400 : 500 },
    );
  }
}
