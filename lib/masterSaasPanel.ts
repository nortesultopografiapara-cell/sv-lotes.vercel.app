/**
 * Painel Master SaaS — status de cobrança, timeline e regras de automação.
 */

import type { SaasInvoiceChargeRow } from '@/lib/saasInvoiceChargeView';
import { normalizeWhatsAppPhone } from '@/lib/saasContractSignatureShare';
import { SAAS_AUTO_SUSPEND_AFTER_DAYS } from '@/lib/saasMasterConfig';

export type SaasPanelView = 'dashboard' | 'empresas' | 'cobrancas' | 'automacoes' | 'caixa';

export type SaasCompanyTab = 'dados' | 'contrato' | 'assinatura' | 'cobrancas' | 'historico';

export type SaasChargeDisplayStatus =
  | 'GERADA'
  | 'ENVIADA'
  | 'VISUALIZADA'
  | 'PAGA'
  | 'VENCIDA'
  | 'CANCELADA';

export type SaasTimelineEventType =
  | 'charge_created'
  | 'whatsapp_sent'
  | 'email_sent'
  | 'charge_viewed'
  | 'payment_confirmed'
  | 'company_suspended'
  | 'company_reactivated';

export type SaasTimelineEvent = {
  id: string;
  at: string;
  type: SaasTimelineEventType;
  title: string;
  detail?: string;
};

export type SaasAutomationRule = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  phase: 'pre_due' | 'due' | 'overdue' | 'lifecycle';
};

/** Regras de automação SaaS — lembretes por e-mail ativos via cron diário. */
export const SAAS_AUTOMATION_RULES: SaasAutomationRule[] = [
  {
    id: 'reminder_7d',
    label: 'Lembrete 7 dias antes',
    description: 'Envia e-mail e WhatsApp 7 dias antes do vencimento com link Asaas.',
    enabled: true,
    phase: 'pre_due',
  },
  {
    id: 'reminder_3d',
    label: 'Reenvio 3 dias antes',
    description: 'Envia e-mail e WhatsApp 3 dias antes do vencimento.',
    enabled: true,
    phase: 'pre_due',
  },
  {
    id: 'reminder_due',
    label: 'Reenvio no vencimento',
    description: 'Envia e-mail e WhatsApp no dia do vencimento.',
    enabled: true,
    phase: 'due',
  },
  {
    id: 'friendly_overdue',
    label: 'Cobrança amigável',
    description: 'Envia e-mail e WhatsApp após vencimento (sem suspender).',
    enabled: true,
    phase: 'overdue',
  },
  {
    id: 'auto_suspend',
    label: 'Suspensão automática',
    description: `Suspende tenant após ${SAAS_AUTO_SUSPEND_AFTER_DAYS} dias de inadimplência SaaS sem pagamento da competência.`,
    enabled: true,
    phase: 'overdue',
  },
  {
    id: 'auto_reactivate',
    label: 'Reativação automática',
    description: 'Reativa empresa quando pagamento Asaas é confirmado.',
    enabled: true,
    phase: 'lifecycle',
  },
];

const CHARGE_STATUS_LABEL: Record<SaasChargeDisplayStatus, string> = {
  GERADA: 'Gerada',
  ENVIADA: 'Enviada',
  VISUALIZADA: 'Visualizada',
  PAGA: 'Paga',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
};

const CHARGE_STATUS_TONE: Record<SaasChargeDisplayStatus, string> = {
  GERADA: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  ENVIADA: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  VISUALIZADA: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  PAGA: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  VENCIDA: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  CANCELADA: 'text-gray-400 bg-white/5 border-white/10',
};

export function saasChargeDisplayStatusLabel(status: SaasChargeDisplayStatus): string {
  return CHARGE_STATUS_LABEL[status];
}

export function saasChargeDisplayStatusTone(status: SaasChargeDisplayStatus): string {
  return CHARGE_STATUS_TONE[status];
}

/** Mapeia status Asaas (API ou rótulo interno) → status visual do painel. */
export function mapAsaasStatusToDisplayStatus(
  raw: string | null | undefined,
): SaasChargeDisplayStatus | null {
  const s = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (!s) return null;
  if (s.includes('DELETED') || s.includes('CANCEL')) return 'CANCELADA';
  if (s.includes('RECEIVED') || s.includes('CONFIRM') || s === 'PAID' || s.includes('PAGO'))
    return 'PAGA';
  if (s.includes('OVERDUE') || s.includes('VENCID')) return 'VENCIDA';
  if (s.includes('VIEWED') || s.includes('VISUALIZ')) return 'VISUALIZADA';
  if (s.includes('LINK') && s.includes('ENVIAD')) return 'ENVIADA';
  if (s.includes('ENVIAD') && !s.includes('RECEB')) return 'ENVIADA';
  if (s.includes('PENDING') || s.includes('PENDENTE') || s.includes('AWAITING')) return 'GERADA';
  return null;
}

/** Mapeia charge/fatura interna → status operacional do painel. */
export function resolveSaasChargeDisplayStatus(
  row: SaasInvoiceChargeRow,
  hints?: { sentWhatsApp?: boolean; sentEmail?: boolean; viewed?: boolean },
): SaasChargeDisplayStatus {
  const chargeStatus = String(row.chargeStatus || '').toUpperCase();
  const invoiceStatus = String(row.invoiceStatus || '').toUpperCase();

  if (chargeStatus === 'CANCELLED' || invoiceStatus === 'CANCELADO') return 'CANCELADA';
  if (chargeStatus === 'PAID' || invoiceStatus === 'PAGO') return 'PAGA';
  if (chargeStatus === 'OVERDUE' || invoiceStatus === 'VENCIDO') return 'VENCIDA';

  if (hints?.viewed) return 'VISUALIZADA';
  if (hints?.sentWhatsApp || hints?.sentEmail) return 'ENVIADA';

  const fromAsaasLabel = mapAsaasStatusToDisplayStatus(row.asaasStatus);
  if (fromAsaasLabel && fromAsaasLabel !== 'GERADA') return fromAsaasLabel;

  const fromCharge = mapAsaasStatusToDisplayStatus(chargeStatus);
  if (fromCharge) return fromCharge;

  if (row.paymentId || row.pixCopyPaste || row.paymentUrl) return 'GERADA';
  return 'GERADA';
}

export function buildSaasChargeWhatsAppMessage(row: SaasInvoiceChargeRow): string {
  const lines = [
    `Olá, ${row.companyName}.`,
    '',
    `Segue a cobrança SV LOTES — competência ${row.referenceMonth}.`,
    `Valor: R$ ${Number(row.amount || 0).toFixed(2).replace('.', ',')}`,
    `Vencimento: ${row.dueDate.split('-').reverse().join('/')}`,
  ];
  if (row.paymentUrl) lines.push('', `Link de pagamento: ${row.paymentUrl}`);
  if (row.pixCopyPaste) lines.push('', `PIX Copia e Cola:`, row.pixCopyPaste);
  return lines.join('\n');
}

export function buildSaasChargeWhatsAppUrl(
  phone: string | null | undefined,
  row: SaasInvoiceChargeRow,
): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  const text = encodeURIComponent(buildSaasChargeWhatsAppMessage(row));
  return `https://wa.me/${normalized}?text=${text}`;
}

export function buildSaasChargeEmailUrl(
  email: string | null | undefined,
  row: SaasInvoiceChargeRow,
): string | null {
  const to = String(email || '').trim();
  if (!to.includes('@')) return null;
  const subject = encodeURIComponent(`Cobrança SV LOTES — ${row.referenceMonth}`);
  const body = encodeURIComponent(buildSaasChargeWhatsAppMessage(row));
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

const TIMELINE_META: Record<
  SaasTimelineEventType,
  { title: string; tone: string }
> = {
  charge_created: { title: 'Cobrança gerada', tone: 'bg-blue-500' },
  whatsapp_sent: { title: 'WhatsApp enviado', tone: 'bg-emerald-500' },
  email_sent: { title: 'E-mail enviado', tone: 'bg-cyan-500' },
  charge_viewed: { title: 'Cobrança visualizada', tone: 'bg-violet-500' },
  payment_confirmed: { title: 'Pagamento confirmado', tone: 'bg-emerald-600' },
  company_suspended: { title: 'Empresa suspensa', tone: 'bg-rose-500' },
  company_reactivated: { title: 'Empresa reativada', tone: 'bg-teal-500' },
};

export function saasTimelineMeta(type: SaasTimelineEventType) {
  return TIMELINE_META[type];
}

/** Converte audit_logs + pagamentos em timeline unificada. */
export function buildSaasTimelineFromHistory(
  rows: Array<{
    id: string;
    created_at?: string | null;
    action?: string | null;
    description?: string | null;
    company_name?: string | null;
  }>,
): SaasTimelineEvent[] {
  return rows
    .map((row) => {
      const action = String(row.action || '').toUpperCase();
      const desc = String(row.description || '');
      let type: SaasTimelineEventType = 'charge_created';

      if (action.includes('PAGAMENTO') || action.includes('PAYMENT') || action.includes('PAID')) {
        type = 'payment_confirmed';
      } else if (action.includes('WHATSAPP')) {
        type = 'whatsapp_sent';
      } else if (action.includes('EMAIL') || action.includes('E-MAIL')) {
        type = 'email_sent';
      } else if (action.includes('SUSPENS')) {
        type = 'company_suspended';
      } else if (action.includes('REATIV') || action.includes('REACTIV')) {
        type = 'company_reactivated';
      } else if (action.includes('VISUAL') || action.includes('VIEW')) {
        type = 'charge_viewed';
      } else if (action.includes('CHARGE') || action.includes('COBRAN') || action.includes('FATURA')) {
        type = 'charge_created';
      }

      const meta = TIMELINE_META[type];
      return {
        id: row.id,
        at: row.created_at || new Date().toISOString(),
        type,
        title: meta.title,
        detail: [row.company_name, desc].filter(Boolean).join(' — ') || undefined,
      };
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function countSuspendedCompanies(
  companies: Array<{ financial_situation?: string; company_operational_status?: string; status_operacional?: string }>,
): number {
  return companies.filter((c) => {
    const fin = String(c.financial_situation || '').toUpperCase();
    const op = String(c.company_operational_status || c.status_operacional || '').toLowerCase();
    return fin === 'SUSPENSO' || op === 'suspensa';
  }).length;
}
