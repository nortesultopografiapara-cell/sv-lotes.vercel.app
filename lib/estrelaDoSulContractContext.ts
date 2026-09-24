/**
 * Contexto isolado — Chacreamento Estrela do Sul.
 * Fontes: companies, contract_second_vendor_json, customers, sale_spouse_*,
 * projects, blocks, sales, finance_receipts. Sem Split de Recebimentos.
 */

import { resolveContractLotSides } from '@/lib/contractLotBoundaries';
import { resolveIdentityDocumentFields } from '@/lib/contractIdentity';
import { extractRecantoSpouseSource, resolveSaleSpouseContext } from '@/lib/saleSpouseFields';
import { resolveBrokerFromSaleRecord } from '@/lib/saleBrokerSnapshot';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import {
  isContractSecondVendorComplete,
  parseContractSecondVendorJson,
  type ContractSecondVendorFields,
} from '@/lib/contractSecondVendor';
import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { toContractTitleCase } from '@/lib/contractTitleCase';
import {
  formatContractDueDateBr,
  formatContractSaleDateBr,
  formatContractSaleDateLongBr,
  resolveContractPaymentDates,
  type ContractFinanceReceiptRef,
} from '@/lib/contractPaymentDates';
import { resolveSalePaymentMode } from '@/lib/salePaymentMode';
import {
  resolveInstallmentPrincipal,
  splitInstallmentAmounts,
} from '@/lib/saleInstallmentCalc';
import { resolveBrokerCommissionAmount } from '@/lib/brokerCommission';
import { formatInstallmentCorrectionLabel } from '@/lib/installmentCorrectionType';
import { resolveRecantoContractProjectRecord } from '@/lib/recantoPrimaveraProjectContext';
import { sanitizeContractField } from '@/lib/recantoPrimaveraCompanyProfile';
import {
  ESTRELA_PARTNERSHIP_FIRST_VENDOR_PERCENT,
  ESTRELA_PARTNERSHIP_SECOND_VENDOR_PERCENT,
} from '@/lib/estrelaDoSulContractConstants';
import {
  formatEstrelaAreaPhrase,
  formatEstrelaBRL,
  formatEstrelaExtensoCurrency,
  formatEstrelaMetersPhrase,
  formatEstrelaMoneyPhrase,
  formatEstrelaNumber,
  formatEstrelaUpperDate,
} from '@/lib/estrelaDoSulContractFormat';

export type EstrelaDoSulContractParams = {
  tenant: Record<string, unknown>;
  customer: Record<string, unknown>;
  project: Record<string, unknown>;
  block: Record<string, unknown>;
  sale: Record<string, unknown>;
  contractSnapshot?: Record<string, unknown>;
  contractDate?: string;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
};

export type EstrelaDoSulContractContext = {
  logoUrl: string;
  companyName: string;
  companyCnpj: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyCity: string;
  companyUf: string;
  companyCep: string;
  companyCreci: string;
  legalRepName: string;
  legalRepCpf: string;
  hasSecondVendor: boolean;
  secondVendor: ContractSecondVendorFields;
  clienteNome: string;
  clienteCpf: string;
  clienteRg: string;
  clienteRgIssuer: string;
  clienteNacionalidade: string;
  clienteEstadoCivil: string;
  clienteProfissao: string;
  clienteEndereco: string;
  clienteEmail: string;
  clienteTelefone: string;
  hasConjuge: boolean;
  conjugeNome: string;
  conjugeCpf: string;
  conjugeRg: string;
  conjugeRgIssuer: string;
  conjugeNacionalidade: string;
  conjugeEstadoCivil: string;
  conjugeProfissao: string;
  conjugeEndereco: string;
  brokerNome: string;
  brokerDocumento: string;
  brokerCreci: string;
  hasBroker: boolean;
  enterpriseName: string;
  enterpriseLocation: string;
  municipality: string;
  uf: string;
  forumCity: string;
  quadra: string;
  lote: string;
  areaM2: string;
  areaPhrase: string;
  frontPhrase: string;
  backPhrase: string;
  rightPhrase: string;
  leftPhrase: string;
  confrontacoesText: string;
  partnershipNote: string;
  valorTotal: number;
  valorTotalFmt: string;
  valorTotalExtenso: string;
  valorCorretagem: number;
  valorCorretagemFmt: string;
  valorCorretagemExtenso: string;
  valorSinal: number;
  valorSinalFmt: string;
  valorSinalExtenso: string;
  valorSaldo: number;
  valorSaldoFmt: string;
  qtdParcelas: number;
  valorParcela: number;
  valorParcelaFmt: string;
  parcelasResumo: string;
  dataPrimeiraParcelaFmt: string;
  indiceCorrecaoCapa: string;
  isCashPayment: boolean;
  dataContratoFmt: string;
  dataContratoExtensoFmt: string;
  dataContratoCidadeUf: string;
  closingCityDate: string;
};

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const clean = sanitizeContractField(value);
    if (clean) return clean;
  }
  return '';
}

function formatDoc(raw: string): string {
  const digits = onlyDigits(raw);
  if (!digits) return raw;
  return formatCpfCnpj(digits) || raw;
}

function readSaleCommissionSnapshotAmount(source: unknown): number {
  if (!source || typeof source !== 'object') return 0;
  const row = source as Record<string, unknown>;
  const fromCanonical = resolveBrokerCommissionAmount(row as never);
  if (fromCanonical > 0) return fromCanonical;
  const fixed = Number(row.commission_fixed_amount);
  return Number.isFinite(fixed) && fixed > 0 ? fixed : 0;
}

/**
 * Comissão da venda: snapshot oficial (`broker_commissions` / campos da venda).
 * Não recalcula a partir da configuração atual do corretor.
 */
function resolveCommission(sale: Record<string, unknown>): number {
  const nested = sale.broker_commissions;
  if (Array.isArray(nested) && nested.length > 0) {
    for (const row of nested) {
      const amount = readSaleCommissionSnapshotAmount(row);
      if (amount > 0) return amount;
    }
    return 0;
  }
  if (nested && typeof nested === 'object') {
    return readSaleCommissionSnapshotAmount(nested);
  }
  const direct = Number(
    sale.commission_amount ??
      sale.broker_commission_amount ??
      sale.sale_commission_fixed_amount ??
      0,
  );
  if (Number.isFinite(direct) && direct > 0) return direct;
  return readSaleCommissionSnapshotAmount(sale);
}

function installmentRows(
  receipts: ContractFinanceReceiptRef[] | null | undefined,
): ContractFinanceReceiptRef[] {
  if (!Array.isArray(receipts)) return [];
  return receipts
    .filter((row) => Number(row.installment_number) > 0)
    .sort(
      (a, b) =>
        Number(a.installment_number || 0) - Number(b.installment_number || 0),
    );
}

export function buildEstrelaDoSulContractContext(
  params: EstrelaDoSulContractParams,
): EstrelaDoSulContractContext {
  const { tenant, customer, project, block, sale, contractSnapshot, financeReceipts } =
    params;
  const seller = normalizeSellerFromCompany(tenant);
  const secondVendor = parseContractSecondVendorJson(
    tenant?.contract_second_vendor_json,
  );
  const hasSecondVendor = isContractSecondVendorComplete(secondVendor);

  const companyName = pickString(
    tenant?.razao_social,
    tenant?.fantasy_name,
    tenant?.name,
    seller.razaoSocial,
  );
  const companyCnpj = formatDoc(
    pickString(tenant?.cnpj, tenant?.document, seller.cnpj),
  );
  const companyAddress = pickString(
    tenant?.address,
    tenant?.endereco,
    tenant?.contract_legal_address,
    seller.address,
  );
  const companyEmail = pickString(
    tenant?.email,
    tenant?.legal_representative_email,
    seller.email,
  );
  const companyPhone = pickString(tenant?.phone, seller.phone);
  const companyCity = toContractTitleCase(
    pickString(tenant?.city, tenant?.cidade, seller.city),
  );
  const companyUf = pickString(tenant?.state, tenant?.uf, seller.state).toUpperCase();
  const companyCep = pickString(tenant?.zip_code, tenant?.cep, seller.zip);
  const companyCreci = pickString(
    tenant?.creci,
    tenant?.company_creci,
    tenant?.real_estate_creci,
  );
  const legalRepName = pickString(
    tenant?.legal_representative,
    tenant?.responsible_name,
    seller.representative,
  );
  const legalRepCpf = formatDoc(
    pickString(
      tenant?.representative_cpf,
      tenant?.legal_representative_cpf,
      tenant?.responsible_cpf,
      seller.representativeCpf,
    ),
  );

  const clienteIdentity = resolveIdentityDocumentFields(customer);
  const clienteNome = toContractTitleCase(pickString(customer?.name));
  const clienteCpf = formatDoc(
    pickString(customer?.cpf, customer?.cpf_cnpj, customer?.document),
  );
  const clienteRg = pickString(clienteIdentity.rg);
  const clienteRgIssuer = [clienteIdentity.issuer, clienteIdentity.issuerState]
    .filter(Boolean)
    .join('/');
  const clienteNacionalidade = pickString(
    customer?.nationality,
    customer?.nacionalidade,
    'brasileiro(a)',
  );
  const clienteEstadoCivil = pickString(
    customer?.civil_state,
    customer?.marital_status,
    customer?.estado_civil,
  );
  const clienteProfissao = pickString(
    customer?.profession,
    customer?.profissao,
    'do lar',
  );
  const clienteEndereco = [
    pickString(customer?.address, customer?.endereco),
    pickString(customer?.neighborhood, customer?.bairro),
    pickString(customer?.city, customer?.cidade),
    pickString(customer?.state, customer?.uf).toUpperCase(),
  ]
    .filter(Boolean)
    .join(', ');
  const clienteEmail = pickString(customer?.email);
  const clienteTelefone = pickString(customer?.phone, customer?.whatsapp);

  const spouseCtx = resolveSaleSpouseContext(sale);
  const spouse = extractRecantoSpouseSource(sale, customer);
  const hasConjuge = spouseCtx.hasSpouse;
  const conjugeNome = toContractTitleCase(spouse?.name || '');
  const conjugeCpf = formatDoc(spouse?.cpf || '');
  const conjugeRg = spouse?.rg || '';
  const conjugeRgIssuer = spouse?.rgIssuer || '';
  const conjugeNacionalidade = spouse?.nationality || '';
  const conjugeEstadoCivil = spouse?.maritalStatus || '';
  const conjugeProfissao = spouse?.profession || '';
  const conjugeEndereco = spouse?.address || '';

  const broker = resolveBrokerFromSaleRecord(sale, { contractSnapshot });
  const brokerNome = toContractTitleCase(broker.nome);
  const hasBroker = Boolean(brokerNome);

  const projectRecord = resolveRecantoContractProjectRecord(
    project,
    sale,
    block,
    contractSnapshot,
  );
  const enterpriseName = toContractTitleCase(
    pickString(projectRecord.name, 'Chacreamento Estrela do Sul'),
  );
  const municipality = toContractTitleCase(
    pickString(projectRecord.city, companyCity),
  );
  const uf = pickString(projectRecord.uf, projectRecord.state, companyUf).toUpperCase() ||
    'PA';
  const forumCity = toContractTitleCase(
    pickString(projectRecord.forum_city, projectRecord.city, municipality),
  );
  const neighborhood = pickString(
    projectRecord.neighborhood,
    projectRecord.locality,
    projectRecord.bairro,
    projectRecord.location,
  );
  const enterpriseLocation = [neighborhood, municipality, uf]
    .filter(Boolean)
    .join(', ');

  const quadra = pickString(
    block?.block,
    block?.block_name,
    block?.quadra,
    block?.name,
  );
  const lote = pickString(block?.lot, block?.number, sale?.lot_number);

  const sides = resolveContractLotSides(block);
  const frontPhrase = formatEstrelaMetersPhrase(sides.frente);
  const backPhrase = formatEstrelaMetersPhrase(sides.fundo);
  const rightPhrase = formatEstrelaMetersPhrase(sides.ladoDireito);
  const leftPhrase = formatEstrelaMetersPhrase(sides.ladoEsquerdo);
  const confrontacoesText = [
    frontPhrase ? `${frontPhrase} de frente` : '',
    backPhrase ? `${backPhrase} de fundo` : '',
    rightPhrase ? `${rightPhrase} do lado direito` : '',
    leftPhrase ? `${leftPhrase} do lado esquerdo` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const areaNum = Number(block?.area);
  const areaM2 = Number.isFinite(areaNum) && areaNum > 0
    ? formatEstrelaNumber(areaNum)
    : '';
  const areaPhrase = formatEstrelaAreaPhrase(areaNum);

  const partnershipNote = hasSecondVendor
    ? `Será repassado ao primeiro vendedor, ${companyName || 'o VENDEDOR'}, ${ESTRELA_PARTNERSHIP_FIRST_VENDOR_PERCENT}% do valor e ${ESTRELA_PARTNERSHIP_SECOND_VENDOR_PERCENT}% ao segundo vendedor, ${secondVendor.name}, sócio citado no contrato de parceria através de boleto o qual fará a distribuição dos valores para ambas as contas, mensalmente seguindo assim até a quitação do objeto em questão.`
    : '';

  let valorTotal =
    Number(sale?.total_value) ||
    Number(sale?.agreed_price) ||
    Number(sale?.sale_price) ||
    0;
  if (!Number.isFinite(valorTotal) || valorTotal < 0) valorTotal = 0;

  const valorSinal = Math.max(0, Number(sale?.down_payment ?? sale?.signal_contract_value ?? 0));
  const valorCorretagem = resolveCommission(sale);
  const paymentMode = resolveSalePaymentMode(sale);
  const isCashPayment = paymentMode.isImmediateCash;

  const receipts = installmentRows(financeReceipts);
  const fromSaleCount = Math.max(0, Number(sale?.installments_count) || 0);
  const qtdParcelas = receipts.length > 0
    ? receipts.length
    : paymentMode.isInstallment
      ? Math.max(1, fromSaleCount)
      : fromSaleCount;

  const principal = resolveInstallmentPrincipal({
    totalValue: valorTotal,
    downPayment: valorSinal,
    contractModel: 'ESTRELA_DO_SUL',
  });
  const valorSaldo = isCashPayment ? 0 : principal;
  const splitAmounts =
    !isCashPayment && qtdParcelas > 0
      ? splitInstallmentAmounts(principal, qtdParcelas)
      : [];
  const valorParcela =
    receipts[0] && Number(receipts[0].amount) > 0
      ? Number(receipts[0].amount)
      : splitAmounts[0] || Number(sale?.installment_value) || 0;

  const paymentDates = resolveContractPaymentDates(sale, financeReceipts);
  const dataPrimeiraParcelaFmt =
    paymentDates.firstInstallmentDueFmt ||
    formatContractDueDateBr(sale?.first_installment_due_date);

  const parcelasResumo =
    !isCashPayment && qtdParcelas > 0
      ? `${qtdParcelas} (${extensoQtd(qtdParcelas)}) parcela${qtdParcelas > 1 ? 's' : ''} de ${formatEstrelaMoneyPhrase(valorParcela)}`
      : paymentMode.isSingleFuture
        ? `Pagamento único futuro de ${formatEstrelaMoneyPhrase(valorSaldo || valorTotal)}`
        : 'À vista';

  const indiceCorrecaoCapa = formatInstallmentCorrectionLabel(
    sale?.installment_correction_type,
  );

  const dataContratoFmt = formatContractSaleDateBr(sale);
  const dataContratoExtensoFmt = formatContractSaleDateLongBr(sale);
  const cityUf = [forumCity || municipality, uf].filter(Boolean).join('/');
  const upperDate = formatEstrelaUpperDate(dataContratoExtensoFmt);
  const closingCityDate = [cityUf, upperDate].filter(Boolean).join(', ');

  return {
    logoUrl: pickString(tenant?.logo_url, seller.logoUrl),
    companyName,
    companyCnpj,
    companyAddress,
    companyEmail,
    companyPhone,
    companyCity,
    companyUf,
    companyCep,
    companyCreci,
    legalRepName,
    legalRepCpf,
    hasSecondVendor,
    secondVendor,
    clienteNome,
    clienteCpf,
    clienteRg,
    clienteRgIssuer,
    clienteNacionalidade,
    clienteEstadoCivil,
    clienteProfissao,
    clienteEndereco,
    clienteEmail,
    clienteTelefone,
    hasConjuge,
    conjugeNome,
    conjugeCpf,
    conjugeRg,
    conjugeRgIssuer,
    conjugeNacionalidade,
    conjugeEstadoCivil,
    conjugeProfissao,
    conjugeEndereco,
    brokerNome,
    brokerDocumento: broker.documento,
    brokerCreci: broker.creci,
    hasBroker,
    enterpriseName,
    enterpriseLocation,
    municipality,
    uf,
    forumCity,
    quadra,
    lote,
    areaM2,
    areaPhrase,
    frontPhrase,
    backPhrase,
    rightPhrase,
    leftPhrase,
    confrontacoesText,
    partnershipNote,
    valorTotal,
    valorTotalFmt: formatEstrelaBRL(valorTotal),
    valorTotalExtenso: formatEstrelaExtensoCurrency(valorTotal),
    valorCorretagem,
    valorCorretagemFmt: formatEstrelaBRL(valorCorretagem),
    valorCorretagemExtenso: formatEstrelaExtensoCurrency(valorCorretagem),
    valorSinal,
    valorSinalFmt: formatEstrelaBRL(valorSinal),
    valorSinalExtenso: formatEstrelaExtensoCurrency(valorSinal),
    valorSaldo,
    valorSaldoFmt: formatEstrelaBRL(valorSaldo),
    qtdParcelas,
    valorParcela,
    valorParcelaFmt: formatEstrelaBRL(valorParcela),
    parcelasResumo,
    dataPrimeiraParcelaFmt,
    indiceCorrecaoCapa,
    isCashPayment,
    dataContratoFmt,
    dataContratoExtensoFmt,
    dataContratoCidadeUf: cityUf,
    closingCityDate,
  };
}

function extensoQtd(n: number): string {
  try {
    const extenso = require('extenso');
    return String(extenso(n, { mode: 'number' }));
  } catch {
    return String(n);
  }
}
