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
import {
  getPartyByPublicToken,
  listSignatureParties,
} from '@/lib/saleContractSignatureParties';
import { markPartyOrLegacyViewed } from '@/lib/saleContractSignaturePartyFlow';
import { saleSignaturePartyRoleLabel } from '@/lib/saleContractSignaturePartyTypes';
import {
  computeAggregateSaleSignatureStatus,
  toPartyStatusSnapshots,
} from '@/lib/saleContractSignaturePartyStatus';

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

  const party = await getPartyByPublicToken(supabaseAdmin, token);
  let partyRole: string | null = null;
  let partyCanSign = false;
  let partyStatus: string = signature.signature_status;
  let signerDisplayName: string | null = null;
  let awaitingOtherBuyers = false;

  if (party && party.contract_signature_id === signature.id) {
    partyRole = party.role;
    signerDisplayName = party.signer_name;
    partyStatus = party.status;
    partyCanSign = canPublicSaleSign(party.status);

    if (String(party.status).toUpperCase() === 'PENDING') {
      const viewed = await markPartyOrLegacyViewed(supabaseAdmin, token, signature, {
        ipAddress: resolveClientIp(request),
        userAgent: request.headers.get('user-agent'),
      });
      signature = viewed.signature as typeof signature;
      if (viewed.party) {
        partyStatus = viewed.party.status;
        partyCanSign = canPublicSaleSign(viewed.party.status);
      }
    }

    const parties = await listSignatureParties(supabaseAdmin, signature.id);
    const aggregate = computeAggregateSaleSignatureStatus(
      toPartyStatusSnapshots(parties),
    );
    awaitingOtherBuyers = aggregate === 'PARTIALLY_SIGNED';
  } else if (signature.signature_status === 'PENDING') {
    signature = await markSaleSignatureViewed(supabaseAdmin, signature, {
      ipAddress: resolveClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });
  }

  const processBlocked = isSaleSignatureBlocked(signature.signature_status);
  const blocked = party
    ? ['SIGNED', 'CANCELLED', 'EXPIRED', 'ERROR'].includes(
        String(partyStatus).toUpperCase(),
      ) || ['SIGNED', 'CANCELLED', 'EXPIRED'].includes(
        String(signature.signature_status).toUpperCase(),
      )
    : processBlocked;
  const buyerName =
    String(
      signerDisplayName ||
        customer?.name ||
        contract.signed_by_name ||
        '',
    ).trim() || null;

  const roleLabel = partyRole
    ? saleSignaturePartyRoleLabel(partyRole)
    : 'Comprador';

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
      document:
        party?.signer_cpf ||
        customer?.document ||
        customer?.cpf ||
        null,
      email:
        String(
          party?.signer_email ||
            customer?.email ||
            customer?.contact_email ||
            '',
        ).trim() || null,
    },
    party: partyRole
      ? {
          role: partyRole,
          roleLabel,
          status: partyStatus,
          statusLabel: saleSignatureStatusLabel(
            partyRole === 'SPOUSE' || partyRole === 'BUYER'
              ? partyStatus === 'SIGNED'
                ? 'CLIENT_SIGNED'
                : partyStatus
              : partyStatus,
          ),
        }
      : null,
    signature: {
      status: signature.signature_status,
      statusLabel: saleSignatureStatusLabel(signature.signature_status),
      expiresAt: party?.expires_at || signature.expires_at,
      signedAt: party?.signed_at || signature.signed_at,
      signerName: party?.signer_name || signature.signer_name,
      signerDocument: (party?.signer_cpf || signature.signer_document)
        ? formatCpfCnpj(String(party?.signer_cpf || signature.signer_document))
        : null,
      blocked,
      canSign: party ? partyCanSign && !blocked : canPublicSaleSign(signature.signature_status),
      awaitingVendor: signature.signature_status === 'CLIENT_SIGNED',
      awaitingOtherBuyers,
      title:
        partyRole === 'SPOUSE'
          ? 'Assinatura do cônjuge anuente'
          : 'Assinatura do comprador',
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
      awaitingVendor:
        result.awaitingVendor ??
        result.signature.signature_status === 'CLIENT_SIGNED',
      awaitingOtherBuyers: result.awaitingOtherBuyers ?? false,
      partyRole: result.partyRole || null,
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
