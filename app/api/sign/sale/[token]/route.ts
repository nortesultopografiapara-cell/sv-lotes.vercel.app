import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { formatCpfCnpj } from '@/lib/inputMasks';
import {
  createSaleContractHtmlPreviewResponse,
  createSaleContractPdfResponse,
} from '@/lib/saleContractPdfHttp';
import {
  logSaleSignPdfError,
  SALE_SIGN_PDF_DOWNLOAD_ERROR,
  shouldExposeSaleSignPdfError,
} from '@/lib/saleContractPdfErrors';
import {
  canPublicSaleSign,
  isSaleSignatureBlocked,
  saleSignatureStatusLabel,
} from '@/lib/saleContractSignatureStatus';
import {
  getSaleSignatureByToken,
  isSignatureExpired,
  loadSaleSignPageContext,
  loadSaleContractHtmlForSign,
  loadSaleContractPdfForSign,
  markSaleSignatureViewed,
  resolveClientIp,
  SaleContractSignatureError,
  signSaleContractElectronically,
} from '@/lib/saleContractSignatureService';

export const runtime = 'nodejs';
export const maxDuration = 60;

function resolveQuadra(block: Record<string, unknown> | null): string {
  if (!block) return '—';
  return String(block.quadra || block.block_name || block.name || '—');
}

function resolveLote(
  block: Record<string, unknown> | null,
  contract: Record<string, unknown>,
): string {
  if (block) {
    return String(block.lot_number || block.lote || block.number || '—');
  }
  return String(contract.lot_number_snapshot || '—');
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

  let signature = await getSaleSignatureByToken(supabaseAdmin, token);
  if (!signature) {
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 });
  }

  if (isSignatureExpired(signature.expires_at) && !isSaleSignatureBlocked(signature.signature_status)) {
    if (signature.signature_status !== 'EXPIRED') {
      const { data } = await supabaseAdmin
        .from('contract_signatures')
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

  const ctx = await loadSaleSignPageContext(supabaseAdmin, signature);
  const { contract, customer, block, project, company } = ctx;

  if (pdf) {
    const contractNumber = String(contract.contract_number || '');
    try {
      const { pdf: pdfBytes, contractNumber: resolvedNumber } =
        await loadSaleContractPdfForSign(
          supabaseAdmin,
          signature.contract_id,
          {
            signature,
            signContext: ctx,
          },
        );
      return createSaleContractPdfResponse(
        pdfBytes,
        download ? 'attachment' : 'inline',
        resolvedNumber || contractNumber,
      );
    } catch (err) {
      const detail = logSaleSignPdfError(
        {
          token: token.slice(0, 8),
          contract_id: signature.contract_id,
          contract_number: contractNumber,
          download,
        },
        err,
      );

      if (!download) {
        try {
          const html = await loadSaleContractHtmlForSign(
            supabaseAdmin,
            signature.contract_id,
          );
          console.warn('[sale-sign-pdf] using HTML preview fallback', {
            token: token.slice(0, 8),
            contract_id: signature.contract_id,
          });
          return createSaleContractHtmlPreviewResponse(html, contractNumber);
        } catch (htmlErr) {
          logSaleSignPdfError(
            {
              token: token.slice(0, 8),
              contract_id: signature.contract_id,
              stage: 'html-preview-fallback',
            },
            htmlErr,
          );
        }
      }

      const message =
        err instanceof SaleContractSignatureError
          ? err.message
          : download
            ? SALE_SIGN_PDF_DOWNLOAD_ERROR
            : 'Falha ao gerar PDF do contrato.';

      return NextResponse.json(
        {
          error: message,
          ...(shouldExposeSaleSignPdfError() ? { detail: detail.message } : {}),
        },
        { status: download ? 503 : 502 },
      );
    }
  }

  if (signature.signature_status === 'PENDING') {
    signature = await markSaleSignatureViewed(supabaseAdmin, signature, {
      ipAddress: resolveClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
  }

  const blocked = isSaleSignatureBlocked(signature.signature_status);
  const buyerName =
    String(customer?.name || contract.signed_by_name || '').trim() || null;

  return NextResponse.json({
    success: true,
    contract: {
      id: contract.id,
      number: contract.contract_number,
      status: contract.status,
    },
    company: company
      ? {
          id: company.id,
          name: company.fantasy_name || company.name,
          cnpj: company.cnpj,
        }
      : null,
    lot: {
      quadra: resolveQuadra(block),
      lote: resolveLote(block, contract),
      project:
        String(
          project?.name ||
            contract.project_name_snapshot ||
            '—',
        ),
    },
    buyer: {
      name: buyerName,
      document: customer?.document || customer?.cpf || null,
      email:
        String(customer?.email || customer?.contact_email || '').trim() || null,
    },
    signature: {
      status: signature.signature_status,
      statusLabel: saleSignatureStatusLabel(signature.signature_status),
      expiresAt: signature.expires_at,
      signedAt: signature.signed_at,
      signerName: signature.signer_name,
      signerDocument: signature.signer_document
        ? formatCpfCnpj(signature.signer_document)
        : null,
      blocked,
      canSign: canPublicSaleSign(signature.signature_status),
    },
    pdfUrl: `/api/sign/sale/${encodeURIComponent(token)}?pdf=1`,
    pdfDownloadUrl: `/api/sign/sale/${encodeURIComponent(token)}?pdf=1&download=1`,
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
    const result = await signSaleContractElectronically(supabaseAdmin, token, {
      signerName: String(body.signerName || ''),
      signerDocument: String(body.signerDocument || ''),
      signerEmail: String(body.signerEmail || ''),
      ipAddress: resolveClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      success: true,
      signature: result.signature,
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao assinar contrato.';
    const status =
      err instanceof SaleContractSignatureError && err.step === 'validation' ? 400 : 500;
    console.error('SALE_CONTRACT_SIGN_ERROR', { token: token.slice(0, 8), message });
    return NextResponse.json({ error: message }, { status });
  }
}
