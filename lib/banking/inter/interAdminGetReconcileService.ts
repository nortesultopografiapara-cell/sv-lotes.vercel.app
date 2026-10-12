/**
 * Serviço TEMPORÁRIO de conciliação GET-only Inter.
 * Não chama funções de criação ou cancelamento de cobrança.
 * REMOVER após conciliação do contrato 000000098/2026.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCustomerDocumentDigits } from '@/lib/customerIdentity';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import {
  fetchInterCobrancaByCodigo,
  listInterCobrancasBySeuNumero,
  listInterCobrancasPage,
} from '@/lib/banking/inter/interCobrancaClient';
import type { InterOAuthCredentials } from '@/lib/banking/inter/interOAuthClient';
import {
  INTER_ADMIN_GET_RECONCILE_BUDGET_MS,
  runInterAdminGetReconcile,
  type InterReconcileLocalCharge,
  type InterReconcileReceipt,
  type InterReconcileReport,
} from '@/lib/banking/inter/interAdminGetReconcile';

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function reconcileInterSaleChargesGetOnly(input: {
  admin: SupabaseClient;
  companyId: string;
  saleId: string;
  dueFrom?: string | null;
  dueTo?: string | null;
}): Promise<
  | { ok: true; companyId: string; saleId: string; report: InterReconcileReport }
  | { ok: false; status: number; error: string }
> {
  const companyId = String(input.companyId || '').trim();
  const saleId = String(input.saleId || '').trim();
  if (!companyId || !saleId) {
    return { ok: false, status: 400, error: 'companyId e saleId obrigatórios.' };
  }

  const { data: sale, error: saleErr } = await input.admin
    .from('sales')
    .select('id, company_id, financial_account_id, customer_id, installments_count')
    .eq('id', saleId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (saleErr) return { ok: false, status: 500, error: 'Falha ao ler venda.' };
  if (!sale?.id) return { ok: false, status: 404, error: 'Venda não encontrada nesta empresa.' };

  const accountId = String(sale.financial_account_id || '').trim();
  if (!accountId) return { ok: false, status: 400, error: 'Venda sem conta financeira.' };

  const { data: account } = await input.admin
    .from('company_financial_accounts')
    .select('id, company_id, bank_integration_id, active')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!account?.id || account.active === false) {
    return { ok: false, status: 400, error: 'Conta financeira inativa ou de outra empresa.' };
  }

  const { data: customer } = await input.admin
    .from('customers')
    .select('cpf_cnpj, document')
    .eq('id', String(sale.customer_id || ''))
    .maybeSingle();
  const payerDocDigits = resolveCustomerDocumentDigits(customer);

  const { data: receipts } = await input.admin
    .from('finance_receipts')
    .select('id, installment_number, amount, due_date')
    .eq('sale_id', saleId);
  const { data: charges } = await input.admin
    .from('bank_charges')
    .select('id, finance_receipt_id, external_id, our_number, due_date')
    .eq('sale_id', saleId)
    .eq('provider', 'INTER');

  const monthlyReceipts: InterReconcileReceipt[] = (receipts || [])
    .filter((row) => Number(row.installment_number) >= 1)
    .map((row) => ({
      id: String(row.id),
      installmentNumber: Number(row.installment_number),
      dueDate: String(row.due_date || '').slice(0, 10),
      amount: Number(row.amount || 0),
    }));
  const receiptById = new Map(monthlyReceipts.map((row) => [row.id, row]));
  const localCharges: InterReconcileLocalCharge[] = (charges || []).map((row) => {
    const rec = receiptById.get(String(row.finance_receipt_id || ''));
    return {
      receiptId: String(row.finance_receipt_id || ''),
      installmentNumber: rec?.installmentNumber ?? 0,
      externalId: String(row.external_id || '').trim(),
      ourNumber: row.our_number ? String(row.our_number) : null,
      dueDate: String(row.due_date || rec?.dueDate || '').slice(0, 10),
    };
  });

  const dues = monthlyReceipts.map((row) => row.dueDate).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const dueStart =
    String(input.dueFrom || '').slice(0, 10) || dues[0] || '2026-11-15';
  const dueEnd =
    String(input.dueTo || '').slice(0, 10) || dues[dues.length - 1] || '2041-10-15';

  const secrets = await loadInterSecretsForServer(input.admin, companyId, {
    integrationId: String(account.bank_integration_id || '').trim() || null,
    financialAccountId: accountId,
  });
  if (!secrets) return { ok: false, status: 400, error: 'Credenciais Inter ausentes para esta conta.' };

  const creds: InterOAuthCredentials = {
    companyId,
    integrationId: secrets.integrationId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };

  const report = await runInterAdminGetReconcile(
    {
      localCharges,
      monthlyReceipts,
      payerDocDigits,
      dueStart,
      dueEnd,
      budgetMs: INTER_ADMIN_GET_RECONCILE_BUDGET_MS,
    },
    {
      async listPage(query) {
        const page = await listInterCobrancasPage(creds, {
          dataInicial: query.dataInicial,
          dataFinal: query.dataFinal,
          filtrarDataPor: 'VENCIMENTO',
          cpfCnpjPessoaPagadora: query.cpfCnpjPessoaPagadora,
          paginaAtual: query.paginaAtual,
          itensPorPagina: 100,
        });
        return {
          status: page.status,
          totalPaginas: page.totalPaginas,
          cobrancas: page.cobrancas.map((row) => ({
            codigoSolicitacao: row.codigoSolicitacao,
            seuNumero: row.seuNumero || null,
            nossoNumero: row.nossoNumero || null,
            situacao: row.situacao,
            dataVencimento: row.dataVencimento,
          })),
        };
      },
      async getByCodigo(codigo) {
        const detail = await fetchInterCobrancaByCodigo(creds, codigo);
        return {
          codigoSolicitacao: detail.codigoSolicitacao,
          seuNumero: detail.seuNumero || null,
          nossoNumero: detail.nossoNumero || null,
          situacao: detail.situacao,
          dataVencimento: String(detail.raw?.dataVencimento || '').slice(0, 10) || null,
        };
      },
      async getBySeuNumero(query) {
        const detail = await listInterCobrancasBySeuNumero(creds, query);
        if (!detail) return null;
        return {
          codigoSolicitacao: detail.codigoSolicitacao,
          seuNumero: detail.seuNumero || null,
          nossoNumero: detail.nossoNumero || null,
          situacao: detail.situacao,
          dataVencimento: query.dueDate,
        };
      },
      sleep,
      nowMs: () => Date.now(),
    },
  );

  console.info('[inter-admin-get-reconcile]', {
    companyId,
    saleId,
    complete: report.coverage.complete,
    windowsOk: report.coverage.windowsOk,
    windowsPlanned: report.coverage.windowsPlanned,
    matched: report.matched,
    orphans: report.orphans.length,
    confirmedByCodigo: report.getByCodigo.confirmed,
    aptosEmissao: report.aptosEmissao,
    payerDocLen: onlyDigits(payerDocDigits).length,
  });

  return { ok: true, companyId, saleId, report };
}
