export type C6ChargeActionInput = {
  externalId?: string | null;
  status?: string | null;
  digitableLine?: string | null;
  barCode?: string | null;
  installmentPaid: boolean;
  ownerReadOnly: boolean;
  uncertain: boolean;
  rejectionMessage?: string | null;
};

export type C6ChargeActionVisibility = {
  showGenerate: boolean;
  showView: boolean;
  showDownload: boolean;
  showCopyLine: boolean;
  showPaid: boolean;
  notice: string | null;
};

export function resolveC6ChargeActions(input: C6ChargeActionInput): C6ChargeActionVisibility {
  const externalId = String(input.externalId || '').trim();
  const status = String(input.status || '').toUpperCase();
  const paid = input.installmentPaid || status === 'PAID';
  const registered = Boolean(externalId) && status !== 'FAILED' && status !== 'CANCELLED' && status !== 'EXPIRED';
  const line = String(input.digitableLine || '').trim();
  const barcode = String(input.barCode || '').replace(/\D/g, '');
  const notice = input.uncertain
    ? 'Resultado bancário incerto. Nova emissão bloqueada até a consulta.'
    : registered && !paid
      ? 'O C6 confirmou a emissão. A consulta oficial não informa se o boleto já pode ser pago na rede bancária.'
      : input.rejectionMessage?.trim() || null;

  return {
    showGenerate: !input.ownerReadOnly && !paid && !registered && !input.uncertain,
    showView: registered,
    showDownload: registered,
    showCopyLine: Boolean(line || barcode.length >= 44) && !paid,
    showPaid: paid,
    notice: paid ? null : notice,
  };
}
