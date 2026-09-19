/**
 * Cobrança em massa via WhatsApp — domínio puro (sem I/O).
 * Uma mensagem por customer_id. Não gera cobrança Asaas/Inter.
 */

import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  buildChargeInstallmentView,
  computeInstallmentStatus,
  type FinanceReceiptRow,
} from '@/lib/charges/chargeInstallmentHelpers';
import {
  chargeHasInterWhatsAppPayload,
  resolveChargeContractNumber,
  resolveChargeCustomerPhone,
  resolveChargeWhatsAppBoletoOrInvoiceUrl,
  resolveChargeWhatsAppPrimaryPaymentUrl,
  resolveChargeWhatsAppShareableUrl,
} from '@/lib/charges/chargeWhatsAppMessage';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  isOwnerRole,
  isTenantEnterpriseAdminRole,
  OWNER_READ_ONLY_DENIED_MESSAGE,
} from '@/lib/rolePermissions';
import { isPlatformAdmin } from '@/lib/rls';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';
import {
  CLIENT_PORTAL_PATH,
  isClientPortalEnabled,
  resolveClientPortalUiEnabled,
} from '@/lib/portal-cliente/config';
import { resolvePublicBaseUrl } from '@/lib/signatureVerifyUrls';

export const CHARGE_WHATSAPP_BATCH_MAX_CUSTOMERS = 20;
export const CHARGE_WHATSAPP_BATCH_MAX_INSTALLMENTS = 250;
export const CHARGE_WHATSAPP_BATCH_SEND_GAP_MS = 250;
export const CHARGE_WHATSAPP_BATCH_TEMPLATE_KEY = 'platform_collection_v1';
export const CHARGE_WHATSAPP_BATCH_CHANNEL = 'zapi_platform';

export const CHARGE_WHATSAPP_BATCH_OWNER_DENIED = OWNER_READ_ONLY_DENIED_MESSAGE;

export type ChargeWhatsAppSkipReason =
  | 'other_tenant'
  | 'missing_receipt'
  | 'missing_customer'
  | 'missing_phone'
  | 'invalid_phone'
  | 'paid'
  | 'cancelled'
  | 'not_overdue'
  | 'no_payment_method'
  | 'charge_cancelled'
  | 'charge_paid'
  | 'over_customer_cap';

export const CHARGE_WHATSAPP_SKIP_REASON_LABELS: Record<ChargeWhatsAppSkipReason, string> = {
  other_tenant: 'Parcela de outra empresa',
  missing_receipt: 'Parcela não encontrada',
  missing_customer: 'Parcela sem cliente vinculado',
  missing_phone: 'Cliente sem telefone cadastrado',
  invalid_phone: 'Telefone inválido para WhatsApp',
  paid: 'Parcela já paga',
  cancelled: 'Parcela cancelada',
  not_overdue: 'Parcela ainda não vencida',
  no_payment_method: 'Sem boleto, PIX ou link de pagamento',
  charge_cancelled: 'Cobrança cancelada',
  charge_paid: 'Cobrança já quitada no banco',
  over_customer_cap: 'Acima do teto de clientes por lote',
};

export type ChargeWhatsAppBatchParcelInput = {
  installmentId: string;
  companyId: string | null;
  tenantId: string | null;
  customerId: string | null;
  customerName: string;
  phone: string | null;
  projectName: string;
  lotLabel: string;
  parcelLabel: string;
  contractNumber: string;
  dueDateIso: string;
  dueDateLabel: string;
  amount: number;
  rawStatus: string;
  computedStatus: string;
  charge: CompanyAsaasChargeResponse | null;
};

export type ChargeWhatsAppEvaluatedParcel = ChargeWhatsAppBatchParcelInput & {
  skipReason: ChargeWhatsAppSkipReason | null;
  normalizedPhone: string | null;
  sendable: boolean;
};

export type ChargeWhatsAppCustomerGroup = {
  customerId: string;
  customerName: string;
  phone: string | null;
  normalizedPhone: string | null;
  sendable: boolean;
  skipReason: ChargeWhatsAppSkipReason | null;
  sendableParcels: ChargeWhatsAppEvaluatedParcel[];
  skippedParcels: ChargeWhatsAppEvaluatedParcel[];
  totalAmount: number;
  message: string | null;
  chargeIds: string[];
  financeReceiptIds: string[];
};

export type ChargeWhatsAppBatchPreview = {
  installmentCount: number;
  customerCount: number;
  selectedAmount: number;
  readyCustomerCount: number;
  readyInstallmentCount: number;
  readyAmount: number;
  skippedInstallmentCount: number;
  missingPhoneCount: number;
  invalidPhoneCount: number;
  noPaymentMethodCount: number;
  otherSkipCount: number;
  overCustomerCap: boolean;
  zapiConfigured: boolean;
  loteadoraName: string;
  portalUrl: string | null;
  customers: ChargeWhatsAppCustomerGroup[];
  skippedParcels: ChargeWhatsAppEvaluatedParcel[];
  sendBlockedReason: string | null;
};

export function receiptBelongsToTenant(
  row: { company_id?: unknown; tenant_id?: unknown; companyId?: unknown; tenantId?: unknown },
  tenantId: string,
): boolean {
  const company = String(row.company_id ?? row.companyId ?? '').trim();
  const tenant = String(row.tenant_id ?? row.tenantId ?? '').trim();
  const expected = String(tenantId || '').trim();
  if (!expected) return false;
  return company === expected || tenant === expected;
}

export function canDispatchChargeWhatsAppBatch(role?: string | null): boolean {
  if (isOwnerRole(role)) return false;
  if (isTenantEnterpriseAdminRole(role)) return true;
  return isPlatformAdmin(role);
}

export function chargeWhatsAppBatchRoleDeniedMessage(role?: string | null): string | null {
  if (isOwnerRole(role)) return CHARGE_WHATSAPP_BATCH_OWNER_DENIED;
  if (canDispatchChargeWhatsAppBatch(role)) return null;
  return 'Permissão negada.';
}

export function chargeHasSendablePaymentArtifact(
  charge: CompanyAsaasChargeResponse | null | undefined,
): boolean {
  if (!charge) return false;
  const status = String(charge.status || '').toUpperCase();
  if (status === 'CANCELLED' || status === 'CANCELED' || status === 'PAID') return false;
  return Boolean(
    resolveChargeWhatsAppShareableUrl(charge) ||
      String(charge.pixCopyPaste || '').trim() ||
      String(charge.bankSlipIdentification || '').trim() ||
      chargeHasInterWhatsAppPayload(charge),
  );
}

export function pickExistingChargeForWhatsApp(
  installmentId: string,
  asaasByInstallment: Record<string, CompanyAsaasChargeResponse | null | undefined>,
  interByInstallment: Record<string, CompanyAsaasChargeResponse | null | undefined>,
): CompanyAsaasChargeResponse | null {
  const asaas = asaasByInstallment[installmentId] ?? null;
  const inter = interByInstallment[installmentId] ?? null;
  if (asaas && chargeHasSendablePaymentArtifact(asaas)) return asaas;
  if (inter && chargeHasSendablePaymentArtifact(inter)) return inter;
  return asaas || inter || null;
}

export function resolveChargeWhatsAppBatchPortalUrl(): string | null {
  if (!isClientPortalEnabled() || !resolveClientPortalUiEnabled()) return null;
  const base = resolvePublicBaseUrl().replace(/\/$/, '');
  if (!base) return null;
  return `${base}${CLIENT_PORTAL_PATH}`;
}

function embedRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

export function mapReceiptRowToBatchParcel(
  row: FinanceReceiptRow,
  charge: CompanyAsaasChargeResponse | null,
  todayStr?: string,
): ChargeWhatsAppBatchParcelInput {
  const view = buildChargeInstallmentView(row, charge, todayStr);
  const customers = embedRecord(row.customers);
  const customerId =
    String(row.customer_id || customers?.id || '').trim() || null;
  return {
    installmentId: String(row.id || '').trim(),
    companyId: String(row.company_id || '').trim() || null,
    tenantId: String(row.tenant_id || '').trim() || null,
    customerId,
    customerName: view.clientName === '—' ? String(customers?.name || '').trim() || 'Cliente' : view.clientName,
    phone: resolveChargeCustomerPhone(row),
    projectName: view.projectName,
    lotLabel: view.lotLabel,
    parcelLabel: view.parcelLabel,
    contractNumber: resolveChargeContractNumber(row),
    dueDateIso: view.dueDateIso,
    dueDateLabel: view.dueDateLabel,
    amount: view.amount,
    rawStatus: String(row.status || '').toLowerCase(),
    computedStatus: computeInstallmentStatus(row, todayStr),
    charge,
  };
}

export function evaluateChargeWhatsAppParcel(
  parcel: ChargeWhatsAppBatchParcelInput,
  tenantId: string,
): ChargeWhatsAppEvaluatedParcel {
  const normalizedPhone = normalizeWhatsAppPhone(parcel.phone);
  const status = parcel.computedStatus.toLowerCase();
  const chargeStatus = String(parcel.charge?.status || '').toUpperCase();

  let skipReason: ChargeWhatsAppSkipReason | null = null;
  if (!receiptBelongsToTenant(parcel, tenantId)) {
    skipReason = 'other_tenant';
  } else if (!parcel.installmentId) {
    skipReason = 'missing_receipt';
  } else if (status === 'pago' || status === 'paid') {
    skipReason = 'paid';
  } else if (status === 'cancelado' || status === 'canceled' || status === 'cancelled') {
    skipReason = 'cancelled';
  } else if (status !== 'atrasado' && status !== 'overdue') {
    skipReason = 'not_overdue';
  } else if (!parcel.customerId) {
    skipReason = 'missing_customer';
  } else if (!String(parcel.phone || '').trim()) {
    skipReason = 'missing_phone';
  } else if (!normalizedPhone) {
    skipReason = 'invalid_phone';
  } else if (!parcel.charge) {
    skipReason = 'no_payment_method';
  } else if (chargeStatus === 'PAID') {
    skipReason = 'charge_paid';
  } else if (chargeStatus === 'CANCELLED' || chargeStatus === 'CANCELED') {
    skipReason = 'charge_cancelled';
  } else if (!chargeHasSendablePaymentArtifact(parcel.charge)) {
    skipReason = 'no_payment_method';
  }

  return {
    ...parcel,
    skipReason,
    normalizedPhone,
    sendable: skipReason === null,
  };
}

function sortParcels(a: ChargeWhatsAppEvaluatedParcel, b: ChargeWhatsAppEvaluatedParcel): number {
  const due = String(a.dueDateIso).localeCompare(String(b.dueDateIso));
  if (due !== 0) return due;
  return a.parcelLabel.localeCompare(b.parcelLabel, 'pt-BR');
}

function uniqueProjectNames(parcels: ChargeWhatsAppEvaluatedParcel[]): string[] {
  const names: string[] = [];
  for (const parcel of parcels) {
    const name = String(parcel.projectName || '').trim();
    if (name && name !== '—' && !names.includes(name)) names.push(name);
  }
  return names;
}

function formatParcelPaymentLines(parcel: ChargeWhatsAppEvaluatedParcel): string[] {
  const charge = parcel.charge;
  if (!charge) return [];
  const lines: string[] = [];
  const boleto = resolveChargeWhatsAppBoletoOrInvoiceUrl(charge);
  const primary = resolveChargeWhatsAppPrimaryPaymentUrl(charge);
  const pix = String(charge.pixCopyPaste || '').trim();
  const linha = String(charge.bankSlipIdentification || '').trim();

  if (primary) {
    lines.push(boleto ? `  Boleto/fatura: ${primary}` : `  Link para pagamento: ${primary}`);
  }
  if (pix) {
    lines.push(`  PIX copia e cola: ${pix}`);
  }
  if (linha) {
    lines.push(`  Linha digitável: ${linha}`);
  }
  return lines;
}

export function buildConsolidatedChargeWhatsAppMessage(input: {
  customerName: string;
  loteadoraName: string;
  parcels: ChargeWhatsAppEvaluatedParcel[];
  portalUrl?: string | null;
}): string {
  const clientName = String(input.customerName || 'Cliente').trim() || 'Cliente';
  const loteadora =
    String(input.loteadoraName || '').trim() || 'a empresa responsável pelo empreendimento';
  const parcels = [...input.parcels].sort(sortParcels);
  const projects = uniqueProjectNames(parcels);
  const projectLabel = projects.length ? projects.join(', ') : 'seu empreendimento';
  const contracts = [
    ...new Set(parcels.map((p) => p.contractNumber).filter((n) => n && n !== 'S/N')),
  ];
  const total = parcels.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalLabel = formatCurrencyBRL(total) || 'R$ 0,00';

  const lines: string[] = [
    `Olá, ${clientName}.`,
    '',
    `Esta é uma mensagem automática de cobrança enviada pelo SV Lotes, referente ao empreendimento ${projectLabel}, administrado por ${loteadora}.`,
    '',
    contracts.length
      ? `Identificamos parcelas pendentes/vencidas vinculadas ao contrato ${contracts.join(', ')}.`
      : 'Identificamos parcelas pendentes/vencidas vinculadas ao seu contrato.',
    '',
  ];

  for (const parcel of parcels) {
    const valor = formatCurrencyBRL(parcel.amount) || 'R$ 0,00';
    lines.push(
      `• ${parcel.parcelLabel} — venc. ${parcel.dueDateLabel} — ${valor}`,
      `  ${parcel.lotLabel}`,
    );
    const payment = formatParcelPaymentLines(parcel);
    if (payment.length) lines.push(...payment);
    lines.push('');
  }

  lines.push(`Total selecionado: ${totalLabel}`, '');
  lines.push(
    'Os valores acima são os originais das parcelas. Multa e juros, quando aplicáveis, constam no boleto ou PIX do banco.',
    '',
  );

  const portalUrl = String(input.portalUrl || '').trim();
  if (portalUrl) {
    lines.push('Portal do Cliente:', portalUrl, '');
  }

  lines.push(
    `Em caso de dúvida, entre em contato com ${loteadora}, responsável pelo empreendimento.`,
    '',
    'SV Lotes',
  );
  return lines.join('\n');
}

function primarySkipReason(
  parcels: ChargeWhatsAppEvaluatedParcel[],
): ChargeWhatsAppSkipReason | null {
  const order: ChargeWhatsAppSkipReason[] = [
    'other_tenant',
    'missing_customer',
    'missing_phone',
    'invalid_phone',
    'no_payment_method',
    'charge_cancelled',
    'charge_paid',
    'paid',
    'cancelled',
    'not_overdue',
    'missing_receipt',
  ];
  for (const reason of order) {
    if (parcels.some((p) => p.skipReason === reason)) return reason;
  }
  return parcels[0]?.skipReason ?? null;
}

export function groupChargeWhatsAppParcelsByCustomer(
  parcels: ChargeWhatsAppEvaluatedParcel[],
  context: { loteadoraName: string; portalUrl?: string | null },
): ChargeWhatsAppCustomerGroup[] {
  const order: string[] = [];
  const byCustomer = new Map<string, ChargeWhatsAppEvaluatedParcel[]>();

  for (const parcel of parcels) {
    const key = parcel.customerId || `missing:${parcel.installmentId}`;
    if (!byCustomer.has(key)) {
      order.push(key);
      byCustomer.set(key, []);
    }
    byCustomer.get(key)!.push(parcel);
  }

  return order.map((key) => {
    const all = (byCustomer.get(key) || []).sort(sortParcels);
    const sendableParcels = all.filter((p) => p.sendable);
    const skippedParcels = all.filter((p) => !p.sendable);
    const first = sendableParcels[0] || all[0];
    const sendable = sendableParcels.length > 0;
    const phone = first?.phone ?? null;
    const normalizedPhone = sendableParcels[0]?.normalizedPhone || first?.normalizedPhone || null;
    const message = sendable
      ? buildConsolidatedChargeWhatsAppMessage({
          customerName: first?.customerName || 'Cliente',
          loteadoraName: context.loteadoraName,
          parcels: sendableParcels,
          portalUrl: context.portalUrl,
        })
      : null;

    return {
      customerId: first?.customerId || key,
      customerName: first?.customerName || 'Cliente',
      phone,
      normalizedPhone,
      sendable,
      skipReason: sendable ? null : primarySkipReason(skippedParcels),
      sendableParcels,
      skippedParcels,
      totalAmount: sendableParcels.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      message,
      chargeIds: [
        ...new Set(
          sendableParcels
            .map((p) => String(p.charge?.id || '').trim())
            .filter(Boolean),
        ),
      ],
      financeReceiptIds: sendableParcels.map((p) => p.installmentId),
    };
  });
}

export function countSkipReason(
  parcels: ChargeWhatsAppEvaluatedParcel[],
  reason: ChargeWhatsAppSkipReason,
): number {
  return parcels.filter((p) => p.skipReason === reason).length;
}

export function buildChargeWhatsAppBatchPreview(input: {
  requestedIds: string[];
  loadedParcels: ChargeWhatsAppBatchParcelInput[];
  tenantId: string;
  loteadoraName: string;
  zapiConfigured: boolean;
  portalUrl?: string | null;
}): ChargeWhatsAppBatchPreview {
  const loadedIds = new Set(input.loadedParcels.map((p) => p.installmentId));
  const missing: ChargeWhatsAppEvaluatedParcel[] = input.requestedIds
    .filter((id) => id && !loadedIds.has(id))
    .map((id) =>
      evaluateChargeWhatsAppParcel(
        {
          installmentId: id,
          companyId: null,
          tenantId: null,
          customerId: null,
          customerName: '—',
          phone: null,
          projectName: '—',
          lotLabel: '—',
          parcelLabel: '—',
          contractNumber: 'S/N',
          dueDateIso: '',
          dueDateLabel: '—',
          amount: 0,
          rawStatus: '',
          computedStatus: '',
          charge: null,
        },
        input.tenantId,
      ),
    )
    .map((parcel) => ({
      ...parcel,
      skipReason: 'missing_receipt' as const,
      sendable: false,
    }));

  const evaluated = [
    ...input.loadedParcels.map((p) => evaluateChargeWhatsAppParcel(p, input.tenantId)),
    ...missing,
  ];

  const groups = groupChargeWhatsAppParcelsByCustomer(evaluated, {
    loteadoraName: input.loteadoraName,
    portalUrl: input.portalUrl ?? null,
  });

  const skippedParcels = evaluated.filter((p) => !p.sendable);
  const readyGroups = groups.filter((g) => g.sendable);
  const overCustomerCap = readyGroups.length > CHARGE_WHATSAPP_BATCH_MAX_CUSTOMERS;

  let sendBlockedReason: string | null = null;
  if (!readyGroups.length) {
    sendBlockedReason = 'Nenhum cliente elegível para envio neste lote.';
  } else if (overCustomerCap) {
    sendBlockedReason = `Selecione no máximo ${CHARGE_WHATSAPP_BATCH_MAX_CUSTOMERS} clientes por lote (homologação).`;
  } else if (!input.zapiConfigured) {
    sendBlockedReason = 'Z-API não configurada neste ambiente.';
  }

  const selectedAmount = evaluated.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const uniqueCustomers = new Set(
    evaluated.map((p) => p.customerId).filter((id): id is string => Boolean(id)),
  );

  return {
    installmentCount: evaluated.length,
    customerCount: uniqueCustomers.size || groups.length,
    selectedAmount,
    readyCustomerCount: readyGroups.length,
    readyInstallmentCount: readyGroups.reduce((n, g) => n + g.sendableParcels.length, 0),
    readyAmount: readyGroups.reduce((n, g) => n + g.totalAmount, 0),
    skippedInstallmentCount: skippedParcels.length,
    missingPhoneCount: countSkipReason(skippedParcels, 'missing_phone'),
    invalidPhoneCount: countSkipReason(skippedParcels, 'invalid_phone'),
    noPaymentMethodCount:
      countSkipReason(skippedParcels, 'no_payment_method') +
      countSkipReason(skippedParcels, 'charge_cancelled') +
      countSkipReason(skippedParcels, 'charge_paid'),
    otherSkipCount: skippedParcels.filter(
      (p) =>
        p.skipReason &&
        !['missing_phone', 'invalid_phone', 'no_payment_method', 'charge_cancelled', 'charge_paid'].includes(
          p.skipReason,
        ),
    ).length,
    overCustomerCap,
    zapiConfigured: input.zapiConfigured,
    loteadoraName: input.loteadoraName,
    portalUrl: input.portalUrl ?? null,
    customers: groups,
    skippedParcels,
    sendBlockedReason,
  };
}

export function parseChargeWhatsAppInstallmentIds(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of list) {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= CHARGE_WHATSAPP_BATCH_MAX_INSTALLMENTS) break;
  }
  return ids;
}

export function shouldReplayExistingBatch(status: string | null | undefined): boolean {
  const st = String(status || '').toLowerCase();
  return ['queued', 'sending', 'sent', 'partial', 'failed'].includes(st);
}

export function filterChargeWhatsAppItemsForDispatch<T extends { status?: string | null }>(
  items: T[],
): T[] {
  return items.filter((item) => {
    const status = String(item.status || '').toLowerCase();
    return status === 'queued' || status === 'failed';
  });
}

export function selectFailedItemsForRetry<T extends { status?: string | null }>(items: T[]): T[] {
  return items.filter((item) => String(item.status || '').toLowerCase() === 'failed');
}

export function resolveBatchStatusFromCounts(input: {
  sent: number;
  failed: number;
  skipped: number;
}): 'sent' | 'partial' | 'failed' {
  if (input.sent > 0 && input.failed > 0) return 'partial';
  if (input.sent > 0 && input.failed === 0) return 'sent';
  if (input.failed > 0 && input.sent === 0) return 'failed';
  return 'sent';
}
