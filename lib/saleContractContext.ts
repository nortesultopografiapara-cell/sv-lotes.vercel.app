/**
 * Contexto compartilhado para renderização de contratos de compra e venda.
 * Dados da empresa sempre vêm de Configurações → Empresa (tenant).
 */

const extenso = require('extenso');

import { resolveLotMeasuresFromBlock } from '@/lib/lotChanfre';
import { formatCurveClause } from '@/lib/officialLotMeasurements';
import { buildLotAddressLine } from '@/lib/streetGuide';
import {
  getCompanyDisplayName,
  normalizeCompanyAddressLine,
} from '@/lib/contractCompanyDisplay';
import { formatContractLotBoundariesClause } from '@/lib/contractLotBoundaries';
import {
  formatClassicSellerInstallationText,
  normalizeSellerFromCompany,
  type NormalizedSeller,
} from '@/lib/contractSeller';
import {
  formatContractIdentityDocumentSuffix,
  formatContractSpouseQualificationSuffix,
  formatSellerRepresentativeIdentitySuffix,
} from '@/lib/contractIdentity';
import {
  buildSaleContractClauseQuartaHtml,
  buildSaleContractClauseTerceiraHtml,
  buildSaleContractElectronicSignatureClauseHtml,
  buildSaleContractForumClauseHtml,
  buildSaleContractRepresentativeSignatureHtml,
} from '@/lib/saleContractLegalTemplate';
import {
  type ContractInstallmentScheduleRow,
} from '@/lib/saleContractPaymentSummary';
import {
  buildBalloonAwarePaymentClauseText,
  resolveSaleContractBalloonFinance,
} from '@/lib/saleContractBalloonFinance';
import {
  resolveContractPaymentDates,
  formatContractSaleDateBr,
  type ContractFinanceReceiptRef,
} from '@/lib/contractPaymentDates';
import {
  resolveSalePaymentMode,
  type SalePaymentMode,
} from '@/lib/salePaymentMode';
import { resolveSingleFuturePaymentDueDateFmt } from '@/lib/resolveSingleFuturePaymentDueDate';
import { toContractTitleCase } from '@/lib/contractTitleCase';

export type SaleContractRenderParams = {
  tenant: Record<string, unknown>;
  customer: Record<string, unknown>;
  project: Record<string, unknown>;
  block: Record<string, unknown>;
  sale: Record<string, unknown>;
  contractSnapshot?: Record<string, unknown>;
  contractDate?: string;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
  /** Fonte exclusiva de balões: sale_balloon_installments (nunca inferir por valores). */
  balloonAddons?: Array<{ installment_number: number; additional_amount: number }> | null;
};

export type SaleContractRenderContext = {
  seller: NormalizedSeller;
  empresaNome: string;
  empresaDocumentoFmt: string;
  empresaDocumentoLabel: string;
  empresaEndereco: string;
  empresaCidade: string;
  empresaUf: string;
  empresaCep: string;
  empresaTelefone: string;
  empresaEmail: string;
  empresaRepresentante: string;
  empresaRepresentanteDocFmt: string;
  empresaLogoHtml: string;
  empresaAssinatura: string;
  representanteAssinaturaHtml: string;
  sellerText: string;
  vendedorContato: string;
  clienteNome: string;
  clienteCpfCnpj: string;
  clienteIdentitySuffix: string;
  clienteConjugeSuffix: string;
  clienteProfissao: string;
  clienteEstadoCivil: string;
  clienteEndereco: string;
  clienteBairro: string;
  clienteCidade: string;
  clienteUf: string;
  clienteCep: string;
  empreendimentoNome: string;
  quadra: string;
  lote: string;
  lotBoundariesClause: string;
  curvaClause: string;
  lotLocationSuffix: string;
  projectDescString: string;
  foroText: string;
  valorTotalFmt: string;
  valorTotalExtenso: string;
  paymentMode: SalePaymentMode;
  isCashPayment: boolean;
  tipoVenda: string;
  clauseTerceiraHtml: string;
  clauseQuartaHtml: string;
  electronicSignatureClauseHtml: string;
  forumClauseHtml: string;
  dataContratoFmt: string;
  formatArea: (val: unknown) => string;
};

function formatBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

function isValid(v: unknown): boolean {
  if (v == null || v === '') return false;
  if (typeof v === 'number') return Number.isFinite(v);
  const s = String(v).trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  return (
    !lower.includes('não informad') &&
    !lower.includes('cidade - uf') &&
    lower !== 'n/a' &&
    s !== 'undefined' &&
    s !== 'null' &&
    s !== '-'
  );
}

function formatCNPJCPF(val: string) {
  if (!val) return '';
  const numeric = val.replace(/\D/g, '');
  if (numeric.length === 14) {
    return numeric.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  if (numeric.length === 11) {
    return numeric.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return val;
}

function toTitleCase(str: string) {
  return toContractTitleCase(str);
}

function formatArea(val: unknown) {
  if (!val) return 'não informado';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return (
    num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' m²'
  );
}

export function buildSaleContractRenderContext(
  params: SaleContractRenderParams,
): SaleContractRenderContext {
  const {
    tenant,
    customer,
    project,
    block,
    sale,
    contractSnapshot,
    financeReceipts,
  } = params;

  const seller = normalizeSellerFromCompany(tenant);
  const empresaNome = getCompanyDisplayName(tenant);
  const docDigits = seller.cnpj.replace(/\D/g, '');
  const empresaDocumentoLabel = docDigits.length === 11 ? 'CPF' : 'CPF/CNPJ';
  const empresaDocumentoFmt =
    seller.cnpj !== 'Não informado'
      ? formatCNPJCPF(seller.cnpj)
      : 'Não informado';
  const empresaEndereco =
    seller.address !== 'Não informado'
      ? toTitleCase(normalizeCompanyAddressLine(seller.address))
      : 'Não informado';
  const empresaCidade =
    seller.city !== 'Não informado' ? toTitleCase(seller.city) : 'Não informado';
  const empresaUf =
    seller.state !== 'Não informado'
      ? seller.state.toUpperCase()
      : 'Não informado';
  const empresaCep = seller.zip;
  const empresaTelefone = seller.phone;
  const empresaEmail = seller.email;
  const empresaRepresentante = toTitleCase(seller.representative);
  const empresaRepresentanteDocFmt =
    seller.representativeCpf !== 'Não informado'
      ? formatCNPJCPF(seller.representativeCpf)
      : '';
  const vendedorRepresentanteIdentitySuffix =
    formatSellerRepresentativeIdentitySuffix(tenant);
  const representanteAssinaturaHtml = buildSaleContractRepresentativeSignatureHtml({
    representativeName: empresaRepresentante,
    representativeCpfRaw: seller.representativeCpf,
    companyName: empresaNome,
    identitySuffix: vendedorRepresentanteIdentitySuffix,
  });
  const sellerText = formatClassicSellerInstallationText(seller);
  const empresaLogoHtml = seller.logoUrl
    ? `<img src="${seller.logoUrl}" alt="Logo" style="max-height: 72px; max-width: 220px; object-fit: contain; margin-bottom: 12px;" />`
    : '';
  const empresaAssinatura = seller.signatureUrl
    ? `<img src="${seller.signatureUrl}" style="max-height: 56px; margin-bottom: 8px;" alt="Assinatura"/>`
    : '';

  const clienteNome = toTitleCase(String(customer?.name || 'cliente não informado'));
  const clienteCpfCnpj = formatCNPJCPF(
    String(customer?.document || customer?.cpf || 'cpf/cnpj não informado'),
  );
  const clienteIdentitySuffix = formatContractIdentityDocumentSuffix(customer);
  const clienteConjugeSuffix = formatContractSpouseQualificationSuffix(customer);
  const clienteProfissao = toTitleCase(
    String(customer?.profession || 'profissão não informada'),
  );
  const clienteEstadoCivil = toTitleCase(
    String(
      customer?.civil_state || customer?.marital_status || 'estado civil não informado',
    ),
  );
  const clienteEndereco = toTitleCase(
    String(customer?.address || customer?.street || 'endereço não informado'),
  );
  const clienteBairro = toTitleCase(
    String(customer?.neighborhood || 'bairro não informado'),
  );
  const clienteCidade = toTitleCase(String(customer?.city || 'cidade não informada'));
  const clienteUf =
    String(customer?.state_uf || customer?.state || '')
      .toString()
      .toUpperCase() || 'UF';
  const clienteCep = String(customer?.zip_code || customer?.cep || 'cep não informado');

  const empreendimentoNome = toTitleCase(
    (isValid(project?.name) ? String(project.name) : null) ||
      (isValid((sale?.projects as { name?: string } | undefined)?.name)
        ? String((sale.projects as { name: string }).name)
        : null) ||
      (isValid((sale?.project as { name?: string } | undefined)?.name)
        ? String((sale.project as { name: string }).name)
        : null) ||
      (isValid((block?.projects as { name?: string } | undefined)?.name)
        ? String((block.projects as { name: string }).name)
        : null) ||
      (isValid((block?.project as { name?: string } | undefined)?.name)
        ? String((block.project as { name: string }).name)
        : null) ||
      (isValid(contractSnapshot?.project_name_snapshot)
        ? String(contractSnapshot.project_name_snapshot)
        : null) ||
      '',
  );

  const quadra =
    (isValid(block?.block) ? String(block.block) : null) ||
    (isValid(block?.block_name) ? String(block.block_name) : null) ||
    (isValid(block?.quadra) ? String(block.quadra) : null) ||
    (isValid((sale?.blocks as { block_name?: string } | undefined)?.block_name)
      ? String((sale.blocks as { block_name: string }).block_name)
      : null) ||
    (isValid(block?.name) ? String(block.name) : null) ||
    '';

  const lote =
    (isValid(block?.lot) ? String(block.lot) : null) ||
    (isValid(block?.number) ? String(block.number) : null) ||
    (isValid(sale?.lot_number) ? String(sale.lot_number) : null) ||
    (isValid((sale?.blocks as { number?: string } | undefined)?.number)
      ? String((sale.blocks as { number: string }).number)
      : null) ||
    '';

  const { curva: curvaInfo } = resolveLotMeasuresFromBlock(block);
  const lotBoundariesClause = formatContractLotBoundariesClause({ block: block || {} });
  const curvaClause =
    curvaInfo && curvaInfo.totalLength > 0 ? formatCurveClause(curvaInfo) : '';
  const lotAddressLine = buildLotAddressLine(block || {});
  const lotLocationSuffix = lotAddressLine
    ? `, situado em <strong>${lotAddressLine}</strong>`
    : '';

  const empreendimentoCidade = toTitleCase(
    (isValid(project?.city) ? String(project.city) : null) ||
      (isValid(contractSnapshot?.project_city_snapshot)
        ? String(contractSnapshot.project_city_snapshot)
        : null) ||
      '',
  );
  const empreendimentoUf = (
    (isValid(project?.uf) ? String(project.uf) : null) ||
    (isValid(contractSnapshot?.project_uf_snapshot)
      ? String(contractSnapshot.project_uf_snapshot)
      : null) ||
    ''
  ).toUpperCase();

  const foroCidade =
    empresaCidade && !/^não informado$/i.test(empresaCidade)
      ? empresaCidade
      : empreendimentoCidade;
  const foroUf =
    empresaUf && !/^não informado$/i.test(empresaUf)
      ? empresaUf
      : empreendimentoUf;

  let foroText = '';
  if (foroCidade && foroUf) {
    foroText = `da Comarca de <strong>${foroCidade} - ${foroUf}</strong>`;
  } else if (foroCidade) {
    foroText = `da Comarca de <strong>${foroCidade}</strong>`;
  } else {
    foroText = 'competente';
  }

  let valTotal =
    Number(sale?.total_value) ||
    Number(sale?.agreed_price) ||
    Number(sale?.sale_price) ||
    Number(block?.price) ||
    0;
  if (valTotal <= 0 && sale?.receipts_sum) {
    valTotal = Number(sale.receipts_sum);
  }
  if (valTotal <= 0 && block?.price) valTotal = Number(block.price);

  const valEntrada = Number(sale?.down_payment || 0);
  const valorTotalFmt = formatBRL(valTotal);
  let valorTotalExtenso = '';
  try {
    valorTotalExtenso = extenso(valTotal.toFixed(2).replace('.', ','), {
      mode: 'currency',
    });
  } catch {
    valorTotalExtenso = '';
  }

  const paymentModeResolution = resolveSalePaymentMode(sale);
  const paymentMode = paymentModeResolution.mode;
  const isCashPayment = paymentModeResolution.isImmediateCash;
  const tipoVenda = paymentModeResolution.label;
  const valorEntradaFmt = formatBRL(valEntrada);
  let valorEntradaExtenso = '';
  try {
    if (valEntrada > 0) {
      valorEntradaExtenso = extenso(valEntrada.toFixed(2).replace('.', ','), {
        mode: 'currency',
      });
    }
  } catch {
    valorEntradaExtenso = '';
  }

  const qtdParcelas = Number(sale?.installments_count) || 1;
  let valorParcela = 0;
  if (qtdParcelas > 0) {
    valorParcela = (valTotal - valEntrada) / qtdParcelas;
  }
  const valorParcelaFmt = formatBRL(valorParcela);
  let valorParcelaExtenso = '';
  try {
    if (valorParcela > 0) {
      valorParcelaExtenso = extenso(valorParcela.toFixed(2).replace('.', ','), {
        mode: 'currency',
      });
    }
  } catch {
    valorParcelaExtenso = '';
  }

  const paymentDates = resolveContractPaymentDates(sale, financeReceipts);
  const scheduleRows: ContractInstallmentScheduleRow[] = (financeReceipts || [])
    .map((r) => ({
      installmentNumber: Number(r.installment_number),
      amount: Number(r.amount) || 0,
      dueDate: r.due_date ?? null,
    }))
    .filter((r) => Number.isFinite(r.installmentNumber));
  const balloonSummary = resolveSaleContractBalloonFinance({
    sale: sale as Record<string, unknown>,
    financeReceipts,
    balloonAddons: params.balloonAddons,
    isCashPayment: !paymentModeResolution.isInstallment,
  });
  const hasVariableInstallments = balloonSummary.hasBalloon;
  if (hasVariableInstallments) {
    valorParcela = balloonSummary.baseInstallmentValue;
  }
  const valorParcelaFmtFinal = formatBRL(valorParcela);
  let valorParcelaExtensoFinal = valorParcelaExtenso;
  if (hasVariableInstallments && valorParcela > 0) {
    try {
      valorParcelaExtensoFinal = extenso(valorParcela.toFixed(2).replace('.', ','), {
        mode: 'currency',
      });
    } catch {
      /* keep previous */
    }
  }

  const balloonClauseBody = balloonSummary.hasBalloon
    ? buildBalloonAwarePaymentClauseText({
        summary: balloonSummary,
        valorTotalFmt,
        valorTotalExtenso,
        valorEntradaFmt,
        valorEntradaExtenso,
        dataPrimeiraParcelaFmt: paymentDates.firstInstallmentDueFmt,
        dataUltimaParcelaFmt: paymentDates.lastInstallmentDueFmt,
      })
    : null;

  const singleFutureDue = resolveSingleFuturePaymentDueDateFmt({
    sale,
    financeReceipts,
  });
  const singleFutureDueLongFmt = singleFutureDue.longFmt;

  const clauseTerceiraHtml = buildSaleContractClauseTerceiraHtml({
    mode: paymentMode,
    valorTotalFmt,
    valorTotalExtenso,
    dueDateLongFmt: singleFutureDueLongFmt,
  });

  const clauseQuartaHtml = buildSaleContractClauseQuartaHtml({
    isCash: isCashPayment,
    mode: paymentMode,
    valorTotalFmt,
    valorTotalExtenso,
    valorEntradaFmt,
    valorEntradaExtenso,
    qtdParcelas,
    valorParcelaFmt: valorParcelaFmtFinal,
    valorParcelaExtenso: valorParcelaExtensoFinal,
    dataPrimeiraParcelaFmt: paymentDates.firstInstallmentDueFmt,
    dataUltimaParcelaFmt: paymentDates.lastInstallmentDueFmt,
    singleFutureDueLongFmt,
    hasVariableInstallments,
    balloonClauseBodyHtml: balloonClauseBody,
  });

  const projectDescParts: string[] = [];
  if (empreendimentoNome) {
    projectDescParts.push(
      `integrante do empreendimento <strong>${empreendimentoNome.toUpperCase()}</strong>`,
    );
  }
  if (
    empreendimentoCidade &&
    empreendimentoUf &&
    empreendimentoCidade !== 'Cidade Não Informada'
  ) {
    projectDescParts.push(
      `localizado no município de <strong>${empreendimentoCidade} - ${empreendimentoUf}</strong>`,
    );
  }
  const projectDescString =
    projectDescParts.length > 0 ? `, ${projectDescParts.join(', ')}` : '';

  const vendedorContato = [
    empresaTelefone !== 'Não informado' ? `Tel.: ${empresaTelefone}` : '',
    empresaEmail !== 'Não informado' ? `E-mail: ${empresaEmail}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const dataContratoFmt = formatContractSaleDateBr(sale as Record<string, unknown>);

  return {
    seller,
    empresaNome,
    empresaDocumentoFmt,
    empresaDocumentoLabel,
    empresaEndereco,
    empresaCidade,
    empresaUf,
    empresaCep,
    empresaTelefone,
    empresaEmail,
    empresaRepresentante,
    empresaRepresentanteDocFmt,
    empresaLogoHtml,
    empresaAssinatura,
    representanteAssinaturaHtml,
    sellerText,
    vendedorContato,
    clienteNome,
    clienteCpfCnpj,
    clienteIdentitySuffix,
    clienteConjugeSuffix,
    clienteProfissao,
    clienteEstadoCivil,
    clienteEndereco,
    clienteBairro,
    clienteCidade,
    clienteUf,
    clienteCep,
    empreendimentoNome,
    quadra,
    lote,
    lotBoundariesClause,
    curvaClause,
    lotLocationSuffix,
    projectDescString,
    foroText,
    valorTotalFmt,
    valorTotalExtenso,
    paymentMode,
    isCashPayment,
    tipoVenda,
    clauseTerceiraHtml,
    clauseQuartaHtml,
    electronicSignatureClauseHtml: buildSaleContractElectronicSignatureClauseHtml(),
    forumClauseHtml: buildSaleContractForumClauseHtml(foroText),
    dataContratoFmt,
    formatArea,
  };
}
