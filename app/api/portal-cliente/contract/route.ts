import { NextResponse } from 'next/server';
import { readStoredContractHtml } from '@/lib/contractHtmlGlobal';
import { resolvePortalClientContract } from '@/lib/portal-cliente/contractLookup';
import { isClientPortalEnabled } from '@/lib/portal-cliente/config';
import { validatePortalLotSaleScope } from '@/lib/portal-cliente/scopeValidation';
import {
  getClientPortalSessionCookie,
  readClientPortalSessionToken,
} from '@/lib/portal-cliente/session';
import { resolvePublicBaseUrl } from '@/lib/signatureVerifyUrls';
import { createAdminSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!isClientPortalEnabled()) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const cookie = await getClientPortalSessionCookie();
  if (!cookie) {
    return NextResponse.json({ ok: false, message: 'Sessão não encontrada.' }, { status: 401 });
  }

  const session = readClientPortalSessionToken(cookie);
  if (!session?.scope.saleId || !session.scope.customerId) {
    return NextResponse.json({ ok: false, message: 'Sessão inválida.' }, { status: 401 });
  }

  const { client: admin, configError } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: configError || 'Serviço indisponível.' },
      { status: 503 },
    );
  }

  const validated = await validatePortalLotSaleScope(admin, session.scope);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, message: 'Acesso negado.' }, { status: 403 });
  }

  const lookup = await resolvePortalClientContract(admin, validated.data);
  const contract = lookup.row;
  if (!contract) {
    return NextResponse.json({ ok: false, message: 'Contrato não encontrado.' }, { status: 404 });
  }

  const html = readStoredContractHtml(contract as Record<string, unknown>);
  if (html) {
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const signatureToken = String(contract.signature_token || '').trim();
  const signatureStatus = String(contract.signature_status || '').toUpperCase();
  if (signatureToken && (signatureStatus === 'SIGNED' || contract.pdf_signed_url)) {
    const pdfUrl = `${resolvePublicBaseUrl()}/api/sign/sale/${encodeURIComponent(signatureToken)}?pdf=1`;
    return NextResponse.redirect(pdfUrl);
  }

  return NextResponse.json({ ok: false, message: 'Contrato ainda não disponível.' }, { status: 404 });
}
