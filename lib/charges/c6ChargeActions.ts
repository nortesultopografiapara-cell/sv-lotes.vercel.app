import { c6BolepixV2CanShare } from '@/lib/banking/c6/c6BolepixV2Status';

export type C6BolepixActionInput = {
  api: 'v2';
  bankStatus?: string | null;
  billingType?: string | null;
  pixCopyPaste?: string | null;
  pixQrAvailable?: boolean;
  pdfAvailable?: boolean;
  statusMessage?: string | null;
};

export type C6ChargeActionInput = {
  externalId?: string | null;
  status?: string | null;
  digitableLine?: string | null;
  barCode?: string | null;
  installmentPaid: boolean;
  ownerReadOnly: boolean;
  uncertain: boolean;
  rejectionMessage?: string | null;
  bolepix?: C6BolepixActionInput | null;
};

export type C6ChargeActionVisibility = {
  showGenerate: boolean;
  showView: boolean;
  showDownload: boolean;
  showCopyLine: boolean;
  showCopyPix: boolean;
  showQr: boolean;
  showWhatsApp: boolean;
  showPaid: boolean;
  notice: string | null;
  bankStatusLabel: string | null;
};

export function resolveC6ChargeActions(input: C6ChargeActionInput): C6ChargeActionVisibility {
  const externalId = String(input.externalId || '').trim();
  const status = String(input.status || '').toUpperCase();
  const paid = input.installmentPaid || status === 'PAID';
  const registered = Boolean(externalId) && status !== 'FAILED' && status !== 'CANCELLED' && status !== 'EXPIRED';
  const line = String(input.digitableLine || '').trim();
  const barcode = String(input.barCode || '').replace(/\D/g, '');
  const v2 = input.bolepix?.api === 'v2';
  const notice = input.uncertain
    ? 'Resultado bancário incerto. Nova emissão bloqueada até a consulta.'
    : v2 && !paid
      ? input.bolepix?.statusMessage?.trim() ||
        'O C6 criou a cobrança. Isso não confirma que ela já pode ser paga na rede bancária.'
      : registered && !paid
        ? 'O C6 confirmou a emissão. A consulta oficial não informa se o boleto já pode ser pago na rede bancária.'
        : input.rejectionMessage?.trim() || null;
  const copyLine = Boolean(line || barcode.length >= 44) && !paid;
  const pdfReady = v2 ? Boolean(input.bolepix?.pdfAvailable) : registered;

  return {
    showGenerate: v2 ? false : !input.ownerReadOnly && !paid && !registered && !input.uncertain,
    showView: pdfReady,
    showDownload: pdfReady,
    showCopyLine: copyLine,
    showCopyPix: Boolean(v2 && input.bolepix?.pixCopyPaste && !paid),
    showQr: Boolean(v2 && input.bolepix?.pixQrAvailable && !paid),
    showWhatsApp: v2
      ? c6BolepixV2CanShare({
          status: input.bolepix?.bankStatus,
          billingType: input.bolepix?.billingType,
          digitableLine: line,
          pixCopyPaste: input.bolepix?.pixCopyPaste,
        })
      : Boolean(registered && !paid && copyLine),
    showPaid: paid,
    notice: paid ? null : notice,
    bankStatusLabel: v2 ? input.bolepix?.bankStatus || null : null,
  };
}
