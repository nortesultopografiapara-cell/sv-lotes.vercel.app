/**
 * A integração C6 na base de Production não remove as proteções já publicadas.
 * npx tsx scripts/mandatory-c6-production-preservation-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { isC6CompanyOperationEnabled } from '../lib/banking/c6/c6CompanyAccess';
import { throwIfC6EmissionAttempt } from '../lib/banking/c6/c6EmitGuard';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const asaas = read('lib/finance/asaasCompanyChargeService.ts');
const sales = read('lib/finance/saleChargesService.ts');
const inter = read('lib/banking/inter/interSaleChargeService.ts');
const grants = read('lib/banking/c6/c6CompanyAccess.ts');

assert(asaas.includes('runGuardedAsaasCreate'), 'a emissão Asaas continua idempotente');
assert(asaas.includes('assertAsaasSeparateScheduleChargeAllowed'), 'o sinal separado do Recanto continua protegido');
assert(asaas.includes('Parcela cancelada não gera cobrança.'), 'parcela cancelada continua bloqueada');
assert(asaas.includes('Parcela não pertence ao empreendimento da venda.'), 'o empreendimento da venda continua validado');
assert(asaas.includes('A conta C6 não usa o fluxo do Asaas.'), 'o C6 não entra no fluxo Asaas');
assert(sales.includes('isRecantoSeparateSignalAllowed'), 'o resumo da venda preserva o sinal separado');
assert(!inter.includes('emitC6InstallmentBoleto') && !inter.includes('lib/banking/c6'), 'o Inter não passa a depender do C6');
assert(grants.includes('C6_COMPANY_OPERATION_GRANTS: Readonly<Record<string, C6CompanyGrant>> = {}'), 'nenhuma empresa recebe emissão automática');
assert(isC6CompanyOperationEnabled('f26f2331-1885-4ac6-8d0e-4131cc8a8014', 'emission') === false, 'a emissão individual permanece desligada');
let blocked = false;
try {
  throwIfC6EmissionAttempt('C6', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
} catch {
  blocked = true;
}
assert(blocked, 'C6 sem concessão não emite');
throwIfC6EmissionAttempt('ASAAS_COMPANY', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
throwIfC6EmissionAttempt('INTER', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

console.log('C6_PRODUCTION_PRESERVATION_OK');
