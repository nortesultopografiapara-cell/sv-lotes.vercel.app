import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { runSicoobTestConnection } from '@/lib/banking/sicoobApiHandlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await runSicoobTestConnection(auth, body);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[banking/sicoob/test-connection]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao testar conexão Sicoob.' },
      { status: 500 },
    );
  }
}
