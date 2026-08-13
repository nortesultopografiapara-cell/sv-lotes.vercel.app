import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';

export const INTER_OFFICIAL_PDF_HINT =
  'O Inter fornece PDF oficial do boleto em GET /cobranca/v3/cobrancas/{codigoSolicitacao}/pdf. Carnê PDF Asaas não se aplica a esta cobrança.';

export const INTER_PDF_NOT_MATERIALIZED_HINT =
  'PDF oficial do boleto Inter ainda não materializado. Atualize os dados da cobrança (consulta GET). Não será emitida nova cobrança.';

export function resolveInterIssuedChargeActions(params: {
  charge: CompanyAsaasChargeResponse | null | undefined;
  installmentPaid: boolean;
}): {
  hasExternalId: boolean;
  hideGenerate: boolean;
  showCopyLinha: boolean;
  showCopyPix: boolean;
  showOfficialPdf: boolean;
  showRefresh: boolean;
  officialPdfUnavailableReason: string | null;
} {
  const charge = params.charge;
  const externalId = String(charge?.asaasPaymentId || '').trim();
  const hasExternalId = Boolean(externalId);
  const paid = params.installmentPaid || charge?.status === 'PAID';
  const linha = String(charge?.bankSlipIdentification || '').trim();
  const barcode = String(charge?.barCode || '').replace(/\D/g, '');
  const pix = String(charge?.pixCopyPaste || '').trim();
  const nosso = String(charge?.nossoNumero || '').trim();
  const hasBoletoArtifact = Boolean(linha || barcode.length >= 44 || nosso);
  const showOfficialPdf = hasExternalId && hasBoletoArtifact && !paid;

  return {
    hasExternalId,
    hideGenerate: hasExternalId,
    showCopyLinha: Boolean(linha) && !paid,
    showCopyPix: Boolean(pix) && !paid,
    showOfficialPdf,
    showRefresh: hasExternalId && !paid,
    officialPdfUnavailableReason: hasExternalId && !showOfficialPdf && !paid
      ? INTER_PDF_NOT_MATERIALIZED_HINT
      : hasExternalId
        ? INTER_OFFICIAL_PDF_HINT
        : null,
  };
}
