/**
 * Fase 1 — identificação bancária cadastral em company_financial_accounts.
 * npx tsx scripts/mandatory-financial-account-bank-identity-tests.ts
 *
 * Não altera split, webhook, relatórios, wallet resolution nem credenciais.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  EMPTY_BANK_IDENTITY,
  parseBankAccountKind,
  pickBankIdentityFromBody,
  sanitizeBankIdentity,
} from '../lib/finance/companyFinancialAccountBankIdentity';
import {
  assertCompanyFinancialAccountResponseSafe,
  mapCompanyFinancialAccountRow,
} from '../lib/finance/companyFinancialAccountTypes';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testExistingAccountWithoutBankIdentityStillMaps() {
  const account = mapCompanyFinancialAccountRow({
    id: 'fa-asaas',
    company_id: 'co-1',
    name: 'ASAAS SANDBOX',
    account_type: 'IMOBILIARIA',
    beneficiary_name: 'SV TOPOGRAFIA E PROJETO',
    document: null,
    email: null,
    phone: null,
    environment: 'SANDBOX',
    bank_integration_id: 'bi-1',
    is_default: true,
    active: true,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  assert(account.bankName === null, 'conta existente sem banco');
  assert(account.bankCode === null, 'conta existente sem código');
  assert(account.agency === null, 'conta existente sem agência');
  assert(account.accountNumber === null, 'conta existente sem conta');
  assert(account.accountDigit === null, 'conta existente sem dígito');
  assert(account.bankAccountKind === null, 'conta existente sem tipo');
  assert(account.beneficiaryName === 'SV TOPOGRAFIA E PROJETO', 'titular permanece beneficiary_name');
  assertCompanyFinancialAccountResponseSafe(account);
}

function testSanitizeSaveAndEditAndClear() {
  const saved = sanitizeBankIdentity({
    bankName: ' Banco do Brasil ',
    bankCode: '001-x',
    agency: '1234-5',
    accountNumber: ' 123456 ',
    accountDigit: ' 7 ',
    bankAccountKind: 'corrente',
  });
  assert(saved.bankName === 'Banco do Brasil', 'salva nome do banco');
  assert(saved.bankCode === '001', 'código COMPE só dígitos');
  assert(saved.agency === '1234-5', 'agência preservada');
  assert(saved.accountNumber === '123456', 'número da conta');
  assert(saved.accountDigit === '7', 'dígito');
  assert(saved.bankAccountKind === 'CORRENTE', 'tipo normalizado');

  const edited = sanitizeBankIdentity({
    ...saved,
    bankName: 'Caixa Econômica',
    bankCode: '104',
    agency: '4321',
  });
  assert(edited.bankName === 'Caixa Econômica', 'edita banco');
  assert(edited.bankCode === '104', 'edita código');
  assert(edited.agency === '4321', 'edita agência');
  assert(edited.accountNumber === '123456', 'conta permanece');

  const cleared = sanitizeBankIdentity({
    bankName: '  ',
    bankCode: '',
    agency: '',
    accountNumber: '',
    accountDigit: '',
    bankAccountKind: '',
  });
  assert(cleared.bankName === null, 'limpa banco');
  assert(cleared.bankCode === null, 'limpa código');
  assert(cleared.agency === null, 'limpa agência');
  assert(cleared.accountNumber === null, 'limpa conta');
  assert(cleared.accountDigit === null, 'limpa dígito');
  assert(cleared.bankAccountKind === null, 'limpa tipo');
  assert(JSON.stringify(cleared) === JSON.stringify(EMPTY_BANK_IDENTITY), 'identidade vazia = nulls');
}

function testBeneficiaryNameRemainsTitular() {
  const account = mapCompanyFinancialAccountRow({
    id: 'fa-ana',
    company_id: 'co-1',
    name: 'ANA VITORIA',
    account_type: 'PROPRIETARIO',
    beneficiary_name: 'ANA VITORIA',
    document: null,
    email: null,
    phone: null,
    environment: 'SANDBOX',
    bank_integration_id: 'bi-ana',
    is_default: false,
    active: true,
    notes: null,
    bank_name: 'Banco X',
    bank_code: '001',
    agency: '0001',
    account_number: '1234',
    account_digit: '0',
    bank_account_kind: 'CORRENTE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  assert(account.beneficiaryName === 'ANA VITORIA', 'titular = beneficiary_name');
  assert(account.bankName === 'Banco X', 'banco cadastral separado do titular');
  const json = JSON.stringify(account);
  assert(!json.includes('destinationIdentifier'), 'não expõe wallet UUID');
  assert(!json.includes('apiKey'), 'não expõe apiKey');
  assert(!json.includes('encrypted_payload'), 'não expõe credencial');
  assertCompanyFinancialAccountResponseSafe(account);
}

function testPickBodyAllowsPartialClear() {
  const patch = pickBankIdentityFromBody({
    bankName: 'Itaú',
    agency: '',
  });
  assert(patch != null, 'patch presente');
  assert(patch?.bankName === 'Itaú', 'banco no patch');
  assert(patch?.agency === null, 'agência vazia vira null');
  assert(patch?.accountNumber === undefined, 'conta omitida não entra no patch');
}

function testInvalidKindRejected() {
  let threw = false;
  try {
    parseBankAccountKind('SALARIO');
  } catch {
    threw = true;
  }
  assert(threw, 'tipo inválido rejeitado');
  assert(parseBankAccountKind('') === null, 'vazio = não informado');
  assert(parseBankAccountKind('poupanca') === 'POUPANCA', 'poupança normalizada');
}

function testPhase1DoesNotTouchSplitWebhookReports() {
  const migration = read(
    'supabase/migrations/20261018120000_company_financial_accounts_bank_identity.sql',
  );
  assert(migration.includes('ADD COLUMN IF NOT EXISTS bank_name'), 'migration bank_name');
  assert(migration.includes('bank_account_kind'), 'migration bank_account_kind');
  assert(migration.includes('CORRENTE'), 'enum CORRENTE');
  assert(migration.includes('POUPANCA'), 'enum POUPANCA');
  assert(migration.includes('PAGAMENTO'), 'enum PAGAMENTO');
  assert(!/DROP COLUMN/i.test(migration), 'migration aditiva');
  assert(!/ALTER TABLE public\.bank_credentials/i.test(migration), 'não altera credenciais');
  assert(!/FROM public\.bank_credentials/i.test(migration), 'não lê credenciais na migration');
  assert(!/encrypted_payload/i.test(migration), 'não toca encrypted_payload');
  assert(!/charge_revenue_split_legs/i.test(migration), 'não toca legs');
  assert(!/sale_revenue_split_snapshot/i.test(migration), 'não toca snapshot');

  const repo = read('lib/finance/companyFinancialAccountRepository.ts');
  const integrationUpdate = repo.slice(
    repo.indexOf('async function ensureBankIntegrationForAccount'),
    repo.indexOf('export type SaveCompanyFinancialAccountInput'),
  );
  assert(!integrationUpdate.includes('bank_name'), 'não grava identificação em bank_integrations');
  assert(!integrationUpdate.includes('account_number'), 'não reutiliza bank_integrations como fonte viva');
  assert(repo.includes('loadAsaasWalletMasks'), 'wallet resolution permanece no repositório');

  const webhook = read('lib/finance/companyAsaasWebhookHandler.ts');
  assert(!webhook.includes('bank_account_kind'), 'webhook Asaas intocado');
  const splitService = read('lib/finance/revenueSplit/service.ts');
  assert(!splitService.includes('bank_account_kind'), 'freeze/snapshot intocado');
  const emit = read('lib/finance/revenueSplit/asaasChargeSplit.ts');
  assert(!emit.includes('bank_account_kind'), 'emissão split intocada');
  const panel = read('components/finance/FinancialAccountsPanel.tsx');
  assert(panel.includes('Identificação bancária / conciliação'), 'seção na UI');
  assert(panel.includes('Dados bancários para identificação e conciliação.'), 'aviso Asaas na UI');
  assert(panel.includes('permanece a Wallet Asaas.'), 'destino técnico Asaas na UI');
  assert(panel.includes('beneficiaryName'), 'titular reutiliza beneficiaryName');
  const bankSection = panel.slice(
    panel.indexOf('Identificação bancária / conciliação'),
    panel.indexOf('Observações'),
  );
  assert(!/walletMasked|asaasWalletMasked|destinationIdentifier/.test(bankSection), 'seção sem wallet UUID');

  const pdf = read('lib/finance/reports/renderFinanceReportPdf.ts');
  assert(!pdf.includes('bank_account_kind'), 'PDF financeiro intocado');
  const excel = read('lib/finance/reports/renderFinanceReportExcel.ts');
  assert(!excel.includes('bank_account_kind'), 'Excel financeiro intocado');
  const parcelas = read('components/finance/ChargeRevenueSplitDistribution.tsx');
  assert(!parcelas.includes('bank_account_kind'), 'Parcelas intocadas');
}

async function main() {
  testExistingAccountWithoutBankIdentityStillMaps();
  testSanitizeSaveAndEditAndClear();
  testBeneficiaryNameRemainsTitular();
  testPickBodyAllowsPartialClear();
  testInvalidKindRejected();
  testPhase1DoesNotTouchSplitWebhookReports();
  console.log('mandatory-financial-account-bank-identity-tests: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
