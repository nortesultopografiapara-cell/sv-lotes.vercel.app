import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { getBankingEncryptionKeyDebugPayload } from '@/lib/banking/credentialsCrypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Diagnóstico temporário — Preview/develop. Nunca retorna o valor da chave. */
export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  return NextResponse.json(getBankingEncryptionKeyDebugPayload());
}
