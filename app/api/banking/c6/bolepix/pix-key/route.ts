import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { evaluateC6BolepixPixKeyRegistration } from '@/lib/banking/c6/c6BolepixV2PixKey';
import { resolveSupabaseProjectRef } from '@/lib/homolog/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recusa o cadastro da chave Pix. Não lê o corpo e não grava credencial. */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;
  evaluateC6BolepixPixKeyRegistration({
    role: auth.role,
    projectRef: resolveSupabaseProjectRef(),
  });
  return NextResponse.json(
    { error: 'O cadastro da chave Pix do Bolepix permanece desligado. Nenhuma chave foi gravada.' },
    { status: 409 },
  );
}
