import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { runSicoobTestConnection, type SicoobTestConnectionBody } from '@/lib/banking/sicoobApiHandlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as SicoobTestConnectionBody;
  const result = await runSicoobTestConnection(auth, body);
  return NextResponse.json(result);
}
