import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import {
  createSaleContractPdfResponse,
} from '@/lib/saleContractPdfHttp';
import {
  getLatestSignedSaleSignature,
  loadSaleContractPdfForSign,
  loadSaleSignPageContext,
  SaleContractSignatureError,
} from '@/lib/saleContractSignatureService';
import { loadSaleContractContext } from '@/lib/contractRegeneration';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function assertContractAccess(
  supabase: NonNullable<Awaited<ReturnType<typeof createAdminSupabase>>['client']>,
  contractId: string,
  userId: string,
) {
  const profile = await resolveCallerProfile(supabase, userId);
  const callerRole = String(profile?.role || '').toUpperCase();
  if (callerRole === 'OWNER') {
    throw new SaleContractSignatureError(
      'Perfil OWNER possui acesso somente leitura.',
    );
  }

  const contract = await loadSaleContractContext(supabase, contractId);
  const tenantId = String(contract.tenant_id || contract.company_id || '');
  const callerTenant = String(profile?.tenant_id || profile?.company_id || '');

  const isSuperAdmin = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'].includes(callerRole);
  if (!isSuperAdmin && callerTenant && tenantId && callerTenant !== tenantId) {
    throw new SaleContractSignatureError('Sem permissão para este contrato.');
  }

  return contract;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

    const { id: contractId } = await params;
    const contract = await assertContractAccess(supabase, contractId, user.id);
    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';

    const signature = await getLatestSignedSaleSignature(supabase, contractId);
    if (!signature) {
      return NextResponse.json(
        { error: 'Contrato sem assinatura eletrônica registrada.' },
        { status: 404 },
      );
    }

    const contractRow = contract as Record<string, unknown>;

    const signContext = await loadSaleSignPageContext(supabase, signature);

    try {
      const { pdf, contractNumber } = await loadSaleContractPdfForSign(
        supabase,
        contractId,
        { signature, signContext },
      );

      if (pdf.byteLength >= 5) {
        return createSaleContractPdfResponse(
          pdf,
          download ? 'attachment' : 'inline',
          contractNumber || String(contract.contract_number || ''),
        );
      }
    } catch (regenErr) {
      console.warn('[CONTRACT_SIGNED_PDF] regeneration failed', regenErr);
    }

    const storedSignedUrl = String(contractRow.pdf_signed_url || '').trim();
    if (storedSignedUrl) {
      try {
        const storedRes = await fetch(storedSignedUrl, { cache: 'no-store' });
        if (storedRes.ok) {
          const storedBytes = new Uint8Array(await storedRes.arrayBuffer());
          if (storedBytes.byteLength >= 5) {
            return createSaleContractPdfResponse(
              storedBytes,
              download ? 'attachment' : 'inline',
              String(contract.contract_number || contractId),
            );
          }
        }
      } catch (storedErr) {
        console.warn('[CONTRACT_SIGNED_PDF] stored url fetch failed', storedErr);
      }
    }

    return NextResponse.json(
      { error: 'Falha ao gerar PDF assinado.' },
      { status: 500 },
    );
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao gerar PDF.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    console.error('[CONTRACT_SIGNED_PDF]', message);
    return NextResponse.json({ error: message }, { status });
  }
}
