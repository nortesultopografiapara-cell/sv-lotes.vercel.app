/**
 * Testes obrigatórios — conciliação GET-only Inter (admin temporário).
 * npm run test:inter-admin-get-reconcile
 */
import fs from 'node:fs';
import path from 'path';
import { isInterAdminGetReconcileEnabled } from '../lib/banking/inter/interAdminGetReconcileFlag';
import { isInterResumeLiveEmitFlagEnabled } from '../lib/banking/inter/interResumeLiveEmitFlag';
import { buildInterSeuNumero } from '../lib/banking/inter/interSaleChargesResume';
import {
  buildInterDueWindows,
  chooseInterListWindowDays,
  compareInterAdminReconcile,
  isInterCobrancaListLastPage,
  runInterAdminGetReconcile,
  windowsCoverRangeWithoutGaps,
  type InterAdminGetReconcilePorts,
  type InterReconcileBankItem,
  type InterReconcileLocalCharge,
  type InterReconcileReceipt,
} from '../lib/banking/inter/interAdminGetReconcile';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function receipts(from: number, to: number): InterReconcileReceipt[] {
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const n = from + i;
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    return {
      id,
      installmentNumber: n,
      dueDate: `2027-${String((n % 12) + 1).padStart(2, '0')}-15`,
      amount: 500,
    };
  });
}

function localFrom(rows: InterReconcileReceipt[], count: number): InterReconcileLocalCharge[] {
  return rows.slice(0, count).map((row, i) => ({
    receiptId: row.id,
    installmentNumber: row.installmentNumber,
    externalId: `ext-${String(i + 1).padStart(2, '0')}`,
    ourNumber: `our-${i + 1}`,
    dueDate: row.dueDate,
  }));
}

function testFlagOffByDefault(): void {
  const prev = process.env.INTER_ADMIN_GET_RECONCILE_ENABLED;
  delete process.env.INTER_ADMIN_GET_RECONCILE_ENABLED;
  assert(isInterAdminGetReconcileEnabled() === false, 'flag off por padrão');
  assert(isInterAdminGetReconcileEnabled('true') === true, 'flag true explícito');
  assert(isInterAdminGetReconcileEnabled('TRUE') === true, 'flag TRUE');
  assert(isInterAdminGetReconcileEnabled('1') === false, 'flag 1 não libera');
  assert(isInterResumeLiveEmitFlagEnabled() === false, 'live emit continua off');
  if (prev === undefined) delete process.env.INTER_ADMIN_GET_RECONCILE_ENABLED;
  else process.env.INTER_ADMIN_GET_RECONCILE_ENABLED = prev;
}

function testWindows(): void {
  const month = buildInterDueWindows('2026-11-15', '2041-10-15', 30);
  assert(windowsCoverRangeWithoutGaps(month, '2026-11-15', '2041-10-15'), '30d cobre 15/11/2026–15/10/2041 sem lacuna');
  assert(month[0].from === '2026-11-15', 'primeira janela');
  assert(month[month.length - 1].to === '2041-10-15', 'última janela fecha no fim');
  const seven = buildInterDueWindows('2026-11-15', '2041-10-15', 7);
  assert(windowsCoverRangeWithoutGaps(seven, '2026-11-15', '2041-10-15'), '7d também sem lacuna');
  assert(chooseInterListWindowDays(200) === 30, 'HTTP 200 → 30d');
  assert(chooseInterListWindowDays(400) === 7, 'HTTP 400 → 7d');
  assert(chooseInterListWindowDays(500) === 7, 'HTTP 500 → 7d');
}

function testPaginationLastPage(): void {
  assert(
    isInterCobrancaListLastPage({ pageIndex: 0, itemCount: 12, totalPaginas: 0 }) === true,
    'página curta encerra',
  );
  assert(
    isInterCobrancaListLastPage({ pageIndex: 0, itemCount: 100, totalPaginas: 0 }) === false,
    '100 itens sem totalPaginas continua',
  );
  assert(
    isInterCobrancaListLastPage({ pageIndex: 0, itemCount: 100, totalPaginas: 1 }) === true,
    'totalPaginas=1 encerra',
  );
  assert(
    isInterCobrancaListLastPage({ pageIndex: 0, itemCount: 100, totalPaginas: 2 }) === false,
    'totalPaginas=2 continua',
  );
}

function testCompareComplete(): void {
  const monthly = receipts(1, 180);
  const local = localFrom(monthly, 32);
  const bank: InterReconcileBankItem[] = local.map((row) => ({
    codigoSolicitacao: row.externalId,
    seuNumero: buildInterSeuNumero(row.installmentNumber, row.receiptId),
    nossoNumero: row.ourNumber,
    situacao: 'A_RECEBER',
    dataVencimento: row.dueDate,
  }));
  const report = compareInterAdminReconcile({
    localCharges: local,
    monthlyReceipts: monthly,
    bankItems: bank,
    confirmedByCodigo: new Set(local.map((r) => r.externalId)),
    seuNumeroHits: new Set(),
    coverageComplete: true,
  });
  assert(report.readOnly === true, 'readOnly');
  assert(report.emitAttempted === false, 'não emitiu');
  assert(report.matched === 32, '32 casadas');
  assert(report.orphansUnlinked === 0, 'sem órfãs soltas');
  assert(report.orphansLinkedToReceipt === 0, 'sem órfãs ligadas');
  assert(report.missingConfirmedAbsent === 148, '148 ausentes no banco');
  assert(report.aptosEmissao === 148, '148 aptas só com cobertura completa');
}

function testCompareIncompleteDoesNotProveAbsence(): void {
  const monthly = receipts(1, 180);
  const local = localFrom(monthly, 32);
  const report = compareInterAdminReconcile({
    localCharges: local,
    monthlyReceipts: monthly,
    bankItems: local.map((row) => ({
      codigoSolicitacao: row.externalId,
      seuNumero: null,
      nossoNumero: row.ourNumber,
      situacao: 'A_RECEBER',
      dataVencimento: row.dueDate,
    })),
    confirmedByCodigo: new Set(local.map((r) => r.externalId)),
    seuNumeroHits: new Set(),
    coverageComplete: false,
  });
  assert(report.missingConfirmedAbsent === null, 'incompleto não confirma ausência');
  assert(report.aptosEmissao === null, 'incompleto não declara aptas');
  assert(report.missingUnconfirmed === 148, '148 ficam unconfirmed');
  assert(report.matched === 32, '32 ainda casadas no recorte');
}

function testOrphans(): void {
  const monthly = receipts(1, 180);
  const local = localFrom(monthly, 32);
  const rec33 = monthly.find((r) => r.installmentNumber === 33)!;
  const bank: InterReconcileBankItem[] = [
    ...local.map((row) => ({
      codigoSolicitacao: row.externalId,
      seuNumero: null,
      nossoNumero: row.ourNumber,
      situacao: 'A_RECEBER',
      dataVencimento: row.dueDate,
    })),
    {
      codigoSolicitacao: 'orphan-unlinked',
      seuNumero: '999999999999999',
      nossoNumero: null,
      situacao: 'A_RECEBER',
      dataVencimento: '2030-01-15',
      installmentNumber: null as never,
    },
    {
      codigoSolicitacao: 'orphan-33',
      seuNumero: buildInterSeuNumero(33, rec33.id),
      nossoNumero: null,
      situacao: 'A_RECEBER',
      dataVencimento: rec33.dueDate,
    },
  ];
  const report = compareInterAdminReconcile({
    localCharges: local,
    monthlyReceipts: monthly,
    bankItems: bank,
    confirmedByCodigo: new Set(),
    seuNumeroHits: new Set(),
    coverageComplete: true,
  });
  assert(report.orphansUnlinked === 1, '1 órfã sem parcela');
  assert(report.orphansLinkedToReceipt === 1, '1 órfã da parcela 33');
  assert(report.missingConfirmedAbsent === 147, '33 não conta como ausente');
  assert(report.orphans.some((o) => o.installmentNumber === 33), 'órfã aponta parcela 33');
}

function testRunUsesOnlyGetPorts(): void {
  const monthly = receipts(1, 5);
  const local = localFrom(monthly, 2);
  const methods: string[] = [];
  const ports: InterAdminGetReconcilePorts = {
    async listPage(query) {
      methods.push('GET /cobrancas');
      if (query.dataFinal > addYear(query.dataInicial)) {
        return { status: 400, cobrancas: [], totalPaginas: 1 };
      }
      return {
        status: 200,
        totalPaginas: 1,
        cobrancas: local.map((row) => ({
          codigoSolicitacao: row.externalId,
          seuNumero: null,
          nossoNumero: row.ourNumber,
          situacao: 'A_RECEBER',
          dataVencimento: row.dueDate,
        })),
      };
    },
    async getByCodigo(codigo) {
      methods.push('GET /cobrancas/{id}');
      const row = local.find((r) => r.externalId === codigo);
      if (!row) return null;
      return {
        codigoSolicitacao: row.externalId,
        seuNumero: null,
        nossoNumero: row.ourNumber,
        situacao: 'A_RECEBER',
        dataVencimento: row.dueDate,
      };
    },
    async getBySeuNumero() {
      methods.push('GET /cobrancas?seuNumero');
      return null;
    },
    sleep: async () => undefined,
    nowMs: () => 0,
  };
  function addYear(start: string) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }
  return runInterAdminGetReconcile(
    {
      localCharges: local,
      monthlyReceipts: monthly,
      payerDocDigits: '52998224725',
      dueStart: '2027-01-15',
      dueEnd: '2027-05-15',
      budgetMs: 60_000,
    },
    ports,
  ).then((report) => {
    assert(report.emitAttempted === false, 'run não marca emissão');
    assert(report.coverage.complete === true, 'faixa curta completa');
    assert(report.coverage.nextDueFrom === null, 'completo sem cursor');
    assert(report.getByCodigo.confirmed === 2, 'GET por codigo das 2 locais');
    assert(methods.every((m) => m.startsWith('GET')), 'portas só GET');
    assert(!methods.some((m) => /POST|PATCH|PUT|DELETE/i.test(m)), 'nenhum método de escrita');
    assert(!JSON.stringify(report).includes('52998224725'), 'relatório sem CPF');
    assert(!JSON.stringify(report).includes('-----BEGIN'), 'relatório sem PEM');
  });
}

async function testTimeoutSetsCursor(): Promise<void> {
  let now = 0;
  const ports: InterAdminGetReconcilePorts = {
    async listPage() {
      now += 1000;
      return { status: 200, cobrancas: [], totalPaginas: 1 };
    },
    async getByCodigo() {
      return null;
    },
    async getBySeuNumero() {
      return null;
    },
    sleep: async () => undefined,
    nowMs: () => now,
  };
  const report = await runInterAdminGetReconcile(
    {
      localCharges: [],
      monthlyReceipts: receipts(1, 5),
      payerDocDigits: '52998224725',
      dueStart: '2026-11-15',
      dueEnd: '2041-10-15',
      budgetMs: 50,
    },
    ports,
  );
  assert(report.coverage.complete === false, 'timeout não marca complete');
  assert(report.coverage.nextDueFrom === '2026-11-15', 'cursor recomeça na janela atual');
  assert(report.aptosEmissao === null, 'timeout não declara aptas');
  assert(report.missingConfirmedAbsent === null, 'timeout não prova ausência');
}

function testSourceGuards(): void {
  const route = read('app/api/admin/inter/sale-charges-reconcile/route.ts');
  const service = read('lib/banking/inter/interAdminGetReconcileService.ts');
  const core = read('lib/banking/inter/interAdminGetReconcile.ts');
  const flag = read('lib/banking/inter/interAdminGetReconcileFlag.ts');
  const client = read('lib/banking/inter/interCobrancaClient.ts');

  assert(route.includes('export async function GET'), 'rota exporta GET');
  assert(!/export async function (POST|PUT|PATCH|DELETE)/.test(route), 'rota sem escrita HTTP');
  assert(route.includes("role !== 'SUPER_ADMIN'"), 'exige SUPER_ADMIN');
  assert(route.includes('companyId'), 'isolamento companyId');
  assert(route.includes('isInterAdminGetReconcileEnabled'), 'flag na rota');
  assert(route.includes("status: 404"), 'flag off → 404');
  assert(!route.includes('INTER_RESUME_LIVE_EMIT_ENABLED'), 'rota não liga live emit');

  assert(!/import[\s\S]{0,200}createInterCobranca/.test(service), 'serviço sem import de criação');
  assert(!/import[\s\S]{0,200}cancelInterCobranca/.test(service), 'serviço sem import de cancel');
  assert(service.includes('listInterCobrancasPage'), 'serviço lista GET');
  assert(service.includes('fetchInterCobrancaByCodigo'), 'serviço GET por codigo');
  assert(!service.includes("method: 'POST'"), 'serviço sem POST literal');
  assert(!/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(service), 'serviço sem escrita Supabase');

  assert(!core.includes('createInterCobranca'), 'núcleo sem emissão');
  assert(core.includes("consulta_incompleta") || core.includes('consulta_incompleta'), 'trata incompleto');
  assert(flag.includes('INTER_ADMIN_GET_RECONCILE_ENABLED'), 'env própria');
  assert(!flag.includes('process.env.INTER_RESUME_LIVE_EMIT_ENABLED'), 'flag isolada da emissão');

  assert(client.includes('export async function listInterCobrancasPage'), 'listagem GET exportada');
  assert(client.includes("{ method: 'GET' }"), 'listagem usa GET');
}

async function main() {
  testFlagOffByDefault();
  testWindows();
  testPaginationLastPage();
  testCompareComplete();
  testCompareIncompleteDoesNotProveAbsence();
  testOrphans();
  await testRunUsesOnlyGetPorts();
  await testTimeoutSetsCursor();
  testSourceGuards();
  console.log('\nOK — conciliação GET-only Inter (admin).');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
