import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchInterCobrancaPdf } from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthCredentials, InterOAuthFetchFn } from '@/lib/banking/inter/interOAuthClient';
import {
  bankChargeToSummaryLike,
  getInterSaleChargesSummary,
  listInterChargesForInstallments,
} from '@/lib/banking/inter/interSaleChargeService';
import { buildInterCarnePdfBytes, type InterCarneItem } from '@/lib/banking/inter/interCarnePdf';
import { loadSaleScopedInstallments } from '@/lib/finance/saleChargesService';
import {
  chargeHasCarneArtifacts,
  formatSaleCarneParcelLabel,
  isPrintablePendingCharge,
} from '@/lib/finance/saleChargesShared';
import type { SaleChargesSummary } from '@/lib/finance/saleChargesShared';

export async function buildInterSaleCarneBundle(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
  options?: { fetchFn?: InterOAuthFetchFn },
): Promise<{
  summary: SaleChargesSummary & { chargeProvider: 'INTER' };
  items: InterCarneItem[];
  pdf: Uint8Array;
}> {
  const summary = await getInterSaleChargesSummary(admin, companyId, saleId);
  const installments = await loadSaleScopedInstallments(admin, companyId, saleId);
  const map = await listInterChargesForInstallments(
    admin,
    companyId,
    installments.map((i) => i.id),
  );
  const secrets = await loadInterSecretsForServer(admin, companyId);
  if (!secrets) throw new Error('Credenciais Inter ausentes.');
  const creds: InterOAuthCredentials = {
    companyId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };

  const items: InterCarneItem[] = [];
  const total = Math.max(1, summary.totalInstallments || summary.eligibleInstallments || 1);
  const candidates: Array<{ inst: (typeof installments)[number]; charge: ReturnType<typeof bankChargeToSummaryLike> }> =
    [];
  for (const inst of installments) {
    const row = map.get(inst.id);
    if (!row) continue;
    const charge = bankChargeToSummaryLike(row as Record<string, unknown>, companyId);
    if (!String(charge.asaasPaymentId || '').trim()) continue;
    if (charge.status === 'CANCELLED' || charge.status === 'FAILED' || charge.status === 'EXPIRED') {
      continue;
    }
    candidates.push({ inst, charge });
  }
  const unpaid = candidates.filter(
    ({ charge }) => charge.status !== 'PAID' && (isPrintablePendingCharge(charge) || chargeHasCarneArtifacts(charge)),
  );
  const selected = unpaid.length > 0 ? unpaid : candidates.filter(({ charge }) => chargeHasCarneArtifacts(charge));

  for (const { inst, charge } of selected) {

    let officialPdf: Uint8Array | null = null;
    try {
      const buf = await fetchInterCobrancaPdf(creds, String(charge.asaasPaymentId), {
        fetchFn: options?.fetchFn,
      });
      officialPdf = new Uint8Array(buf);
    } catch {
      officialPdf = null;
    }
    items.push({
      charge,
      parcelLabel: formatSaleCarneParcelLabel(inst.installment_number, total),
      officialPdf,
    });
  }

  if (items.length === 0) {
    throw new Error(
      summary.carneBlockReason ||
        'Nenhuma cobrança Inter emitida com artefatos para o carnê.',
    );
  }

  const built = await buildInterCarnePdfBytes({
    items,
    emittedCount: items.length,
    totalParcels: total,
    customerName: summary.customerName,
    projectName: summary.projectName,
    lotLabel: summary.lotLabel,
  });

  return { summary, items, pdf: built.bytes };
}
