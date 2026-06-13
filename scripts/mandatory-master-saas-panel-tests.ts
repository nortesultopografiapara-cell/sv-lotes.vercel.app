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
  assert(items.some((i) => i.href === '/master/reports'), 'reports route');
  assert(items.some((i) => i.href === '/master/audit'), 'audit route');
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

function main() {
  testReportsMetrics();
  testAuditHelpers();
  testSubscriptionHelpers();
  testSuperAdminNav();
  testDaysLate();
  testImpersonationStorage();
  testAuditLoadShape();
  testOfficialPaymentStatus();
  testSaasPayments();
  testCompanyUserCounts();
  console.log('mandatory-master-saas-panel-tests: all passed');
}

main();
