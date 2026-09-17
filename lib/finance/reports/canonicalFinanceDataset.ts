/**
 * Dataset financeiro canônico.
 *
 * PDF e Excel NÃO calculam — apenas apresentam o objeto retornado aqui.
 * Split nunca entra como receita adicional.
 */
import { displayContractNumber } from '@/lib/contractNumber';
import { resolveCashMovementInstallmentId } from '@/lib/finance/cashMovementsSchema';
import {
  buildCashFlowItems,
  formatFlowDate,
} from '@/lib/financeCashFlow';
import {
  DESTINATION_DISCLAIMER,
  FINANCE_REPORT_ALL_ACCOUNTS,
  FINANCE_REPORT_ALL_PROJECTS,
  FINANCE_REPORT_ALL_STATUSES,
  type CanonicalCashMovement,
  type CanonicalDestinationTotal,
  type CanonicalFinanceFilters,
  type CanonicalFinanceReport,
  type CanonicalFinanceReportInput,
  type CanonicalOutflowByCategory,
  type CanonicalProjectBreakdown,
  type CanonicalSplitLeg,
  type CanonicalWalletMovement,
} from './canonicalFinanceTypes';
import {
  computeWalletStatus,
  formatDateBr,
  formatDateTimeBr,
  formatInstallmentLabel,
  formatWalletStatusLabel,
  isoDatePart,
  isIsoDateInRange,
  roundMoney,
} from './financeReportFormat';
import {
  AMOUNT_KIND_LABELS,
  aggregateDestinationTotals,
  resolveInstallmentSplitDistribution,
} from './splitForReport';

function projectNameOfReceipt(p: any): string {
  return (
    p?.projects?.name ||
    p?.sales?.projects?.name ||
    p?.blocks?.projects?.name ||
    'Projeto Desconhecido'
  );
}

function contractNumberOfReceipt(p: any): string {
  const stored = p?.sales?.contracts?.[0]?.contract_number;
  const official = displayContractNumber(stored);
  if (official !== 'S/N') return official;
  const raw = String(stored || '').trim();
  if (raw) return raw;
  if (p?.sales?.id) {
    const year = new Date(p.created_at || Date.now()).getFullYear();
    return `CT-${year}-${String(p.sales.id).substring(0, 6).toUpperCase()}`;
  }
  return 'S/N';
}

function receiptAccountId(p: any): string {
  return String(p?.financial_account_id || p?.sales?.financial_account_id || '').trim();
}

function matchesSearch(p: any, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const contractNo = contractNumberOfReceipt(p);
  const hay = [
    contractNo,
    p?.sales?.id,
    p?.customers?.name,
    p?.customers?.full_name,
    p?.blocks?.name,
    p?.blocks?.block_name,
    String(p?.blocks?.number ?? ''),
    projectNameOfReceipt(p),
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

function matchesWalletStatus(computedStatus: string, statusFilter: string): boolean {
  if (!statusFilter || statusFilter === FINANCE_REPORT_ALL_STATUSES) {
    return computedStatus !== 'cancelado' && computedStatus !== 'canceled';
  }
  const want = statusFilter.toLowerCase();
  if (want === 'pago') return computedStatus === 'pago' || computedStatus === 'paid';
  if (want === 'pendente') {
    return (
      (computedStatus === 'pendente' || computedStatus === 'pending') 
    );
  }
  if (want === 'atrasado') {
    return computedStatus === 'atrasado' || computedStatus === 'overdue';
  }
  if (want === 'cancelado') {
    return (
      computedStatus === 'cancelado' ||
      computedStatus === 'canceled' ||
      computedStatus === 'cancelled'
    );
  }
  return true;
}

function cashAccountId(item: any, receiptAccountById: Record<string, string>): string {
  const meta = item?.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const fromMeta = String(
      (meta as Record<string, unknown>).financial_account_id || '',
    ).trim();
    if (fromMeta) return fromMeta;
  }
  const receiptId = String(
    item?.receiptId ||
      item?.finance_receipt_id ||
      resolveCashMovementInstallmentId(item) ||
      '',
  ).trim();
  if (receiptId && receiptAccountById[receiptId]) return receiptAccountById[receiptId];
  return '';
}

function buildFilterLines(filters: CanonicalFinanceFilters, hasPeriod: boolean): string[] {
  const lines = [
    `Empreendimento: ${filters.projectFilter || FINANCE_REPORT_ALL_PROJECTS}`,
    `Conta: ${filters.financialAccountLabel || FINANCE_REPORT_ALL_ACCOUNTS}`,
    `Situação (carteira): ${filters.statusFilter || FINANCE_REPORT_ALL_STATUSES}`,
  ];
  if (filters.search.trim()) lines.push(`Busca: ${filters.search.trim()}`);
  if (hasPeriod) {
    lines.push(
      `Período informado: ${formatDateBr(filters.startDate) === '—' ? 'início' : formatDateBr(filters.startDate)} a ${formatDateBr(filters.endDate) === '—' ? 'fim' : formatDateBr(filters.endDate)}`,
    );
  } else {
    lines.push('Período: todo o histórico carregado');
  }
  lines.push('Situação e busca aplicam-se à carteira. Caixa não usa o filtro de situação da parcela.');
  if (
    filters.financialAccountId &&
    filters.financialAccountId !== FINANCE_REPORT_ALL_ACCOUNTS
  ) {
    lines.push(
      'Conta no caixa: aplicada somente quando o lançamento possui conta identificável.',
    );
  }
  return lines;
}

export function buildCanonicalFinanceReport(
  input: CanonicalFinanceReportInput,
): CanonicalFinanceReport {
  const filters = input.filters;
  const todayIso = isoDatePart(input.todayIso) || new Date().toISOString().split('T')[0];
  const generatedAt = input.generatedAt || new Date();
  const accountLabels = input.accountLabels || {};
  const splitViews = input.splitViews || {};
  const chargeHints = input.chargeHints || {};
  const start = isoDatePart(filters.startDate);
  const end = isoDatePart(filters.endDate);
  const hasPeriod = Boolean(start || end);

  const receiptAccountById: Record<string, string> = {};
  for (const p of input.receipts || []) {
    const id = String(p?.id || '').trim();
    if (id) receiptAccountById[id] = receiptAccountId(p);
  }

  const identityReceipts = (input.receipts || []).filter((p) => {
    const proj = projectNameOfReceipt(p);
    if (
      filters.projectFilter &&
      filters.projectFilter !== FINANCE_REPORT_ALL_PROJECTS &&
      proj !== filters.projectFilter
    ) {
      return false;
    }
    const accountId = receiptAccountId(p);
    if (
      filters.financialAccountId &&
      filters.financialAccountId !== FINANCE_REPORT_ALL_ACCOUNTS &&
      accountId !== filters.financialAccountId
    ) {
      return false;
    }
    if (!matchesSearch(p, filters.search || '')) return false;
    const due = isoDatePart(p?.due_date);
    const status = computeWalletStatus(p?.status, due, todayIso);
    if (!matchesWalletStatus(status, filters.statusFilter || FINANCE_REPORT_ALL_STATUSES)) {
      return false;
    }
    return true;
  });

  const toMovement = (p: any): CanonicalWalletMovement => {
    const due = isoDatePart(p?.due_date);
    const status = computeWalletStatus(p?.status, due, todayIso);
    const isPaid = status === 'pago' || status === 'paid';
    const amount = roundMoney(Number(p?.amount) || 0);
    const paidAmount = isPaid ? roundMoney(Number(p?.paid_amount) || amount) : 0;
    const saleId = String(p?.sale_id || p?.sales?.id || '').trim() || null;
    const accountId = receiptAccountId(p) || null;
    const accountLabel = accountId
      ? accountLabels[accountId] || accountId
      : 'Conta não identificada';
    const split = resolveInstallmentSplitDistribution({
      saleId,
      installmentId: String(p?.id || ''),
      paidAmount: paidAmount || amount,
      splitView: saleId ? splitViews[saleId] : null,
      accountLabels,
    });
    const paidAtRaw = p?.paid_at ? String(p.paid_at) : null;
    const hint = chargeHints[String(p?.id || '')];
    const installmentNumber = Number(p?.installment_number);
    return {
      id: String(p?.id || ''),
      saleId,
      contractNumber: contractNumberOfReceipt(p),
      clientName: p?.customers?.name || p?.customers?.full_name || 'Desconhecido',
      clientDocument: p?.customers?.document || p?.customers?.cpf_cnpj || '—',
      projectName: projectNameOfReceipt(p),
      blockName: p?.blocks?.block_name || p?.blocks?.name || '?',
      lotNumber: String(p?.blocks?.number ?? p?.blocks?.lot_number ?? '?'),
      installmentNumber: Number.isFinite(installmentNumber) ? installmentNumber : 1,
      installmentLabel: formatInstallmentLabel(
        p?.installment_number,
        p?.sales?.installments_count,
      ),
      dueDate: due,
      dueDateLabel: formatDateBr(due),
      paidAt: paidAtRaw,
      paidAtLabel: isPaid ? formatDateTimeBr(paidAtRaw) : '—',
      amount,
      paidAmount,
      status,
      statusLabel: formatWalletStatusLabel(status),
      financialAccountId: accountId,
      financialAccountLabel: accountLabel,
      hasSplit: split.length > 0,
      split,
      destinationFallbackLabel: accountLabel,
      chargeProvider: hint?.provider ?? null,
      gatewayFeeAmount:
        hint?.feeAmount != null && Number.isFinite(Number(hint.feeAmount))
          ? roundMoney(Number(hint.feeAmount))
          : null,
    };
  };

  const listing = identityReceipts.filter((p) => {
    if (!hasPeriod) return true;
    const due = isoDatePart(p?.due_date);
    const paid = isoDatePart(p?.paid_at);
    const dueIn = isIsoDateInRange(due, start, end);
    const status = computeWalletStatus(p?.status, due, todayIso);
    const isPaid = status === 'pago' || status === 'paid';
    const paidIn = isPaid && isIsoDateInRange(paid, start, end);
    return dueIn || paidIn;
  });

  const movements = listing.map(toMovement);

  let receivedInPeriod = 0;
  let toReceive = 0;
  let overdue = 0;
  let qtyPaid = 0;
  let qtyPending = 0;
  let qtyOverdue = 0;
  const byProjectMap = new Map<string, CanonicalProjectBreakdown>();

  const bumpProject = (
    name: string,
    patch: Partial<Pick<CanonicalProjectBreakdown, 'received' | 'toReceive' | 'overdue'>>,
  ) => {
    const current = byProjectMap.get(name) || {
      projectName: name,
      received: 0,
      toReceive: 0,
      overdue: 0,
    };
    if (patch.received) current.received = roundMoney(current.received + patch.received);
    if (patch.toReceive) current.toReceive = roundMoney(current.toReceive + patch.toReceive);
    if (patch.overdue) current.overdue = roundMoney(current.overdue + patch.overdue);
    byProjectMap.set(name, current);
  };

  for (const p of identityReceipts) {
    const due = isoDatePart(p?.due_date);
    const paid = isoDatePart(p?.paid_at);
    const status = computeWalletStatus(p?.status, due, todayIso);
    const isPaid = status === 'pago' || status === 'paid';
    const isLate = status === 'atrasado' || status === 'overdue';
    const amount = roundMoney(Number(p?.amount) || 0);
    const paidAmount = isPaid ? roundMoney(Number(p?.paid_amount) || amount) : 0;
    const proj = projectNameOfReceipt(p);

    if (isPaid && isIsoDateInRange(paid, start, end)) {
      receivedInPeriod = roundMoney(receivedInPeriod + paidAmount);
      qtyPaid += 1;
      bumpProject(proj, { received: paidAmount });
    } else if (!isPaid && status !== 'cancelado') {
      if (isIsoDateInRange(due, start, end)) {
        toReceive = roundMoney(toReceive + amount);
        bumpProject(proj, { toReceive: amount });
        if (isLate) {
          overdue = roundMoney(overdue + amount);
          qtyOverdue += 1;
          bumpProject(proj, { overdue: amount });
        } else {
          qtyPending += 1;
        }
      }
    }
  }

  const paidForDestinations = identityReceipts.filter((p) => {
    const due = isoDatePart(p?.due_date);
    const paid = isoDatePart(p?.paid_at);
    const status = computeWalletStatus(p?.status, due, todayIso);
    return (status === 'pago' || status === 'paid') && isIsoDateInRange(paid, start, end);
  });

  const destinationLegs: CanonicalSplitLeg[] = [];
  const destinationRows: CanonicalDestinationTotal[] = [];
  for (const p of paidForDestinations) {
    const movement = toMovement(p);
    if (movement.hasSplit) {
      destinationLegs.push(...movement.split);
    } else {
      destinationRows.push({
        beneficiaryName: movement.destinationFallbackLabel,
        amount: movement.paidAmount,
        amountKind: 'account',
        amountKindLabel: AMOUNT_KIND_LABELS.account,
      });
    }
  }
  const splitTotals = aggregateDestinationTotals(destinationLegs);
  const mergedDestinations = [...splitTotals, ...destinationRows];
  const destMap = new Map<string, CanonicalDestinationTotal>();
  for (const row of mergedDestinations) {
    const key = `${row.beneficiaryName}::${row.amountKind}`;
    const prev = destMap.get(key);
    if (prev) prev.amount = roundMoney(prev.amount + row.amount);
    else destMap.set(key, { ...row });
  }
  const destinations = [...destMap.values()].sort((a, b) =>
    a.beneficiaryName.localeCompare(b.beneficiaryName, 'pt-BR'),
  );
  const destinationsTotal = roundMoney(destinations.reduce((s, r) => s + r.amount, 0));

  const allCashItems = buildCashFlowItems(
    input.receipts || [],
    input.cashMovements || [],
    input.commissions || [],
  );

  const matchesCashIdentity = (item: (typeof allCashItems)[number]): boolean => {
    if (
      filters.projectFilter &&
      filters.projectFilter !== FINANCE_REPORT_ALL_PROJECTS &&
      item.projectName !== filters.projectFilter
    ) {
      return false;
    }
    const accountId = cashAccountId(item, receiptAccountById);
    if (
      filters.financialAccountId &&
      filters.financialAccountId !== FINANCE_REPORT_ALL_ACCOUNTS
    ) {
      if (!accountId || accountId !== filters.financialAccountId) return false;
    }
    const q = (filters.search || '').trim().toLowerCase();
    if (q) {
      const hay = [
        item.customerName,
        item.contractNumber,
        item.description,
        item.locationLabel,
        item.projectName,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const identifiedCash = allCashItems.filter(matchesCashIdentity);
  let openingBalance = 0;
  if (start) {
    for (const item of identifiedCash) {
      const date = isoDatePart(item.movement_date);
      if (date && date < start) {
        if (item.tipo === 'entrada') openingBalance = roundMoney(openingBalance + item.amount);
        else openingBalance = roundMoney(openingBalance - item.amount);
      }
    }
  }

  const periodCash = identifiedCash.filter((item) =>
    isIsoDateInRange(isoDatePart(item.movement_date), start, end),
  );

  let inflows = 0;
  let outflows = 0;
  const outflowMap = new Map<string, number>();
  const cashMovements: CanonicalCashMovement[] = periodCash.map((item) => {
    if (item.tipo === 'entrada') inflows = roundMoney(inflows + item.amount);
    else {
      outflows = roundMoney(outflows + item.amount);
      const cat = item.category || 'Outras saídas';
      outflowMap.set(cat, roundMoney((outflowMap.get(cat) || 0) + item.amount));
    }
    const accountId = cashAccountId(item, receiptAccountById);
    const accountLabel = accountId ? accountLabels[accountId] || accountId : null;
    const date = isoDatePart(item.movement_date);
    return {
      id: item.id,
      date,
      dateLabel: formatFlowDate(item.movement_date),
      tipo: item.tipo,
      tipoLabel: item.tipo === 'entrada' ? 'Entrada' : 'Saída',
      category: item.category || '—',
      projectName: item.projectName || '—',
      description: item.description || '—',
      accountLabel,
      amount: roundMoney(item.amount),
      status: item.status === 'estornado' ? 'Estornado' : 'Ativo',
    };
  });

  cashMovements.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const outflowsByCategory: CanonicalOutflowByCategory[] = [...outflowMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'));

  const byProject = [...byProjectMap.values()]
    .filter((row) => row.received !== 0 || row.toReceive !== 0 || row.overdue !== 0)
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'pt-BR'));

  const periodLabel = hasPeriod
    ? `${start ? formatDateBr(start) : 'início'} a ${end ? formatDateBr(end) : 'fim'}`
    : 'Todo o histórico carregado';

  return {
    meta: {
      companyName: input.company.name || 'Empresa não informada',
      companyDocument: input.company.document || 'CNPJ não informado',
      companyEmail: input.company.email || null,
      companyPhone: input.company.phone || null,
      generatedAtIso: generatedAt.toISOString(),
      generatedAtLabel: generatedAt.toLocaleString('pt-BR'),
      periodStartIso: start,
      periodEndIso: end,
      periodLabel,
      filters,
      filterLines: buildFilterLines(filters, hasPeriod),
      dateSemantics: [
        'Carteira (a receber / vencido): data de vencimento (due_date).',
        'Recebimentos: data/hora de pagamento (paid_at).',
        'Caixa: data da movimentação (movement_date, somente data).',
      ],
    },
    wallet: {
      movements,
      receivedInPeriod,
      toReceive,
      overdue,
      qtyPaid,
      qtyPending,
      qtyOverdue,
      byProject,
    },
    cash: {
      openingBalance,
      inflows,
      outflows,
      closingBalance: roundMoney(openingBalance + inflows - outflows),
      movements: cashMovements,
      outflowsByCategory,
    },
    destinations: {
      rows: destinations,
      total: destinationsTotal,
      disclaimer: DESTINATION_DISCLAIMER,
    },
  };
}
