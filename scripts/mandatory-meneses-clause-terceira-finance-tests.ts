/**
 * Cláusula Terceira MENESES — resumo financeiro dinâmico (mesma fonte do Quadro-Resumo).
 * npx tsx scripts/mandatory-meneses-clause-terceira-finance-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  buildMenesesClauseTerceiraPriceNarrativeHtml,
  buildMenesesClausesHtml,
} from '../lib/menesesContractClauses';
import { resolveContractPaymentDates } from '../lib/contractPaymentDates';
import { resolveSaleContractPaymentBreakdown } from '../lib/saleContractPaymentSummary';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function stripHtml(s: string) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normMoney(s: string) {
  return String(s || '')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s+/g, ' ');
}

const CUSTOMER = {
  name: 'Cliente Teste',
  document: '11144477735',
  cpf: '11144477735',
  profession: 'Comerciante',
  civil_state: 'Solteiro',
  address: 'Rua A',
  neighborhood: 'Centro',
  city: 'Rio Verde',
  state: 'GO',
  zip_code: '75900000',
};

const PROJECT = { name: 'Loteamento Horizonte', city: 'Rio Verde', uf: 'GO' };
const BLOCK = {
  block_name: '12',
  number: '05',
  area: 450.5,
  frente: 12,
  fundo: 12,
  lateral_esquerda: 30,
  lateral_direita: 30,
};

const TENANT = {
  name: 'MENESES IMOBILIARIA LTDA',
  fantasy_name: 'MENESES',
  cnpj: '12345678000199',
  contract_model: 'MENESES',
  city: 'Rio Verde',
  state: 'GO',
  address: 'Av Central',
  phone: '6433334444',
  email: 'contato@teste.com',
  legal_representative: 'Rep Legal',
  representative_cpf: '52998224725',
};

function makeReceipts(params: {
  count: number;
  amount: number;
  firstDue: string;
  entryAmount?: number;
  entryDue?: string;
  balloonAt?: number;
  balloonAmount?: number;
}) {
  const rows: Array<{
    installment_number: number;
    amount: number;
    due_date: string;
    status: string;
  }> = [];
  if ((params.entryAmount || 0) > 0) {
    rows.push({
      installment_number: 0,
      amount: params.entryAmount!,
      due_date: params.entryDue || params.firstDue,
      status: 'pendente',
    });
  }
  const [y, m, d] = params.firstDue.split('-').map(Number);
  for (let i = 1; i <= params.count; i++) {
    const dt = new Date(Date.UTC(y, m - 1 + (i - 1), d, 12));
    const iso = dt.toISOString().slice(0, 10);
    const isBalloon = params.balloonAt === i;
    rows.push({
      installment_number: i,
      amount: isBalloon ? params.balloonAmount || params.amount : params.amount,
      due_date: iso,
      status: 'pendente',
    });
  }
  return rows;
}

function html(sale: Record<string, unknown>, receipts?: unknown[]) {
  return generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale,
    financeReceipts: receipts as any,
  });
}

function extractTerceira(h: string) {
  const m = h.match(
    /Cláusula Terceira — Do Preço e da Forma de Pagamento:<\/strong>\s*([\s\S]*?)<\/p>/i,
  );
  return m ? stripHtml(m[1]) : '';
}

console.log('1) Parcelada com entrada (cenário 086)...');
{
  const sale = {
    id: 'sale-086',
    payment_type: 'Parcelado',
    lot_price: 122500,
    total_value: 122500,
    agreed_price: 122500,
    down_payment: 2500,
    installments_count: 120,
    installment_value: 1000,
    sale_date: '2026-03-10',
    first_installment_due_date: '2026-04-10',
  };
  const receipts = makeReceipts({
    count: 120,
    amount: 1000,
    firstDue: '2026-04-10',
    entryAmount: 2500,
    entryDue: '2026-03-10',
  });
  const h = html(sale, receipts);
  const terceira = extractTerceira(h);
  assert(terceira.includes('R$ 122.500,00'), 'valor total');
  assert(terceira.includes('R$ 2.500,00'), 'entrada');
  assert(terceira.includes('R$ 120.000,00'), 'saldo');
  assert(terceira.includes('120 parcelas iguais'), 'qtd parcelas');
  assert(terceira.includes('R$ 1.000,00'), 'valor parcela');
  assert(terceira.includes('10/04/2026'), 'primeiro vencimento das parcelas');
  const dates = resolveContractPaymentDates(sale, receipts);
  assert(
    terceira.includes(dates.lastInstallmentDueFmt),
    `último vencimento ${dates.lastInstallmentDueFmt}`,
  );
  assert(terceira.includes('Quadro Financeiro'), 'remissão ao quadro');
  assert(h.includes('Quadro resumo'), 'quadro-resumo presente');
  assert(
    normMoney(h).includes('R$ 122.500,00'),
    'quadro com valor do lote',
  );
  // Não deve ficar só na remissão genérica antiga sem valores.
  assert(!/observarão integralmente as especificações constantes do Quadro Financeiro/.test(terceira), 'não usa só remissão genérica');
  console.log('TEXTO_086:', terceira);
}

console.log('2) Parcelada sem entrada...');
{
  const sale = {
    payment_type: 'Parcelado',
    total_value: 60000,
    lot_price: 60000,
    down_payment: 0,
    installments_count: 60,
    installment_value: 1000,
    first_installment_due_date: '2026-05-01',
  };
  const receipts = makeReceipts({ count: 60, amount: 1000, firstDue: '2026-05-01' });
  const terceira = extractTerceira(html(sale, receipts));
  assert(!/sendo .+ de entrada/i.test(terceira), 'sem trecho de entrada');
  assert(terceira.includes('60 parcelas iguais'), '60 parcelas');
  assert(terceira.includes('R$ 1.000,00'), 'parcela');
  assert(terceira.includes('01/05/2026'), 'primeiro vencimento');
}

console.log('3) Com parcela balão...');
{
  const sale = {
    payment_type: 'Parcelado',
    total_value: 100000,
    lot_price: 100000,
    down_payment: 10000,
    installments_count: 12,
    first_installment_due_date: '2026-06-01',
  };
  const receipts = makeReceipts({
    count: 12,
    amount: 7000,
    firstDue: '2026-06-01',
    entryAmount: 10000,
    balloonAt: 12,
    balloonAmount: 16000,
  });
  const balloonAddons = [{ installment_number: 12, additional_amount: 9000 }];
  const h = generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale,
    financeReceipts: receipts as any,
    balloonAddons,
  });
  const terceira = extractTerceira(h);
  assert(
    /balão|adicional|Quadro Financeiro/i.test(terceira),
    'menciona balão/quadro',
  );
  assert(terceira.includes('R$ 100.000,00') || terceira.includes('100.000'), 'total');
}

console.log('4) Pagamento único futuro...');
{
  const sale = {
    payment_type: 'Pagamento único futuro',
    total_value: 80000,
    lot_price: 80000,
    down_payment: 0,
    installments_count: 1,
    single_payment_due_date: '2026-12-15',
  };
  const receipts = [
    {
      installment_number: 1,
      amount: 80000,
      due_date: '2026-12-15',
      status: 'pendente',
    },
  ];
  const terceira = extractTerceira(html(sale, receipts));
  assert(/pagamento único/i.test(terceira), 'modalidade único futuro');
  assert(
    /15 de dezembro de 2026|15\/12\/2026/i.test(terceira),
    'vencimento único',
  );
}

console.log('5) Venda à vista...');
{
  const sale = {
    payment_type: 'À vista',
    total_value: 50000,
    lot_price: 50000,
    down_payment: 0,
    installments_count: 1,
  };
  const terceira = extractTerceira(html(sale));
  assert(/À VISTA/i.test(terceira), 'modalidade à vista');
  assert(terceira.includes('R$ 50.000,00'), 'valor à vista');
}

console.log('6) Coerência Cláusula Terceira x Quadro-Resumo (breakdown)...');
{
  const sale = {
    payment_type: 'Parcelado',
    lot_price: 122500,
    total_value: 122500,
    down_payment: 2500,
    installments_count: 120,
  };
  const receipts = makeReceipts({
    count: 120,
    amount: 1000,
    firstDue: '2026-04-10',
    entryAmount: 2500,
  });
  const breakdown = resolveSaleContractPaymentBreakdown(sale, {
    financeReceipts: receipts,
    contractModel: 'MENESES',
  });
  const dates = resolveContractPaymentDates(sale, receipts);
  const narrative = buildMenesesClauseTerceiraPriceNarrativeHtml({
    paymentMode: 'INSTALLMENT',
    valorTotalFmt: breakdown.netValueFmt,
    valorEntradaFmt: breakdown.entryFmt,
    valorSaldoFmt: breakdown.installmentBalanceFmt,
    qtdParcelas: breakdown.installmentsCount,
    valorParcelaFmt: breakdown.installmentValueFmt,
    dataPrimeiraParcelaFmt: dates.firstInstallmentDueFmt,
    dataUltimaParcelaFmt: dates.lastInstallmentDueFmt,
  });
  assert(narrative.includes(breakdown.entryFmt), 'entrada = breakdown');
  assert(narrative.includes(breakdown.installmentBalanceFmt), 'saldo = breakdown');
  assert(narrative.includes(breakdown.installmentValueFmt), 'parcela = breakdown');
  assert(narrative.includes(dates.firstInstallmentDueFmt), '1º venc = receipts');
  assert(narrative.includes(dates.lastInstallmentDueFmt), 'último venc = receipts');
}

console.log('7) PADRAO / Recanto isolados...');
{
  for (const model of ['PADRAO', 'RECANTO_PRIMAVERA'] as const) {
    const h = generateContractHTML({
      tenant: { ...TENANT, contract_model: model },
      customer: CUSTOMER,
      project: PROJECT,
      block: BLOCK,
      sale: {
        payment_type: 'Parcelado',
        total_value: 100000,
        down_payment: 10000,
        installments_count: 10,
      },
    });
    assert(
      !h.includes('parcelado em <strong>10 parcelas iguais</strong> de'),
      `${model}: sem narrativa Meneses nova`,
    );
  }
}

console.log('8) buildMenesesClausesHtml com finance...');
{
  const fragment = buildMenesesClausesHtml({
    loteLabel: 'LOTE 01 DA QUADRA A',
    lote: '01',
    quadra: 'A',
    areaFmt: '300,00 m²',
    lotBoundariesClause: 'apresentando as seguintes dimensões: frente 10 m',
    curvaClause: '',
    projectDescString: '',
    lotLocationSuffix: '',
    foroText: 'da Comarca de <strong>Rio Verde - GO</strong>',
    finance: {
      paymentMode: 'INSTALLMENT',
      valorTotalFmt: 'R$ 122.500,00',
      valorEntradaFmt: 'R$ 2.500,00',
      valorSaldoFmt: 'R$ 120.000,00',
      qtdParcelas: 120,
      valorParcelaFmt: 'R$ 1.000,00',
      dataPrimeiraParcelaFmt: '10/04/2026',
      dataUltimaParcelaFmt: '10/03/2036',
    },
  });
  assert(fragment.includes('R$ 1.000,00'), 'finance injetado');
  assert(fragment.includes('Parágrafo Primeiro'), 'parágrafos preservados');
  assert(fragment.includes('Central do Cliente do SV LOTES'), 'meios de pagamento');
}

console.log('\nOK mandatory-meneses-clause-terceira-finance-tests');
