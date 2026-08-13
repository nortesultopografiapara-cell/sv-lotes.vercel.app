/**
 * Mapeamento único situacao Inter Cobrança V3 → status local / rótulo UI.
 */

export const INTER_SITUACAO_TO_BANK_STATUS = {
  RECEBIDO: 'PAID',
  PAGO: 'PAID',
  MARCADO_RECEBIDO: 'PAID',
  CANCELADO: 'CANCELLED',
  EXPIRADO: 'EXPIRED',
  A_RECEBER: 'REGISTERED',
  EM_PROCESSAMENTO: 'PENDING',
  ATRASADO: 'OVERDUE',
} as const;

export type InterBankStatus =
  | 'PENDING'
  | 'REGISTERED'
  | 'OVERDUE'
  | 'PAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export function normalizeInterSituacao(situacao: string | null | undefined): string {
  return String(situacao || '').trim().toUpperCase();
}

export function mapInterSituacaoToBankStatus(situacao: string | null | undefined): InterBankStatus {
  const s = normalizeInterSituacao(situacao);
  const mapped = INTER_SITUACAO_TO_BANK_STATUS[s as keyof typeof INTER_SITUACAO_TO_BANK_STATUS];
  return (mapped || 'PENDING') as InterBankStatus;
}

export function isInterSituacaoRecebido(situacao: string | null | undefined): boolean {
  return mapInterSituacaoToBankStatus(situacao) === 'PAID';
}

export function isInterSituacaoTerminal(situacao: string | null | undefined): boolean {
  const status = mapInterSituacaoToBankStatus(situacao);
  return status === 'PAID' || status === 'CANCELLED' || status === 'EXPIRED';
}

function todayIsoDate(): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today.toISOString().split('T')[0];
}

export function formatInterChargeStatusLabel(params: {
  situacao?: string | null;
  bankStatus?: string | null;
  dueDate?: string | null;
  todayStr?: string;
}): string {
  const situacao = normalizeInterSituacao(params.situacao);
  const status = String(params.bankStatus || mapInterSituacaoToBankStatus(situacao) || '')
    .trim()
    .toUpperCase();
  if (status === 'PAID' || situacao === 'RECEBIDO' || situacao === 'PAGO' || situacao === 'MARCADO_RECEBIDO') {
    return 'Pago/Recebido';
  }
  if (status === 'CANCELLED' || situacao === 'CANCELADO') return 'Cancelado';
  if (status === 'EXPIRED' || situacao === 'EXPIRADO') return 'Expirado';
  if (status === 'FAILED') return 'Erro';
  if (situacao === 'EM_PROCESSAMENTO' && status === 'PENDING') {
    const due = String(params.dueDate || '').slice(0, 10);
    const today = params.todayStr || todayIsoDate();
    if (due && due < today) return 'Atrasado';
    return 'Em processamento';
  }
  const due = String(params.dueDate || '').slice(0, 10);
  const today = params.todayStr || todayIsoDate();
  if (status === 'OVERDUE' || situacao === 'ATRASADO' || (due && due < today)) return 'Atrasado';
  if (situacao === 'A_RECEBER' || status === 'REGISTERED' || status === 'PENDING') return 'A receber';
  return 'A receber';
}
