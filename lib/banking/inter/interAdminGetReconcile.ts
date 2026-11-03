/**
 * Conciliação TEMPORÁRIA Banco Inter — somente GET.
 * Não emite, não cancela, não persiste cobranças.
 * REMOVER após conciliação do contrato 000000098/2026.
 */

import { buildInterSeuNumero } from '@/lib/banking/inter/interSaleChargesResume';

export const INTER_ADMIN_GET_RECONCILE_BUDGET_MS = 240_000;
export const INTER_ADMIN_GET_RECONCILE_PAGE_SIZE = 100;
export const INTER_ADMIN_GET_RECONCILE_MAX_PAGES = 20;

export type InterReconcileLocalCharge = {
  receiptId: string;
  installmentNumber: number;
  externalId: string;
  ourNumber: string | null;
  dueDate: string;
};

export type InterReconcileReceipt = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
};

export type InterReconcileBankItem = {
  codigoSolicitacao: string;
  seuNumero: string | null;
  nossoNumero: string | null;
  situacao: string;
  dataVencimento: string | null;
};

export type InterReconcileCoverage = {
  windowDays: number;
  windowsPlanned: number;
  windowsOk: number;
  complete: boolean;
  nextDueFrom: string | null;
  probeHttp: number;
  listHttpErrors: number;
  reason: string | null;
};

export type InterReconcileReport = {
  readOnly: true;
  emitAttempted: false;
  coverage: InterReconcileCoverage;
  getByCodigo: {
    attempted: number;
    confirmed: number;
    errors: number;
    situacoes: Record<string, number>;
  };
  getBySeuNumero: { attempted: number; hits: number };
  matched: number;
  localUnconfirmed: number;
  orphansUnlinked: number;
  orphansLinkedToReceipt: number;
  missingConfirmedAbsent: number | null;
  missingUnconfirmed: number;
  aptosEmissao: number | null;
  orphans: Array<{
    codigoSolicitacao: string;
    situacao: string;
    due: string | null;
    installmentNumber: number | null;
  }>;
};

export function addUtcDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildInterDueWindows(
  start: string,
  end: string,
  spanDays: number,
): Array<{ from: string; to: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return [];
  }
  const span = Math.max(1, Math.floor(spanDays));
  const out: Array<{ from: string; to: string }> = [];
  let from = start;
  while (from <= end) {
    const rawTo = addUtcDays(from, span - 1);
    const to = rawTo < end ? rawTo : end;
    out.push({ from, to });
    from = addUtcDays(to, 1);
  }
  return out;
}

export function chooseInterListWindowDays(probeStatus: number): 30 | 7 {
  if (probeStatus >= 200 && probeStatus < 300) return 30;
  return 7;
}

export function isInterCobrancaListLastPage(input: {
  pageIndex: number;
  itemCount: number;
  totalPaginas: number;
  pageSize?: number;
}): boolean {
  const pageSize = input.pageSize ?? INTER_ADMIN_GET_RECONCILE_PAGE_SIZE;
  if (input.itemCount < pageSize) return true;
  if (Number.isFinite(input.totalPaginas) && input.totalPaginas > 0) {
    return input.pageIndex + 1 >= input.totalPaginas;
  }
  return false;
}

export function windowsCoverRangeWithoutGaps(
  windows: Array<{ from: string; to: string }>,
  start: string,
  end: string,
): boolean {
  if (!windows.length) return false;
  if (windows[0].from !== start) return false;
  if (windows[windows.length - 1].to !== end) return false;
  for (let i = 0; i < windows.length; i += 1) {
    if (windows[i].from > windows[i].to) return false;
    if (i === 0) continue;
    if (windows[i].from !== addUtcDays(windows[i - 1].to, 1)) return false;
  }
  return true;
}

export function compareInterAdminReconcile(input: {
  localCharges: InterReconcileLocalCharge[];
  monthlyReceipts: InterReconcileReceipt[];
  bankItems: InterReconcileBankItem[];
  confirmedByCodigo: Set<string>;
  seuNumeroHits: Set<string>;
  coverageComplete: boolean;
}): InterReconcileReport {
  const localByExt = new Map(
    input.localCharges
      .filter((row) => row.externalId)
      .map((row) => [row.externalId, row]),
  );
  const localByOur = new Map(
    input.localCharges
      .filter((row) => row.ourNumber)
      .map((row) => [String(row.ourNumber), row]),
  );
  const receiptBySeu = new Map<string, InterReconcileReceipt>();
  for (const rec of input.monthlyReceipts) {
    receiptBySeu.set(buildInterSeuNumero(rec.installmentNumber, rec.id), rec);
  }

  const uniqueBank = new Map<string, InterReconcileBankItem>();
  for (const item of input.bankItems) {
    if (item.codigoSolicitacao) uniqueBank.set(item.codigoSolicitacao, item);
  }

  let matched = 0;
  const orphans: InterReconcileReport['orphans'] = [];
  let orphansLinkedToReceipt = 0;
  const receiptsFoundAtBank = new Set<string>();

  for (const item of uniqueBank.values()) {
    const local =
      localByExt.get(item.codigoSolicitacao) ||
      (item.nossoNumero ? localByOur.get(item.nossoNumero) : undefined);
    if (local) {
      matched += 1;
      receiptsFoundAtBank.add(local.receiptId);
      continue;
    }
    const linked = item.seuNumero ? receiptBySeu.get(item.seuNumero) : undefined;
    if (linked) {
      orphansLinkedToReceipt += 1;
      receiptsFoundAtBank.add(linked.id);
      orphans.push({
        codigoSolicitacao: item.codigoSolicitacao,
        situacao: item.situacao,
        due: item.dataVencimento,
        installmentNumber: linked.installmentNumber,
      });
      continue;
    }
    orphans.push({
      codigoSolicitacao: item.codigoSolicitacao,
      situacao: item.situacao,
      due: item.dataVencimento,
      installmentNumber: null,
    });
  }

  const localUnconfirmed = input.localCharges.filter(
    (row) => row.externalId && !input.confirmedByCodigo.has(row.externalId) && !uniqueBank.has(row.externalId),
  ).length;

  const missingReceipts = input.monthlyReceipts.filter((rec) => rec.installmentNumber >= 33);
  let missingConfirmedAbsent = 0;
  let missingUnconfirmed = 0;
  for (const rec of missingReceipts) {
    if (receiptsFoundAtBank.has(rec.id) || input.seuNumeroHits.has(rec.id)) continue;
    if (input.coverageComplete) missingConfirmedAbsent += 1;
    else missingUnconfirmed += 1;
  }

  const orphansUnlinked = orphans.filter((row) => row.installmentNumber == null).length;

  return {
    readOnly: true,
    emitAttempted: false,
    coverage: {
      windowDays: 0,
      windowsPlanned: 0,
      windowsOk: 0,
      complete: input.coverageComplete,
      nextDueFrom: null,
      probeHttp: 0,
      listHttpErrors: 0,
      reason: input.coverageComplete ? null : 'consulta_incompleta',
    },
    getByCodigo: { attempted: 0, confirmed: 0, errors: 0, situacoes: {} },
    getBySeuNumero: { attempted: 0, hits: 0 },
    matched,
    localUnconfirmed,
    orphansUnlinked,
    orphansLinkedToReceipt,
    missingConfirmedAbsent: input.coverageComplete ? missingConfirmedAbsent : null,
    missingUnconfirmed: input.coverageComplete ? 0 : missingUnconfirmed,
    aptosEmissao: input.coverageComplete ? missingConfirmedAbsent : null,
    orphans,
  };
}

export type InterAdminGetReconcilePorts = {
  listPage: (query: {
    dataInicial: string;
    dataFinal: string;
    cpfCnpjPessoaPagadora: string;
    paginaAtual: number;
  }) => Promise<{
    status: number;
    cobrancas: InterReconcileBankItem[];
    totalPaginas: number;
  }>;
  getByCodigo: (codigoSolicitacao: string) => Promise<InterReconcileBankItem | null>;
  getBySeuNumero: (input: {
    seuNumero: string;
    dueDate: string;
  }) => Promise<InterReconcileBankItem | null>;
  sleep: (ms: number) => Promise<void>;
  nowMs: () => number;
};

function asBankItem(row: {
  codigoSolicitacao?: string | null;
  seuNumero?: string | null;
  nossoNumero?: string | null;
  situacao?: string | null;
  dataVencimento?: string | null;
}): InterReconcileBankItem | null {
  const codigo = String(row.codigoSolicitacao || '').trim();
  if (!codigo) return null;
  return {
    codigoSolicitacao: codigo,
    seuNumero: row.seuNumero ? String(row.seuNumero).trim() : null,
    nossoNumero: row.nossoNumero ? String(row.nossoNumero).trim() : null,
    situacao: String(row.situacao || '').trim().toUpperCase(),
    dataVencimento: row.dataVencimento ? String(row.dataVencimento).slice(0, 10) : null,
  };
}

export async function runInterAdminGetReconcile(
  input: {
    localCharges: InterReconcileLocalCharge[];
    monthlyReceipts: InterReconcileReceipt[];
    payerDocDigits: string;
    dueStart: string;
    dueEnd: string;
    budgetMs?: number;
  },
  ports: InterAdminGetReconcilePorts,
): Promise<InterReconcileReport> {
  const started = ports.nowMs();
  const budget = input.budgetMs ?? INTER_ADMIN_GET_RECONCILE_BUDGET_MS;
  const cpf = String(input.payerDocDigits || '').replace(/\D/g, '');
  const bankItems: InterReconcileBankItem[] = [];
  let probeHttp = 0;
  let windowDays: 30 | 7 = 30;
  let listHttpErrors = 0;
  let listComplete = cpf.length === 11 || cpf.length === 14;
  let reason: string | null = listComplete ? null : 'pagador_sem_documento';
  let nextDueFrom: string | null = null;

  if (listComplete) {
    try {
      const probe = await ports.listPage({
        dataInicial: input.dueStart,
        dataFinal: addUtcDays(input.dueStart, 29),
        cpfCnpjPessoaPagadora: cpf,
        paginaAtual: 0,
      });
      probeHttp = probe.status;
      if (probe.status >= 400) windowDays = 7;
    } catch (err) {
      const status = Number((err as { status?: number }).status || 0);
      probeHttp = status || 0;
      windowDays = 7;
    }
  }

  const windows = listComplete ? buildInterDueWindows(input.dueStart, input.dueEnd, windowDays) : [];
  if (listComplete && !windowsCoverRangeWithoutGaps(windows, input.dueStart, input.dueEnd)) {
    listComplete = false;
    reason = 'janelas_com_lacuna';
  }
  let windowsOk = 0;
  for (const win of windows) {
    if (ports.nowMs() - started > budget) {
      listComplete = false;
      reason = 'tempo_esgotado';
      nextDueFrom = win.from;
      break;
    }
    let page = 0;
    let lastPage = false;
    let guard = 0;
    let windowFailed = false;
    while (!lastPage && guard < INTER_ADMIN_GET_RECONCILE_MAX_PAGES) {
      guard += 1;
      if (ports.nowMs() - started > budget) {
        listComplete = false;
        reason = 'tempo_esgotado';
        nextDueFrom = win.from;
        windowFailed = true;
        break;
      }
      let retries = 0;
      let pageDone = false;
      while (!pageDone && retries < 6) {
        try {
          const res = await ports.listPage({
            dataInicial: win.from,
            dataFinal: win.to,
            cpfCnpjPessoaPagadora: cpf,
            paginaAtual: page,
          });
          if (res.status === 429) {
            retries += 1;
            await ports.sleep(8000);
            continue;
          }
          if (res.status >= 400) {
            listHttpErrors += 1;
            windowFailed = true;
            pageDone = true;
            break;
          }
          for (const cob of res.cobrancas) {
            const item = asBankItem(cob);
            if (item) bankItems.push(item);
          }
          lastPage = isInterCobrancaListLastPage({
            pageIndex: page,
            itemCount: res.cobrancas.length,
            totalPaginas: res.totalPaginas,
          });
          page += 1;
          pageDone = true;
          await ports.sleep(250);
        } catch {
          listHttpErrors += 1;
          windowFailed = true;
          pageDone = true;
        }
      }
      if (!pageDone) {
        windowFailed = true;
      }
      if (windowFailed) break;
    }
    if (windowFailed || !lastPage) {
      listComplete = false;
      reason = reason || (!lastPage ? 'paginacao_truncada' : 'janela_http_erro');
      nextDueFrom = win.from;
      break;
    }
    windowsOk += 1;
  }

  const confirmedByCodigo = new Set<string>();
  const situacoes: Record<string, number> = {};
  let codigoErrors = 0;
  let codigoComplete = true;
  const localWithExt = input.localCharges.filter((row) => row.externalId);
  for (const row of localWithExt) {
    if (ports.nowMs() - started > budget) {
      codigoComplete = false;
      reason = reason || 'tempo_esgotado';
      break;
    }
    try {
      const detail = await ports.getByCodigo(row.externalId);
      if (detail?.codigoSolicitacao) {
        confirmedByCodigo.add(row.externalId);
        const sit = detail.situacao || 'UNKNOWN';
        situacoes[sit] = (situacoes[sit] || 0) + 1;
        const item = asBankItem(detail);
        if (item) bankItems.push(item);
      } else {
        codigoErrors += 1;
      }
    } catch {
      codigoErrors += 1;
    }
    await ports.sleep(250);
  }

  const seuNumeroHits = new Set<string>();
  let seuAttempted = 0;
  if (!listComplete) {
    for (const rec of input.monthlyReceipts.filter((r) => r.installmentNumber >= 33)) {
      if (ports.nowMs() - started > budget) break;
      seuAttempted += 1;
      try {
        const hit = await ports.getBySeuNumero({
          seuNumero: buildInterSeuNumero(rec.installmentNumber, rec.id),
          dueDate: rec.dueDate,
        });
        if (hit?.codigoSolicitacao) {
          seuNumeroHits.add(rec.id);
          const item = asBankItem(hit);
          if (item) bankItems.push(item);
        }
      } catch {
        /* ausência neste recorte não prova inexistência */
      }
      await ports.sleep(250);
    }
  }

  const coverageComplete =
    listComplete && codigoComplete && windows.length > 0 && windowsOk === windows.length;
  if (!coverageComplete && !nextDueFrom) {
    nextDueFrom = listComplete
      ? input.dueStart
      : windows[windowsOk]?.from || input.dueStart;
  }
  const report = compareInterAdminReconcile({
    localCharges: input.localCharges,
    monthlyReceipts: input.monthlyReceipts,
    bankItems,
    confirmedByCodigo,
    seuNumeroHits,
    coverageComplete,
  });
  report.coverage = {
    windowDays,
    windowsPlanned: windows.length,
    windowsOk,
    complete: report.coverage.complete,
    nextDueFrom: coverageComplete ? null : nextDueFrom,
    probeHttp,
    listHttpErrors,
    reason: report.coverage.complete ? null : reason || 'consulta_incompleta',
  };
  report.getByCodigo = {
    attempted: input.localCharges.filter((r) => r.externalId).length,
    confirmed: confirmedByCodigo.size,
    errors: codigoErrors,
    situacoes,
  };
  report.getBySeuNumero = { attempted: seuAttempted, hits: seuNumeroHits.size };
  return report;
}
