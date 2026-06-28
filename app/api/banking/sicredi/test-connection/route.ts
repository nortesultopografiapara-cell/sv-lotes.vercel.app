import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { runSicrediTestConnection, type SicrediTestConnectionBody } from '@/lib/banking/sicrediApiHandlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as SicrediTestConnectionBody;
  const result = await runSicrediTestConnection(auth, body);
  return NextResponse.json(result);
}
