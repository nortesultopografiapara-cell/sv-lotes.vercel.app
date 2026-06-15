import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { buildSaasContractPdfWithMeta } from '@/lib/saasContractPdf';
import { subscriptionDatesForContractPdf } from '@/lib/companySubscriptionDates';
import {
  getSignatureByToken,
  isSignatureExpired,
  markContractSignatureViewed,
  resolveClientIp,
  signContractElectronically,
} from '@/lib/saasContractSignatureService';
import { SaasContractStepError } from '@/lib/saasContractErrors';
import { loadFreshSaasContractContext } from '@/lib/saasContractService';
import { formatCpfCnpj } from '@/lib/inputMasks';
import { signatureStatusLabel } from '@/lib/saasContractStatus';

export const runtime = 'nodejs';

function pdfResponse(pdfBytes: Uint8Array, contractNumber: string, disposition: 'inline' | 'attachment') {
  const filename = `contrato-saas-${contractNumber}.pdf`;
  return new NextResponse(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        disposition === 'attachment'
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { token } = await params;
  const url = new URL(request.url);
  const download = url.searchParams.get('download') === '1';
  const pdf = url.searchParams.get('pdf') === '1';

  let signature = await getSignatureByToken(supabaseAdmin, token);
  if (!signature) {
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 });
  }

  if (isSignatureExpired(signature.expires_at) && signature.signature_status !== 'SIGNED') {
    if (signature.signature_status !== 'EXPIRED') {
      const { data } = await supabaseAdmin
        .from('company_contract_signatures')
        .update({
          signature_status: 'EXPIRED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', signature.id)
        .select('*')
        .single();
      if (data) signature = data as typeof signature;
    }
  }

  const { data: contract } = await supabaseAdmin
    .from('company_contracts')
    .select('id, contract_number, contract_url, pdf_signed_url, status, version')
    .eq('id', signature.contract_id)
    .single();

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('id, name, cnpj, email')
    .eq('id', signature.company_id)
    .single();

  if (!contract || !company) {
    return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 });
  }

  if (pdf) {
    if (signature.signature_status === 'SIGNED' && contract.pdf_signed_url) {
      const signedRes = await fetch(contract.pdf_signed_url);
      if (signedRes.ok) {
        const bytes = new Uint8Array(await signedRes.arrayBuffer());
        return pdfResponse(bytes, contract.contract_number, download ? 'attachment' : 'inline');
      }
    }

    const { company: companyFull, subscription } = await loadFreshSaasContractContext(
      supabaseAdmin,
      signature.company_id,
    );
    const pdfDates = subscriptionDatesForContractPdf(subscription);
    const built = buildSaasContractPdfWithMeta({
      company: companyFull,
      subscription: {
        contract_number: contract.contract_number,
        plan_type: subscription.plan_type,
        monthly_price: subscription.monthly_price,
        start_date: pdfDates.start_date,
        first_payment_date: pdfDates.first_payment_date,
        next_due_date: pdfDates.next_due_date,
      },
    });
    return pdfResponse(
      built.pdf,
      contract.contract_number,
      download ? 'attachment' : 'inline',
    );
  }

  if (signature.signature_status === 'PENDING') {
    signature = await markContractSignatureViewed(supabaseAdmin, signature, {
      ipAddress: resolveClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
  }

  const blocked =
    signature.signature_status === 'SIGNED' ||
    signature.signature_status === 'EXPIRED' ||
    signature.signature_status === 'CANCELLED';

  return NextResponse.json({
    success: true,
    contract: {
      id: contract.id,
      number: contract.contract_number,
      status: contract.status,
    },
    company: {
      id: company.id,
      name: company.name,
      cnpj: company.cnpj,
    },
    signature: {
      status: signature.signature_status,
      statusLabel: signatureStatusLabel(signature.signature_status),
      expiresAt: signature.expires_at,
      signedAt: signature.signed_at,
      signerName: signature.signer_name,
      signerDocument: signature.signer_document
        ? formatCpfCnpj(signature.signer_document)
        : null,
      blocked,
      canSign: signature.signature_status === 'PENDING' || signature.signature_status === 'VIEWED',
    },
    pdfUrl: `/api/sign/${encodeURIComponent(token)}?pdf=1`,
    pdfDownloadUrl: `/api/sign/${encodeURIComponent(token)}?pdf=1&download=1`,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { token } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const result = await signContractElectronically(supabaseAdmin, token, {
      signerName: String(body.signerName || ''),
      signerDocument: String(body.signerDocument || ''),
      signerEmail: String(body.signerEmail || ''),
      signerRole: body.signerRole ? String(body.signerRole) : null,
      ipAddress: resolveClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      success: true,
      signature: result.signature,
      pdfSignedUrl: result.pdfSignedUrl,
    });
  } catch (err) {
    const message =
      err instanceof SaasContractStepError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao assinar contrato.';
    const status = err instanceof SaasContractStepError && err.step === 'validation' ? 400 : 500;
    console.error('SAAS_CONTRACT_SIGN_ERROR', { token: token.slice(0, 8), message });
    return NextResponse.json({ error: message }, { status });
  }
}
