/**
 * Contexto do contrato Chacreamento Mundo Novo — isolado do ARAGUAIA.
 */

const extenso = require('extenso');

import { formatContractIdentityDocumentPhrase } from '@/lib/contractIdentity';
import {
  formatContractDueDateBr,
  formatContractDueDateLongBr,
  formatContractSaleDateLongBr,
  resolveContractPaymentDates,
  type ContractFinanceReceiptRef,
} from '@/lib/contractPaymentDates';
import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';
import { formatCpfCnpj } from '@/lib/inputMasks';
import { resolveSaleSpouseContext } from '@/lib/saleSpouseFields';
import { toContractTitleCase } from '@/lib/contractTitleCase';
import { resolveLoteFromBlock } from '@/lib/saleBlockLotLabel';
import type { ProjectContractSellerParty } from '@/lib/projectContractSellers';
import {
  formatMundoNovoMetersExtenso,
  formatMundoNovoSideMeters,
  resolveMundoNovoLotDescription,
} from '@/lib/mundoNovoContractLot';
import {
  inflectMundoNovoContractParties,
  inflectMundoNovoSingleParty,
  type MundoNovoPartyInflection,
} from '@/lib/mundoNovoContractPartyInflection';
import {
  formatMundoNovoNeutralMaritalStatus,
  formatMundoNovoNeutralNationality,
  formatMundoNovoPresentedResidence,
  formatMundoNovoRgAfterNumeroLabel,
  formatMundoNovoSeatAddressFromCompany,
  stripMundoNovoPresentedSnToken,
  stripMundoNovoRgLabelPrefix,
} from '@/lib/mundoNovoContractQualification';
import {
  resolveMundoNovoPromitenteVendors,
} from '@/lib/mundoNovoContractSellers';

export type MundoNovoContractParams = {
  tenant: Record<string, unknown> | null | undefined;
  customer: Record<string, unknown> | null | undefined;
  project: Record<string, unknown> | null | undefined;
  block: Record<string, unknown> | null | undefined;
  sale: Record<string, unknown> | null | undefined;
  contractSnapshot?: Record<string, unknown> | null;
  contractDate?: string;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
  projectBlocks?: Record<string, unknown>[] | null;
  streetGuides?: Record<string, unknown>[] | null;
};

export type MundoNovoContractContext = {
  sellers: ProjectContractSellerParty[];
  intervenienteName: string;
  intervenienteCnpj: string;
  intervenienteAddress: string;
  buyerName: string;
  buyerNationality: string;
  buyerMaritalStatus: string;
  buyerProfession: string;
  buyerCpf: string;
  buyerRgLine: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
  buyerInflection: MundoNovoPartyInflection;
  vendorInflection: MundoNovoPartyInflection;
  vendorSignatureLabels: string[];
  buyerSignatureLabel: string;
  hasSpouse: boolean;
  spouseQualificationHtml: string;
  spouseName: string;
  spouseCpf: string;
  chacaraNumber: string;
  areaFmt: string;
  areaExtenso: string;
  frenteM: string;
  fundoM: string;
  ladoDireitoM: string;
  ladoEsquerdoM: string;
  frenteMExtenso: string;
  fundoMExtenso: string;
  ladoDireitoMExtenso: string;
  ladoEsquerdoMExtenso: string;
  confrontanteFundo: string;
  confrontanteDireita: string;
  confrontanteEsquerda: string;
  valorTotalFmt: string;
  valorTotalExtenso: string;
  entradaFmt: string;
  entradaExtenso: string;
  qtdParcelas: number;
  parcelaFmt: string;
  parcelaExtenso: string;
  primeiroVencimentoFmt: string;
  primeiroVencimentoLong: string;
  brokerName: string;
  closingLine: string;
  pendingFields: string[];
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

function currencyExtenso(val: number): string {
  if (!(val > 0)) return '';
  try {
    return extenso(val.toFixed(2).replace('.', ','), { mode: 'currency' });
  } catch {
    return '';
  }
}

export function formatMundoNovoAreaExtenso(areaM2: number | null): string {
  if (areaM2 == null || !Number.isFinite(areaM2) || areaM2 <= 0) return '';
  try {
    const whole = Math.floor(Math.abs(areaM2));
    const cents = Math.round((Math.abs(areaM2) - whole) * 100);
    let text = extenso(String(whole));
    if (cents > 0) {
      text += ` vírgula ${extenso(String(cents))}`;
    }
    return `${text} metros quadrados`;
  } catch {
    return '';
  }
}

function formatAreaNumber(areaM2: number | null): string {
  if (areaM2 == null || !Number.isFinite(areaM2)) return 'não informado';
  return (
    areaM2.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' m²'
  );
}

function buildBuyerAddress(customer: Record<string, unknown>): string {
  const parts = [
    clean(customer.address || customer.endereco),
    clean(customer.neighborhood || customer.bairro),
    clean(customer.city || customer.cidade),
    clean(customer.state || customer.state_uf || customer.uf),
    clean(customer.zip_code || customer.cep),
  ].filter(Boolean);
  return stripMundoNovoPresentedSnToken(parts.join(', '));
}

function resolveBrokerName(sale: Record<string, unknown>): string {
  const nested =
    (sale.brokers as Record<string, unknown> | undefined) ||
    (sale.broker as Record<string, unknown> | undefined) ||
    {};
  return toContractTitleCase(clean(nested.name || sale.broker_name));
}

export function buildMundoNovoContractContext(
  params: MundoNovoContractParams,
): MundoNovoContractContext {
  const tenant = params.tenant || {};
  const customer = params.customer || {};
  const project = params.project || {};
  const block = params.block || {};
  const sale = params.sale || {};
  const pendingFields: string[] = [];

  const sellers = resolveMundoNovoPromitenteVendors({ project }).map((seller) => ({
    ...seller,
    address: formatMundoNovoPresentedResidence(seller.address),
  }));
  for (const s of sellers) {
    if (!s.nationality) pendingFields.push(`nacionalidade de ${s.name}`);
    if (!s.maritalStatus) pendingFields.push(`estado civil de ${s.name}`);
    if (!s.profession) pendingFields.push(`profissão de ${s.name}`);
    if (!s.rg) pendingFields.push(`RG de ${s.name}`);
    if (!s.address) pendingFields.push(`endereço de ${s.name}`);
  }

  const intervenienteName =
    clean(tenant.razao_social) ||
    clean(tenant.legal_name) ||
    getCompanyDisplayName(tenant);
  const intervenienteCnpj =
    formatCpfCnpj(clean(tenant.cnpj || tenant.document)) || '';
  const intervenienteAddress = formatMundoNovoSeatAddressFromCompany(tenant);

  const buyerName = toContractTitleCase(
    clean(customer.name || customer.full_name) || 'NOME COMPLETO',
  );
  if (!clean(customer.name || customer.full_name)) pendingFields.push('nome do comprador');

  const rawBuyerNationality = clean(customer.nationality || customer.nacionalidade);
  const buyerNationality = formatMundoNovoNeutralNationality(rawBuyerNationality);
  if (!rawBuyerNationality) pendingFields.push('nacionalidade do comprador');
  const buyerMaritalStatus =
    formatMundoNovoNeutralMaritalStatus(
      clean(customer.civil_state || customer.marital_status),
    ) || 'não informado';
  const buyerProfession =
    toContractTitleCase(clean(customer.profession || customer.profissao)) ||
    'não informado';
  const buyerCpf =
    formatCpfCnpj(clean(customer.cpf_cnpj || customer.document || customer.cpf)) ||
    'não informado';
  const customerForRg = {
    ...customer,
    rg: stripMundoNovoRgLabelPrefix(
      String(customer.rg_number || customer.rg || customer.document_rg || ''),
    ),
    rg_number: stripMundoNovoRgLabelPrefix(
      String(customer.rg_number || customer.rg || customer.document_rg || ''),
    ),
  };
  const buyerRgPhrase = formatContractIdentityDocumentPhrase(customerForRg);
  const buyerRgLine = buyerRgPhrase
    ? formatMundoNovoRgAfterNumeroLabel(
        buyerRgPhrase.replace(/^Portador da Cédula de Identidade\s*/i, ''),
      )
    : 'não informado';
  const buyerEmail = clean(customer.email) || 'não informado';
  const buyerPhone =
    clean(customer.phone || customer.whatsapp || customer.mobile) || 'não informado';
  const buyerAddress = buildBuyerAddress(customer) || 'não informado';
  const buyerInflection = inflectMundoNovoContractParties(
    [
      {
        maritalStatus: clean(customer.civil_state || customer.marital_status),
        nationality: rawBuyerNationality,
      },
    ],
    'buyer',
  );
  const vendorInflection = inflectMundoNovoContractParties(
    sellers.map((s) => ({
      maritalStatus: s.maritalStatus,
      nationality: s.nationality,
    })),
    'vendor',
  );
  const vendorSignatureLabels = sellers.map(
    (s) =>
      inflectMundoNovoSingleParty(
        { maritalStatus: s.maritalStatus, nationality: s.nationality },
        'vendor',
      ).label,
  );
  const buyerSignatureLabel = buyerInflection.label;

  const spouseCtx = resolveSaleSpouseContext(sale);
  const hasSpouse = Boolean(spouseCtx.hasSpouse && spouseCtx.spouse?.name);
  let spouseQualificationHtml = '';
  let spouseName = '';
  let spouseCpf = '';
  if (hasSpouse && spouseCtx.spouse) {
    const sp = spouseCtx.spouse;
    spouseName = toContractTitleCase(sp.name || '');
    spouseCpf = formatCpfCnpj(sp.cpf) || sp.cpf || '';
    const parts = [
      spouseName,
      sp.nationality ? formatMundoNovoNeutralNationality(sp.nationality) : '',
      sp.maritalStatus ? formatMundoNovoNeutralMaritalStatus(sp.maritalStatus) : '',
      sp.profession ? `profissão ${toContractTitleCase(sp.profession)}` : '',
      spouseCpf ? `CPF nº ${spouseCpf}` : '',
      sp.rg
        ? `RG nº ${formatMundoNovoRgAfterNumeroLabel(sp.rg)}${
            sp.issuer ? ` — ${sp.issuer}` : ''
          }`
        : '',
      sp.address ? `residente em ${sp.address}` : '',
    ].filter(Boolean);
    spouseQualificationHtml = escapeHtml(parts.join(', '));
  }

  const lot = resolveMundoNovoLotDescription({
    block,
    project,
    projectBlocks: params.projectBlocks,
    streetGuides: params.streetGuides,
  });
  const chacaraNumber = resolveLoteFromBlock(block) || 'não informado';
  if (chacaraNumber === 'não informado') pendingFields.push('número da chácara');
  if (lot.confrontations.fundo === 'a definir') pendingFields.push('confrontante dos fundos');
  if (lot.confrontations.ladoDireito === 'a definir') {
    pendingFields.push('confrontante da lateral direita');
  }
  if (lot.confrontations.ladoEsquerdo === 'a definir') {
    pendingFields.push('confrontante da lateral esquerda');
  }

  const valTotal =
    Number(sale.total_value) ||
    Number(sale.final_value) ||
    Number(sale.agreed_price) ||
    Number(block.price) ||
    0;
  const valEntrada = Number(sale.down_payment || 0);
  const qtdParcelas = Number(sale.installments_count) || 0;
  let valorParcela = Number(sale.installment_value) || 0;
  if (!(valorParcela > 0) && qtdParcelas > 0) {
    valorParcela = (valTotal - valEntrada) / qtdParcelas;
  }
  const receipts = params.financeReceipts || null;
  if (receipts?.length) {
    const firstInstallment = receipts
      .filter((r) => Number(r.installment_number) >= 1)
      .sort((a, b) => Number(a.installment_number) - Number(b.installment_number))[0];
    if (firstInstallment && Number(firstInstallment.amount) > 0) {
      valorParcela = Number(firstInstallment.amount);
    }
  }

  const paymentDates = resolveContractPaymentDates(sale, receipts);
  const primeiroVencimentoRaw = paymentDates.firstInstallmentDueRaw || '';
  const primeiroVencimentoFmt =
    paymentDates.firstInstallmentDueFmt ||
    formatContractDueDateBr(primeiroVencimentoRaw);
  const primeiroVencimentoLong =
    formatContractDueDateLongBr(primeiroVencimentoRaw) || primeiroVencimentoFmt;

  const brokerName = resolveBrokerName(sale) || 'não informado';
  if (brokerName === 'não informado') pendingFields.push('corretor');

  const contractDateLong =
    formatContractSaleDateLongBr({
      ...sale,
      ...(params.contractDate ? { sale_date: params.contractDate } : {}),
    }) || formatContractSaleDateLongBr(sale);
  const closingLine = `Parauapebas – PA, ${
    contractDateLong || '___ de _____________ de ______'
  }.`;

  return {
    sellers,
    intervenienteName,
    intervenienteCnpj,
    intervenienteAddress,
    buyerName,
    buyerNationality,
    buyerMaritalStatus,
    buyerProfession,
    buyerCpf,
    buyerRgLine,
    buyerEmail,
    buyerPhone,
    buyerAddress,
    buyerInflection,
    vendorInflection,
    vendorSignatureLabels,
    buyerSignatureLabel,
    hasSpouse,
    spouseQualificationHtml,
    spouseName,
    spouseCpf,
    chacaraNumber,
    areaFmt: formatAreaNumber(lot.areaM2),
    areaExtenso: formatMundoNovoAreaExtenso(lot.areaM2),
    frenteM: formatMundoNovoSideMeters(lot.sides.frente),
    fundoM: formatMundoNovoSideMeters(lot.sides.fundo),
    ladoDireitoM: formatMundoNovoSideMeters(lot.sides.ladoDireito),
    ladoEsquerdoM: formatMundoNovoSideMeters(lot.sides.ladoEsquerdo),
    frenteMExtenso: formatMundoNovoMetersExtenso(lot.sides.frente),
    fundoMExtenso: formatMundoNovoMetersExtenso(lot.sides.fundo),
    ladoDireitoMExtenso: formatMundoNovoMetersExtenso(lot.sides.ladoDireito),
    ladoEsquerdoMExtenso: formatMundoNovoMetersExtenso(lot.sides.ladoEsquerdo),
    confrontanteFundo: lot.confrontations.fundo,
    confrontanteDireita: lot.confrontations.ladoDireito,
    confrontanteEsquerda: lot.confrontations.ladoEsquerdo,
    valorTotalFmt: formatBRL(valTotal),
    valorTotalExtenso: currencyExtenso(valTotal),
    entradaFmt: formatBRL(valEntrada),
    entradaExtenso: currencyExtenso(valEntrada),
    qtdParcelas,
    parcelaFmt: formatBRL(valorParcela),
    parcelaExtenso: currencyExtenso(valorParcela),
    primeiroVencimentoFmt,
    primeiroVencimentoLong,
    brokerName,
    closingLine,
    pendingFields: [...new Set(pendingFields)],
  };
}
