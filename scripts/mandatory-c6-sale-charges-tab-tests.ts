/**
 * A aba Cobranças da venda lê parcelas C6 com a emissão desligada
 * e reutiliza o POST já publicado, sem ampliar a parcela autorizada.
 * npx tsx scripts/mandatory-c6-sale-charges-tab-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { isC6BolepixV2LiveReceipt } from '../lib/banking/c6/c6BolepixV2OpenApi';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const provider = read('lib/finance/saleChargesProvider.ts');
const summary = read('lib/finance/saleChargesService.ts');
const panel = read('components/sales/SaleChargesPanel.tsx');
const route = read('app/api/finance/c6/sale-charges/route.ts');
const carne = read('app/api/finance/c6/sale-charges/carne-pdf/route.ts');
const cover = read('components/sales/SaleCarneCoverPanel.tsx');
const asaasCarne = read('lib/finance/saleCarnePdf.ts');
const interCarne = read('lib/banking/inter/interCarnePdf.ts');

const companyId = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const integrationId = 'b5cc1de3-172b-4926-a528-36cebc14db51';
const entrada = '693281b1-4d61-4209-adcc-0b378968aed3';
const siblings = [
  '25c9d7c7-fd95-43b1-97ba-8a1953469e0e',
  '4f1f6dea-53c1-4a96-91d3-c31d1dd1dca3',
  '10c81966-7ced-4e09-9f45-df04496dcefe',
  'fb76a549-399c-4f08-975a-0b0191b096b3',
];

assert(!provider.includes('isC6EmissionActivated'), 'identificar a conta C6 não exige emissão ativada');
assert(provider.includes("provider: 'C6'"), 'a conta C6 é identificada como C6');
assert(!summary.includes('C6EmissionNotHomologatedError'), 'ler o resumo não dispara o bloqueio de emissão');
assert(summary.includes('listC6ChargesForInstallments'), 'o resumo lê os boletos C6 já gravados');
assert(summary.includes('Emissão C6 em lote permanece bloqueada'), 'o lote C6 continua recusado no servidor');
assert(!summary.includes('emitC6InstallmentBoleto'), 'o resumo e o lote não emitem boleto');

assert(panel.includes('/api/finance/c6/sale-charges?saleId='), 'a aba lê as parcelas pela rota C6');
assert(panel.includes("provider === 'C6'"), 'a aba separa o C6 do Asaas e do Inter');
assert(panel.includes('C6 Bank'), 'o subtítulo usa o provedor da conta');
assert(panel.includes('ChargeInstallmentActions'), 'as ações são as mesmas do módulo Cobranças');
assert(panel.includes('/api/banking/c6/charges'), 'a emissão individual usa a rota já publicada');
assert(panel.includes('c6EmitAuthorized={c6AuthorizedIds.includes(view.id)}'), 'o botão segue a autorização do servidor');
assert(panel.includes('Emissão em lote permanece bloqueada'), 'a aba não oferece emissão em lote para o C6');
assert(panel.includes('Gerar cobranças faltantes'), 'Asaas e Inter mantêm a geração em lote');
assert(!panel.includes('/api/finance/c6/sale-charges/generate-missing'), 'não existe lote C6 na aba');
assert(panel.includes("? '/api/finance/c6/sale-charges/carne-pdf'"), 'o carnê C6 continua no PDF oficial');

assert(route.includes('filterC6BolepixAuthorizedReceipts'), 'a autorização da parcela vem do servidor');
assert(!route.includes('emitC6InstallmentBoleto') && !route.includes('postC6BolepixV2Charge'), 'a leitura não emite');
assert(carne.includes('chargeHasOfficialBoletoLine'), 'o carnê só imprime linha oficial');
assert(!carne.includes('emitC6InstallmentBoleto') && !carne.includes('postC6BolepixV2Charge'), 'o carnê não emite');
assert(!cover.includes('lib/banking/c6') && !cover.includes('Asaas Company'), 'a capa do carnê não troca de banco');
assert(!asaasCarne.includes('c6Bolepix') && !interCarne.includes('c6Bolepix'), 'carnês Asaas e Inter permanecem separados');

assert(
  isC6BolepixV2LiveReceipt(companyId, integrationId, entrada),
  'somente a entrada autorizada permanece liberada',
);
for (const receiptId of siblings) {
  assert(
    !isC6BolepixV2LiveReceipt(companyId, integrationId, receiptId),
    'as outras quatro parcelas continuam bloqueadas',
  );
}
assert(
  !isC6BolepixV2LiveReceipt('00000000-0000-4000-8000-000000000001', integrationId, entrada),
  'outra empresa continua bloqueada',
);

console.log('C6_SALE_CHARGES_TAB_OK');
