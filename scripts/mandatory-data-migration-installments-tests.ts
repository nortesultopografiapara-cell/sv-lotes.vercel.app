/**
 * Testes — atualização de parcelas na Migração de Dados.
 * npm run test:data-migration-installments
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  parseInstallmentNumber,
  parseInstallmentStatus,
} from '../lib/imports/modules/installments/normalize';
import {
  buildInstallmentUpdatePayload,
  validateInstallmentRows,
} from '../lib/imports/modules/installments/validateRows';
import { installmentsImportModule } from '../lib/imports/modules/installments';
import { listImportModules } from '../lib/imports/modules';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testModuleUi() {
  const modules = listImportModules();
  assert(modules.length === 4, '4 módulos visíveis');
  assert(!modules.some((m) => m.id === 'attachments'), 'anexos oculto na UI');
  assert(!modules.some((m) => m.id === 'legacy_contracts'), 'contratos antigos oculto na UI');
  assert(
    modules.some(
      (m) =>
        m.id === 'installments' &&
        m.title === 'Atualizar Parcelas das Vendas Importadas',
    ),
    'título parcelas',
  );
  assert(installmentsImportModule.status === 'available', 'parcelas disponível');

  const wizard = read('components/imports/DataMigrationWizard.tsx');
  assert(wizard.includes('applyInstallmentsValidationAndAdvance'), 'wizard valida parcelas');
  assert(wizard.includes('executeInstallmentsImport'), 'wizard executa parcelas');
  assert(wizard.includes('Confirmar Atualização'), 'botão confirmar atualização');

  assert(fs.existsSync(path.join(ROOT, 'app/api/data-migration/installments/validate/route.ts')), 'api validate');
  assert(fs.existsSync(path.join(ROOT, 'app/api/data-migration/installments/execute/route.ts')), 'api execute');

  console.log('OK testModuleUi');
}

function testNormalize() {
  assert(parseInstallmentNumber('3').value === 3, 'parcela 3');
  assert(parseInstallmentNumber('entrada').value === 0, 'entrada');
  assert(parseInstallmentNumber('sinal').value === -1, 'sinal');
  assert(parseInstallmentStatus('pago').value === 'pago', 'status pago');
  assert(parseInstallmentStatus('PENDENTE').value === 'pendente', 'status pendente');
  console.log('OK testNormalize');
}

function testValidationRules() {
  const emptyContext = {
    projects: new Map(),
    projectsByName: new Map(),
    blocks: new Map(),
    receiptsById: new Map(),
    receiptsBySaleAndNumber: new Map(),
    salesById: new Map(),
    salesByBlockId: new Map(),
  };

  const { rows, summary } = validateInstallmentRows(
    [
      {
        lineNumber: 2,
        raw: {},
        venda_id: 'sale-1',
        parcela_id: '',
        empreendimento: 'Projeto',
        empreendimento_normalized: 'PROJETO',
        quadra: 'A',
        quadra_normalized: 'A',
        lote: '1',
        lote_normalized: '1',
        cliente: 'Cliente',
        cliente_normalized: 'CLIENTE',
        numero_parcela_raw: '2',
        numero_parcela: 2,
        vencimento_raw: '',
        vencimento: null,
        novo_vencimento_raw: '10/05/2025',
        novo_vencimento: '2025-05-10',
        status_raw: 'pago',
        status_normalized: 'pago',
        valor_raw: '',
        valor: null,
        valor_pago_raw: '100',
        valor_pago: 100,
        data_pagamento_raw: '',
        data_pagamento: null,
        observacoes: '',
      },
    ],
    emptyContext,
  );

  assert(summary.notLocatedRows === 1, 'parcela não localizada');
  assert(!rows[0]?.importable, 'não importável sem receipt');
  assert(
    rows[0]?.messages.some((message) =>
      message.text.toLowerCase().includes('parcela') &&
      message.text.toLowerCase().includes('não'),
    ),
    'mensagem parcela ausente',
  );

  console.log('OK testValidationRules');
}

function testUpdatePayload() {
  const payload = buildInstallmentUpdatePayload({
    lineNumber: 2,
    raw: {},
    venda_id: 'sale-1',
    parcela_id: 'receipt-1',
    empreendimento: '',
    empreendimento_normalized: '',
    quadra: '',
    quadra_normalized: '',
    lote: '',
    lote_normalized: '',
    cliente: '',
    cliente_normalized: '',
    numero_parcela_raw: '1',
    numero_parcela: 1,
    vencimento_raw: '',
    vencimento: null,
    novo_vencimento_raw: '',
    novo_vencimento: '2025-06-01',
    status_raw: 'pago',
    status_normalized: 'pago',
    valor_raw: '',
    valor: 500,
    valor_pago_raw: '',
    valor_pago: null,
    data_pagamento_raw: '',
    data_pagamento: null,
    observacoes: '',
    status: 'valid',
    messages: [],
    importable: true,
    located: true,
    receipt_id: 'receipt-1',
    sale_id: 'sale-1',
    project_id: null,
    project_name: null,
    block_id: null,
    customer_id: null,
    customer_name: null,
    current_due_date: '2025-05-01',
    current_status: 'pendente',
    current_amount: 500,
    current_paid_amount: null,
    resolved_status: 'pago',
  });

  assert(payload.due_date === '2025-06-01', 'atualiza vencimento');
  assert(payload.status === 'pago', 'atualiza status');
  assert(payload.amount === 500, 'atualiza valor');
  assert(Number(payload.paid_amount) === 500, 'valor pago inferido');

  console.log('OK testUpdatePayload');
}

function main() {
  testModuleUi();
  testNormalize();
  testValidationRules();
  testUpdatePayload();
  console.log('\nmandatory-data-migration-installments-tests: all passed');
}

main();
