import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { createUnlinkedC6FinancialAccount } from '@/lib/banking/c6/c6FinancialAccount';
import { redactC6ErrorMessage } from '@/lib/banking/c6/c6ConfigRepository';
import type { BankEnvironment } from '@/lib/banking/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cria uma conta financeira sem provedor. Não vincula Asaas, Inter nem a integração C6. */
export async function POST(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const environment: BankEnvironment = record.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';

  try {
    const account = await createUnlinkedC6FinancialAccount(auth.admin, auth.tenantId, environment);
    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        provider: null,
        created: account.created,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: redactC6ErrorMessage(error, 'Não foi possível cadastrar a conta C6.') },
      { status: 422 },
    );
  }
}
