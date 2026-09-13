import { NextResponse } from 'next/server';
import {
  authorizeRevenueSplitAdmin,
  revenueSplitErrorResponse,
} from '@/lib/finance/revenueSplit/httpAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await authorizeRevenueSplitAdmin(request, {
    impersonatingTenantId: String(body.impersonatingTenantId || '').trim() || null,
    tenantId: String(body.tenantId || '').trim() || null,
  });
  if ('error' in auth) return auth.error;

  try {
    if (body.sandboxApiKey || body.productionApiKey || body.apiKey || body.webhookToken) {
      return NextResponse.json(
        { error: 'Não envie API key, token ou senha. Informe apenas o Wallet ID.' },
        { status: 400 },
      );
    }
    const destination = await auth.service.upsertAsaasWalletDestination({
      actor: { role: auth.role, companyId: auth.tenantId, userId: auth.userId },
      companyId: auth.tenantId,
      financialAccountId: String(body.financialAccountId || body.financial_account_id || '').trim(),
      walletId: String(body.walletId || body.destinationIdentifier || body.destination_identifier || '').trim(),
    });
    return NextResponse.json({ destination });
  } catch (err) {
    return revenueSplitErrorResponse(err);
  }
}
