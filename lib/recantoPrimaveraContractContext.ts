/**
 * Contexto isolado do contrato Recanto Primavera — não afeta Meneses/PADRAO.
 */

const extenso = require('extenso');

import { resolveLotMeasuresFromBlock } from '@/lib/lotChanfre';
import { formatCurveClause } from '@/lib/officialLotMeasurements';
import {
  getCompanyDisplayName,
  normalizeCompanyAddressLine,
} from '@/lib/contractCompanyDisplay';
import {
  formatContractLotBoundariesClause,
  resolveContractLotSides,
} from '@/lib/contractLotBoundaries';
import {
  formatContractIdentityDocumentSuffix,
  formatContractSpouseQualificationSuffix,
  resolveIdentityDocumentFields,
} from '@/lib/contractIdentity';
import {
  buildSaleContractElectronicSignatureClauseHtml,
  isSaleContractCashPayment,
} from '@/lib/saleContractLegalTemplate';
import {
  resolveContractPaymentDates,
  type ContractFinanceReceiptRef,
} from '@/lib/contractPaymentDates';
import {
  normalizeRecantoPrimaveraCompanyProfile,
  sanitizeContractField,
  type RecantoPrimaveraCompanyProfile,
} from '@/lib/recantoPrimaveraCompanyProfile';

export type RecantoPrimaveraContractParams = {
  tenant: Record<string, unknown>;
  customer: Record<string, unknown>;
  project: Record<string, unknown>;
  block: Record<string, unknown>;
  sale: Record<string, unknown>;
  contractSnapshot?: Record<string, unknown>;
  contractDate?: string;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
};

export type RecantoPrimaveraContractContext = {
  profile: RecantoPrimaveraCompanyProfile;
  empresaLogoHtml: string;
  empresaAssinatura: string;
  titleLine1: string;
  titleLine2: string;
  clienteNome: string;
  clienteCpfCnpj: string;
  clienteRg: string;
  clienteRgIssuer: string;
  clienteProfissao: string;
  clienteEstadoCivil: string;
  clienteNacionalidade: string;
  clienteTelefone: string;
  clienteEmail: string;
  clienteEndereco: string;
  clienteBairro: string;
  clienteCidade: string;
  clienteUf: string;
  clienteCep: string;
  clienteIdentitySuffix: string;
  clienteConjugeSuffix: string;
  quadra: string;
  lote: string;
  lotArea: string;
  lotSidesText: string;
  lotBoundariesClause: string;
  curvaClause: string;
  enterpriseLocationSuffix: string;
  enterpriseDescString: string;
  foroText: string;
  valorTotalFmt: string;
  valorTotalExtenso: string;
  valorEntradaFmt: string;
  valorEntradaExtenso: string;
  valorSaldoFmt: string;
  valorSaldoExtenso: string;
  valorParcelaFmt: string;
  valorParcelaExtenso: string;
  qtdParcelas: number;
  isCashPayment: boolean;
  tipoVenda: string;
  dataPrimeiraParcelaFmt: string;
  dataUltimaParcelaFmt: string;
  bankPaymentText: string;
  brokerNome: string;
  brokerDocumento: string;
  brokerCreci: string;
  brokerClauseHtml: string;
  dataContratoFmt: string;
  dataContratoCidade: string;
  dataContratoUf: string;
  electronicSignatureClauseHtml: string;
};

function formatBRL(val: number): string {
  if (!Number.isFinite(val) || val < 0) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase())
    .replace(/\bS\/n\b/g, 'S/N');
}

function formatCNPJCPF(val: string): string {
  const clean = sanitizeContractField(val);
  if (!clean) return '';
  const numeric = clean.replace(/\D/g, '');
  if (numeric.length === 14) {
    return numeric.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  if (numeric.length === 11) {
    return numeric.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return clean;
}

function isValidField(v: unknown): v is string {
  return !!sanitizeContractField(v);
}

function formatArea(val: unknown): string {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return '';
  return (
    num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' m²'
  );
}

function formatExtensoCurrency(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '';
  try {
    return extenso(val.toFixed(2).replace('.', ','), { mode: 'currency' });
  } catch {
    return '';
  }
}

function resolveBroker(sale: Record<string, unknown>) {
  const brokers =
    sale.brokers && typeof sale.brokers === 'object'
      ? (sale.brokers as Record<string, unknown>)
      : null;
  const broker =
    sale.broker && typeof sale.broker === 'object'
      ? (sale.broker as Record<string, unknown>)
      : null;

  const nome = toTitleCase(
    sanitizeContractField(
      brokers?.name ?? broker?.name ?? sale.broker_name,
    ),
  );
  const documento = formatCNPJCPF(
    sanitizeContractField(
      brokers?.document ??
        brokers?.cpf ??
        broker?.document ??
        broker?.cpf ??
        sale.broker_cpf,
    ),
  );
  const creci = sanitizeContractField(
    brokers?.creci ?? broker?.creci ?? sale.broker_creci,
  );

  return { nome, documento, creci };
}

function buildBankPaymentText(profile: RecantoPrimaveraCompanyProfile): string {
  const parts: string[] = [];
  if (profile.bankName) parts.push(`Banco <strong>${profile.bankName}</strong>`);
  if (profile.bankBranch) parts.push(`Agência <strong>${profile.bankBranch}</strong>`);
  if (profile.bankAccount) parts.push(`Conta <strong>${profile.bankAccount}</strong>`);
  if (profile.bankPix) parts.push(`PIX <strong>${profile.bankPix}</strong>`);
  if (profile.bankBeneficiary) {
    parts.push(`Favorecido(a) <strong>${profile.bankBeneficiary}</strong>`);
  }
  if (parts.length === 0) return '';
  return parts.join(', ');
}

export function buildRecantoPrimaveraContractContext(
  params: RecantoPrimaveraContractParams,
): RecantoPrimaveraContractContext {
  const {
    tenant,
    customer,
    project,
    block,
    sale,
    contractSnapshot,
    contractDate,
    financeReceipts,
  } = params;

  const profile = normalizeRecantoPrimaveraCompanyProfile(tenant);

  const empresaLogoHtml = profile.logoUrl
    ? `<img src="${profile.logoUrl}" alt="Logo" style="max-height: 72px; max-width: 220px; object-fit: contain; margin-bottom: 12px;" />`
    : '';
  const empresaAssinatura = profile.signatureUrl
    ? `<img src="${profile.signatureUrl}" style="max-height: 56px; margin-bottom: 8px;" alt="Assinatura"/>`
    : '';

  const clienteIdentity = resolveIdentityDocumentFields(customer);
  const clienteNome = toTitleCase(
    sanitizeContractField(customer?.name) || 'Comprador',
  );
  const clienteCpfCnpj = formatCNPJCPF(
    sanitizeContractField(customer?.document || customer?.cpf),
  );
  const clienteRg = sanitizeContractField(clienteIdentity.rg);
  const clienteRgIssuer = [
    clienteIdentity.issuer,
    clienteIdentity.issuerState,
  ]
    .filter(Boolean)
    .join('/');

  const quadra =
    sanitizeContractField(block?.block) ||
    sanitizeContractField(block?.block_name) ||
    sanitizeContractField(block?.quadra) ||
    sanitizeContractField((sale?.blocks as { block_name?: string } | undefined)?.block_name) ||
    sanitizeContractField(block?.name) ||
    '';

  const lote =
    sanitizeContractField(block?.lot) ||
    sanitizeContractField(block?.number) ||
    sanitizeContractField(sale?.lot_number) ||
    sanitizeContractField((sale?.blocks as { number?: string } | undefined)?.number) ||
    '';

  const lotBoundariesClause = formatContractLotBoundariesClause({ block: block || {} });
  const { curva: curvaInfo } = resolveLotMeasuresFromBlock(block);
  const curvaClause =
    curvaInfo && curvaInfo.totalLength > 0 ? formatCurveClause(curvaInfo) : '';

  const sides = resolveContractLotSides(block);
  const lotSidesText = [
    sides.frente ? `frente ${Number(sides.frente).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : '',
    sides.fundo ? `fundo ${Number(sides.fundo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : '',
    sides.ladoDireito ? `lado direito ${Number(sides.ladoDireito).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : '',
    sides.ladoEsquerdo ? `lado esquerdo ${Number(sides.ladoEsquerdo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const enterpriseLocationSuffix = profile.enterpriseLocation
    ? `, situado em <strong>${profile.enterpriseLocation}</strong>`
    : '';

  const enterpriseDescParts: string[] = [];
  if (profile.enterpriseName) {
    enterpriseDescParts.push(
      `integrante do empreendimento <strong>${profile.enterpriseName.toUpperCase()}</strong>`,
    );
  }
  if (profile.enterpriseMunicipality && profile.enterpriseUf) {
    enterpriseDescParts.push(
      `localizado no município de <strong>${profile.enterpriseMunicipality} - ${profile.enterpriseUf}</strong>`,
    );
  }
  const enterpriseDescString =
    enterpriseDescParts.length > 0 ? `, ${enterpriseDescParts.join(', ')}` : '';

  const foroCidade = profile.forumCity || profile.enterpriseMunicipality || profile.city;
  const foroUf = profile.enterpriseUf || profile.state;
  let foroText = 'competente';
  if (foroCidade && foroUf) {
    foroText = `da Comarca de <strong>${foroCidade} - ${foroUf}</strong>`;
  } else if (foroCidade) {
    foroText = `da Comarca de <strong>${foroCidade}</strong>`;
  }

  let valTotal =
    Number(sale?.total_value) ||
    Number(sale?.agreed_price) ||
    Number(sale?.sale_price) ||
    Number(block?.price) ||
    0;
  if (valTotal <= 0 && sale?.receipts_sum) valTotal = Number(sale.receipts_sum);
  if (!Number.isFinite(valTotal) || valTotal < 0) valTotal = 0;

  const valEntrada = Math.max(0, Number(sale?.down_payment || 0));
  const valorSaldo = Math.max(0, valTotal - valEntrada);
  const qtdParcelas = Math.max(1, Number(sale?.installments_count) || 1);
  const valorParcela =
    qtdParcelas > 0 && !isSaleContractCashPayment(sale) ? valorSaldo / qtdParcelas : 0;

  const paymentDates = resolveContractPaymentDates(sale, financeReceipts);
  const broker = resolveBroker(sale);

  const brokerClauseHtml =
    broker.nome
      ? `<p style="margin-bottom: 0;"><strong>Intermediação:</strong> A presente transação foi intermediada por <strong>${broker.nome}</strong>${broker.documento ? `, inscrito(a) no CPF/CNPJ sob o nº <strong>${broker.documento}</strong>` : ''}${broker.creci ? `, CRECI <strong>${broker.creci}</strong>` : ''}.</p>`
      : '';

  const dContrato = new Date(
    sanitizeContractField(contractDate) ||
      sanitizeContractField(sale?.created_at) ||
      new Date().toISOString(),
  );

  return {
    profile,
    empresaLogoHtml,
    empresaAssinatura,
    titleLine1: 'INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA',
    titleLine2: profile.enterpriseName || getCompanyDisplayName(tenant),
    clienteNome,
    clienteCpfCnpj,
    clienteRg,
    clienteRgIssuer,
    clienteProfissao: toTitleCase(
      sanitizeContractField(customer?.profession),
    ),
    clienteEstadoCivil: toTitleCase(
      sanitizeContractField(customer?.civil_state || customer?.marital_status),
    ),
    clienteNacionalidade: toTitleCase(
      sanitizeContractField(customer?.nationality) || 'Brasileira',
    ),
    clienteTelefone: sanitizeContractField(customer?.phone),
    clienteEmail: sanitizeContractField(customer?.email),
    clienteEndereco: toTitleCase(
      sanitizeContractField(customer?.address || customer?.street),
    ),
    clienteBairro: toTitleCase(sanitizeContractField(customer?.neighborhood)),
    clienteCidade: toTitleCase(sanitizeContractField(customer?.city)),
    clienteUf: sanitizeContractField(customer?.state_uf || customer?.state).toUpperCase(),
    clienteCep: sanitizeContractField(customer?.zip_code || customer?.cep),
    clienteIdentitySuffix: formatContractIdentityDocumentSuffix(customer),
    clienteConjugeSuffix: formatContractSpouseQualificationSuffix(customer),
    quadra,
    lote,
    lotArea: formatArea(block?.area),
    lotSidesText,
    lotBoundariesClause,
    curvaClause,
    enterpriseLocationSuffix,
    enterpriseDescString,
    foroText,
    valorTotalFmt: formatBRL(valTotal),
    valorTotalExtenso: formatExtensoCurrency(valTotal),
    valorEntradaFmt: formatBRL(valEntrada),
    valorEntradaExtenso: formatExtensoCurrency(valEntrada),
    valorSaldoFmt: formatBRL(valorSaldo),
    valorSaldoExtenso: formatExtensoCurrency(valorSaldo),
    valorParcelaFmt: formatBRL(valorParcela),
    valorParcelaExtenso: formatExtensoCurrency(valorParcela),
    qtdParcelas,
    isCashPayment: isSaleContractCashPayment(sale),
    tipoVenda: isSaleContractCashPayment(sale) ? 'À Vista' : 'Parcelada',
    dataPrimeiraParcelaFmt: paymentDates.firstInstallmentDueFmt,
    dataUltimaParcelaFmt: paymentDates.lastInstallmentDueFmt,
    bankPaymentText: buildBankPaymentText(profile),
    brokerNome: broker.nome,
    brokerDocumento: broker.documento,
    brokerCreci: broker.creci,
    brokerClauseHtml,
    dataContratoFmt: dContrato.toLocaleDateString('pt-BR'),
    dataContratoCidade: profile.forumCity || profile.enterpriseMunicipality || profile.city,
    dataContratoUf: profile.enterpriseUf || profile.state,
    electronicSignatureClauseHtml: buildSaleContractElectronicSignatureClauseHtml(),
  };
}
