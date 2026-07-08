import { NextResponse } from 'next/server';
import {
  loadPortalContractPdfForDownload,
  PortalContractPdfUnavailableError,
  PORTAL_CONTRACT_PDF_UNAVAILABLE_MESSAGE,
} from '@/lib/portal-cliente/contractDownload';
import { resolvePortalClientContract } from '@/lib/portal-cliente/contractLookup';
import { isClientPortalEnabled } from '@/lib/portal-cliente/config';
import { validatePortalLotSaleScope } from '@/lib/portal-cliente/scopeValidation';
import {
  getClientPortalSessionCookie,
  readClientPortalSessionToken,
} from '@/lib/portal-cliente/session';
import { createSaleContractPdfResponse } from '@/lib/saleContractPdfHttp';
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
  if (!session?.scope.saleId || !session.scope.customerId || !session.scope.companyId) {
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

  try {
    const { bytes, contractNumber } = await loadPortalContractPdfForDownload(admin, contract);
    return createSaleContractPdfResponse(bytes, 'attachment', contractNumber);
  } catch (err) {
    if (err instanceof PortalContractPdfUnavailableError) {
      return NextResponse.json(
        { ok: false, message: PORTAL_CONTRACT_PDF_UNAVAILABLE_MESSAGE },
        { status: 404 },
      );
    }

    const message = err instanceof Error ? err.message : 'Falha ao baixar PDF do contrato.';
    console.error('[portal-cliente/contract/download]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
