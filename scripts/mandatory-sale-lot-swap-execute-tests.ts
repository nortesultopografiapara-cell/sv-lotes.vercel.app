/**
 * Fase 4 — execução atômica da Troca de lote.
 * npx tsx scripts/mandatory-sale-lot-swap-execute-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isDeferredSaleOperation,
  isLotReleaseSaleOperation,
  showsTerminationSettlement,
} from '../lib/finance/releaseLotShared';
import { isSaleReleaseSettlementOperation } from '../lib/finance/saleReleaseSettlement';
import { isSaleLotSwapOperation } from '../lib/finance/saleLotSwap';
import { buildLotSwapFinancialPlan } from '../lib/finance/saleLotSwapPlan';
import { LOT_SWAP_PLAN_FORBIDDEN_MUTATION_TABLES } from '../lib/finance/saleLotSwapPlanService';
import {
  assertContractNumberNotReused,
  buildLotSwapExecuteReceiptMutations,
  buildSyntheticContractReceipts,
  isLotSwapExecuteOperation,
  LOT_SWAP_EXECUTE_RPC,
  lotSwapExecutePreservesNegotiation,
  nextLotSwapExecuteStatus,
  parseLotSwapExecuteRpcError,
} from '../lib/finance/saleLotSwapExecute';
import {
  LOT_SWAP_EXECUTE_GENERIC_FAILURE_MESSAGE,
  mapLotSwapExecuteUserMessage,
  simulateLotSwapCrossTenantAccess,
} from '../lib/finance/saleLotSwapPreview';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testStateMachineAndIdempotency() {
  assert(nextLotSwapExecuteStatus('CALCULATED', 'start') === 'EXECUTING', 'start');
  assert(nextLotSwapExecuteStatus('EXECUTING', 'succeed') === 'EXECUTED', 'succeed');
  assert(nextLotSwapExecuteStatus('EXECUTED', 'succeed') === 'EXECUTED', 'idempotente');
  assert(nextLotSwapExecuteStatus('CALCULATED', 'fail') === 'FAILED', 'fail calculated');
  assert(nextLotSwapExecuteStatus('EXECUTING', 'fail') === 'FAILED', 'fail executing');
  console.log('OK testStateMachineAndIdempotency');
}

function testReceiptMutationsPreservePaidAndReplaceFuture() {
  const plan = buildLotSwapFinancialPlan({
    oldSalePrice: 100000,
    newLotPrice: 120000,
    receipts: [
      {
        id: 'r-paid',
        installment_number: 0,
        status: 'pago',
        amount: 20000,
        paid_amount: 20000,
        due_date: '2026-01-10',
      },
      {
        id: 'r-future',
        installment_number: 1,
        status: 'pendente',
        amount: 5000,
        due_date: '2026-10-10',
      },
    ],
    financialAccountId: 'acc-1',
    asOf: '2026-09-06',
  });
  const mut = buildLotSwapExecuteReceiptMutations(plan);
  assert(mut.preserveIds.join() === 'r-paid', 'preserva pago');
  assert(mut.cancelIds.join() === 'r-future', 'cancela futura');
  assert(mut.create.length === 1, 'cria nova');
  assert(mut.create[0].amount === 100000, 'novo saldo');
  assert(mut.create[0].financial_account_id === 'acc-1', 'conta financeira');
  const synthetic = buildSyntheticContractReceipts(plan);
  assert(synthetic.length === 1, 'HTML do contrato só vê o saldo novo');
  assert(synthetic[0].status === 'pendente', 'pago preservado não vira parcela/entrada no HTML');
  assert(synthetic[0].amount === 100000, 'HTML vê o saldo remanescente');
  assert(
    synthetic.every((row) => row.status === 'pendente'),
    'recibos sintéticos do contrato são só CREATE',
  );
  console.log('OK testReceiptMutationsPreservePaidAndReplaceFuture');
}

function testContractNumberNotReused() {
  assertContractNumberNotReused('000000001/2026', '000000002/2026');
  let reused = false;
  try {
    assertContractNumberNotReused('000000009/2026', '000000009/2026');
  } catch (err) {
    reused = err instanceof Error && err.message === 'CONTRACT_NUMBER_REUSED';
  }
  assert(reused, 'recusa reuso do número');
  let invalid = false;
  try {
    assertContractNumberNotReused('000000001/2026', 'CTR-9');
  } catch (err) {
    invalid = err instanceof Error && err.message === 'CONTRACT_NUMBER_INVALID';
  }
  assert(invalid, 'recusa número fora do formato oficial');
  console.log('OK testContractNumberNotReused');
}

function testRpcErrorParserAndSaleIdentity() {
  const parsed = parseLotSwapExecuteRpcError(
    'LOT_SWAP_EXECUTE:DESTINATION_NOT_AVAILABLE:O lote destino precisa estar Disponível, sem venda e sem contrato.',
  );
  assert(parsed.code === 'DESTINATION_NOT_AVAILABLE', 'código RPC');
  assert(
    lotSwapExecutePreservesNegotiation({
      saleIdBefore: 'sale-1',
      saleIdAfter: 'sale-1',
      sourceStatus: 'Disponível',
      destinationStatus: 'Vendido',
    }),
    'mesma sale_id e status dos lotes',
  );
  assert(
    !lotSwapExecutePreservesNegotiation({
      saleIdBefore: 'sale-1',
      saleIdAfter: 'sale-2',
      sourceStatus: 'Disponível',
      destinationStatus: 'Vendido',
    }),
    'não troca a identidade da venda',
  );
  assert(isLotSwapExecuteOperation('troca_lote'), 'código da operação');
  console.log('OK testRpcErrorParserAndSaleIdentity');
}

function testSqlAtomicRpc() {
  const sql = read('supabase/migrations/20261014120000_execute_sale_lot_swap.sql');
  assert(sql.includes('CREATE OR REPLACE FUNCTION public.execute_sale_lot_swap'), 'função');
  assert(sql.includes('SECURITY DEFINER'), 'SECURITY DEFINER');
  assert(sql.includes('FOR UPDATE'), 'locks');
  assert(sql.includes("status = 'EXECUTING'"), 'CALCULATED → EXECUTING');
  assert(sql.includes("status = 'EXECUTED'"), 'EXECUTING → EXECUTED');
  assert(sql.includes("status = 'Disponível'"), 'origem Disponível');
  assert(sql.includes("status = 'Vendido'"), 'destino Vendido');
  assert(sql.includes("status = 'superseded'"), 'contrato anterior superseded');
  assert(sql.includes('sale_id_unchanged'), 'preserva sale_id');
  assert(sql.includes("status = 'cancelado'"), 'cancela futuras');
  assert(!/\bDELETE FROM\s+public\.finance_receipts/i.test(sql), 'não apaga parcelas');
  assert(!/\bDELETE FROM\s+public\.contracts/i.test(sql), 'não apaga contratos');
  assert(!sql.includes('company_asaas_charges'), 'sem Asaas');
  assert(!sql.includes('bank_charges'), 'sem Inter');
  assert(!/from\s+public\.sale_release_settlements/i.test(sql), 'sem settlement');
  assert(!sql.includes('retention_percent'), 'sem retenção');
  assert(!sql.includes('seller_parties_json'), 'não toca vendedores Mundo Novo');
  assert(sql.includes('CONTRACT_NUMBER_REUSED'), 'bloqueia reuso de número');
  assert(sql.includes('OLD_CONTRACT_HTML_CHANGED'), 'protege HTML antigo');
  assert(sql.includes('charges_untouched'), 'cobranças intocadas');
  const apply = read('scripts/develop/apply-execute-sale-lot-swap.ts');
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply só DEVELOP');
  assert(apply.includes('ABORT: DATABASE_URL aponta para Production'), 'recusa Production');
  assert(apply.includes('executesLotSwap: false'), 'apply não executa troca');
  const fix = read(
    'supabase/migrations/20261014120100_fix_execute_sale_lot_swap_uuid_coalesce.sql',
  );
  assert(fix.includes('CREATE OR REPLACE FUNCTION public.execute_sale_lot_swap'), 'fix replace');
  assert(fix.includes('SECURITY DEFINER'), 'fix definer');
  assert(fix.includes('FOR UPDATE'), 'fix locks');
  assert(
    fix.includes("COALESCE(v_from.company_id, NULLIF(btrim(v_from.tenant_id), '')::uuid)"),
    'origem: tenant_id text → uuid',
  );
  assert(
    fix.includes("COALESCE(v_to.company_id, NULLIF(btrim(v_to.tenant_id), '')::uuid)"),
    'destino: tenant_id text → uuid',
  );
  assert(!/coalesce\(v_from\.company_id,\s*v_from\.tenant_id\)/i.test(fix), 'sem uuid+text na origem');
  assert(!/coalesce\(v_to\.company_id,\s*v_to\.tenant_id\)/i.test(fix), 'sem uuid+text no destino');
  assert(fix.includes("status = 'EXECUTING'"), 'fix preserva EXECUTING');
  assert(fix.includes("status = 'EXECUTED'"), 'fix preserva EXECUTED');
  assert(fix.includes("status = 'superseded'"), 'fix preserva superseded');
  assert(!fix.includes('seller_parties_json'), 'fix não toca Mundo Novo');
  const applyFix = read('scripts/develop/apply-fix-execute-sale-lot-swap-uuid-coalesce.ts');
  assert(applyFix.includes('assertDevelopWriteAllowed'), 'apply fix só DEVELOP');
  assert(applyFix.includes('executesLotSwap: false'), 'apply fix não executa troca');
  console.log('OK testSqlAtomicRpc');
}

function extractContractsInsertColumns(sql: string): string {
  const match = sql.match(/INSERT INTO public\.contracts \(\s*([\s\S]*?)\)\s*VALUES/i);
  assert(Boolean(match), 'INSERT de contracts presente');
  return String(match?.[1] || '');
}

function testDueDateAndContractInsertCompatibility() {
  const sql = read(
    'supabase/migrations/20261014120200_fix_execute_sale_lot_swap_due_date_contract_insert.sql',
  );
  assert(sql.includes('CREATE OR REPLACE FUNCTION public.execute_sale_lot_swap'), 'replace aditivo');
  assert(
    sql.includes("COALESCE(NULLIF(v_rec->>'due_date', '')::date, (CURRENT_DATE + 30))"),
    'due_date válido e fallback CURRENT_DATE + 30 são date',
  );
  assert(
    !/COALESCE\(NULLIF\(v_rec->>'due_date', ''\), \(CURRENT_DATE \+ 30\)\)::date/.test(sql),
    'não há COALESCE text+date em due_date',
  );
  assert(
    sql.includes("COALESCE(v_from.company_id, NULLIF(btrim(v_from.tenant_id), '')::uuid)"),
    'mantém COALESCE uuid da origem',
  );
  const insertCols = extractContractsInsertColumns(sql);
  assert(!/\bregenerated_by\b/.test(insertCols), 'schema sem contracts.regenerated_by no INSERT');
  assert(!/\binstallments\b/.test(insertCols), 'schema sem contracts.installments no INSERT');
  assert(!/\bneeds_regenerar\b/.test(insertCols), 'schema sem contracts.needs_regenerar no INSERT');
  assert(!/\bpdf_url\b/.test(insertCols), 'schema sem contracts.pdf_url no INSERT');
  assert(!/\bsale_value\b/.test(insertCols), 'schema sem contracts.sale_value no INSERT');
  assert(!/\bsuperseded_by\b/.test(insertCols), 'superseded_by não vai no INSERT');
  const developContractColumns = new Set([
    'id',
    'tenant_id',
    'sale_id',
    'customer_id',
    'project_id',
    'block_id',
    'contract_number',
    'generated_html',
    'status',
    'created_at',
    'project_name_snapshot',
    'project_city_snapshot',
    'project_uf_snapshot',
    'forum_city_snapshot',
    'company_id',
    'broker_id',
    'down_payment',
    'discount',
    'final_value',
    'payment_method',
    'regenerated_at',
    'regenerated_from',
    'version',
    'is_current',
    'html_content',
    'pdf_signed_url',
    'signature_token',
    'signature_status',
    'signature_sent_at',
    'signature_viewed_at',
    'signed_at',
    'signed_by_name',
    'signed_by_cpf',
    'signed_ip',
    'signed_user_agent',
    'signature_expires_at',
    'contract_model',
    'termination_policy_snapshot',
    'termination_policy_version',
    'termination_policy_source',
  ]);
  const insertColNames = insertCols
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const missingOnDevelop = insertColNames.filter((c) => !developContractColumns.has(c));
  assert(missingOnDevelop.length === 0, `INSERT usa colunas ausentes no DEVELOP: ${missingOnDevelop.join(',')}`);
  assert(/\bsale_id\b/.test(insertCols), 'mesmo sale_id');
  assert(/\bblock_id\b/.test(insertCols), 'block_id do destino');
  assert(/\bcontract_number\b/.test(insertCols), 'número novo');
  assert(/\bregenerated_from\b/.test(insertCols), 'regenerated_from do contrato antigo');
  assert(/\bis_current\b/.test(insertCols), 'is_current do novo');
  assert(/\bstatus\b/.test(insertCols), 'status do novo');
  assert(/\bversion\b/.test(insertCols), 'version do novo');
  assert(/\bgenerated_html\b/.test(insertCols), 'HTML do novo contrato');
  assert(sql.includes("column_name = 'regenerated_by'"), 'regenerated_by opcional via information_schema');
  assert(sql.includes("column_name = 'installments'"), 'installments opcional via information_schema');
  assert(sql.includes("column_name = 'needs_regenerar'"), 'needs_regenerar opcional');
  assert(sql.includes("column_name = 'pdf_url'"), 'pdf_url opcional');
  assert(sql.includes("column_name = 'sale_value'"), 'sale_value opcional');
  assert(sql.includes("column_name = 'superseded_by'"), 'superseded_by opcional no contrato antigo');
  assert(sql.includes("column_name = 'html_content'"), 'html_content opcional');
  assert(!/\bALTER TABLE\s+public\.contracts\b/i.test(sql), 'não cria colunas no DEVELOP');
  assert(sql.includes("status = 'superseded'"), 'contrato antigo superseded');
  assert(sql.includes("status = 'cancelado'"), 'futuras canceladas');
  assert(sql.includes('v_created_ids'), 'novas parcelas criadas');
  assert(sql.includes('EXCEPTION'), 'rollback integral em erro');
  assert(sql.includes("status = 'EXECUTED'"), 'idempotência EXECUTED');
  assert(sql.includes('sale_id_unchanged'), 'mesma sale_id');
  assert(!sql.includes('company_asaas_charges'), 'Asaas intacto');
  assert(!sql.includes('bank_charges'), 'Inter intacto');
  assert(!sql.includes('seller_parties_json'), 'não toca Mundo Novo');
  assert(sql.includes('current_tenant_id()'), 'guard current_tenant_id');
  assert(sql.includes('SECURITY DEFINER'), 'SECURITY DEFINER global');
  assert(sql.includes('FOR UPDATE'), 'locks globais');
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), 'sem UUID hardcoded');
  assert(!/Araguaia|Mundo Novo|S\.V Topografia|hoynys/i.test(sql), 'sem empresa/homolog hardcoded');
  assert(sql.includes('information_schema.columns'), 'colunas opcionais pelo schema, não pela empresa');
  assert(sql.includes('O contrato anterior não pertence à empresa atual'), 'contrato antigo no mesmo tenant');
  const apply = read(
    'scripts/develop/apply-fix-execute-sale-lot-swap-due-date-contract-insert.ts',
  );
  assert(apply.includes('assertDevelopWriteAllowed'), 'apply corretivo só DEVELOP');
  assert(apply.includes('executesLotSwap: false'), 'apply corretivo não executa troca');
  assert(apply.includes('20261014120200_fix_execute_sale_lot_swap_due_date_contract_insert.sql'), 'migration 202');
  console.log('OK testDueDateAndContractInsertCompatibility');
}

function testExecuteErrorUx() {
  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  assert(ui.includes('mapLotSwapExecuteUserMessage'), 'mapper específico de execução');
  assert(ui.includes('executeError'), 'estado de erro de execução separado');
  assert(ui.includes('scrollIntoView'), 'scroll até o erro');
  assert(ui.includes('Executar troca de lote'), 'botão de execução');
  const executeFn = ui.slice(ui.indexOf('const executeSwap'), ui.indexOf('const current'));
  assert(executeFn.includes('mapLotSwapExecuteUserMessage'), 'POST execute usa mapper de execução');
  assert(!executeFn.includes('mapLotSwapPreviewUserMessage'), 'POST execute não usa mapper de prévia');
  assert(executeFn.includes('setExecuteError'), 'grava erro de execução');
  assert(!executeFn.includes('setError('), 'não mistura com erro de prévia');
  const loadFn = ui.slice(ui.indexOf('const load = useCallback'), ui.indexOf('useEffect'));
  assert(!loadFn.includes('setExecuteError'), 'GET da prévia não apaga o erro de execução');
  assert(!loadFn.includes('setPrepared(null)'), 'GET da prévia não esconde o botão Executar');
  assert(ui.includes('disabled={executing || !ackExecute}'), 'botão libera após erro seguro');
  const mapperSrc = read('lib/finance/saleLotSwapPreview.ts');
  assert(
    mapperSrc.includes('LOT_SWAP_EXECUTE_GENERIC_FAILURE_MESSAGE'),
    'mensagem específica de execução',
  );
  assert(
    mapLotSwapExecuteUserMessage({
      status: 409,
      message: 'COALESCE types date and text cannot be matched',
    }) === LOT_SWAP_EXECUTE_GENERIC_FAILURE_MESSAGE,
    '409 de Postgres não vira “carregar a prévia”',
  );
  assert(
    mapLotSwapExecuteUserMessage({
      status: 409,
      code: 'PLAN_NOT_CALCULATED',
    }) === 'Confirme o plano CALCULATED antes de executar a troca.',
    '409 de plano',
  );
  assert(
    !mapLotSwapExecuteUserMessage({ status: 409, message: 'column regenerated_by does not exist' }).includes(
      'prévia',
    ),
    'schema DEVELOP não usa texto de prévia',
  );
  console.log('OK testExecuteErrorUx');
}

function testExecuteServiceContractCompatibility() {
  const svc = read('lib/finance/saleLotSwapExecuteService.ts');
  assert(svc.includes('getNextContractNumber'), 'numeração oficial');
  assert(svc.includes('generateContractHTML'), 'geradores oficiais');
  assert(svc.includes('buildLotSwapContractFinanceContext'), 'contexto financeiro da troca');
  assert(svc.includes('resolveSaleContractModelFromContext'), 'PADRAO/ARAGUAIA/RECANTO/MUNDO_NOVO');
  assert(svc.includes('loadFreshRegenerationEntities'), 'dados vigentes da venda');
  assert(svc.includes("balloonAddons: []"), 'não regrava balões');
  assert(!svc.includes('regenerateSaleContract('), 'não reusa regeneração que mantém número');
  assert(!svc.includes('seller_parties_json'), 'não lê/grava seller_parties_json aqui');
  assert(!svc.includes('mundoNovoContractSellers'), 'não altera Mundo Novo sellers');
  assert(!svc.includes('releaseLotService'), 'sem ReleaseLot');
  assert(!svc.includes('company_asaas_charges'), 'sem Asaas');
  assert(!svc.includes('bank_charges'), 'sem Inter');
  assert(svc.includes(`rpc(LOT_SWAP_EXECUTE_RPC`) || svc.includes(`rpc('${LOT_SWAP_EXECUTE_RPC}'`), 'chama RPC');
  assert(svc.includes("status === 'EXECUTED'"), 'idempotência EXECUTED');
  assert(svc.includes('loadLotSwapCallerProfile'), 'execute carrega o tenant do operador');
  assert(svc.includes('assertLotSwapCallerOwnsCompany'), 'execute recusa CROSS_TENANT');
  const route = read('app/api/sales/[saleId]/lot-swap/execute/route.ts');
  assert(route.includes('executeSaleLotSwap'), 'rota de execução');
  assert(route.includes('persistCharges: false'), 'Fase 5 não entra');
  console.log('OK testExecuteServiceContractCompatibility');
}

function testUiExecuteAfterCalculated() {
  const ui = read('components/map/LotSwapPreviewPanel.tsx');
  assert(ui.includes('Confirmar plano (sem executar)'), 'ainda confirma plano');
  assert(ui.includes('/lot-swap/charges/execute'), 'POST 5B charges execute');
  assert(
    read('app/api/sales/[saleId]/lot-swap/execute/route.ts').includes('executeSaleLotSwap'),
    'rota Fase 4 pura permanece',
  );
  assert(ui.includes('Executar troca de lote'), 'botão de execução');
  assert(!ui.includes('/release'), 'não chama ReleaseLot');
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const handleSubmit = modal.slice(
    modal.indexOf('const handleSubmit'),
    modal.indexOf('if (!mounted)'),
  );
  assert(!handleSubmit.includes('/lot-swap/execute'), 'submit do modal não executa troca');
  assert(!handleSubmit.includes('/lot-swap'), 'submit do modal não posta troca');
  console.log('OK testUiExecuteAfterCalculated');
}

function testRegressionReleaseAndDocuments() {
  assert(isLotReleaseSaleOperation('desistencia'), 'Desistência intacta');
  assert(isLotReleaseSaleOperation('distrato'), 'Distrato intacto');
  assert(isLotReleaseSaleOperation('inadimplencia'), 'Inadimplência intacta');
  assert(showsTerminationSettlement('desistencia'), 'settlement Desistência');
  assert(showsTerminationSettlement('distrato'), 'settlement Distrato');
  assert(showsTerminationSettlement('inadimplencia'), 'settlement Inadimplência');
  assert(!isLotReleaseSaleOperation('troca_lote'), 'troca não é release');
  assert(!showsTerminationSettlement('troca_lote'), 'troca sem settlement');
  assert(!isSaleReleaseSettlementOperation('troca_lote'), 'sem persistência de rescisão');
  assert(!isDeferredSaleOperation('troca_lote'), 'fluxo próprio');
  assert(isSaleLotSwapOperation('troca_lote'), 'código troca');
  const release = read('lib/finance/releaseLotService.ts');
  assert(!release.includes('executeSaleLotSwap'), 'ReleaseLot não executa troca');
  assert(!release.includes('execute_sale_lot_swap'), 'ReleaseLot não chama RPC de troca');
  const desist = read('lib/termination-documents/persist.ts');
  assert(!desist.includes('execute_sale_lot_swap'), 'termo TD/DT/IN não usa RPC de troca');
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(mundo.includes('resolveMundoNovoPromitenteVendors'), 'Mundo Novo intacto');
  assert(
    mundo.includes('seller_parties_json') ||
      read('lib/project-form.ts').includes('seller_parties_json'),
    'seller_parties_json permanece no projeto',
  );
  const planSvc = read('lib/finance/saleLotSwapPlanService.ts');
  assert(!/\.from\('sales'\)[\s\S]{0,80}\.update\(/.test(planSvc), 'plano ainda não muta sales');
  for (const table of LOT_SWAP_PLAN_FORBIDDEN_MUTATION_TABLES) {
    assert(
      planSvc.includes(`'${table}'`) || table === 'sale_balloon_installments',
      `plano documenta ${table}`,
    );
  }
  assert(DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub', 'DEVELOP');
  assert(PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej', 'Production');
  console.log('OK testRegressionReleaseAndDocuments');
}

function testGlobalMultitenantIsolation() {
  const tenantA = 'company-sv-topografia';
  const tenantB = 'company-outro-loteamento';
  const same = simulateLotSwapCrossTenantAccess({
    callerTenantId: tenantA,
    callerRole: 'ADMIN',
    saleCompanyId: tenantA,
    originLotCompanyId: tenantA,
    destLotCompanyId: tenantA,
    originProjectId: 'proj-araguaia',
    destProjectId: 'proj-araguaia',
  });
  assert(same.canPreviewSale && same.canListDestination && same.canExecute, 'mesma empresa pode operar');

  const otherSale = simulateLotSwapCrossTenantAccess({
    callerTenantId: tenantA,
    callerRole: 'ADMIN',
    saleCompanyId: tenantB,
    originLotCompanyId: tenantB,
    destLotCompanyId: tenantB,
    originProjectId: 'proj-b',
    destProjectId: 'proj-b',
  });
  assert(!otherSale.canPreviewSale, 'empresa A não visualiza venda de B');
  assert(!otherSale.canExecute, 'empresa A não executa venda de B');
  assert(otherSale.codes.includes('CROSS_TENANT'), 'CROSS_TENANT na venda');

  const stolenDestUuid = simulateLotSwapCrossTenantAccess({
    callerTenantId: tenantA,
    callerRole: 'ADMIN',
    saleCompanyId: tenantA,
    originLotCompanyId: tenantA,
    destLotCompanyId: tenantB,
    originProjectId: 'proj-araguaia',
    destProjectId: 'proj-araguaia',
  });
  assert(stolenDestUuid.canPreviewSale, 'venda própria segue visível');
  assert(!stolenDestUuid.canListDestination, 'não lista lote de outra empresa');
  assert(!stolenDestUuid.canExecute, 'UUID de lote alheio não executa');
  assert(stolenDestUuid.codes.includes('CROSS_TENANT'), 'CROSS_TENANT no lote destino');

  const stolenOrigin = simulateLotSwapCrossTenantAccess({
    callerTenantId: tenantB,
    callerRole: 'ADMIN',
    saleCompanyId: tenantA,
    originLotCompanyId: tenantA,
    destLotCompanyId: tenantA,
    originProjectId: 'proj-mundo-novo',
    destProjectId: 'proj-mundo-novo',
  });
  assert(!stolenOrigin.canPreviewSale && !stolenOrigin.canExecute, 'B não usa venda/lote de A');

  const superAdmin = simulateLotSwapCrossTenantAccess({
    callerTenantId: tenantA,
    callerRole: 'SUPER_ADMIN',
    saleCompanyId: tenantB,
    originLotCompanyId: tenantB,
    destLotCompanyId: tenantB,
    originProjectId: 'proj-b',
    destProjectId: 'proj-b',
  });
  assert(superAdmin.canPreviewSale && superAdmin.canExecute, 'super admin da plataforma não é uma empresa');

  const sql = read(
    'supabase/migrations/20261014120200_fix_execute_sale_lot_swap_due_date_contract_insert.sql',
  );
  assert(sql.includes('v_swap.company_id IS DISTINCT FROM v_company_id'), 'RPC confere tenant do swap');
  assert(sql.includes('Os lotes não pertencem à empresa atual'), 'RPC recusa lote de outro tenant');
  const mundo = read('lib/mundoNovoContractSellers.ts');
  assert(mundo.includes('somente projects.seller_parties_json'), 'Mundo Novo só JSON do projeto');
  assert(!mundo.toLowerCase().includes('representante legal') || mundo.includes('nunca cai no Representante Legal'), 'sem fallback RL');
  const template = read('lib/contractTemplate.ts');
  assert(template.includes('generateMundoNovoContract'), 'HTML Mundo Novo');
  assert(template.includes('isAraguaiaContractModel') || read('lib/contractModel.ts').includes('ARAGUAIA'), 'ARAGUAIA');
  assert(template.includes('generateRecantoPrimaveraContract'), 'RECANTO_PRIMAVERA');
  console.log('OK testGlobalMultitenantIsolation');
}

testStateMachineAndIdempotency();
testReceiptMutationsPreservePaidAndReplaceFuture();
testContractNumberNotReused();
testRpcErrorParserAndSaleIdentity();
testSqlAtomicRpc();
testDueDateAndContractInsertCompatibility();
testExecuteServiceContractCompatibility();
testUiExecuteAfterCalculated();
testExecuteErrorUx();
testRegressionReleaseAndDocuments();
testGlobalMultitenantIsolation();
console.log('OK mandatory-sale-lot-swap-execute-tests');
