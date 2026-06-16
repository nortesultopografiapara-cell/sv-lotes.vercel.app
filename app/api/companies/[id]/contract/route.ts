import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { buildSaasContractPdfWithMeta } from '@/lib/saasContractPdf';
import {
  countPdfPages,
  validateSaasContractPdfInput,
} from '@/lib/saasContractPdfValidation';
import { resolveStoredSaasContractContentVersion } from '@/lib/saasContractContent';
import { subscriptionDatesForContractPdf } from '@/lib/companySubscriptionDates';
import {
  getCompanyContractById,
  listCompanyContracts,
  loadFreshSaasContractContext,
  refreshCompanyContractDraftPdf,
  type CompanyContractRow,
} from '@/lib/saasContractService';
import { findActiveVisibleSaasContract } from '@/lib/saasContractArchive';
import { formatCompanyContractNumber } from '@/lib/companyContractNumber';
import {
  createSaasContractPdfResponse,
  fetchStoredSaasContractPdf,
  isPdfBytes,
} from '@/lib/saasContractPdfHttp';
import {
  detectSaasContractPdfContentVersion,
  storedPdfMatchesExpectedContentVersion,
} from '@/lib/saasContractPdfContentDetect';
import { SAAS_CONTRACT_CONTENT_VERSION } from '@/lib/saasContractContent';

export const runtime = 'nodejs';

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  console.error('SAAS_CONTRACT_PDF_HTTP_ERROR', { status, message, ...extra });
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

async function resolveContractRecord(
  supabaseAdmin: NonNullable<Awaited<ReturnType<typeof createServiceSupabase>>['client']>,
  companyId: string,
  contractId: string | null,
): Promise<CompanyContractRow | null> {
  if (contractId) {
    return getCompanyContractById(supabaseAdmin, companyId, contractId);
  }
  const contracts = await listCompanyContracts(supabaseAdmin, companyId, {
    includeArchived: false,
  });
  return findActiveVisibleSaasContract(contracts);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { client: supabaseAdmin, error: configError } = createServiceSupabase();
    if (!supabaseAdmin) {
      return jsonError(configError || 'Service role não configurada.', 500);
    }

    const { id: companyId } = await params;
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const download = url.searchParams.get('download') === '1';
    const inline = url.searchParams.get('inline') === '1' || !download;
    const contractId = url.searchParams.get('contractId');
    const metaOnly = url.searchParams.get('meta') === '1';

    const auth = await assertSuperAdmin(supabaseAdmin, userId);
    if (!auth.ok) {
      return jsonError(auth.error || 'Permissão negada.', 403);
    }

    const contractRecord = contractId
      ? await resolveContractRecord(supabaseAdmin, companyId, contractId)
      : await resolveContractRecord(supabaseAdmin, companyId, null);

    if (contractId && !contractRecord) {
      return jsonError('Contrato não encontrado.', 404, { contractId });
    }

    const { company, subscription } = await loadFreshSaasContractContext(
      supabaseAdmin,
      companyId,
    );

    const pdfDates = subscriptionDatesForContractPdf(subscription);
    const contractNumber =
      contractRecord?.contract_number ||
      subscription.contract_number ||
      formatCompanyContractNumber(1);
    const contentVersion = resolveStoredSaasContractContentVersion(contractRecord);
    const subForPdf = {
      contract_number: contractNumber,
      plan_type: subscription.plan_type,
      monthly_price: subscription.monthly_price,
      start_date: pdfDates.start_date,
      first_payment_date: pdfDates.first_payment_date,
      next_due_date: pdfDates.next_due_date,
    };

    let pdfBytes: Uint8Array | null = null;
    let source: 'pdf_signed_url' | 'contract_url' | 'regenerated' = 'regenerated';
    let pageCount = 0;
    let clausesCount = 0;

    const stored = await fetchStoredSaasContractPdf(contractRecord, contentVersion);
    if (stored) {
      pdfBytes = stored.bytes;
      source = stored.source;
      pageCount = countPdfPages(stored.bytes);
    }

    if (!pdfBytes) {
      let built;
      try {
        built = buildSaasContractPdfWithMeta({ company, subscription: subForPdf }, { contentVersion });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao gerar PDF';
        return jsonError(message, 500, { step: 'pdf_generation', companyId, contractId });
      }
      pdfBytes = built.pdf;
      pageCount = built.pageCount;
      clausesCount = built.clausesCount;
      source = 'regenerated';
    }

    if (
      contentVersion >= SAAS_CONTRACT_CONTENT_VERSION &&
      pdfBytes &&
      !storedPdfMatchesExpectedContentVersion(pdfBytes, contentVersion)
    ) {
      console.warn('SAAS_CONTRACT_PDF_CONTENT_MISMATCH', {
        company_id: companyId,
        contract_id: contractRecord?.id ?? null,
        expected_content_version: contentVersion,
        detected: detectSaasContractPdfContentVersion(pdfBytes),
        source,
      });
      let built;
      try {
        built = buildSaasContractPdfWithMeta({ company, subscription: subForPdf }, { contentVersion });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao gerar PDF v2';
        return jsonError(message, 500, { step: 'pdf_regeneration_v2', companyId, contractId });
      }
      pdfBytes = built.pdf;
      pageCount = built.pageCount;
      clausesCount = built.clausesCount;
      source = 'regenerated';
    }

    if (
      source === 'regenerated' &&
      contractRecord &&
      contentVersion >= SAAS_CONTRACT_CONTENT_VERSION &&
      pdfBytes?.length
    ) {
      try {
        await refreshCompanyContractDraftPdf(supabaseAdmin, contractRecord, pdfBytes);
      } catch (err) {
        console.warn('SAAS_CONTRACT_REFRESH_DRAFT_FAILED', {
          contract_id: contractRecord.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!pdfBytes?.length || !isPdfBytes(pdfBytes)) {
      return jsonError('PDF do contrato inválido ou vazio.', 500, {
        companyId,
        contractId,
        source,
      });
    }

    const validation = validateSaasContractPdfInput(
      { company, subscription: subForPdf },
      pdfBytes,
      contentVersion,
    );

    if (!clausesCount) {
      clausesCount = validation.clausesCount;
    }
    if (!pageCount) {
      pageCount = validation.pageCount;
    }

    console.log('SAAS_CONTRACT_PDF_SERVE', {
      company_id: companyId,
      contract_id: contractRecord?.id ?? null,
      contract_number: contractNumber,
      content_version: contentVersion,
      source,
      page_count: pageCount,
      clauses_count: clausesCount,
      bytes: pdfBytes.byteLength,
      validation_ok: validation.ok,
    });

    if (!validation.ok) {
      console.warn('SAAS_CONTRACT_PDF_VALIDATION_WARN', validation.errors);
    }

    if (metaOnly) {
      return NextResponse.json({
        success: true,
        company_id: companyId,
        contract_id: contractRecord?.id ?? null,
        contract_number: contractNumber,
        content_version: contentVersion,
        page_count: pageCount,
        clauses_count: clausesCount,
        source,
        validation,
        stored_contract_url: contractRecord?.contract_url ?? subscription.contract_pdf_url ?? null,
        pdf_signed_url: contractRecord?.pdf_signed_url ?? null,
      });
    }

    if (!download && !inline) {
      return NextResponse.json({
        company: { id: company.id, name: company.name, cnpj: company.cnpj },
        subscription,
        active_contract: contractRecord,
        pdf_meta: {
          page_count: pageCount,
          clauses_count: clausesCount,
          contract_number: contractNumber,
          content_version: contentVersion,
          source,
          validation_ok: validation.ok,
        },
      });
    }

    return createSaasContractPdfResponse(
      pdfBytes,
      download ? 'attachment' : 'inline',
      {
        contractId: contractRecord?.id ?? null,
        pageCount,
        clausesCount,
        contractNumber,
        contentVersion,
        source,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno ao servir PDF.';
    return jsonError(message, 500);
  }
}
