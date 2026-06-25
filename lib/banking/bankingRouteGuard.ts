import { NextResponse } from 'next/server';
import { isBankingModuleEnabled } from './config';
import { authorizeTenantBilling, type TenantBillingAuth } from '@/lib/tenantBillingAuth';

export type BankingRouteAuth = TenantBillingAuth;

/** Bloqueia rotas quando o módulo está desativado (404 — não expor existência). */
export function assertBankingModuleEnabled(): NextResponse | null {
  if (!isBankingModuleEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}

export async function authorizeBankingRoute(
  request: Request,
): Promise<{ error: NextResponse } | BankingRouteAuth> {
  const disabled = assertBankingModuleEnabled();
  if (disabled) return { error: disabled };

  return authorizeTenantBilling(request);
}

/** Rejeita tentativa de usar provider real antes da Fase 2. */
export function rejectNonMockProvider(body: unknown): NextResponse | null {
  if (!body || typeof body !== 'object') return null;
  const provider = (body as Record<string, unknown>).provider;
  if (provider === undefined || provider === null) return null;
  if (provider !== 'MOCK') {
    return NextResponse.json(
      { error: 'Apenas provider MOCK está disponível nesta fase.' },
      { status: 400 },
    );
  }
  return null;
}
