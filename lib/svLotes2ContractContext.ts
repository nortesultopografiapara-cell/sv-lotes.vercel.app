/**
 * Contexto de renderização — modelo SV LOTES 2.0 (Recomendado).
 */

import { displayContractNumber } from '@/lib/contractNumber';
import {
  buildSaleContractRenderContext,
  type SaleContractRenderParams,
} from '@/lib/saleContractContext';
import { resolveContractPaymentDates } from '@/lib/contractPaymentDates';
import { formatCpfCnpj } from '@/lib/inputMasks';
import {
  buildSvLotes2SellerFromCompany,
  buildSvLotes2ContractSignatureDateLine,
  formatGenderedCivilState,
  sanitizeNeighborhoodForContract,
} from '@/lib/svLotes2ContractFormat';
import {
  formatContractSaleDateBr,
  formatContractSaleDateLongBr,
  formatContractDueDateLongBr,
  normalizeSaleRecordForContractDates,
} from '@/lib/contractPaymentDates';
import { resolveSaleContractPaymentBreakdown } from '@/lib/saleContractPaymentSummary';
import {
  buildCompactBalloonFinanceScheduleHtml,
  buildContractFinanceQuadroHtml,
  resolveSaleContractBalloonFinance,
} from '@/lib/saleContractBalloonFinance';
import { formatCurrencyBRL } from '@/lib/currencyBrl';

function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text && text.toLowerCase() !== 'não informado') return text;
  }
  return '';
}

export type SvLotes2ContractContext = ReturnType<typeof buildSvLotes2ContractContext>;

export function buildSvLotes2ContractContext(params: SaleContractRenderParams) {
  const base = buildSaleContractRenderContext(params);
  const { customer, project, block, sale, contractSnapshot, financeReceipts } =
    params;

  const contractNumber = displayContractNumber(
    pickString(
      contractSnapshot?.contract_number,
      sale?.contract_number,
      contractSnapshot?.contractNumber,
    ) || '—',
  );

  const paymentDates = resolveContractPaymentDates(sale, financeReceipts);
  const area = base.formatArea(block?.area);
  const municipio = pickString(
    project?.city,
    contractSnapshot?.project_city_snapshot,
    base.clienteCidade,
  );
  const estado = pickString(
    project?.uf,
    project?.state,
    contractSnapshot?.project_uf_snapshot,
    base.clienteUf,
  ).toUpperCase();

  const clienteTelefone = pickString(customer?.phone);
  const clienteEmail = pickString(customer?.email, customer?.contact_email);
  const clienteRg = pickString(customer?.rg, customer?.document_rg);

  const vendorDigits = base.seller.cnpj.replace(/\D/g, '');
  const vendorIsPf = vendorDigits.length === 11;

  const qtdParcelas = Number(sale?.installments_count) || 1;
  const valEntrada = Number(sale?.down_payment || 0);
  const valTotal =
    Number(sale?.total_value) ||
    Number(sale?.agreed_price) ||
    Number(sale?.sale_price) ||
    Number(block?.price) ||
    0;

  const balloonSummary = resolveSaleContractBalloonFinance({
    sale: sale as Record<string, unknown>,
    financeReceipts,
    balloonAddons: params.balloonAddons,
    isCashPayment: base.paymentMode !== 'INSTALLMENT',
  });

  let valorParcela = 0;
  if (base.paymentMode === 'INSTALLMENT' && qtdParcelas > 0) {
    valorParcela = balloonSummary.hasBalloon
      ? balloonSummary.baseInstallmentValue
      : Math.max(0, (valTotal - valEntrada) / qtdParcelas);
  }

  const valorParcelaFmt = formatCurrencyBRL(valorParcela);

  const paymentBreakdown = resolveSaleContractPaymentBreakdown(
    sale as Record<string, unknown>,
    {
      isCashPayment: base.isCashPayment,
      financeReceipts,
      balloonAddons: params.balloonAddons,
    },
  );

  const singleFutureDueLongFmt =
    paymentBreakdown.singlePaymentDueLongFmt ||
    formatContractDueDateLongBr(paymentDates.entryDueRaw) ||
    '';

  const vencimentoLabel =
    base.paymentMode === 'IMMEDIATE_CASH' || base.paymentMode === 'SINGLE_FUTURE'
      ? paymentDates.entryDueFmt || paymentDates.firstInstallmentDueFmt
      : paymentDates.firstInstallmentDueFmt;

  const sv2Seller = buildSvLotes2SellerFromCompany(params.tenant);
  const saleForDates = normalizeSaleRecordForContractDates(
    sale as Record<string, unknown>,
  );
  const dataContratoFmt = formatContractSaleDateBr(saleForDates);
  const dataContratoExtensoFmt = formatContractSaleDateLongBr(saleForDates);
  const signatureCity = pickString(
    sv2Seller.city,
    base.empresaCidade !== 'Não informado' ? base.empresaCidade : '',
    municipio,
  );
  const signatureUf = pickString(
    sv2Seller.state,
    base.empresaUf !== 'Não informado' ? base.empresaUf : '',
    estado,
  );
  const signatureDateLine = buildSvLotes2ContractSignatureDateLine(
    signatureCity,
    signatureUf,
    saleForDates,
    dataContratoExtensoFmt,
  );
  const empresaLegalNome = toTitleCase(
    pickString(
      params.tenant?.razao_social,
      params.tenant?.name,
      sv2Seller.displayName,
    ),
  );

  const financeExtras = {
    discountFmt: paymentBreakdown.discountFmt,
    correctionLabel: paymentBreakdown.correctionLabel,
    firstDueDateFmt: vencimentoLabel || null,
  };

  const balloonFinanceHtml = balloonSummary.hasBalloon
    ? buildCompactBalloonFinanceScheduleHtml(balloonSummary, financeExtras)
    : buildContractFinanceQuadroHtml({
        saleTotalFmt: formatCurrencyBRL(valTotal),
        discountFmt: paymentBreakdown.discountFmt,
        entryFmt: paymentBreakdown.entryFmt,
        financedFmt: paymentBreakdown.installmentBalanceFmt,
        parcelamentoLabel:
          base.paymentMode === 'SINGLE_FUTURE'
            ? 'Pagamento único com vencimento futuro'
            : base.paymentMode === 'IMMEDIATE_CASH'
              ? 'À vista'
              : `${qtdParcelas} parcelas mensais`,
        baseInstallmentFmt: paymentBreakdown.installmentValueFmt,
        correctionLabel: paymentBreakdown.correctionLabel,
        firstDueDateFmt: vencimentoLabel || null,
        isCashPayment: base.isCashPayment,
      });

  return {
    ...base,
    contractNumber,
    paymentBreakdown,
    balloonSummary,
    balloonFinanceHtml,
    hasBalloonInstallments: balloonSummary.hasBalloon,
    singleFutureDueLongFmt,
    area,
    municipio,
    estado,
    empresaNome: empresaLegalNome || sv2Seller.displayName || base.empresaNome,
    empresaDocumentoFmt: sv2Seller.documentFmt || base.empresaDocumentoFmt,
    empresaDocumentoLabel: sv2Seller.documentLabel || base.empresaDocumentoLabel,
    empresaEndereco: sv2Seller.addressLine || base.empresaEndereco,
    empresaCidade: sv2Seller.city || base.empresaCidade,
    empresaUf: sv2Seller.state || base.empresaUf,
    empresaCep: sv2Seller.cepFmt || base.empresaCep,
    empresaTelefone: sv2Seller.phone || base.empresaTelefone,
    empresaEmail: sv2Seller.email || base.empresaEmail,
    empresaRepresentante: sv2Seller.representativeName || base.empresaRepresentante,
    empresaRepresentanteDocFmt:
      sv2Seller.representativeCpfFmt || base.empresaRepresentanteDocFmt,
    vendorRepresentativeRole: sv2Seller.representativeRole,
    vendorRepresentativeEmail: sv2Seller.representativeEmail,
    vendorRepresentativePhone: sv2Seller.representativePhone,
    clienteEstadoCivil: formatGenderedCivilState(
      String(
        customer?.civil_state ||
          customer?.marital_status ||
          base.clienteEstadoCivil,
      ),
      base.clienteNome,
    ),
    clienteBairro: sanitizeNeighborhoodForContract(
      String(customer?.neighborhood || ''),
    ),
    clienteTelefone,
    clienteEmail,
    clienteRg,
    vendorIsPf,
    vendorRg: pickString(params.tenant?.representative_rg, params.tenant?.contract_legal_rg),
    vendorMaritalStatus: pickString(
      params.tenant?.contract_legal_marital_status,
    ),
    vendorProfession: pickString(
      params.tenant?.contract_legal_profession,
      params.tenant?.representative_profession,
    ),
    qtdParcelas,
    valEntrada,
    valorParcelaFmt,
    vencimentoLabel,
    paymentDates,
    entradaFmt: new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valEntrada),
    dataContratoFmt,
    dataContratoExtensoFmt,
    signatureDateLine,
    buyerCpfFmt: formatCpfCnpj(
      String(customer?.document || customer?.cpf || customer?.cpf_cnpj || ''),
    ) || base.clienteCpfCnpj,
  };
}
