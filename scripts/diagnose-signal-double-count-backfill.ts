/**
 * Diagnóstico e backfill — vendas com dupla contagem do sinal.
 *
 * Este script NÃO altera dados em produção. Ele:
 *   1. Localiza vendas com sinal (installment_number = -1)
 *   2. Verifica se a soma financeira excede o valor da venda
 *   3. Gera relatório sanitizado
 *   4. Propõe backfill idempotente (dry-run)
 *
 * Execução (somente diagnóstico):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/diagnose-signal-double-count-backfill.ts
 *
 * Execução com correção (SOMENTE EM PREVIEW/STAGING):
 *   APPLY_FIX=true SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/diagnose-signal-double-count-backfill.ts
 */

import { createClient } from '@supabase/supabase-js';
import { splitInstallmentAmounts } from '@/lib/saleInstallmentCalc';
import { normalizeSaleContractModel } from '@/lib/contractModel';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY_FIX = process.env.APPLY_FIX === 'true';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type SaleRow = {
  id: string;
  tenant_id: string;
  total_value: number;
  agreed_price: number;
  down_payment: number;
  installments_count: number;
  block_id: string;
  customer_id: string;
  blocks?: { block_name?: string; number?: string; projects?: { name?: string } } | null;
  customers?: { name?: string } | null;
};

type ReceiptRow = {
  id: string;
  sale_id: string;
  installment_number: number;
  amount: number;
  status: string;
  paid_at: string | null;
};

type DiagnosticEntry = {
  saleId: string;
  tenantId: string;
  customerName: string;
  projectName: string;
  blockLabel: string;
  finalValue: number;
  downPayment: number;
  signalAmount: number;
  entryComplement: number;
  installmentsCount: number;
  currentInstallmentSum: number;
  correctInstallmentSum: number;
  totalFinance: number;
  divergence: number;
  paidInstallments: number;
  pendingInstallments: number;
};

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

async function main() {
  console.log('=== DIAGNÓSTICO: Dupla contagem do sinal no financeiro ===\n');
  console.log(`Modo: ${APPLY_FIX ? '⚠️  APLICANDO CORREÇÃO' : '🔍 Somente diagnóstico'}\n`);

  // 1. Buscar vendas que possuem sinal (installment_number = -1)
  const { data: signalReceipts, error: signalErr } = await supabase
    .from('finance_receipts')
    .select('sale_id, amount')
    .eq('installment_number', -1)
    .neq('status', 'cancelado');

  if (signalErr) {
    console.error('Erro ao buscar sinais:', signalErr.message);
    process.exit(1);
  }

  if (!signalReceipts?.length) {
    console.log('Nenhuma venda com sinal encontrada.');
    process.exit(0);
  }

  const saleIds = [...new Set(signalReceipts.map((r) => r.sale_id))];
  const signalBySale = new Map<string, number>();
  for (const r of signalReceipts) {
    signalBySale.set(r.sale_id, (signalBySale.get(r.sale_id) || 0) + Number(r.amount));
  }

  console.log(`Vendas com sinal encontradas: ${saleIds.length}\n`);

  // 2. Carregar dados das vendas
  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('id, tenant_id, total_value, agreed_price, down_payment, installments_count, block_id, customer_id, blocks(block_name, number, projects(name)), customers(name)')
    .in('id', saleIds);

  if (salesErr) {
    console.error('Erro ao buscar vendas:', salesErr.message);
    process.exit(1);
  }

  // 3. Filtrar: excluir RECANTO_PRIMAVERA
  const companyIds = [...new Set((sales || []).map((s) => s.tenant_id))];
  const { data: companies } = await supabase
    .from('companies')
    .select('id, contract_model, name')
    .in('id', companyIds);

  const companyMap = new Map((companies || []).map((c) => [c.id, c]));
  const companyNameMap = new Map((companies || []).map((c) => [c.id, c.name || c.id]));

  const standardSales = (sales || []).filter((s) => {
    const company = companyMap.get(s.tenant_id);
    const model = normalizeSaleContractModel(company?.contract_model);
    return model !== 'RECANTO_PRIMAVERA';
  });

  console.log(`Vendas padrão (excluído Recanto): ${standardSales.length}\n`);

  // 4. Para cada venda, carregar parcelas e calcular divergência
  const diagnostics: DiagnosticEntry[] = [];
  let totalDivergent = 0;

  for (const sale of standardSales as SaleRow[]) {
    const signalAmount = signalBySale.get(sale.id) || 0;
    const finalValue = Number(sale.total_value) || Number(sale.agreed_price) || 0;
    const downPayment = Number(sale.down_payment) || 0;

    const { data: receipts } = await supabase
      .from('finance_receipts')
      .select('id, sale_id, installment_number, amount, status, paid_at')
      .eq('sale_id', sale.id)
      .neq('status', 'cancelado')
      .order('installment_number');

    if (!receipts?.length) continue;

    const totalFinance = money(receipts.reduce((s, r) => s + Number(r.amount), 0));
    const divergence = money(totalFinance - finalValue);

    if (Math.abs(divergence) < 0.01) continue;

    const installments = receipts.filter((r) => r.installment_number >= 1) as ReceiptRow[];
    const paidInstallments = installments.filter((r) => r.status === 'pago' || r.paid_at).length;
    const pendingInstallments = installments.filter((r) => r.status !== 'pago' && !r.paid_at).length;
    const currentInstallmentSum = money(installments.reduce((s, r) => s + Number(r.amount), 0));
    const correctPrincipal = money(finalValue - downPayment);
    const entryComplement = money(downPayment - signalAmount);

    const blockLabel = `QD ${sale.blocks?.block_name || '?'} — LT ${sale.blocks?.number || '?'}`;
    const projectName = sale.blocks?.projects?.name || '?';
    const customerName = sale.customers?.name || '?';

    diagnostics.push({
      saleId: sale.id,
      tenantId: sale.tenant_id,
      customerName,
      projectName,
      blockLabel,
      finalValue,
      downPayment,
      signalAmount,
      entryComplement: Math.max(0, entryComplement),
      installmentsCount: installments.length,
      currentInstallmentSum,
      correctInstallmentSum: correctPrincipal,
      totalFinance,
      divergence,
      paidInstallments,
      pendingInstallments,
    });
    totalDivergent++;
  }

  // 5. Relatório
  console.log('═══════════════════════════════════════════════════════');
  console.log('RELATÓRIO DE VENDAS COM DIVERGÊNCIA FINANCEIRA');
  console.log('═══════════════════════════════════════════════════════\n');

  if (diagnostics.length === 0) {
    console.log('✅ Nenhuma venda divergente encontrada.');
    process.exit(0);
  }

  for (const d of diagnostics) {
    const companyName = companyNameMap.get(d.tenantId) || d.tenantId;
    console.log(`Empresa:       ${companyName}`);
    console.log(`Cliente:       ${d.customerName}`);
    console.log(`Projeto:       ${d.projectName}`);
    console.log(`Lote:          ${d.blockLabel}`);
    console.log(`Venda ID:      ${d.saleId}`);
    console.log(`Valor final:   R$ ${d.finalValue.toFixed(2)}`);
    console.log(`Entrada bruta: R$ ${d.downPayment.toFixed(2)}`);
    console.log(`Sinal:         R$ ${d.signalAmount.toFixed(2)}`);
    console.log(`Complemento:   R$ ${d.entryComplement.toFixed(2)}`);
    console.log(`Parcelas:      ${d.installmentsCount} (${d.paidInstallments} pagas, ${d.pendingInstallments} pendentes)`);
    console.log(`Soma parcelas: R$ ${d.currentInstallmentSum.toFixed(2)} (correto: R$ ${d.correctInstallmentSum.toFixed(2)})`);
    console.log(`Total financ.: R$ ${d.totalFinance.toFixed(2)}`);
    console.log(`DIVERGÊNCIA:   R$ ${d.divergence.toFixed(2)}`);
    console.log('---');
  }

  console.log(`\nTotal de vendas divergentes: ${totalDivergent}`);
  console.log(`Soma das divergências: R$ ${money(diagnostics.reduce((s, d) => s + d.divergence, 0)).toFixed(2)}`);

  // 6. Backfill (dry-run ou aplicação)
  if (!APPLY_FIX) {
    console.log('\n⚠️  Para aplicar correções, execute com APPLY_FIX=true');
    console.log('   SOMENTE em ambiente de PREVIEW/STAGING.');
    process.exit(0);
  }

  console.log('\n═══ APLICANDO BACKFILL ═══\n');

  let fixedCount = 0;
  let skippedCount = 0;

  for (const d of diagnostics) {
    const correctPrincipal = d.correctInstallmentSum;
    const newAmounts = splitInstallmentAmounts(correctPrincipal, d.installmentsCount);

    const { data: receipts } = await supabase
      .from('finance_receipts')
      .select('id, installment_number, amount, status, paid_at')
      .eq('sale_id', d.saleId)
      .gte('installment_number', 1)
      .neq('status', 'cancelado')
      .order('installment_number');

    if (!receipts?.length) {
      skippedCount++;
      continue;
    }

    const pendingReceipts = receipts.filter((r) => r.status !== 'pago' && !r.paid_at);
    const paidReceipts = receipts.filter((r) => r.status === 'pago' || r.paid_at);

    const paidSum = money(paidReceipts.reduce((s, r) => s + Number(r.amount), 0));
    const remainingPrincipal = money(correctPrincipal - paidSum);

    if (remainingPrincipal <= 0 || pendingReceipts.length === 0) {
      console.log(`  ⏭️  ${d.saleId}: sem parcelas pendentes para ajustar`);
      skippedCount++;
      continue;
    }

    const correctedAmounts = splitInstallmentAmounts(remainingPrincipal, pendingReceipts.length);

    for (let i = 0; i < pendingReceipts.length; i++) {
      const receipt = pendingReceipts[i];
      const newAmount = correctedAmounts[i];
      if (Math.abs(Number(receipt.amount) - newAmount) < 0.01) continue;

      const { error } = await supabase
        .from('finance_receipts')
        .update({ amount: newAmount, base_amount: newAmount })
        .eq('id', receipt.id);

      if (error) {
        console.error(`  ❌ ${receipt.id}: ${error.message}`);
      }
    }

    console.log(`  ✅ ${d.saleId}: ${pendingReceipts.length} parcelas corrigidas (R$ ${remainingPrincipal.toFixed(2)} / ${pendingReceipts.length})`);
    fixedCount++;
  }

  console.log(`\nBackfill concluído: ${fixedCount} vendas corrigidas, ${skippedCount} ignoradas`);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
