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
  return {
    scheduleGroup: group,
    installmentNumber: installmentNumber(row),
    amountCents,
    amountReais: amountCents / 100,
    dueDate: dueDate(row),
    signalAddonCents: toCents(row.signal_addon_amount),
  };
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

function rowHtml(line: SeparateSignalContractLine, label: string): string {
  return `<tr data-schedule-group="${line.scheduleGroup}" data-installment="${
    line.installmentNumber ?? ''
  }" data-amount-cents="${line.amountCents}" data-due="${line.dueDate ?? ''}">
    <td style="border: 1px solid #111; padding: 6px;">${escapeHtml(label)}</td>
    <td style="border: 1px solid #111; padding: 6px; text-align: right;">${money(line.amountCents)}</td>
    <td style="border: 1px solid #111; padding: 6px; text-align: center;">${formatDue(line.dueDate)}</td>
  </tr>`;
}

function tableHtml(title: string, rows: string): string {
  return `<p style="margin: 10px 0 6px 0;"><strong>${title}</strong></p>
    <table style="width: 100%; border-collapse: collapse; font-size: 10.5pt;">
      <thead>
        <tr>
          <th style="border: 1px solid #111; padding: 6px; text-align: left;">Parcela</th>
          <th style="border: 1px solid #111; padding: 6px;">Valor</th>
          <th style="border: 1px solid #111; padding: 6px;">Vencimento</th>
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

  const signalRows = signalLines
    .map((line) =>
      rowHtml(
        line,
        line.installmentNumber === 0
          ? 'Pagamento inicial do SINAL'
          : `Parcela ${line.installmentNumber ?? ''} do SINAL`.replace('  ', ' '),
      ),
    )
    .join('');
  const lotRows = lotLines
    .map((line) => rowHtml(line, `Parcela ${line.installmentNumber ?? ''} do lote`.trim()))
    .join('');

  const lotIntro =
    lotLines.length > 0
      ? `Condições de pagamento do lote, em cronograma separado: ${lotLines.length} ${
          lotLines.length === 1 ? 'parcela' : 'parcelas'
        }, no total de ${money(lotTotalCents)}. Esse valor é o preço do lote e não sofre redução pelo SINAL.`
      : 'As condições de pagamento do lote permanecem em cronograma separado do SINAL. O preço do lote não é reduzido pelo SINAL.';

  const scheduleHtml = `${
    signalLines.length > 0 ? tableHtml('Cronograma do SINAL', signalRows) : ''
  }
    <p style="margin: 10px 0 6px 0;">${lotIntro}</p>
    ${lotLines.length > 0 ? tableHtml('Cronograma do lote', lotRows) : ''}`;

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
