import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchInterCobrancaByCodigo,
  type InterCobrancaDetail,
} from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthCredentials, InterOAuthFetchFn } from '@/lib/banking/inter/interOAuthClient';
import {
  bankChargeToSummaryLike,
  getInterSaleChargesSummary,
  listInterChargesForInstallments,
} from '@/lib/banking/inter/interSaleChargeService';
import { buildInterCarnePdfBytes, type InterCarneItem } from '@/lib/banking/inter/interCarnePdf';
import { getCompanyFinancialAccountById } from '@/lib/finance/companyFinancialAccountRepository';
import { resolveSaleCarneBeneficiaryFromSources } from '@/lib/finance/saleCarneBeneficiary';
import { loadSaleCarnePayerInfo, loadSaleScopedInstallments } from '@/lib/finance/saleChargesService';
import {
  chargeHasCarneArtifacts,
  chargeHasOfficialBoletoLine,
  formatSaleCarneParcelLabel,
  isPrintablePendingCharge,
} from '@/lib/finance/saleChargesShared';
import type { SaleChargesSummary } from '@/lib/finance/saleChargesShared';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';

function overlayInterDetail(
  charge: CompanyAsaasChargeResponse,
  detail: InterCobrancaDetail,
): CompanyAsaasChargeResponse {
  return {
    ...charge,
    bankSlipIdentification: detail.linhaDigitavel || charge.bankSlipIdentification,
    barCode: detail.codigoBarras || charge.barCode,
    pixCopyPaste: detail.pixCopiaECola || charge.pixCopyPaste,
    nossoNumero: detail.nossoNumero || charge.nossoNumero,
    invoiceNumber: detail.seuNumero || charge.invoiceNumber,
  };
}

async function hydrateInterChargeArtifactsGetOnly(
  creds: InterOAuthCredentials,
  charge: CompanyAsaasChargeResponse,
  fetchFn?: InterOAuthFetchFn,
): Promise<CompanyAsaasChargeResponse> {
  const hasLine = chargeHasOfficialBoletoLine(charge);
  const hasPix = Boolean(String(charge.pixCopyPaste || '').trim());
  if (hasLine && hasPix) return charge;
  const codigo = String(charge.asaasPaymentId || '').trim();
  if (!codigo) return charge;
  try {
    const detail = await fetchInterCobrancaByCodigo(creds, codigo, { fetchFn });
    return overlayInterDetail(charge, detail);
  } catch {
    return charge;
  }
}

async function resolveInterCarneBeneficiary(
  admin: SupabaseClient,
  companyId: string,
  financialAccountId: string | null,
): Promise<{ name: string | null; documentFormatted: string | null }> {
  let financialAccount: {
    document?: string | null;
    beneficiaryName?: string | null;
    name?: string | null;
  } | null = null;
  if (financialAccountId) {
    try {
      const account = await getCompanyFinancialAccountById(admin, companyId, financialAccountId);
      if (account) {
        financialAccount = {
          document: account.document,
          beneficiaryName: account.beneficiaryName,
          name: account.name,
        };
      }
    } catch {
      financialAccount = null;
    }
  }
  const { data: company } = await admin
    .from('companies')
    .select('id, cnpj, razao_social, fantasy_name, name')
    .eq('id', companyId)
    .maybeSingle();
  const resolved = resolveSaleCarneBeneficiaryFromSources({
    asaas: null,
    financialAccount,
    company: company
      ? {
          cnpj: company.cnpj ? String(company.cnpj) : null,
          razaoSocial: company.razao_social
            ? String(company.razao_social)
            : company.name
              ? String(company.name)
              : null,
          fantasyName: company.fantasy_name ? String(company.fantasy_name) : null,
        }
      : null,
  });
  return {
    name: resolved.name || financialAccount?.beneficiaryName || financialAccount?.name || null,
    documentFormatted: resolved.documentFormatted,
  };
}

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
  const secrets = await loadInterSecretsForServer(admin, companyId, {
    financialAccountId: summary.financialAccountId,
  });
  if (!secrets) throw new Error('Credenciais Inter ausentes.');
  const creds: InterOAuthCredentials = {
    companyId,
    integrationId: secrets.integrationId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };

  const total = Math.max(1, summary.totalInstallments || summary.eligibleInstallments || 1);
  const candidates: Array<{
    inst: (typeof installments)[number];
    charge: CompanyAsaasChargeResponse;
  }> = [];
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

  const items: InterCarneItem[] = [];
  for (const { inst, charge } of selected) {
    const hydrated = await hydrateInterChargeArtifactsGetOnly(creds, charge, options?.fetchFn);
    items.push({
      charge: hydrated,
      installment: inst,
      parcelLabel: formatSaleCarneParcelLabel(inst.installment_number, total),
      totalParcels: total,
    });
  }

  if (items.length === 0) {
    throw new Error(
      summary.carneBlockReason ||
        'Nenhuma cobrança Inter emitida com artefatos para o carnê.',
    );
  }

  const beneficiary = await resolveInterCarneBeneficiary(
    admin,
    companyId,
    summary.financialAccountId,
  );
  const customerId =
    installments.find((r) => r.customer_id)?.customer_id ||
    items.find((i) => i.charge.customerId)?.charge.customerId ||
    null;
  const payerRow = await loadSaleCarnePayerInfo(admin, companyId, customerId);

  const built = await buildInterCarnePdfBytes({
    items,
    emittedCount: items.length,
    totalParcels: total,
    summary,
    customerName: summary.customerName,
    projectName: summary.projectName,
    lotLabel: summary.lotLabel,
    quadra: summary.quadra,
    lote: summary.lote,
    beneficiaryName: beneficiary.name || summary.financialAccountName,
    beneficiaryDocument: beneficiary.documentFormatted,
    payer: payerRow
      ? {
          name: payerRow.name || summary.customerName || 'Pagador',
          document: payerRow.document,
          address: payerRow.address,
          neighborhood: payerRow.neighborhood,
          city: payerRow.city,
          state: payerRow.state,
          zip: payerRow.zip,
          formattedAddress: payerRow.formattedAddress,
        }
      : {
          name: summary.customerName || 'Pagador',
          document: '',
        },
    agencyCedente: '',
  });

  return { summary, items, pdf: built.bytes };
}
