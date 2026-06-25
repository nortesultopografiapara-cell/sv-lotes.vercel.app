import { NextResponse } from 'next/server';
import {
  authorizeBankingRoute,
  rejectNonMockProvider,
} from '@/lib/banking/bankingRouteGuard';
import { runMockTestConnection } from '@/lib/banking/mockApiHandlers';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const providerError = rejectNonMockProvider(body);
  if (providerError) return providerError;

  const result = await runMockTestConnection(auth.tenantId);
  return NextResponse.json(result);
}
