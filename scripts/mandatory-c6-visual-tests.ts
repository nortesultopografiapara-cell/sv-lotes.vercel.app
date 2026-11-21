/**
 * Identificação visual do C6, sem emissão e sem segredo na tela.
 * npx tsx scripts/mandatory-c6-visual-tests.ts
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EMPTY_C6_BANK_CONFIG, presentC6ConfigFields } from '../lib/banking/c6/c6ConfigTypes';
import { C6ChargesAccountMark } from '../components/charges/C6ChargesAccountMark';
import { countSelectedGeneratableCharges } from '../lib/charges/chargeIntegrationHelpers';
import { buildChargeInstallmentView } from '../lib/charges/chargeInstallmentHelpers';
import {
  C6_CHARGES_DISPLAY_LABEL,
  C6_CHARGES_PREPARATION_MESSAGE,
  classifyChargesAccountProvider,
  normalizeChargesEmitProvider,
} from '../lib/charges/chargeProviderRouting';
import {
  formatFinancialAccountLabel,
  formatFinancialAccountProviderLabel,
} from '../lib/finance/companyFinancialAccountTypes';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function main() {
  assert(classifyChargesAccountProvider('C6') === 'C6', 'C6 não é classificado como Asaas');
  assert(classifyChargesAccountProvider('c6') === 'C6', 'código C6 aceita maiúsculas e minúsculas');
  assert(classifyChargesAccountProvider('INTER') === 'INTER', 'Inter permanece Inter');
  assert(classifyChargesAccountProvider('ASAAS_COMPANY') === 'ASAAS_COMPANY', 'Asaas permanece Asaas');
  assert(classifyChargesAccountProvider('ASAAS') === 'ASAAS_COMPANY', 'alias Asaas permanece Asaas');
  assert(classifyChargesAccountProvider(null) === 'ASAAS_COMPANY', 'conta sem provider permanece Asaas');
  assert(normalizeChargesEmitProvider('INTER') === 'INTER', 'emissão Inter intacta');
  assert(normalizeChargesEmitProvider(null) === 'ASAAS_COMPANY', 'emissão sem provider permanece Asaas');

  assert(formatFinancialAccountProviderLabel('C6') === C6_CHARGES_DISPLAY_LABEL, 'rótulo C6 Bank');
  assert(formatFinancialAccountProviderLabel('ASAAS_COMPANY') === 'Asaas', 'rótulo Asaas intacto');
  assert(formatFinancialAccountProviderLabel('INTER') === 'Banco Inter', 'rótulo Inter intacto');
  assert(formatFinancialAccountProviderLabel('SICOOB') === 'SICOOB', 'rótulo antigo intacto');
  assert(
    formatFinancialAccountLabel({
      name: 'Conta SV',
      accountType: 'IMOBILIARIA',
      beneficiaryName: null,
      provider: 'C6',
    }) === 'Conta SV — C6 Bank',
    'conta C6 aparece como C6 Bank',
  );

  const view = buildChargeInstallmentView(
    {
      id: 'receipt-c6',
      status: 'pendente',
      due_date: '2026-12-20',
      amount: 100,
      financial_account_id: 'fa-c6',
      customers: { name: 'Cliente Teste' },
    },
    null,
    '2026-11-21',
    { 'fa-c6': 'Conta SV — C6 Bank' },
    { chargeProvider: 'C6' },
  );
  assert(view.chargeProvider === 'C6', 'parcela C6 não vira Asaas');
  assert(view.chargeStatusLabel === C6_CHARGES_PREPARATION_MESSAGE, 'estado de preparação');
  assert(view.financialAccountLabel === 'Conta SV — C6 Bank', 'conta da parcela é C6 Bank');
  assert(!view.chargeStatusLabel.includes('Asaas'), 'status C6 não cita Asaas');
  assert(!view.chargeStatusLabel.includes('Inter'), 'status C6 não cita Inter');

  const asaasView = buildChargeInstallmentView(
    { id: 'receipt-asaas', status: 'pendente', due_date: '2026-12-20', amount: 10 },
    null,
    '2026-11-21',
    undefined,
    { chargeProvider: 'ASAAS_COMPANY' },
  );
  assert(asaasView.chargeProvider === 'ASAAS_COMPANY', 'parcela Asaas permanece Asaas');
  const interView = buildChargeInstallmentView(
    { id: 'receipt-inter', status: 'pendente', due_date: '2026-12-20', amount: 10 },
    null,
    '2026-11-21',
    undefined,
    { chargeProvider: 'INTER' },
  );
  assert(interView.chargeProvider === 'INTER', 'parcela Inter permanece Inter');
  assert(interView.chargeStatusLabel === 'Não gerada', 'Inter sem cobrança permanece Não gerada');

  const html = renderToStaticMarkup(createElement(C6ChargesAccountMark));
  assert(html.includes('C6 Bank'), 'marca visual C6 Bank');
  assert(html.includes(C6_CHARGES_PREPARATION_MESSAGE), 'marca visual de preparação');
  assert(!html.includes('Asaas'), 'marca visual sem Asaas');
  assert(!html.includes('Inter'), 'marca visual sem Inter');
  assert(!/<button/i.test(html), 'marca visual sem botão de emissão');

  const row = { id: 'r1', status: 'pendente', due_date: '2026-12-20', amount: 10 };
  const base = {
    selectedIds: ['r1'],
    payments: [row],
    chargesByInstallment: {},
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
  };
  const asaasCount = countSelectedGeneratableCharges({
    ...base,
    resolveProvider: () => 'ASAAS_COMPANY',
  });
  const interCount = countSelectedGeneratableCharges({
    ...base,
    resolveProvider: () => 'INTER',
  });
  const c6Count = countSelectedGeneratableCharges({
    ...base,
    resolveProvider: () => 'C6',
  });
  assert(c6Count === 0, 'C6 não entra na contagem de emissão');
  assert(asaasCount === interCount && asaasCount > 0, 'Asaas e Inter continuam elegíveis');

  const config = EMPTY_C6_BANK_CONFIG('f26f2331-1885-4ac6-8d0e-4131cc8a8014');
  config.clientId = 'client-publico';
  config.status = 'DRAFT';
  config.hasClientSecret = true;
  config.hasCertificate = true;
  config.hasPrivateKey = true;
  const fields = presentC6ConfigFields({
    ...config,
    clientSecret: 'segredo-que-nao-pode-aparecer',
    certificatePem: '-----BEGIN CERTIFICATE-----',
    privateKeyPem: '-----BEGIN PRIVATE KEY-----',
  } as typeof config);
  const serialized = JSON.stringify(fields);
  assert(fields.title === 'C6 Bank', 'painel identifica C6 Bank');
  assert(fields.statusLabel === 'Status DRAFT', 'painel mostra DRAFT');
  assert(fields.emissionLabel === 'Emissão DESATIVADA', 'painel mostra emissão desativada');
  assert(fields.clientId === 'client-publico', 'Client ID público pode aparecer');
  assert(fields.clientSecret === '', 'Client Secret não é preenchido');
  assert(fields.certificatePem === '', 'certificado não é preenchido');
  assert(fields.privateKeyPem === '', 'chave privada não é preenchida');
  assert(fields.sessionCompanyId === config.companyId, 'painel usa a empresa da configuração da sessão');
  assert(!serialized.includes('segredo-que-nao-pode-aparecer'), 'JSON visual sem Client Secret');
  assert(!serialized.includes('BEGIN CERTIFICATE'), 'JSON visual sem PEM');
  assert(!serialized.includes('BEGIN PRIVATE KEY'), 'JSON visual sem chave');

  console.log('C6_VISUAL_OK');
  console.log(html);
}

main();
