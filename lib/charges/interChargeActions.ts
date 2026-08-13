import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';

export const INTER_OFFICIAL_PDF_HINT =
  'Baixar boleto consulta o PDF oficial do Banco Inter. Nenhuma cobrança nova é emitida.';

export const INTER_PDF_NOT_MATERIALIZED_HINT =
  'PDF oficial do boleto Inter ainda não materializado. Atualize os dados da cobrança (consulta GET). Não será emitida nova cobrança.';

export function resolveInterIssuedChargeActions(params: {
  charge: CompanyAsaasChargeResponse | null | undefined;
  installmentPaid: boolean;
  customerEmail?: string | null;
  customerPhone?: string | null;
}): {
  hasExternalId: boolean;
  hideGenerate: boolean;
  showCopyLinha: boolean;
  showCopyPix: boolean;
  showOfficialPdf: boolean;
  showRefresh: boolean;
  showWhatsApp: boolean;
  showEmail: boolean;
  artifactsPending: boolean;
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
  const artifactsPending = hasExternalId && !hasBoletoArtifact && !pix && !paid;
  const phone = String(params.customerPhone || '').replace(/\D/g, '');
  const email = String(params.customerEmail || '').trim();
  const hasShareableArtifacts = Boolean(linha || pix);

  return {
    hasExternalId,
    hideGenerate: hasExternalId,
    showCopyLinha: Boolean(linha) && !paid,
    showCopyPix: Boolean(pix) && !paid,
    showOfficialPdf: hasExternalId,
    showRefresh: hasExternalId,
    showWhatsApp: hasExternalId && phone.length >= 10 && hasShareableArtifacts && !paid,
    showEmail: hasExternalId && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && hasShareableArtifacts,
    artifactsPending,
    officialPdfUnavailableReason: artifactsPending
      ? INTER_PDF_NOT_MATERIALIZED_HINT
      : hasExternalId
        ? INTER_OFFICIAL_PDF_HINT
        : null,
  };
}
