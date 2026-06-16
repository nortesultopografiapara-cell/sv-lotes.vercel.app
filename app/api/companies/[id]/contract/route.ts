import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { buildSaasContractPdfWithMeta } from '@/lib/saasContractPdf';
import { validateSaasContractPdfInput } from '@/lib/saasContractPdfValidation';
import { resolveStoredSaasContractContentVersion } from '@/lib/saasContractContent';
import { subscriptionDatesForContractPdf } from '@/lib/companySubscriptionDates';
import { listCompanyContracts } from '@/lib/saasContractService';
import { findActiveVisibleSaasContract } from '@/lib/saasContractArchive';
import { formatCompanyContractNumber } from '@/lib/companyContractNumber';

export const runtime = 'nodejs';

function pdfResponse(
  pdfBytes: Uint8Array,
  companyId: string,
  disposition: 'inline' | 'attachment',
  meta: {
    contractId?: string | null;
    pageCount: number;
    clausesCount: number;
    contractNumber: string;
  },
) {
  const filename = `contrato-saas-${meta.contractNumber || companyId}.pdf`;
  console.log('SAAS_CONTRACT_PDF_SERVE', {
    company_id: companyId,
    contract_id: meta.contractId ?? null,
    contract_number: meta.contractNumber,
    page_count: meta.pageCount,
    clauses_count: meta.clausesCount,
    bytes: pdfBytes.byteLength,
    disposition,
  });

  return new NextResponse(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        disposition === 'attachment'
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Saas-Contract-Pages': String(meta.pageCount),
      'X-Saas-Contract-Clauses': String(meta.clausesCount),
      'X-Saas-Contract-Number': meta.contractNumber,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
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
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (companyErr || !company) {
    return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
  }

  const subscription = await getSubscriptionByCompanyId(supabaseAdmin, companyId);
  if (!subscription) {
    return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });
  }

  const contracts = await listCompanyContracts(supabaseAdmin, companyId, {
    includeArchived: true,
  });
  const activeContract =
    (contractId
      ? contracts.find((c) => c.id === contractId)
      : findActiveVisibleSaasContract(contracts)) ?? null;

  const pdfDates = subscriptionDatesForContractPdf(subscription);
  const subForPdf = {
    contract_number:
      activeContract?.contract_number ||
      subscription.contract_number ||
      formatCompanyContractNumber(1),
    plan_type: subscription.plan_type,
    monthly_price: subscription.monthly_price,
    start_date: pdfDates.start_date,
    first_payment_date: pdfDates.first_payment_date,
    next_due_date: pdfDates.next_due_date,
  };

  const contentVersion = resolveStoredSaasContractContentVersion(activeContract);

  let built;
  try {
    built = buildSaasContractPdfWithMeta({ company, subscription: subForPdf }, { contentVersion });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar PDF';
    console.error('SAAS_CONTRACT_PDF_BUILD_ERROR', { companyId, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const validation = validateSaasContractPdfInput(
    { company, subscription: subForPdf },
    built.pdf,
    contentVersion,
  );

  console.log('SAAS_CONTRACT_PDF_VALIDATION', {
    company_id: companyId,
    contract_id: activeContract?.id ?? null,
    ok: validation.ok,
    page_count: built.pageCount,
    clauses_count: built.clausesCount,
    errors: validation.errors,
  });

  if (!validation.ok) {
    console.warn('SAAS_CONTRACT_PDF_VALIDATION_WARN', validation.errors);
  }

  if (metaOnly) {
    return NextResponse.json({
      success: true,
      company_id: companyId,
      contract_id: activeContract?.id ?? null,
      contract_number: built.contractNumber,
      page_count: built.pageCount,
      clauses_count: built.clausesCount,
      validation,
      stored_contract_url: activeContract?.contract_url ?? subscription.contract_pdf_url ?? null,
    });
  }

  if (!download && !inline) {
    return NextResponse.json({
      company: { id: company.id, name: company.name, cnpj: company.cnpj },
      subscription,
      active_contract: activeContract,
      pdf_meta: {
        page_count: built.pageCount,
        clauses_count: built.clausesCount,
        contract_number: built.contractNumber,
        validation_ok: validation.ok,
      },
    });
  }

  return pdfResponse(built.pdf, companyId, download ? 'attachment' : 'inline', {
    contractId: activeContract?.id ?? null,
    pageCount: built.pageCount,
    clausesCount: built.clausesCount,
    contractNumber: built.contractNumber,
  });
}
