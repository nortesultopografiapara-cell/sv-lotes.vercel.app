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

export type C6BankDiagnosticView = {
  httpStatus: number | null;
  code: string | null;
  message: string | null;
  field: string | null;
};

export type C6SituationView = C6BankDiagnosticView & {
  externalReference?: string | null;
  bankStatus?: string | null;
  bankId?: string | null;
  traceId?: string | null;
  titleFound?: boolean;
};

export function c6SituationLines(view: C6SituationView | null | undefined): string[] {
  const lines = c6BankDiagnosticLines(view);
  if (!view) return lines;
  if (view.externalReference) lines.push(`Referência: ${view.externalReference}`);
  if (view.bankStatus) lines.push(`Status bancário: ${view.bankStatus}`);
  if (view.bankId) lines.push(`Identificador: ${view.bankId}`);
  if (view.traceId) lines.push(`Rastreio: ${view.traceId}`);
  if (view.httpStatus === 404) {
    lines.push('O título não foi localizado. A referência não foi autorizada para reutilização.');
  }
  if (view.titleFound) lines.push('Título localizado. Nova emissão bloqueada até a reconciliação.');
  return lines;
}

export function c6BankDiagnosticLines(view: C6BankDiagnosticView | null | undefined): string[] {
  if (!view || (view.httpStatus == null && !view.code && !view.message && !view.field)) return [];
  const lines = [`C6 Bank — HTTP ${view.httpStatus ?? 'sem resposta'}`];
  if (view.code) lines.push(`Código: ${view.code}`);
  if (view.message) lines.push(`Motivo: ${view.message}`);
  if (view.field) lines.push(`Campo: ${view.field}`);
  return lines;
}

export type C6ChargeActionInput = {
  externalId?: string | null;
  status?: string | null;
  digitableLine?: string | null;
  barCode?: string | null;
  installmentPaid: boolean;
  ownerReadOnly: boolean;
  uncertain: boolean;
  attemptLocked?: boolean;
  preparedAttempt?: boolean;
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
  noticeTone: 'info' | 'warning' | 'error';
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
  const rejection = input.rejectionMessage?.trim() || '';
  const notice = input.uncertain
    ? rejection || 'Resultado bancário incerto. Nova emissão bloqueada até a consulta.'
    : v2 && !paid
      ? input.bolepix?.statusMessage?.trim() ||
        'O C6 criou a cobrança. Isso não confirma que ela já pode ser paga na rede bancária.'
      : registered && !paid
        ? 'O C6 confirmou a emissão. A consulta oficial não informa se o boleto já pode ser pago na rede bancária.'
        : rejection || null;
  const noticeTone = input.uncertain
    ? 'warning'
    : !paid && !v2 && !registered && rejection
      ? 'error'
      : 'info';
  const copyLine = Boolean(line || barcode.length >= 44) && !paid;
  const pdfReady = v2 ? Boolean(input.bolepix?.pdfAvailable) : registered;

  return {
    showGenerate:
      v2 || (input.attemptLocked && !input.preparedAttempt)
        ? false
        : !input.ownerReadOnly && !paid && !registered && !input.uncertain,
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
    noticeTone: paid ? 'info' : noticeTone,
    bankStatusLabel: v2 ? input.bolepix?.bankStatus || null : null,
  };
}
