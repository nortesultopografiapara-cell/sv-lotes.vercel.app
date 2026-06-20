/**
 * Painel SUPER ADMIN — relatórios e auditoria SaaS.
 * npx tsx scripts/mandatory-master-saas-panel-tests.ts
 */

import {
  buildMasterReportsMetrics,
  computeDaysLate,
  masterReportsToCsv,
} from '../lib/masterSaasReports';
import {
  formatMasterAuditAction,
  isMasterAuditEntry,
  masterAuditToCsv,
} from '../lib/masterAudit';
import {
  buildCompanyUserCounts,
  resolveUserCompanyId,
} from '../lib/masterCompanyUsers';
import {
  buildReceivedRevenueByMonth,
  buildPaidReferenceMonthsByCompany,
  formatReferenceMonthLabel,
  referenceMonthFromDate,
  resolveOfficialPaymentStatusRaw,
  sumReceivedRevenue,
} from '../lib/masterSaasPayments';
import {
  formatPaymentHistoryDetails,
  formatPaymentRecordStatus,
  resolveSaasFinancialSituation,
} from '../lib/masterSaasFinancialStatus';
import { augmentCompanyBilling } from '../lib/masterBilling';
import { loadMasterAuditLogs } from '../lib/masterAuditLoad';
import {
  subscriptionDaysLate,
  subscriptionFinanceLabel,
} from '../lib/masterSubscriptionActions';
import { flattenSuperAdminNav } from '../lib/superAdminNav';
import {
  formatImpersonationDateTime,
  IMPERSONATION_KEYS,
} from '../lib/impersonationStorage';
import {
  buildSaasContractDocumentText,
  menesesSaasContractFixture,
  MENESES_COMPANY_ID,
  SAAS_PROVIDER,
} from '../lib/saasContractContent';
import { buildSaasContractPdf, buildSaasContractPdfWithMeta } from '../lib/saasContractPdf';
import {
  SAAS_CONTRACT_MIN_PAGE_COUNT,
  SAAS_CONTRACT_NATURAL_MAX_PAGE_COUNT,
  SAAS_CONTRACT_TITLE,
  SAAS_REPORT_FORBIDDEN_TITLE,
  extractRoughPdfText,
  validateSaasContractNaturalPagination,
  validateSaasContractPdfInput,
} from '../lib/saasContractPdfValidation';
import { buildSaasContractPdfUrl } from '../lib/saasContractUrls';
import {
  SAAS_CONTRACT_STATUS_AFTER_GENERATION,
  saasContractDocumentStatusLabel,
} from '../lib/saasContractStatus';
import {
  formatCompanyContractNumber,
  isNewFormatCompanyContractNumber,
} from '../lib/companyContractNumber';
import { hasSaasContractReady } from '../lib/saasSubscription';
import { canEditProject, formatProjectApiError } from '../lib/projectEditAccess';
import {
  buildProjectUpdatePayloads,
  formatProjectUpdateDbError,
} from '../lib/projects-update';
import {
  buildSaasTimelineFromHistory,
  countSuspendedCompanies,
  resolveSaasChargeDisplayStatus,
  SAAS_AUTOMATION_RULES,
} from '../lib/masterSaasPanel';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testReportsMetrics() {
  const metrics = buildMasterReportsMetrics(
    [
      {
        id: 'c1',
        name: 'Empresa A',
        plan: 'business',
        active: true,
        status_operacional: 'Ativa',
      },
      {
        id: 'c2',
        name: 'Empresa B',
        plan: 'basic',
        active: true,
        status_operacional: 'Inadimplente',
      },
    ],
    [
      {
        id: 's1',
        company_id: 'c1',
        plan_type: 'business',
        monthly_price: 549.99,
        custom_price_enabled: false,
        billing_cycle: 'monthly',
        start_date: '2026-01-01',
        payment_status: 'paid',
        contract_status: 'active',
      },
      {
        id: 's2',
        company_id: 'c2',
        plan_type: 'basic',
        monthly_price: 329.99,
        custom_price_enabled: false,
        billing_cycle: 'monthly',
        start_date: '2026-01-01',
        payment_status: 'overdue',
        contract_status: 'active',
        next_due_date: '2026-01-01',
      },
    ],
  );

  assert(metrics.registeredCompanies === 2, 'registered');
  assert(metrics.activeSubscriptions === 2, 'active subs');
  assert(metrics.monthlyRevenue > 0, 'mrr');
  assert(metrics.annualRevenue === metrics.monthlyRevenue * 12, 'arr');
  assert(metrics.delinquentCompanies >= 1, 'delinquent');
  assert(masterReportsToCsv(metrics).includes('Empresa A'), 'csv');
  console.log('OK testReportsMetrics');
}

function testAuditHelpers() {
  assert(
    isMasterAuditEntry({ module: 'SUBSCRIPTIONS', action: 'SUBSCRIPTION_RENEWED' }),
    'audit entry',
  );
  assert(
    formatMasterAuditAction('SAAS_PAYMENT_REGISTERED') === 'Pagamento de assinatura registrado',
    'payment audit label',
  );
  assert(formatMasterAuditAction('LOGIN') === 'Login', 'login audit label');
  assert(
    formatMasterAuditAction('IMPERSONATION_STARTED') === 'Modo empresa iniciado',
    'impersonation audit label',
  );
  const csv = masterAuditToCsv([
    {
      id: '1',
      created_at: '2026-06-01T12:00:00Z',
      user_name: 'Admin',
      action: 'Criação de empresa',
      company_name: 'Empresa X',
      details: 'ok',
    },
  ]);
  assert(csv.includes('Empresa X'), 'audit csv');
  console.log('OK testAuditHelpers');
}

function testSubscriptionHelpers() {
  assert(subscriptionFinanceLabel('overdue') === 'Inadimplente', 'finance label');
  assert(subscriptionDaysLate('2026-01-01', 'overdue') >= 1, 'days late');
  console.log('OK testSubscriptionHelpers');
}

function testSuperAdminNav() {
  const items = flattenSuperAdminNav();
  assert(!items.some((i) => i.href === '/master/reports'), 'reports hidden from nav');
  assert(items.some((i) => i.href === '/master/audit'), 'audit route');
  assert(items.some((i) => i.href === '/master/settings'), 'settings route');
  assert(!items.some((i) => i.href === '/settings/global'), 'old settings removed');
  assert(!items.some((i) => i.href === '/logs'), 'logs removed');
  assert(!items.some((i) => i.href === '/offline-sync'), 'offline removed');
  assert(!items.some((i) => i.href === '/support/tickets'), 'tickets removed');
  console.log('OK testSuperAdminNav');
}

function testDaysLate() {
  const past = new Date();
  past.setDate(past.getDate() - 10);
  const iso = past.toISOString().split('T')[0];
  assert(computeDaysLate(iso) >= 10, 'compute days late');
  console.log('OK testDaysLate');
}

function testImpersonationStorage() {
  assert(IMPERSONATION_KEYS.startedAt === 'impersonating_started_at', 'impersonation keys');
  assert(formatImpersonationDateTime('2026-06-13T10:30:00Z').includes('2026'), 'impersonation date');
  console.log('OK testImpersonationStorage');
}

function testAuditLoadShape() {
  assert(typeof loadMasterAuditLogs === 'function', 'audit load export');
  console.log('OK testAuditLoadShape');
}

function testMenesesFinancialSituation() {
  const menesesId = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c';
  const fixedToday = new Date('2026-06-13T12:00:00');
  const payments = [
    {
      id: 'p-meneses',
      company_id: menesesId,
      amount: 549.99,
      paid_at: '2026-05-27',
      payment_method: 'manual',
      reference_month: '2026-05',
      status: 'paid',
    },
  ];
  const paidMonths = buildPaidReferenceMonthsByCompany(payments);
  const situation = resolveSaasFinancialSituation({
    company: { id: menesesId, active: true, status_operacional: 'Ativa' },
    subscription: {
      id: 'sub1',
      company_id: menesesId,
      plan_type: 'business',
      monthly_price: 549.99,
      custom_price_enabled: false,
      billing_cycle: 'monthly',
      start_date: '2026-01-01',
      payment_status: 'paid',
      contract_status: 'active',
      next_due_date: '2026-06-27',
    },
    paidReferenceMonths: paidMonths,
    payments,
    today: fixedToday,
  });
  assert(situation.situation === 'EM DIA', 'meneses em dia');
  assert(situation.situation !== 'Pago', 'not general pago status');
  assert(situation.lastPaymentReference === '2026-05', 'may reference');
  assert(formatPaymentRecordStatus('paid') === 'Pago', 'payment record pago');
  assert(
    formatPaymentHistoryDetails(payments[0]).includes('Status do pagamento: Pago'),
    'history shows payment pago',
  );

  const reports = buildMasterReportsMetrics(
    [
      {
        id: menesesId,
        name: 'MENESES IMOBILIARIA LTDA',
        plan: 'business',
        active: true,
        status_operacional: 'Ativa',
      },
    ],
    [
      {
        id: 'sub1',
        company_id: menesesId,
        plan_type: 'business',
        monthly_price: 549.99,
        custom_price_enabled: false,
        billing_cycle: 'monthly',
        start_date: '2026-01-01',
        payment_status: 'paid',
        contract_status: 'active',
        next_due_date: '2026-06-27',
      },
    ],
    paidMonths,
    payments,
    [],
    fixedToday,
  );
  assert(reports.rows[0].financialSituation === 'EM DIA', 'reports em dia');
  const finance = augmentCompanyBilling(
    {
      id: menesesId,
      name: 'MENESES IMOBILIARIA LTDA',
      plan: 'business',
      active: true,
      status_operacional: 'Ativa',
    },
    {
      id: 'sub1',
      company_id: menesesId,
      plan_type: 'business',
      monthly_price: 549.99,
      custom_price_enabled: false,
      billing_cycle: 'monthly',
      start_date: '2026-01-01',
      payment_status: 'paid',
      contract_status: 'active',
      next_due_date: '2026-06-27',
    },
    { paidReferenceMonths: paidMonths, payments, today: fixedToday },
  );
  assert(finance.financial_situation === 'EM DIA', 'finance em dia');
  console.log('OK testMenesesFinancialSituation');
}

function testOfficialPaymentStatus() {
  const paidMonths = buildPaidReferenceMonthsByCompany([
    {
      id: 'p1',
      company_id: 'meneses',
      amount: 549.99,
      paid_at: '2026-05-27',
      payment_method: 'manual',
      reference_month: '2026-05',
      status: 'paid',
    },
  ]);
  const status = resolveOfficialPaymentStatusRaw(
    { payment_status: 'pending' },
    'meneses',
    paidMonths,
    '2026-05',
  );
  assert(status === 'paid', 'paid from master_saas_payments fallback');
  console.log('OK testOfficialPaymentStatus');
}

function testSaasPayments() {
  const payments = [
    {
      id: 'p1',
      company_id: 'c1',
      amount: 549.99,
      paid_at: '2026-05-27',
      payment_method: 'manual',
      reference_month: '2026-05',
      status: 'paid',
    },
  ];
  assert(sumReceivedRevenue(payments) === 549.99, 'received revenue');
  const months = buildReceivedRevenueByMonth(payments);
  assert(months.some((m) => m.value === 549.99), 'month revenue');
  assert(formatReferenceMonthLabel('2026-05').includes('Maio'), 'ref month');
  assert(referenceMonthFromDate('2026-05-27') === '2026-05', 'ref from date');
  console.log('OK testSaasPayments');
}

function testCompanyUserCounts() {
  const counts = buildCompanyUserCounts([
    { tenant_id: 'c1', role: 'ADMIN' },
    { tenant_id: 'c1', role: 'BROKER' },
    { tenant_id: 'c2', role: 'SUPER_ADMIN' },
    { company_id: 'c3', role: 'ADMIN' },
  ]);
  assert(counts.c1 === 2, 'c1 users');
  assert(counts.c2 === undefined, 'super admin excluded');
  assert(counts.c3 === 1, 'company_id fallback');
  assert(resolveUserCompanyId({ tenant_id: 'abc' }) === 'abc', 'tenant id');
  console.log('OK testCompanyUserCounts');
}

function testCompanyContractNumber() {
  assert(formatCompanyContractNumber(1, 2026) === '00001/2026', 'formato 00001/2026');
  assert(formatCompanyContractNumber(125, 2026) === '00125/2026', 'formato 00125/2026');
  assert(formatCompanyContractNumber(1, 2027) === '00001/2027', 'reinício anual');
  assert(isNewFormatCompanyContractNumber('00003/2026'), 'valida novo formato');
  assert(!isNewFormatCompanyContractNumber('SAAS-2026-933585'), 'rejeita formato legado');
  console.log('OK testCompanyContractNumber');
}

function testSaasContractProfessional() {
  const fixture = menesesSaasContractFixture();
  const text = buildSaasContractDocumentText(fixture).toLowerCase();

  assert(text.includes('propriedade intelectual'), 'cláusula propriedade intelectual');
  assert(text.includes('lgpd'), 'cláusula lgpd');
  assert(text.includes('inadimpl'), 'cláusula inadimplência');
  assert(text.includes('suporte técnico'), 'cláusula suporte técnico');
  assert(text.includes('desenvolvimento personalizado'), 'cláusula desenvolvimento sob demanda');
  assert(text.includes('exportação de dados'), 'cláusula exportação de dados');
  assert(text.includes('parauapebas/pa'), 'foro parauapebas');
  assert(text.includes('licenciado como serviço saas'), 'licença saas não venda');
  assert(text.includes(SAAS_PROVIDER.legalName.toLowerCase()), 'fornecedora');
  assert(text.includes('rua 02, s/n, quadra 123, lote 05'), 'endereço fornecedora cláusula 1');
  assert(text.includes('nova carajás'), 'bairro fornecedora cláusula 1');
  assert(text.includes('68.515-000'), 'cep fornecedora cláusula 1');
  assert(text.includes('município de parauapebas'), 'município fornecedora cláusula 1');
  assert(text.includes('estado do pará'), 'estado fornecedora cláusula 1');
  assert(!text.includes('com sede em parauapebas/pa'), 'qualificação antiga removida');
  assert(text.includes('meneses imobiliaria ltda'), 'contratante meneses');
  assert(text.includes('549,99') || text.includes('549.99'), 'valor meneses');
  assert(text.includes('27/05/2026') || text.includes('2026-05-27'), 'datas meneses');
  const menesesUiPlan = augmentCompanyBilling(
    fixture.company,
    fixture.subscription as import('../lib/saasSubscription').CompanySubscription,
  ).ui_plan;
  assert(text.includes(menesesUiPlan.toLowerCase()), 'plano meneses alinhado ui_plan');
  assert(text.includes('evidências eletrônicas'), 'cláusula 22-a evidências');
  assert(text.includes('token de autenticação'), 'cláusula 22 token');
  assert(text.includes('whatsapp'), 'cláusula 21 whatsapp');
  assert(text.includes('banco de dados seguro'), 'cláusula 12 registros assinatura');

  const legacyText = buildSaasContractDocumentText(fixture, 1).toLowerCase();
  assert(!legacyText.includes('cláusula 22-a'), 'v1 sem cláusula 22-a');
  assert(legacyText.includes('manifestação preliminar') || legacyText.includes('implementação do fluxo'), 'v1 cláusula 22 legado');
  const legacyBuilt = buildSaasContractPdfWithMeta(fixture, { contentVersion: 1 });
  assert(legacyBuilt.clausesCount === 24, 'pdf v1 com 24 cláusulas');

  const built = buildSaasContractPdfWithMeta(fixture);
  const roughPdf = extractRoughPdfText(built.pdf).toLowerCase();
  const pdfValidation = validateSaasContractPdfInput(fixture, built.pdf);
  assert(pdfValidation.ok, `pdf validação meneses: ${pdfValidation.errors.join('; ')}`);
  assert(pdfValidation.hasTitle, 'pdf título contrato');
  assert(pdfValidation.hasLgpd, 'pdf lgpd');
  assert(pdfValidation.hasIntellectualProperty, 'pdf propriedade intelectual');
  assert(pdfValidation.hasInadimplencia, 'pdf inadimplência');
  assert(pdfValidation.hasForoParauapebas, 'pdf foro');
  assert(pdfValidation.isNotSaasReport, 'pdf não é relatório saas');
  assert(built.pageCount >= SAAS_CONTRACT_MIN_PAGE_COUNT, 'pdf páginas mínimas');
  assert(built.pageCount <= SAAS_CONTRACT_NATURAL_MAX_PAGE_COUNT, 'pdf paginação natural (sem forçar)');
  assert(built.clausesCount === 25, 'pdf 25 cláusulas (v2 assinatura eletrônica)');
  assert(roughPdf.includes('evidências eletrônicas') || roughPdf.includes('evidencias eletronicas'), 'cláusula 22-a');
  assert(roughPdf.includes('14.063') || roughPdf.includes('2.200-2'), 'base legal assinatura eletrônica');

  const pagination = validateSaasContractNaturalPagination(built.pdf);
  assert(pagination.ok, `paginação natural: ${pagination.errors.join('; ')}`);

  const rawPdfLatin = Buffer.from(built.pdf).toString('latin1');
  const fornecedoraPos = roughPdf.indexOf('dados da fornecedora');
  const servicosPos = roughPdf.indexOf('serviços licenciados');
  const contratantePos = roughPdf.indexOf('dados da contratante');
  assert(fornecedoraPos >= 0 && servicosPos > fornecedoraPos, 'serviços após fornecedora');
  assert(servicosPos >= 0 && contratantePos > servicosPos, 'contratante após serviços');
  assert(roughPdf.includes('nova carajás') || roughPdf.includes('Nova Caraj'), 'bairro fornecedora no pdf');
  assert(roughPdf.includes('68.515-000') || rawPdfLatin.includes('68.515-000'), 'cep fornecedora no pdf');

  assert(roughPdf.includes('00003/2026'), 'número contrato novo formato no pdf');
  assert(!roughPdf.includes('saas-2026'), 'sem prefixo SAAS- no pdf');

  const signaturePos = roughPdf.indexOf('página de assinatura');
  const signatureSlice = signaturePos >= 0 ? roughPdf.slice(signaturePos) : '';
  assert(signatureSlice.includes('contratada'), 'bloco contratada na assinatura');
  assert(!signatureSlice.includes('rua 02'), 'assinatura sem rua contratada');
  assert(!signatureSlice.includes('nova carajás'), 'assinatura sem bairro contratada');
  assert(!signatureSlice.includes('68.515-000'), 'assinatura sem cep contratada');

  assert(text.includes('64.435.850/0001-03'), 'cnpj mascarado no contrato');
  assert(!text.includes('64435850000103'), 'cnpj sem máscara ausente');
  assert(text.includes('(94) 99239-1277'), 'telefone mascarado no contrato');
  assert(!text.includes('94992391277'), 'telefone sem máscara ausente');
  assert(text.includes('68515-000'), 'cep mascarado no contrato');
  assert(text.includes('parauapebas/pa'), 'cidade formatada no contrato');
  assert(roughPdf.includes('64.435.850/0001-03'), 'cnpj mascarado no pdf');
  assert(roughPdf.includes('68515-000'), 'cep mascarado no pdf');
  assert(rawPdfLatin.includes('99239-1277'), 'telefone mascarado no pdf');
  assert(!rawPdfLatin.includes('94992391277'), 'pdf sem telefone cru');
  assert(!rawPdfLatin.includes('64435850000103'), 'pdf sem cnpj cru');

  assert(
    text.includes(SAAS_CONTRACT_TITLE.toLowerCase()) ||
      text.includes('contrato de licença de software'),
    'título contrato no documento',
  );
  assert(!text.includes(SAAS_REPORT_FORBIDDEN_TITLE.toLowerCase()), 'não é relatório saas');

  const viewUrl = buildSaasContractPdfUrl(MENESES_COMPANY_ID, 'user-1', 'inline');
  const downloadUrl = buildSaasContractPdfUrl(MENESES_COMPANY_ID, 'user-1', 'download');
  assert(viewUrl.includes('inline=1'), 'url ver contrato');
  assert(downloadUrl.includes('download=1'), 'url baixar pdf');
  assert(viewUrl.includes(MENESES_COMPANY_ID), 'url company id');

  const pdf = buildSaasContractPdf(fixture);
  assert(pdf.byteLength > 8000, 'pdf gerado com conteúdo');
  assert(pdf[0] === 0x25 && pdf[1] === 0x50, 'pdf magic bytes');

  assert(
    SAAS_CONTRACT_STATUS_AFTER_GENERATION === 'generated',
    'status após geração',
  );
  assert(
    saasContractDocumentStatusLabel('generated') === 'Gerado',
    'label status gerado',
  );
  assert(
    hasSaasContractReady({
      id: 's',
      company_id: fixture.company.id!,
      plan_type: 'business',
      monthly_price: 549.99,
      custom_price_enabled: false,
      billing_cycle: 'monthly',
      start_date: '2026-05-27',
      payment_status: 'paid',
      contract_status: 'generated',
      contract_pdf_url: 'https://example.com/c.pdf',
    }),
    'generated status ready',
  );

  console.log(
    `OK testSaasContractProfessional (${built.pageCount} páginas, sparse: ${pagination.sparsePages.join(',') || 'nenhuma'})`,
  );
}

function testProjectEditAccess() {
  const menesesTenant = MENESES_COMPANY_ID;
  const otherTenant = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const projectId = 'proj-meneses-1';

  const menesesAdmin = {
    id: 'admin-meneses',
    role: 'ADMIN',
    tenant_id: menesesTenant,
  };
  const otherAdmin = {
    id: 'admin-other',
    role: 'ADMIN',
    tenant_id: otherTenant,
  };
  const superAdmin = {
    id: 'super-1',
    role: 'SUPER_ADMIN',
    tenant_id: null,
  };
  const broker = {
    id: 'broker-1',
    role: 'BROKER',
    tenant_id: menesesTenant,
  };
  const menesesProject = { id: projectId, tenant_id: menesesTenant };

  const ownEdit = canEditProject(menesesAdmin, menesesProject);
  assert(ownEdit.allowed, 'ADMIN Meneses edita próprio projeto');

  const crossEdit = canEditProject(otherAdmin, menesesProject);
  assert(!crossEdit.allowed, 'outro tenant não edita Meneses');
  assert(
    (crossEdit.reason || '').includes('outra empresa'),
    'mensagem cross-tenant',
  );

  const superEdit = canEditProject(superAdmin, menesesProject, {
    impersonatingTenantId: menesesTenant,
  });
  assert(superEdit.allowed, 'SUPER_ADMIN com impersonation edita Meneses');

  const superWrongTenant = canEditProject(superAdmin, menesesProject, {
    impersonatingTenantId: otherTenant,
  });
  assert(!superWrongTenant.allowed, 'SUPER_ADMIN impersonation errada bloqueada');

  const brokerEdit = canEditProject(broker, menesesProject);
  assert(!brokerEdit.allowed, 'BROKER não edita projeto');

  const networkMsg = formatProjectApiError(0, {}, 'TypeError: Failed to fetch');
  assert(
    networkMsg.includes('conectar ao servidor'),
    'erro de rede legível',
  );
  assert(
    !networkMsg.includes('TypeError'),
    'não expõe TypeError bruto',
  );

  const forbiddenMsg = formatProjectApiError(403, {
    error: 'Você não pode editar projetos de outra empresa.',
    code: 'FORBIDDEN',
  });
  assert(
    forbiddenMsg.includes('outra empresa'),
    'erro 403 legível',
  );

  console.log('OK testProjectEditAccess');
}

function testProjectUpdatePayloads() {
  const payloads = buildProjectUpdatePayloads({
    name: 'CHACARAS DOIS IRMÃOS',
    city: 'Parauapebas',
    uf: 'PA',
    neighborhood: 'Centro',
    address: 'Rua Exemplo, 100',
    forum_city: 'Parauapebas',
    contract_city: 'Parauapebas',
    location: 'Parauapebas - PA',
  });

  assert(payloads.length >= 3, 'payloads com fallback');
  for (const payload of payloads) {
    assert(!('updated_at' in payload), 'update não envia updated_at');
    assert(!('state' in payload), 'update não envia state');
    assert(!('contract_city' in payload), 'update não envia contract_city');
    assert(payload.name === 'CHACARAS DOIS IRMÃOS', 'nome preservado');
  }
  assert(payloads[0].forum_city === 'Parauapebas', 'forum_city como município do contrato');
  assert(payloads[0].neighborhood === 'Centro', 'bairro no payload completo');

  const columnMsg = formatProjectUpdateDbError(
    "Could not find the 'updated_at' column of 'projects' in the schema cache",
  );
  assert(
    !columnMsg.includes('updated_at'),
    'erro de coluna não expõe detalhe técnico',
  );
  assert(
    columnMsg.includes('Não foi possível salvar'),
    'erro de coluna amigável',
  );

  console.log('OK testProjectUpdatePayloads');
}

function testMasterSaasPanelHelpers() {
  const paid = resolveSaasChargeDisplayStatus({
    invoiceId: 'i1',
    companyId: 'c1',
    companyName: 'Test',
    referenceMonth: '2026-06',
    amount: 10,
    dueDate: '2026-06-10',
    invoiceStatus: 'PAGO',
    chargeStatus: 'PAID',
    asaasStatus: 'RECEIVED',
    paymentId: 'pay_1',
    chargeId: 'ch_1',
    pixCopyPaste: null,
    paymentUrl: null,
  });
  assert(paid === 'PAGA', 'status paga');

  const overdue = resolveSaasChargeDisplayStatus({
    invoiceId: 'i2',
    companyId: 'c1',
    companyName: 'Test',
    referenceMonth: '2026-05',
    amount: 10,
    dueDate: '2026-05-01',
    invoiceStatus: 'VENCIDO',
    chargeStatus: 'OVERDUE',
    asaasStatus: 'OVERDUE',
    paymentId: 'pay_2',
    chargeId: 'ch_2',
    pixCopyPaste: 'pix',
    paymentUrl: 'https://asaas.com',
  });
  assert(overdue === 'VENCIDA', 'status vencida');

  const sent = resolveSaasChargeDisplayStatus(
    {
      invoiceId: 'i3',
      companyId: 'c1',
      companyName: 'Test',
      referenceMonth: '2026-06',
      amount: 10,
      dueDate: '2026-06-20',
      invoiceStatus: 'PENDENTE',
      chargeStatus: 'PENDING',
      asaasStatus: 'PENDING',
      paymentId: 'pay_3',
      chargeId: 'ch_3',
      pixCopyPaste: 'pix',
      paymentUrl: null,
    },
    { sentWhatsApp: true },
  );
  assert(sent === 'ENVIADA', 'status enviada');

  const timeline = buildSaasTimelineFromHistory([
    {
      id: '1',
      created_at: '2026-06-01T10:00:00Z',
      action: 'Pagamento registrado',
      company_name: 'Empresa A',
      description: 'PIX',
    },
    {
      id: '2',
      created_at: '2026-06-02T10:00:00Z',
      action: 'WhatsApp enviado',
      company_name: 'Empresa A',
    },
  ]);
  assert(timeline[0].type === 'whatsapp_sent', 'timeline whatsapp first (newer)');
  assert(timeline[1].type === 'payment_confirmed', 'timeline payment');

  assert(countSuspendedCompanies([{ financial_situation: 'SUSPENSO' }]) === 1, 'suspended count');
  assert(SAAS_AUTOMATION_RULES.find((r) => r.id === 'auto_reactivate')?.enabled === true, 'auto reactivate ativo');
  assert(SAAS_AUTOMATION_RULES.find((r) => r.id === 'auto_suspend')?.enabled === true, 'auto suspend ativo');
  assert(SAAS_AUTOMATION_RULES.find((r) => r.id === 'reminder_7d')?.enabled === false, 'lembretes preparado');
  console.log('OK testMasterSaasPanelHelpers');
}

function main() {
  testReportsMetrics();
  testAuditHelpers();
  testSubscriptionHelpers();
  testSuperAdminNav();
  testDaysLate();
  testImpersonationStorage();
  testAuditLoadShape();
  testMenesesFinancialSituation();
  testOfficialPaymentStatus();
  testSaasPayments();
  testCompanyUserCounts();
  testCompanyContractNumber();
  testSaasContractProfessional();
  testProjectEditAccess();
  testProjectUpdatePayloads();
  testMasterSaasPanelHelpers();
  console.log('mandatory-master-saas-panel-tests: all passed');
}

main();
