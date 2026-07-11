/**
 * Gera HTML de homologação — pagamento único futuro (SV2).
 * npx tsx scripts/homolog-single-future-presentation.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import { PAYMENT_TYPE_SINGLE_FUTURE } from '../lib/salePaymentMode';

const html = generateContractHTML({
  tenant: {
    id: 't-sv2',
    name: 'SV TOPOGRAFIA E PROJETOS',
    contract_model: 'SV_LOTES_2',
    cnpj: '00.000.000/0001-00',
  },
  customer: {
    name: 'Cliente Homologacao',
    cpf_cnpj: '12345678901',
    document: '12345678901',
  },
  project: { name: 'Projeto Homologacao', city: 'Goiania', uf: 'GO' },
  block: { block_name: '02', number: 26, area: 1158.2 },
  sale: {
    payment_type: PAYMENT_TYPE_SINGLE_FUTURE,
    total_value: 50,
    agreed_price: 50,
    lot_price: 50,
    discount: 0,
    down_payment: 0,
    installments_count: 1,
    sale_date: '2026-06-16',
    finance_receipts: [
      {
        installment_number: 1,
        amount: 50,
        due_date: '2032-06-16',
        status: 'pendente',
      },
    ],
  },
  financeReceipts: [
    {
      installment_number: 1,
      amount: 50,
      due_date: '2032-06-16',
      status: 'pendente',
    },
  ],
});

const checks = [
  [/Data de vencimento/i, 'rótulo Data de vencimento'],
  [/16\/06\/2032/, 'data DD/MM'],
  [/16 de junho de 2032/, 'data por extenso'],
  [/Pagamento único com vencimento futuro/, 'forma de pagamento'],
  [/atraso no pagamento do valor na data de vencimento/, 'inadimplência'],
];

for (const [re, label] of checks) {
  if (!(re as RegExp).test(html)) {
    throw new Error(`Homologação falhou: ${label}`);
  }
}
if (/Saldo financiado|Parcela base|Primeiro vencimento/i.test(html)) {
  throw new Error('Homologação falhou: campos de parcelamento no único futuro');
}
if (/atraso no pagamento de qualquer parcela/.test(html)) {
  throw new Error('Homologação falhou: texto de parcela na inadimplência');
}

const outDir = path.join(process.cwd(), 'tmp');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'homolog-single-future-presentation.html');
fs.writeFileSync(out, html, 'utf8');
console.log('OK homolog HTML', out, 'bytes', html.length);
