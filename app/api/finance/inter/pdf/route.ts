import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { fetchInterCobrancaPdf } from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import { findActiveInterBankChargeForReceipt } from '@/lib/banking/inter/interSaleChargeService';
import type { InterOAuthCredentials } from '@/lib/banking/inter/interOAuthClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Proxy autenticado do PDF oficial Inter. Não emite cobrança. */
export async function GET(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const installmentId = String(url.searchParams.get('installmentId') || '').trim();
    let externalId = String(url.searchParams.get('externalId') || '').trim();

    if (!externalId && installmentId) {
      const existing = await findActiveInterBankChargeForReceipt(
        auth.admin,
        auth.tenantId,
        installmentId,
      );
      externalId = String(existing?.external_id || '').trim();
    }
    if (!externalId) {
      return NextResponse.json(
        { error: 'Cobrança Inter sem external_id. PDF oficial indisponível.' },
        { status: 400 },
      );
    }

    const secrets = await loadInterSecretsForServer(auth.admin, auth.tenantId);
    if (!secrets) {
      return NextResponse.json({ error: 'Credenciais Inter ausentes.' }, { status: 500 });
    }
    const creds: InterOAuthCredentials = {
      companyId: auth.tenantId,
      environment: secrets.environment,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      certificatePem: secrets.certificatePem,
      privateKeyPem: secrets.privateKeyPem,
    };

    const pdf = await fetchInterCobrancaPdf(creds, externalId);
    const filename = `boleto-inter-${externalId.slice(0, 8)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao obter PDF Inter.';
    console.error('[finance/inter/pdf]', message);
    const status = /ainda não está disponível|não retornou PDF/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
