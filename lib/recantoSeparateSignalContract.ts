import { addMonthsKeepingEndOfMonth } from '@/lib/recantoBrokerageInstallments';

/**
 * Cláusula do contrato Recanto quando o sinal tem cronograma próprio.
 * A modalidade é sales.signal_schedule_mode = SEPARATE.
 * signal_remaining_payment_mode permanece nulo nessa modalidade.
 * Datas e valores saem dos recebíveis do cronograma. Nenhuma data é calculada aqui.
 */

export type SeparateSignalContractReceipt = {
  due_date?: string | null;
  installment_number?: number | string | null;
  amount?: number | null;
  status?: string | null;
  schedule_group?: string | null;
  scheduleGroup?: string | null;
  signal_addon_amount?: number | null;
};

export type SeparateSignalContractLine = {
  scheduleGroup: 'SIGNAL' | 'LOT';
  installmentNumber: number | null;
  amountCents: number;
  amountReais: number;
  dueDate: string | null;
  status: string | null;
  signalAddonCents: number;
};

export type SeparateSignalScheduleBand = {
  scheduleGroup: 'SIGNAL' | 'LOT';
  kind: 'initial' | 'range';
  fromNumber: number | null;
  toNumber: number | null;
  count: number;
  amountCents: number;
  firstDue: string | null;
  lastDue: string | null;
  monthly: boolean;
  status: string | null;
  signalAddonCents: number;
};

export type SeparateSignalContractSchedule = {
  signalTotalCents: number;
  paidAtActCents: number;
  balanceCents: number;
  signalInstallmentCount: number;
  signalInstallmentCents: number[];
  signalDueDates: string[];
  lotTotalCents: number;
  lotInstallmentCents: number[];
  lotDueDates: string[];
  financialTotalCents: number;
  signalLines: SeparateSignalContractLine[];
  lotLines: SeparateSignalContractLine[];
  clauseText: string;
  scheduleHtml: string;
};

function money(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function toCents(amount: unknown): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function saleCents(sale: Record<string, unknown>, key: string): number | null {
  const raw = sale[key];
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function isSeparateSignalScheduleMode(sale: Record<string, unknown>): boolean {
  return String(sale.signal_schedule_mode ?? '').trim().toUpperCase() === 'SEPARATE';
}

function scheduleGroup(row: SeparateSignalContractReceipt): 'SIGNAL' | 'LOT' | null {
  const raw = String(row.schedule_group ?? row.scheduleGroup ?? '').trim().toUpperCase();
  if (raw === 'SIGNAL' || raw === 'LOT') return raw;
  return null;
}

function dueDate(row: SeparateSignalContractReceipt): string | null {
  const raw = String(row.due_date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  return raw.slice(0, 10);
}

function installmentNumber(row: SeparateSignalContractReceipt): number | null {
  if (row.installment_number == null || String(row.installment_number).trim() === '') {
    return null;
  }
  const value = Number(row.installment_number);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function formatDue(iso: string | null): string {
  if (!iso) return 'vencimento ausente no cronograma';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function toLine(
  row: SeparateSignalContractReceipt,
  group: 'SIGNAL' | 'LOT',
): SeparateSignalContractLine {
  const amountCents = toCents(row.amount);
  const status = String(row.status ?? '').trim().toLowerCase();
  return {
    scheduleGroup: group,
    installmentNumber: installmentNumber(row),
    amountCents,
    amountReais: amountCents / 100,
    dueDate: dueDate(row),
    status: status || null,
    signalAddonCents: toCents(row.signal_addon_amount),
  };
}

function isNextMonth(previous: string | null, next: string | null): boolean {
  if (!previous || !next) return false;
  try {
    return addMonthsKeepingEndOfMonth(previous, 1) === next;
  } catch {
    return false;
  }
}

function canExtendBand(
  current: SeparateSignalContractLine[],
  next: SeparateSignalContractLine,
): boolean {
  const previous = current[current.length - 1];
  if (!previous || previous.installmentNumber === 0 || next.installmentNumber === 0) return false;
  if (previous.amountCents !== next.amountCents) return false;
  if (previous.signalAddonCents !== next.signalAddonCents) return false;
  if ((previous.status || '') !== (next.status || '')) return false;
  if (previous.installmentNumber == null || next.installmentNumber == null) return false;
  if (next.installmentNumber !== previous.installmentNumber + 1) return false;
  return isNextMonth(previous.dueDate, next.dueDate);
}

/** Agrupa parcelas consecutivas de mesmo valor, status e vencimento mensal. */
export function groupSeparateSignalScheduleLines(
  lines: SeparateSignalContractLine[],
): SeparateSignalScheduleBand[] {
  const groups: SeparateSignalContractLine[][] = [];
  for (const line of lines) {
    const current = groups[groups.length - 1];
    if (line.installmentNumber === 0 || !current || !canExtendBand(current, line)) {
      groups.push([line]);
      continue;
    }
    current.push(line);
  }
  return groups.map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    return {
      scheduleGroup: first.scheduleGroup,
      kind: first.installmentNumber === 0 ? 'initial' : 'range',
      fromNumber: first.installmentNumber,
      toNumber: last.installmentNumber,
      count: group.length,
      amountCents: first.amountCents,
      firstDue: first.dueDate,
      lastDue: last.dueDate,
      monthly: group.length > 1,
      status: first.status,
      signalAddonCents: first.signalAddonCents,
    };
  });
}

function bySchedule(a: SeparateSignalContractLine, b: SeparateSignalContractLine): number {
  const left = a.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  const right = b.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? ''));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function bandLabel(band: SeparateSignalScheduleBand): string {
  if (band.kind === 'initial') return 'Pagamento inicial';
  if (band.count > 1 && band.fromNumber != null && band.toNumber != null) {
    return `Parcelas ${band.fromNumber} a ${band.toNumber}`;
  }
  return `Parcela ${band.fromNumber ?? ''}`.trim();
}

function bandValue(band: SeparateSignalScheduleBand): string {
  const base = band.count > 1 ? `${money(band.amountCents)} cada` : money(band.amountCents);
  if (band.signalAddonCents > 0) {
    return `${base}, com complemento de ${money(band.signalAddonCents)}`;
  }
  return base;
}

function bandPeriod(band: SeparateSignalScheduleBand): string {
  if (band.kind === 'initial') {
    const pending = band.status === 'pendente' || band.status === 'pending';
    return pending
      ? `vencimento em ${formatDue(band.firstDue)}`
      : `pago em ${formatDue(band.firstDue)}`;
  }
  if (band.count > 1) {
    return `mensais, de ${formatDue(band.firstDue)} a ${formatDue(band.lastDue)}`;
  }
  return formatDue(band.firstDue);
}

function bandRowHtml(band: SeparateSignalScheduleBand): string {
  return `<tr data-schedule-band="${band.scheduleGroup}" data-kind="${band.kind}" data-from="${
    band.fromNumber ?? ''
  }" data-to="${band.toNumber ?? ''}" data-count="${band.count}" data-amount-cents="${band.amountCents}">
    <td style="border: 1px solid #111; padding: 6px;${band.kind === 'initial' ? ' font-weight: 700;' : ''}">${escapeHtml(bandLabel(band))}</td>
    <td style="border: 1px solid #111; padding: 6px; text-align: right;">${bandValue(band)}</td>
    <td style="border: 1px solid #111; padding: 6px;">${escapeHtml(bandPeriod(band))}</td>
  </tr>`;
}

function totalRowHtml(label: string, cents: number): string {
  return `<tr>
    <td style="border: 1px solid #111; padding: 6px;"><strong>${escapeHtml(label)}</strong></td>
    <td style="border: 1px solid #111; padding: 6px; text-align: right;"><strong>${money(cents)}</strong></td>
    <td style="border: 1px solid #111; padding: 6px;"></td>
  </tr>`;
}

function tableHtml(title: string, rows: string): string {
  return `<p style="margin: 10px 0 6px 0;"><strong>${title}</strong></p>
    <table style="width: 100%; border-collapse: collapse; font-size: 10.5pt;">
      <thead>
        <tr>
          <th style="border: 1px solid #111; padding: 6px; text-align: left;">Discriminação</th>
          <th style="border: 1px solid #111; padding: 6px;">Valor individual</th>
          <th style="border: 1px solid #111; padding: 6px;">Periodicidade e vencimentos</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildClauseText(input: {
  signalTotalCents: number;
  paidAtActCents: number;
  balanceCents: number;
  future: SeparateSignalContractLine[];
}): string {
  const equal =
    input.future.length > 0 &&
    input.future.every((line) => line.amountCents === input.future[0].amountCents);
  const count = input.future.length;
  const countText = `${count} ${count === 1 ? 'parcela' : 'parcelas'}`;
  const eachText = equal ? ` de ${money(input.future[0].amountCents)}` : '';

  if (input.balanceCents <= 0) {
    return `O COMPRADOR pagará, a título de SINAL, o valor de ${money(input.signalTotalCents)}. Esse SINAL foi pago integralmente no ato. Não há saldo nem parcelas pendentes de SINAL. O SINAL é independente das parcelas do lote e não reduz o preço do lote.`;
  }

  const paidText =
    input.paidAtActCents > 0
      ? `Desse SINAL, ${money(input.paidAtActCents)} foi pago inicialmente.`
      : 'Nenhum valor deste SINAL foi pago inicialmente.';

  return `O COMPRADOR pagará, a título de SINAL, o valor de ${money(input.signalTotalCents)}. ${paidText} O saldo restante do SINAL é de ${money(input.balanceCents)}, em ${countText}${eachText}. Os vencimentos de cada parcela do SINAL são os do cronograma da venda. O SINAL é independente das parcelas do lote e não reduz o preço do lote.`;
}

function scheduleModeSource(
  sale: Record<string, unknown>,
  contractSnapshot?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (
    contractSnapshot &&
    Object.prototype.hasOwnProperty.call(contractSnapshot, 'signal_schedule_mode')
  ) {
    return contractSnapshot;
  }
  return sale;
}

export function buildSeparateSignalContractSchedule(input: {
  sale: Record<string, unknown>;
  contractSnapshot?: Record<string, unknown> | null;
  receipts?: ReadonlyArray<SeparateSignalContractReceipt> | null;
}): SeparateSignalContractSchedule | null {
  if (!isSeparateSignalScheduleMode(scheduleModeSource(input.sale, input.contractSnapshot))) {
    return null;
  }

  const rows = Array.isArray(input.receipts) ? input.receipts : [];
  const signalLines = rows
    .filter((row) => scheduleGroup(row) === 'SIGNAL')
    .map((row) => toLine(row, 'SIGNAL'))
    .sort(bySchedule);
  const lotLines = rows
    .filter((row) => scheduleGroup(row) === 'LOT')
    .map((row) => toLine(row, 'LOT'))
    .sort(bySchedule);

  const receiptSignalCents = signalLines.reduce((sum, line) => sum + line.amountCents, 0);
  const saleSignalCents = saleCents(input.sale, 'signal_contract_value');
  const signalTotalCents = signalLines.length > 0 ? receiptSignalCents : saleSignalCents ?? 0;
  const paidFromReceipts = signalLines
    .filter((line) => line.installmentNumber === 0)
    .reduce((sum, line) => sum + line.amountCents, 0);
  const paidAtActCents = signalLines.length > 0
    ? paidFromReceipts
    : saleCents(input.sale, 'signal_paid_at_sale') ?? 0;
  const future = signalLines.filter((line) => line.installmentNumber !== 0);
  const balanceCents = signalLines.length > 0
    ? future.reduce((sum, line) => sum + line.amountCents, 0)
    : Math.max(0, signalTotalCents - paidAtActCents);
  const lotTotalCents = lotLines.reduce((sum, line) => sum + line.amountCents, 0);

  const signalRows = groupSeparateSignalScheduleLines(signalLines)
    .map((band) => bandRowHtml(band))
    .join('');
  const lotRows = groupSeparateSignalScheduleLines(lotLines)
    .map((band) => bandRowHtml(band))
    .join('');

  const lotIntro =
    lotLines.length > 0
      ? `Condições de pagamento do lote, em cronograma separado: ${lotLines.length} ${
          lotLines.length === 1 ? 'parcela' : 'parcelas'
        }, no total de ${money(lotTotalCents)}. Esse valor é o preço do lote e não sofre redução pelo SINAL.`
      : 'As condições de pagamento do lote permanecem em cronograma separado do SINAL. O preço do lote não é reduzido pelo SINAL.';

  const scheduleHtml = `${
    signalLines.length > 0
      ? tableHtml('Cronograma do SINAL', `${signalRows}${totalRowHtml('Total do SINAL', signalTotalCents)}`)
      : ''
  }
    <p style="margin: 10px 0 6px 0;">${lotIntro}</p>
    ${
      lotLines.length > 0
        ? tableHtml('Cronograma do lote', `${lotRows}${totalRowHtml('Total do lote', lotTotalCents)}`)
        : ''
    }
    <p style="margin: 8px 0 0 0;"><strong>Total financeiro da operação: ${money(signalTotalCents + lotTotalCents)}.</strong> O SINAL não reduz o preço do lote.</p>`;

  return {
    signalTotalCents,
    paidAtActCents,
    balanceCents,
    signalInstallmentCount: future.length,
    signalInstallmentCents: future.map((line) => line.amountCents),
    signalDueDates: future.map((line) => line.dueDate ?? ''),
    lotTotalCents,
    lotInstallmentCents: lotLines.map((line) => line.amountCents),
    lotDueDates: lotLines.map((line) => line.dueDate ?? ''),
    financialTotalCents: signalTotalCents + lotTotalCents,
    signalLines,
    lotLines,
    clauseText: buildClauseText({
      signalTotalCents,
      paidAtActCents,
      balanceCents,
      future,
    }),
    scheduleHtml,
  };
}
