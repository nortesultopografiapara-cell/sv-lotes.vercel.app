/**
 * Benfeitorias no encerramento: componente financeiro separado da restituição contratual.
 * Não altera calculateTerminationSettlement (base, retenção, líquido).
 */

import { roundMoney } from '@/lib/contract-termination/calculateSettlement';
import { parseCurrencyBRL } from '@/lib/currencyBrl';

export const IMPROVEMENTS_APPRAISAL_REQUIRED_MESSAGE =
  'Existem benfeitorias informadas para esta unidade. Conclua a avaliação e informe os valores reconhecidos antes de finalizar a desistência.';

export const IMPROVEMENTS_CREDIT_NOT_ALLOWED_MESSAGE =
  'O valor das benfeitorias reconhecidas não é convertido em crédito de outra unidade. Com benfeitorias, utilize Restituir ao cliente.';

export type ImprovementAppraisalStatus = 'NONE' | 'PENDING' | 'COMPLETED';

export type ImprovementItem = {
  id: string;
  order: number;
  description: string;
  amount: number;
};

export type ImprovementItemInput = {
  id?: string | null;
  order?: number | null;
  description?: unknown;
  amount?: unknown;
};

export type ImprovementsRecord = {
  declared: boolean;
  appraisalStatus: ImprovementAppraisalStatus;
  items: ImprovementItem[];
  total: number;
};

export type CustomerObligationBreakdown = {
  contractualRefund: number;
  improvementsTotal: number;
  total: number;
};

export type ImprovementsOperatorFields = {
  hasImprovements: boolean;
  improvementsAppraisalStatus: ImprovementAppraisalStatus;
  improvementItems: ImprovementItemInput[];
};

function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return roundMoney(value);
  }
  const fromBrl = parseCurrencyBRL(value);
  if (fromBrl != null) return roundMoney(fromBrl);
  const raw = Number(String(value).trim().replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(raw)) return null;
  return roundMoney(raw);
}

export function emptyImprovementsRecord(): ImprovementsRecord {
  return {
    declared: false,
    appraisalStatus: 'NONE',
    items: [],
    total: 0,
  };
}

export function engineHasImprovementsFlag(input: {
  hasImprovements: boolean;
  improvementsAppraisalStatus?: ImprovementAppraisalStatus | null;
}): boolean {
  return Boolean(input.hasImprovements) && input.improvementsAppraisalStatus !== 'COMPLETED';
}

export function parseImprovementsOperatorFields(
  body: Record<string, unknown>,
): ImprovementsOperatorFields {
  const hasImprovements =
    body.hasImprovements === true ||
    body.hasImprovements === 'sim' ||
    body.hasImprovements === 'SIM';
  const completedRaw = body.improvementsAppraisalCompleted;
  const statusRaw = String(body.improvementsAppraisalStatus || '')
    .trim()
    .toUpperCase();
  let improvementsAppraisalStatus: ImprovementAppraisalStatus = 'NONE';
  if (hasImprovements) {
    if (
      completedRaw === true ||
      completedRaw === 'true' ||
      statusRaw === 'COMPLETED' ||
      statusRaw === 'APPRAISED' ||
      statusRaw === 'CONCLUIDA'
    ) {
      improvementsAppraisalStatus = 'COMPLETED';
    } else {
      improvementsAppraisalStatus = 'PENDING';
    }
  }
  const rawItems = body.improvementItems ?? body.improvementsItems;
  const improvementItems = Array.isArray(rawItems)
    ? (rawItems as ImprovementItemInput[])
    : [];
  return { hasImprovements, improvementsAppraisalStatus, improvementItems };
}

export function normalizeImprovementItems(
  raw: ImprovementItemInput[] | null | undefined,
): ImprovementItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ImprovementItem[] = [];
  raw.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const description = String(row.description ?? '').trim();
    const amount = parseAmount(row.amount);
    if (!description && (amount == null || amount === 0)) return;
    items.push({
      id: String(row.id || `imp-${index + 1}`).trim() || `imp-${index + 1}`,
      order:
        row.order != null && Number.isFinite(Number(row.order))
          ? Math.max(1, Math.floor(Number(row.order)))
          : index + 1,
      description,
      amount: amount == null ? 0 : amount,
    });
  });
  return items
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

export function sumImprovementItems(items: ImprovementItem[]): number {
  return roundMoney(items.reduce((acc, item) => acc + Number(item.amount || 0), 0));
}

export function buildImprovementsRecord(input: {
  hasImprovements: boolean;
  appraisalStatus?: ImprovementAppraisalStatus | null;
  items?: ImprovementItemInput[] | null;
}): ImprovementsRecord {
  if (!input.hasImprovements) {
    return emptyImprovementsRecord();
  }
  const appraisalStatus =
    input.appraisalStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING';
  const items =
    appraisalStatus === 'COMPLETED' ? normalizeImprovementItems(input.items) : [];
  return {
    declared: true,
    appraisalStatus,
    items,
    total: sumImprovementItems(items),
  };
}

export function improvementStatusForPersist(
  record: ImprovementsRecord,
): string {
  if (!record.declared || record.appraisalStatus === 'NONE') return 'NONE';
  if (record.appraisalStatus === 'PENDING') return 'WAITING_APPRAISAL';
  return 'APPRAISED';
}

export function contractualRefundFromSettlement(settlement: {
  agreedRefundAmount?: number | null;
  contractualRefundAmount?: number | null;
}): number {
  if (
    settlement.agreedRefundAmount != null &&
    Number.isFinite(Number(settlement.agreedRefundAmount))
  ) {
    return roundMoney(Number(settlement.agreedRefundAmount));
  }
  if (
    settlement.contractualRefundAmount != null &&
    Number.isFinite(Number(settlement.contractualRefundAmount))
  ) {
    return roundMoney(Number(settlement.contractualRefundAmount));
  }
  return 0;
}

export function buildCustomerObligation(input: {
  contractualRefund: number;
  improvements: ImprovementsRecord;
}): CustomerObligationBreakdown {
  const improvementsTotal =
    input.improvements.appraisalStatus === 'COMPLETED'
      ? roundMoney(input.improvements.total)
      : 0;
  const contractualRefund = roundMoney(Math.max(0, Number(input.contractualRefund) || 0));
  return {
    contractualRefund,
    improvementsTotal,
    total: roundMoney(contractualRefund + improvementsTotal),
  };
}

export function parseImprovementsRecord(raw: unknown): ImprovementsRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyImprovementsRecord();
  }
  const rec = raw as {
    declared?: unknown;
    appraisalStatus?: unknown;
    items?: unknown;
    total?: unknown;
  };
  const statusRaw = String(rec.appraisalStatus || '')
    .trim()
    .toUpperCase();
  let appraisalStatus: ImprovementAppraisalStatus = 'NONE';
  if (statusRaw === 'COMPLETED' || statusRaw === 'APPRAISED') {
    appraisalStatus = 'COMPLETED';
  } else if (statusRaw === 'PENDING' || statusRaw === 'WAITING' || statusRaw === 'WAITING_APPRAISAL') {
    appraisalStatus = 'PENDING';
  } else if (rec.declared === true) {
    appraisalStatus = Array.isArray(rec.items) && rec.items.length > 0 ? 'COMPLETED' : 'PENDING';
  }
  const declared = rec.declared === true || appraisalStatus !== 'NONE';
  if (!declared) return emptyImprovementsRecord();
  const items =
    appraisalStatus === 'COMPLETED' ? normalizeImprovementItems(rec.items as ImprovementItemInput[]) : [];
  const total = sumImprovementItems(items);
  return { declared: true, appraisalStatus, items, total };
}

export function parseImprovementsFromCalculationSnapshot(
  calculationSnapshot: unknown,
): ImprovementsRecord {
  if (!calculationSnapshot || typeof calculationSnapshot !== 'object') {
    return emptyImprovementsRecord();
  }
  const rec = calculationSnapshot as { improvements?: unknown };
  return parseImprovementsRecord(rec.improvements);
}

export function parseObligationFromCalculationSnapshot(
  calculationSnapshot: unknown,
  fallbackContractual = 0,
): CustomerObligationBreakdown {
  if (calculationSnapshot && typeof calculationSnapshot === 'object') {
    const rec = calculationSnapshot as { obligation?: unknown };
    if (rec.obligation && typeof rec.obligation === 'object' && !Array.isArray(rec.obligation)) {
      const ob = rec.obligation as {
        contractualRefund?: unknown;
        improvementsTotal?: unknown;
        total?: unknown;
      };
      const contractualRefund = roundMoney(Number(ob.contractualRefund) || 0);
      const improvementsTotal = roundMoney(Number(ob.improvementsTotal) || 0);
      const total =
        ob.total != null && Number.isFinite(Number(ob.total))
          ? roundMoney(Number(ob.total))
          : roundMoney(contractualRefund + improvementsTotal);
      return { contractualRefund, improvementsTotal, total };
    }
  }
  const improvements = parseImprovementsFromCalculationSnapshot(calculationSnapshot);
  return buildCustomerObligation({
    contractualRefund: fallbackContractual,
    improvements,
  });
}

export function improvementsFromLegacyStatus(status: string | null | undefined): ImprovementsRecord {
  const raw = String(status || '').trim().toUpperCase();
  if (!raw || raw === 'NONE' || raw === 'NULL' || raw === 'UNDEFINED') {
    return emptyImprovementsRecord();
  }
  if (raw.includes('WAITING')) {
    return {
      declared: true,
      appraisalStatus: 'PENDING',
      items: [],
      total: 0,
    };
  }
  if (raw === 'APPRAISED' || raw === 'DECLARED' || raw === 'COMPLETED') {
    return {
      declared: true,
      appraisalStatus: 'COMPLETED',
      items: [],
      total: 0,
    };
  }
  return emptyImprovementsRecord();
}

export function resolveImprovementsForDocument(input: {
  improvements?: ImprovementsRecord | null;
  improvementStatus?: string | null;
  calculationSnapshot?: unknown;
}): ImprovementsRecord {
  const fromSnap = parseImprovementsFromCalculationSnapshot(input.calculationSnapshot);
  if (fromSnap.declared) return fromSnap;
  if (input.improvements && input.improvements.declared) return input.improvements;
  return improvementsFromLegacyStatus(input.improvementStatus);
}

export type ImprovementsValidationResult =
  | { ok: true; record: ImprovementsRecord }
  | { ok: false; error: string; code: string };

export function validateImprovementsForRelease(input: {
  hasImprovements: boolean;
  appraisalStatus?: ImprovementAppraisalStatus | null;
  items?: ImprovementItemInput[] | null;
  destination?: string | null;
}): ImprovementsValidationResult {
  if (!input.hasImprovements) {
    return { ok: true, record: emptyImprovementsRecord() };
  }
  if (input.appraisalStatus !== 'COMPLETED') {
    return {
      ok: false,
      error: IMPROVEMENTS_APPRAISAL_REQUIRED_MESSAGE,
      code: 'IMPROVEMENTS_APPRAISAL_REQUIRED',
    };
  }
  const record = buildImprovementsRecord({
    hasImprovements: true,
    appraisalStatus: 'COMPLETED',
    items: input.items,
  });
  if (record.items.length === 0) {
    return {
      ok: false,
      error: 'Informe ao menos uma benfeitoria com descrição e valor reconhecido.',
      code: 'IMPROVEMENTS_ITEMS_REQUIRED',
    };
  }
  for (const item of record.items) {
    if (!item.description) {
      return {
        ok: false,
        error: 'Cada benfeitoria precisa de uma descrição.',
        code: 'IMPROVEMENTS_DESCRIPTION_REQUIRED',
      };
    }
    if (!(item.amount > 0)) {
      return {
        ok: false,
        error: 'Cada benfeitoria precisa de um valor reconhecido maior que zero.',
        code: 'IMPROVEMENTS_AMOUNT_REQUIRED',
      };
    }
  }
  const dest = String(input.destination || 'REFUND_CUSTOMER').trim().toUpperCase();
  if (dest === 'CREDIT_OTHER_UNIT' && record.total > 0) {
    return {
      ok: false,
      error: IMPROVEMENTS_CREDIT_NOT_ALLOWED_MESSAGE,
      code: 'IMPROVEMENTS_CREDIT_NOT_ALLOWED',
    };
  }
  return { ok: true, record };
}
