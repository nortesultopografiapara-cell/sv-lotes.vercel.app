/**
 * Contexto do contrato Chacreamento Araguaia — isolado dos demais modelos.
 */

const extenso = require('extenso');

import {
  formatAraguaiaSideMeters,
  formatAraguaiaMetersExtenso,
  resolveAraguaiaLotDescription,
} from '@/lib/araguaiaContractLot';
import { formatContractIdentityDocumentPhrase } from '@/lib/contractIdentity';
import {
  formatContractDueDateBr,
  formatContractDueDateLongBr,
  formatContractSaleDateLongBr,
  resolveContractPaymentDates,
  type ContractFinanceReceiptRef,
} from '@/lib/contractPaymentDates';
import { formatCpfCnpj } from '@/lib/inputMasks';
import {
  formatInstallmentCorrectionLabel,
  resolveSaleInstallmentCorrectionType,
} from '@/lib/installmentCorrectionType';
import {
  formatSellerCpfDisplay,
  type ProjectContractSellerParty,
} from '@/lib/projectContractSellers';
import { resolveAraguaiaPromitenteVendors } from '@/lib/araguaiaCompanyLegalRepresentative';
import { resolveAraguaiaIntervenientIdentity } from '@/lib/araguaiaIntervenientIdentity';
import { shouldEnableAraguaiaEsignV2 } from '@/lib/araguaiaEsignV2Gate';
import { resolveSaleSpouseContext } from '@/lib/saleSpouseFields';
import { toContractTitleCase } from '@/lib/contractTitleCase';

export type AraguaiaContractParams = {
  tenant: Record<string, unknown> | null | undefined;
  customer: Record<string, unknown> | null | undefined;
  project: Record<string, unknown> | null | undefined;
  block: Record<string, unknown> | null | undefined;
  sale: Record<string, unknown> | null | undefined;
  contractSnapshot?: Record<string, unknown> | null;
  /** Força path V2 (senão usa gate env + allowlist). */
  esignV2?: boolean;
  contractDate?: string;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
  projectBlocks?: Record<string, unknown>[] | null;
  streetGuides?: Record<string, unknown>[] | null;
};

export type AraguaiaContractContext = {
  sellers: ProjectContractSellerParty[];
  intervenienteName: string;
  intervenienteCnpj: string;
  intervenienteAddress: string;
  intervenienteCityUf: string;
  intervenienteRepresentativeName: string;
  intervenienteRepresentativeCpf: string;
  buyerName: string;
  buyerNationality: string;
  buyerMaritalStatus: string;
  buyerProfession: string;
  buyerCpf: string;
  buyerRgLine: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
  hasSpouse: boolean;
  spouseQualificationHtml: string;
  spouseName: string;
  spouseCpf: string;
  chacaraNumber: string;
  quadra: string;
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
  confrontanteFrente: string;
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
  correctionLabel: string;
  brokerName: string;
  brokerCpf: string;
  cityUf: string;
  contractDateLong: string;
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

/** Área por extenso — exclusivo Araguaia (não altera formatArea global). */
export function formatAraguaiaAreaExtenso(areaM2: number | null): string {
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
  return parts.join(', ');
}

function resolveBroker(sale: Record<string, unknown>): {
  name: string;
  cpf: string;
} {
  const nested =
    (sale.brokers as Record<string, unknown> | undefined) ||
    (sale.broker as Record<string, unknown> | undefined) ||
    {};
  return {
    name: toContractTitleCase(clean(nested.name || sale.broker_name)),
    cpf: formatSellerCpfDisplay(clean(nested.cpf || sale.broker_cpf)),
  };
}

export function buildAraguaiaContractContext(
  params: AraguaiaContractParams,
): AraguaiaContractContext {
  const tenant = params.tenant || {};
  const customer = params.customer || {};
  const project = params.project || {};
  const block = params.block || {};
  const sale = params.sale || {};
  const pendingFields: string[] = [];

  const companyId = tenant?.id ? String(tenant.id) : null;
  const esignV2 =
    params.esignV2 === true ||
    shouldEnableAraguaiaEsignV2({
      companyId,
      contractModel: 'ARAGUAIA',
    });
  const vendorMode = esignV2 ? 'v2' : 'legacy';

  const sellers = resolveAraguaiaPromitenteVendors({
    company: tenant,
    project: esignV2 ? null : project,
    contractModel: 'ARAGUAIA',
    mode: vendorMode,
  });
  if (sellers.length < 1) {
    pendingFields.push(
      esignV2
        ? 'Representante Legal da empresa (Configurações)'
        : 'promitentes vendedores do empreendimento',
    );
  }
  for (const s of sellers) {
    if (!s.nationality) pendingFields.push(`nacionalidade de ${s.name}`);
    if (!s.maritalStatus) pendingFields.push(`estado civil de ${s.name}`);
    if (!s.profession) pendingFields.push(`profissão de ${s.name}`);
    if (!s.address) pendingFields.push(`endereço de ${s.name}`);
  }

  const intervenienteId = resolveAraguaiaIntervenientIdentity({
    company: tenant,
    mode: vendorMode,
  });
  const intervenienteName = intervenienteId.companyName;
  const intervenienteCnpj = intervenienteId.companyCnpjDisplay;
  const intervenienteAddress =
    clean(tenant.address || tenant.endereco) || 'endereço não informado';
  const intervenienteCityUf = [clean(tenant.city || tenant.cidade), clean(tenant.state || tenant.uf)]
    .filter(Boolean)
    .join('/');

  const buyerName = toContractTitleCase(
    clean(customer.name || customer.full_name) || 'NOME COMPLETO',
  );
  if (!clean(customer.name || customer.full_name)) pendingFields.push('nome do comprador');

  const buyerNationality =
    toContractTitleCase(clean(customer.nationality || customer.nacionalidade)) ||
    'Brasileira';
  const buyerMaritalStatus =
    toContractTitleCase(clean(customer.civil_state || customer.marital_status)) ||
    'não informado';
  const buyerProfession =
    toContractTitleCase(clean(customer.profession || customer.profissao)) ||
    'não informado';
  const buyerCpf =
    formatCpfCnpj(clean(customer.cpf_cnpj || customer.document || customer.cpf)) ||
    'não informado';
  const buyerRgPhrase = formatContractIdentityDocumentPhrase(customer);
  const buyerRgLine = buyerRgPhrase
    ? buyerRgPhrase.replace(/^Portador da Cédula de Identidade\s*/i, '')
    : 'não informado';
  const buyerEmail = clean(customer.email) || 'não informado';
  const buyerPhone =
    clean(customer.phone || customer.whatsapp || customer.mobile) || 'não informado';
  const buyerAddress = buildBuyerAddress(customer) || 'não informado';

  if (buyerMaritalStatus === 'não informado') pendingFields.push('estado civil do comprador');
  if (buyerProfession === 'não informado') pendingFields.push('profissão do comprador');
  if (buyerEmail === 'não informado') pendingFields.push('e-mail do comprador');
  if (buyerPhone === 'não informado') pendingFields.push('telefone/WhatsApp do comprador');
  if (buyerAddress === 'não informado') pendingFields.push('endereço do comprador');

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
      sp.nationality ? `nacionalidade ${toContractTitleCase(sp.nationality)}` : '',
      sp.maritalStatus ? toContractTitleCase(sp.maritalStatus) : '',
      sp.profession ? `profissão ${toContractTitleCase(sp.profession)}` : '',
      spouseCpf ? `CPF nº ${spouseCpf}` : '',
      sp.rg ? `RG nº ${sp.rg}${sp.issuer ? ` — ${sp.issuer}` : ''}` : '',
      sp.address ? `residente em ${sp.address}` : '',
    ].filter(Boolean);
    spouseQualificationHtml = escapeHtml(parts.join(', '));
  }

  const lot = resolveAraguaiaLotDescription({
    block,
    project,
    projectBlocks: params.projectBlocks,
    streetGuides: params.streetGuides,
  });
  const chacaraNumber =
    clean(block.number || block.lot || block.lot_number) || 'não informado';
  const quadra =
    clean(block.block_name || block.block || block.quadra) || '';
  if (chacaraNumber === 'não informado') pendingFields.push('número da chácara');
  if (lot.confrontations.frente === 'a definir') pendingFields.push('confrontante da frente');
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

  const correctionType = resolveSaleInstallmentCorrectionType(sale);
  const correctionLabel = formatInstallmentCorrectionLabel(correctionType);

  const broker = resolveBroker(sale);
  if (!broker.name) pendingFields.push('corretor');

  const city =
    clean(project.city || project.cidade) ||
    clean(tenant.city || tenant.cidade) ||
    '';
  const uf =
    clean(project.uf || project.state) ||
    clean(tenant.state || tenant.uf) ||
    '';
  const cityUf = [city, uf].filter(Boolean).join('/');
  const contractDateLong =
    formatContractSaleDateLongBr({
      ...sale,
      ...(params.contractDate ? { sale_date: params.contractDate } : {}),
    }) || formatContractSaleDateLongBr(sale);
  // Fecho do original: "Parauapebas – PA, …" (data dinâmica).
  const closingLine = `Parauapebas – PA, ${
    contractDateLong || '___ de _____________ de ______'
  }.`;

  return {
    sellers,
    intervenienteName,
    intervenienteCnpj,
    intervenienteAddress,
    intervenienteCityUf,
    intervenienteRepresentativeName: intervenienteId.representativeName,
    intervenienteRepresentativeCpf: intervenienteId.representativeCpfDigits,
    buyerName,
    buyerNationality,
    buyerMaritalStatus,
    buyerProfession,
    buyerCpf,
    buyerRgLine,
    buyerEmail,
    buyerPhone,
    buyerAddress,
    hasSpouse,
    spouseQualificationHtml,
    spouseName,
    spouseCpf,
    chacaraNumber,
    quadra,
    areaFmt: formatAreaNumber(lot.areaM2),
    areaExtenso: formatAraguaiaAreaExtenso(lot.areaM2),
    frenteM: formatAraguaiaSideMeters(lot.sides.frente),
    fundoM: formatAraguaiaSideMeters(lot.sides.fundo),
    ladoDireitoM: formatAraguaiaSideMeters(lot.sides.ladoDireito),
    ladoEsquerdoM: formatAraguaiaSideMeters(lot.sides.ladoEsquerdo),
    frenteMExtenso: formatAraguaiaMetersExtenso(lot.sides.frente),
    fundoMExtenso: formatAraguaiaMetersExtenso(lot.sides.fundo),
    ladoDireitoMExtenso: formatAraguaiaMetersExtenso(lot.sides.ladoDireito),
    ladoEsquerdoMExtenso: formatAraguaiaMetersExtenso(lot.sides.ladoEsquerdo),
    confrontanteFrente: lot.confrontations.frente,
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
    correctionLabel,
    brokerName: broker.name || 'não informado',
    brokerCpf: broker.cpf || '',
    cityUf,
    contractDateLong,
    closingLine,
    pendingFields: [...new Set(pendingFields)],
  };
}
