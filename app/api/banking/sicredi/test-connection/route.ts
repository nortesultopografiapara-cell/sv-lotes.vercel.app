import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { runSicrediTestConnection } from '@/lib/banking/sicrediApiHandlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await runSicrediTestConnection(auth, body);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[banking/sicredi/test-connection]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao testar conexão Sicredi.' },
      { status: 500 },
    );
  }
}
