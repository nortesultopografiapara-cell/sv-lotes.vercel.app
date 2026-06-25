import { NextResponse } from 'next/server';
import {
  authorizeBankingRoute,
  rejectNonMockProvider,
} from '@/lib/banking/bankingRouteGuard';
import { runMockCreateBoleto } from '@/lib/banking/mockApiHandlers';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const providerError = rejectNonMockProvider(body);
  if (providerError) return providerError;

  const result = await runMockCreateBoleto(auth.tenantId, {
    amount: typeof body.amount === 'number' ? body.amount : undefined,
    dueDate: typeof body.dueDate === 'string' ? body.dueDate : undefined,
    payerName: typeof body.payerName === 'string' ? body.payerName : undefined,
  });

  return NextResponse.json(result);
}
