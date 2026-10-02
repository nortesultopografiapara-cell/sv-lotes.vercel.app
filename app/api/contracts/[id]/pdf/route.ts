import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import { createSaleContractPdfResponse } from '@/lib/saleContractPdfHttp';
import { loadSignedSaleContractArtifact } from '@/lib/saleContractSignedArtifact';
import { getContractSignedParties } from '@/lib/saleContractSignedParties';
import {
  classifySignedPdfGenerationError,
  getDeployGitSha,
  getDeployGitShaShort,
} from '@/lib/deployGitSha';
import {
  SaleContractSignatureError,
} from '@/lib/saleContractSignatureService';
import { loadSaleContractContext } from '@/lib/contractRegeneration';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_SIGNATURE_MESSAGE = 'Contrato sem assinatura eletrônica registrada.';

function deployHeaders(returnCode: string, extra?: Record<string, string>) {
  return {
    'Cache-Control': 'no-store',
    'X-SV-Git-Sha': getDeployGitSha(),
    'X-SV-Git-Sha-Short': getDeployGitShaShort(),
    'X-SV-Signed-Pdf-Return': returnCode,
    ...extra,
  };
}

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
  const gitSha = getDeployGitSha();
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json(
        { error: configError || 'Não autenticado', gitSha, signedPdfReturn: 'unauthenticated' },
        { status: 401, headers: deployHeaders('unauthenticated') },
      );
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json(
        { error: adminError || 'Supabase não configurado', gitSha, signedPdfReturn: 'supabase_missing' },
        { status: 503, headers: deployHeaders('supabase_missing') },
      );
    }

    const { id: requestedContractId } = await params;
    const contract = await assertContractAccess(supabase, requestedContractId, user.id);
    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';

    const resolved = await getContractSignedParties(supabase, requestedContractId, {
      saleId: String(contract.sale_id || '').trim() || null,
      regeneratedFrom: String(contract.regenerated_from || '').trim() || null,
      contractNumber: String(contract.contract_number || '').trim() || null,
    });

    const routeTrace = {
      requestedContractId,
      contractNumber: String(contract.contract_number || ''),
      contractVersion: contract.version ?? null,
      saleId: contract.sale_id || null,
      regeneratedFrom: contract.regenerated_from || null,
      lineageContractIds: resolved.lineageContractIds,
      processRows: resolved.processRows,
      partyRows: resolved.partyRows,
      signedParties: resolved.signerNames,
      signedCount: resolved.signedCount,
      expectedCount: resolved.totalCount,
      signatureSource: resolved.signatureSource,
      selectedSignatureProcessId: resolved.process?.id || null,
      gitSha,
    };
    console.info('[SIGNED PDF ROUTE TRACE]', routeTrace);

    const signaturesReady =
      resolved.signatureSource !== 'none' ||
      (resolved.signedCount > 0 &&
        resolved.totalCount > 0 &&
        resolved.signedCount >= resolved.totalCount);

    if (signaturesReady) {
      try {
        const artifact = await loadSignedSaleContractArtifact(
          supabase,
          requestedContractId,
          contract as Record<string, unknown>,
        );
        if (artifact) {
          return createSaleContractPdfResponse(
            artifact.bytes,
            download ? 'attachment' : 'inline',
            artifact.contractNumber,
            deployHeaders('artifact_ok', {
              'X-SV-Signed-Count': String(resolved.signedCount),
              'X-SV-Signature-Source': resolved.signatureSource,
            }),
          );
        }
        return NextResponse.json(
          {
            error: `Falha ao gerar PDF assinado LF ESTRELA: artefato vazio (signedCount=${resolved.signedCount}).`,
            gitSha,
            signedPdfReturn: 'artifact_empty_after_signed',
            ...routeTrace,
          },
          { status: 500, headers: deployHeaders('artifact_empty_after_signed') },
        );
      } catch (genErr) {
        const classified = classifySignedPdfGenerationError(genErr);
        console.error('[SIGNED PDF ROUTE TRACE] generation failed', {
          ...routeTrace,
          message: genErr instanceof Error ? genErr.message : String(genErr),
          stack: genErr instanceof Error ? genErr.stack : undefined,
        });
        return NextResponse.json(
          {
            error: classified,
            gitSha,
            signedPdfReturn: 'generation_failed',
            ...routeTrace,
          },
          { status: 500, headers: deployHeaders('generation_failed') },
        );
      }
    }

    const artifact = await loadSignedSaleContractArtifact(
      supabase,
      requestedContractId,
      contract as Record<string, unknown>,
    );

    if (artifact) {
      return createSaleContractPdfResponse(
        artifact.bytes,
        download ? 'attachment' : 'inline',
        artifact.contractNumber,
        deployHeaders('pdf_signed_url_fallback', {
          'X-SV-Signed-Count': String(resolved.signedCount),
        }),
      );
    }

    console.info('[SIGNED PDF ROUTE TRACE] artifact_null', routeTrace);
    return NextResponse.json(
      {
        error: NO_SIGNATURE_MESSAGE,
        gitSha,
        signedPdfReturn: 'artifact_null',
        ...routeTrace,
      },
      { status: 404, headers: deployHeaders('artifact_null') },
    );
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : classifySignedPdfGenerationError(err);
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    const signedPdfReturn =
      err instanceof SaleContractSignatureError ? 'access_error' : 'unhandled_generation_error';
    console.error('[CONTRACT_SIGNED_PDF]', message, {
      gitSha,
      signedPdfReturn,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: message, gitSha, signedPdfReturn },
      { status, headers: deployHeaders(signedPdfReturn) },
    );
  }
}
