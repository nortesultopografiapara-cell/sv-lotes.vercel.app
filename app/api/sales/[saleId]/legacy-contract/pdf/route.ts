import { NextResponse } from 'next/server';
import {
  assertLegacyContractSaleAccess,
  createLegacyContractSignedPdfUrl,
  LegacyContractDocumentError,
  loadLegacyContractDocumentBySaleId,
} from '@/lib/legacyContractDocumentService';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 });
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const { saleId } = await params;
    const access = await assertLegacyContractSaleAccess(supabase, saleId, user.id);
    const document = await loadLegacyContractDocumentBySaleId(supabase, saleId);

    if (!document?.storage_path) {
      return NextResponse.json({ error: 'Nenhum contrato antigo anexado.' }, { status: 404 });
    }

    const expectedPrefix = `${access.tenantId}/`;
    if (
      !document.storage_path.startsWith(expectedPrefix) &&
      !document.storage_path.includes(`/${access.tenantId}/`)
    ) {
      return NextResponse.json({ error: 'Arquivo fora do escopo do tenant.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const asJson = url.searchParams.get('format') === 'json';

    const signedUrl = await createLegacyContractSignedPdfUrl(supabase, document.storage_path);

    if (asJson) {
      return NextResponse.json({ url: signedUrl });
    }

    return NextResponse.redirect(signedUrl);
  } catch (err) {
    if (err instanceof LegacyContractDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error('[sales/legacy-contract/pdf GET]', err);
    return NextResponse.json({ error: 'Erro interno ao abrir PDF do contrato antigo.' }, { status: 500 });
  }
}
