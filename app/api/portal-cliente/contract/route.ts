import { NextResponse } from 'next/server';
import { readStoredContractHtml } from '@/lib/contractHtmlGlobal';
import {
  loadPortalContractPdfForDownload,
  PortalContractPdfUnavailableError,
  PORTAL_CONTRACT_PDF_UNAVAILABLE_MESSAGE,
  PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE,
} from '@/lib/portal-cliente/contractDownload';
import { resolvePortalClientContract } from '@/lib/portal-cliente/contractLookup';
import { isClientPortalEnabled } from '@/lib/portal-cliente/config';
import { validatePortalLotSaleScope } from '@/lib/portal-cliente/scopeValidation';
import {
  getClientPortalSessionCookie,
  readClientPortalSessionToken,
} from '@/lib/portal-cliente/session';
import { createSaleContractPdfResponse } from '@/lib/saleContractPdfHttp';
import { shouldBlockUnsignedFallbackAfterElectronicSign } from '@/lib/saleContractSignatureRenderMode';
import { createAdminSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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

  const { data: signatureRow } = await admin
    .from('contract_signatures')
    .select('signature_status')
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const signatureStatus = String(
    signatureRow?.signature_status || contract.signature_status || '',
  ).toUpperCase();
  const enriched = {
    ...contract,
    signature_status: signatureStatus || contract.signature_status,
  };

  const electronicallySigned = shouldBlockUnsignedFallbackAfterElectronicSign({
    signatureStatus,
    contractStatus: contract.status,
  });

  if (electronicallySigned) {
    try {
      const { bytes, contractNumber } = await loadPortalContractPdfForDownload(
        admin,
        enriched,
      );
      return createSaleContractPdfResponse(bytes, 'inline', contractNumber);
    } catch (err) {
      if (err instanceof PortalContractPdfUnavailableError) {
        return NextResponse.json(
          {
            ok: false,
            message: PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE,
          },
          { status: 409 },
        );
      }
      const message =
        err instanceof Error ? err.message : 'Falha ao abrir PDF assinado.';
      console.error('[portal-cliente/contract] signed view', message);
      return NextResponse.json({ ok: false, message }, { status: 500 });
    }
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

  return NextResponse.json(
    { ok: false, message: PORTAL_CONTRACT_PDF_UNAVAILABLE_MESSAGE },
    { status: 404 },
  );
}
