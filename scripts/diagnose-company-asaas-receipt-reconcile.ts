/**
 * Diagnóstico — cobrança Asaas Company PAID vs finance_receipts pendente.
 *
 * Uso:
 *   npx tsx scripts/diagnose-company-asaas-receipt-reconcile.ts
 *   npx tsx scripts/diagnose-company-asaas-receipt-reconcile.ts --company-id <uuid>
 *   npx tsx scripts/diagnose-company-asaas-receipt-reconcile.ts --amount 5
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  FINANCE_RECEIPT_PAID_STATUS,
  forceCompanyAsaasPaidInstallmentReconciliation,
  isReceiptPaidStatus,
  needsCompanyAsaasReceiptReconciliation,
} from '../lib/finance/companyAsaasPaymentReconciliation';

function loadEnvFile(relPath: string): void {
  const full = path.join(process.cwd(), relPath);
  if (!fs.existsSync(full)) return;
  const content = fs.readFileSync(full, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.production.local');
loadEnvFile('.env.local');

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const companyId = argValue('--company-id');
  const amountFilter = argValue('--amount');
  const dryRun = process.argv.includes('--dry-run');

  let query = admin
    .from('company_asaas_charges')
    .select(
      'id, company_id, installment_id, status, value, paid_at, asaas_payment_id, cash_movement_id, created_at',
    )
    .eq('status', 'PAID')
    .order('created_at', { ascending: false })
    .limit(50);

  if (companyId) query = query.eq('company_id', companyId);
  if (amountFilter) query = query.eq('value', Number(amountFilter));

  const { data: charges, error: chargesError } = await query;
  if (chargesError) throw new Error(chargesError.message);

  console.log('=== DIAGNÓSTICO Asaas Company PAID → finance_receipts ===');
  console.log(`Cobranças PAID encontradas: ${charges?.length ?? 0}`);
  console.log(`Status pago esperado no Financeiro: "${FINANCE_RECEIPT_PAID_STATUS}"`);
  console.log('');

  let mismatchCount = 0;

  for (const charge of charges ?? []) {
    const installmentId = String(charge.installment_id || '').trim();
    const { data: receipt, error: receiptError } = await admin
      .from('finance_receipts')
      .select('id, status, amount, paid_amount, paid_at, company_id, tenant_id, sale_id, installment_number')
      .eq('id', installmentId)
      .maybeSingle();

    if (receiptError) throw new Error(receiptError.message);

    const needsSync = needsCompanyAsaasReceiptReconciliation({
      chargeStatus: charge.status,
      receiptStatus: receipt?.status,
    });

    const installmentMatch = receipt?.id === installmentId;
    const companyMatch =
      !receipt?.company_id ||
      receipt.company_id === charge.company_id ||
      receipt.tenant_id === charge.company_id;

    console.log('---');
    console.log('company_asaas_charges:', {
      id: charge.id,
      company_id: charge.company_id,
      installment_id: charge.installment_id,
      status: charge.status,
      value: charge.value,
      asaas_payment_id: charge.asaas_payment_id,
      cash_movement_id: charge.cash_movement_id,
      paid_at: charge.paid_at,
    });
    console.log('finance_receipts:', receipt ?? '(não encontrado)');
    console.log('checks:', {
      installment_id_matches_receipt_id: installmentMatch,
      company_id_matches: companyMatch,
      needs_reconciliation: needsSync,
      receipt_is_paid: isReceiptPaidStatus(receipt?.status),
    });

    if (needsSync) {
      mismatchCount += 1;
      if (!dryRun && receipt && installmentMatch) {
        console.log('→ Tentando baixa automática (force reconcile)...');
        try {
          const result = await forceCompanyAsaasPaidInstallmentReconciliation(
            admin,
            String(charge.company_id),
            installmentId,
            { eventType: 'DIAGNOSE_SCRIPT' },
          );
          const { data: after } = await admin
            .from('finance_receipts')
            .select('id, status, paid_amount, paid_at')
            .eq('id', installmentId)
            .maybeSingle();
          console.log('→ Resultado:', { result, receiptAfter: after });
        } catch (err) {
          console.error('→ FALHA na baixa:', err instanceof Error ? err.message : err);
        }
      }
    }
  }

  console.log('');
  console.log(`Total PAID com parcela pendente: ${mismatchCount}`);
  if (mismatchCount === 0) {
    console.log('Nenhuma inconsistência encontrada nas cobranças analisadas.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
