/**
 * Testes — módulo Migração de Dados (fase 1).
 * npx tsx scripts/mandatory-data-migration-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { canAccessDataMigrationModule } from '../lib/imports/permissions';
import { DATA_MIGRATION_ROUTE, MIGRATION_WIZARD_STEPS } from '../lib/imports/constants';
import { listImportModules } from '../lib/imports/modules';
import {
  advanceWizardState,
  canAdvanceWizardStep,
  INITIAL_MIGRATION_WIZARD_STATE,
  selectImportModule,
  startMigrationWizard,
} from '../lib/imports/services/migrationWizardState';
import { getWizardStepsForModule } from '../lib/imports/services/migrationWizardSteps';
import {
  isAcceptedImportFile,
  parseImportFileMeta,
} from '../lib/imports/helpers/parseImportFileMeta';
import { buildImportCsvTemplate, getImportTemplateHeaders } from '../lib/imports/services/templateDownload';
import { getMigrationHistoryColumns } from '../lib/imports/services/migrationHistory';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testPermissions() {
  assert(canAccessDataMigrationModule('ADMIN'), 'ADMIN acessa');
  assert(canAccessDataMigrationModule('SUPER_ADMIN'), 'SUPER_ADMIN acessa');
  assert(canAccessDataMigrationModule('MASTER_ADMIN'), 'MASTER_ADMIN acessa');
  assert(!canAccessDataMigrationModule('ADMIN_EMPRESA'), 'ADMIN_EMPRESA bloqueado');
  assert(!canAccessDataMigrationModule('COMPANY_ADMIN'), 'COMPANY_ADMIN bloqueado');
  assert(!canAccessDataMigrationModule('BROKER'), 'BROKER bloqueado');
  assert(!canAccessDataMigrationModule('OWNER'), 'OWNER bloqueado');
  console.log('OK testPermissions');
}

function testSidebarMenu() {
  const layout = read('components/Layout.tsx');
  assert(layout.includes('Migração de Dados'), 'menu item');
  assert(layout.includes('DatabaseBackup'), 'ícone migração');
  assert(layout.includes('canAccessDataMigrationModule'), 'guard menu');
  assert(layout.includes("href: DATA_MIGRATION_ROUTE"), 'rota menu');
  const offlineIdx = layout.indexOf('Sincronização Offline');
  const migrationIdx = layout.indexOf('Migração de Dados');
  const settingsIdx = layout.indexOf("name: 'Configurações'");
  assert(offlineIdx > 0 && migrationIdx > offlineIdx, 'após offline sync');
  assert(settingsIdx > migrationIdx, 'antes de configurações');
  console.log('OK testSidebarMenu');
}

function testPageRoute() {
  assert(fs.existsSync(path.join(ROOT, 'app/data-migration/page.tsx')), 'página existe');
  const page = read('app/data-migration/page.tsx');
  assert(page.includes('DataMigrationPageClient'), 'client page');
  const client = read('components/imports/DataMigrationPageClient.tsx');
  assert(client.includes('Migração de Dados'), 'título');
  assert(client.includes('Importe dados provenientes'), 'subtítulo');
  assert(client.includes('canAccessDataMigrationModule'), 'guard página');
  console.log('OK testPageRoute');
}

function testWizardSteps() {
  assert(MIGRATION_WIZARD_STEPS.length === 7, '7 etapas');
  assert(MIGRATION_WIZARD_STEPS[0]?.id === 'welcome', 'welcome');
  assert(MIGRATION_WIZARD_STEPS[6]?.id === 'confirmation', 'confirmation');

  let state = INITIAL_MIGRATION_WIZARD_STATE;
  assert(state.step === 'welcome', 'início welcome');
  state = startMigrationWizard();
  assert(state.step === 'select-type', 'iniciar migração');

  state = selectImportModule(state, 'sales');
  assert(state.selectedModuleId === 'sales', 'módulo selecionado');
  assert(canAdvanceWizardStep(state), 'pode avançar após tipo');

  state = advanceWizardState(state);
  assert(state.step === 'template', 'template');

  const wizard = read('components/imports/DataMigrationWizard.tsx');
  assert(wizard.includes('migration-step-welcome'), 'step welcome');
  assert(wizard.includes('migration-step-select-type'), 'step select');
  assert(wizard.includes('migration-step-template'), 'step template');
  assert(wizard.includes('migration-step-upload'), 'step upload');
  assert(wizard.includes('migration-step-pre-validation'), 'step validation');
  assert(wizard.includes('migration-step-preview'), 'step preview');
  assert(wizard.includes('migration-step-confirmation'), 'step confirmation');
  assert(wizard.includes('migration-confirm-import'), 'confirmar importação');
  assert(wizard.includes('applyCustomerValidationAndAdvance'), 'avanço pós-validação');
  assert(wizard.includes('applyBrokerValidationAndAdvance'), 'avanço pós-validação corretores');
  assert(wizard.includes('applySalesValidationAndAdvance'), 'avanço pós-validação vendas');
  assert(wizard.includes('applyInstallmentsValidationAndAdvance'), 'avanço pós-validação parcelas');
  assert(wizard.includes('applyLegacyContractsValidationAndAdvance'), 'avanço pós-validação legacy');
  assert(wizard.includes('migration-step-upload-documents'), 'step upload documentos');
  assert(wizard.includes('migration-validating'), 'loading validação');
  assert(wizard.includes('Iniciar Migração'), 'botão iniciar');
  console.log('OK testWizardSteps');
}

function testImportTypeCards() {
  const modules = listImportModules();
  assert(modules.length === 5, '5 módulos visíveis');
  assert(modules.some((m) => m.id === 'customers' && m.status === 'available'), 'clientes disponível');
  assert(modules.some((m) => m.id === 'brokers' && m.status === 'available'), 'corretores disponível');
  assert(modules.some((m) => m.id === 'sales' && m.status === 'available'), 'vendas disponível');
  assert(
    modules.some((m) => m.id === 'installments' && m.status === 'available'),
    'parcelas disponível',
  );
  assert(
    modules.some((m) => m.id === 'legacy_contracts' && m.status === 'available'),
    'contratos antigos disponível',
  );
  assert(!modules.some((m) => m.id === 'attachments'), 'anexos oculto na UI');
  assert(
    modules.some((m) => m.title === 'Atualizar Parcelas das Vendas Importadas'),
    'título parcelas',
  );

  const card = read('components/imports/ImportTypeCard.tsx');
  assert(card.includes('import-type-card-'), 'testid card');
  console.log('OK testImportTypeCards');
}

function testFileUploadMeta() {
  const csv = new File(['a;b\n'], 'test.csv', { type: 'text/csv' });
  assert(isAcceptedImportFile(csv), 'csv aceito');
  const meta = parseImportFileMeta(csv);
  assert(meta.name === 'test.csv', 'nome arquivo');
  assert(meta.sizeBytes > 0, 'tamanho');
  assert(meta.extension === '.csv', 'extensão');

  const bad = new File(['x'], 'notes.txt', { type: 'text/plain' });
  assert(!isAcceptedImportFile(bad), 'txt rejeitado');

  const wizard = read('components/imports/DataMigrationWizard.tsx');
  assert(wizard.includes('migration-file-input'), 'input upload');
  assert(wizard.includes('migration-file-meta'), 'meta exibição');
  console.log('OK testFileUploadMeta');
}

function testTemplates() {
  const headers = getImportTemplateHeaders('customers');
  assert(headers.includes('nome'), 'headers clientes');
  assert(headers.includes('cpf_cnpj'), 'headers cpf_cnpj');
  assert(headers.includes('whatsapp'), 'headers whatsapp');
  const csv = buildImportCsvTemplate('customers');
  assert(csv.includes('EXEMPLO'), 'csv clientes exemplo');
  const brokerCsv = buildImportCsvTemplate('brokers');
  assert(brokerCsv.includes('percentual_comissao'), 'csv corretores headers');
  assert(brokerCsv.includes('EXEMPLO'), 'csv corretores exemplo');
  const brokerHeaders = getImportTemplateHeaders('brokers');
  assert(brokerHeaders.includes('nome'), 'headers corretores nome');
  const salesHeaders = getImportTemplateHeaders('sales');
  assert(salesHeaders.includes('empreendimento'), 'headers vendas empreendimento');
  assert(salesHeaders.includes('valor_total'), 'headers vendas valor');
  const installmentsHeaders = getImportTemplateHeaders('installments');
  assert(installmentsHeaders.includes('numero_parcela'), 'headers parcelas numero');
  assert(installmentsHeaders.includes('novo_vencimento'), 'headers parcelas novo vencimento');
  const legacyHeaders = getImportTemplateHeaders('legacy_contracts');
  assert(legacyHeaders.includes('nome_arquivo_pdf'), 'headers legacy pdf');
  const tpl = read('lib/imports/services/templateDownload.ts');
  assert(tpl.includes('downloadImportCsvTemplate'), 'download csv');
  assert(tpl.includes('downloadImportExcelTemplate'), 'download xlsx real');
  console.log('OK testTemplates');
}

function testHistory() {
  assert(getMigrationHistoryColumns().length === 6, '6 colunas');
  const hist = read('components/imports/MigrationHistoryTable.tsx');
  assert(hist.includes('migration-history-table'), 'tabela histórico');
  assert(hist.includes('/api/data-migration/history'), 'fetch histórico');
  const page = read('components/imports/DataMigrationPageClient.tsx');
  assert(page.includes('Histórico de Migrações'), 'aba histórico');
  assert(page.includes('migration-tab-history'), 'tab histórico');
  console.log('OK testHistory');
}

function testArchitecture() {
  const dirs = [
    'lib/imports/modules/customers',
    'lib/imports/modules/brokers',
    'lib/imports/modules/sales',
    'lib/imports/modules/legacy-contracts',
    'lib/imports/modules/installments',
    'lib/imports/modules/contracts',
    'lib/imports/modules/attachments',
    'lib/imports/services',
    'lib/imports/helpers',
    'components/imports',
  ];
  for (const d of dirs) {
    assert(fs.existsSync(path.join(ROOT, d)), `dir ${d}`);
  }
  assert(fs.existsSync(path.join(ROOT, 'lib/imports/index.ts')), 'barrel index');
  console.log('OK testArchitecture');
}

function testLegacyWizardSteps() {
  const steps = getWizardStepsForModule('legacy_contracts');
  assert(steps.length === 7, 'legacy 7 etapas sem planilha');
  assert(!steps.some((step) => step.id === 'upload'), 'legacy sem upload planilha');
  assert(steps.some((step) => step.id === 'upload-documents'), 'legacy passo PDFs');
  console.log('OK testLegacyWizardSteps');
}

function testBrokerBlockedRoute() {
  const roles = read('lib/rolePermissions.ts');
  assert(roles.includes("'/data-migration'"), 'rota bloqueada corretor');
  console.log('OK testBrokerBlockedRoute');
}

function main() {
  testPermissions();
  testSidebarMenu();
  testPageRoute();
  testWizardSteps();
  testLegacyWizardSteps();
  testImportTypeCards();
  testFileUploadMeta();
  testTemplates();
  testHistory();
  testArchitecture();
  testBrokerBlockedRoute();
  console.log('mandatory-data-migration-tests: all passed');
}

main();
