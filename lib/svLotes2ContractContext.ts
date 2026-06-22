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
  let valorParcela = 0;
  if (!base.isCashPayment && qtdParcelas > 0) {
    valorParcela = Math.max(0, (valTotal - valEntrada) / qtdParcelas);
  }

  const valorParcelaFmt = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valorParcela);

  const vencimentoLabel = base.isCashPayment
    ? paymentDates.downPaymentDueFmt || paymentDates.firstInstallmentDueFmt
    : paymentDates.firstInstallmentDueFmt;

  return {
    ...base,
    contractNumber,
    area,
    municipio,
    estado,
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
    buyerCpfFmt: formatCpfCnpj(
      String(customer?.document || customer?.cpf || customer?.cpf_cnpj || ''),
    ) || base.clienteCpfCnpj,
  };
}
