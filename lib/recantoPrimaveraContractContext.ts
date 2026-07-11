/**
 * Contexto isolado do contrato Recanto Primavera — não afeta Meneses/PADRAO.
 */

const extenso = require('extenso');

import { resolveLotMeasuresFromBlock } from '@/lib/lotChanfre';
import { formatCurveClause } from '@/lib/officialLotMeasurements';
import {
  formatContractLotBoundariesClause,
  resolveContractLotSides,
} from '@/lib/contractLotBoundaries';
import { extractRecantoSpouseSource } from '@/lib/saleSpouseFields';
import {
  resolveIdentityDocumentFields,
} from '@/lib/contractIdentity';
import {
  resolveSalePaymentMode,
  type SalePaymentMode,
} from '@/lib/salePaymentMode';
import {
  resolveContractPaymentDates,
  formatContractDueDateLongBr,
  formatContractSaleDateBr,
  parseContractSaleDate,
  type ContractFinanceReceiptRef,
} from '@/lib/contractPaymentDates';
import {
  normalizeRecantoPrimaveraCompanyProfile,
  sanitizeContractField,
  type RecantoPrimaveraCompanyProfile,
} from '@/lib/recantoPrimaveraCompanyProfile';
import {
  resolveRecantoContractProjectRecord,
  resolveRecantoPrimaveraProjectContractFields,
} from '@/lib/recantoPrimaveraProjectContext';
import {
  resolveBrokerFromSaleRecord,
} from '@/lib/saleBrokerSnapshot';
import {
  buildRecantoFullAddress,
  formatRecantoDocument,
  formatRecantoPhone,
  formatRecantoCep,
  resolveRecantoSignatureCity,
} from '@/lib/recantoPrimaveraContractFormat';
import {
  applySignalAddonToInstallmentAmounts,
  buildRecantoSignalClauseText,
  resolveRecantoSignalPlan,
} from '@/lib/recantoSignalRemaining';
import {
  resolveInstallmentPrincipal,
  splitInstallmentAmounts,
} from '@/lib/saleInstallmentCalc';
import {
  resolveSaleContractBalloonFinance,
  type SaleContractBalloonFinanceSummary,
} from '@/lib/saleContractBalloonFinance';

export type RecantoPrimaveraContractParams = {
  tenant: Record<string, unknown>;
  customer: Record<string, unknown>;
  project: Record<string, unknown>;
  block: Record<string, unknown>;
  sale: Record<string, unknown>;
  contractSnapshot?: Record<string, unknown>;
  contractDate?: string;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
  /** Fonte exclusiva: sale_balloon_installments. */
  balloonAddons?: Array<{ installment_number: number; additional_amount: number }> | null;
};

export type RecantoPrimaveraContractContext = {
  profile: RecantoPrimaveraCompanyProfile;
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
  clienteEnderecoCompleto: string;
  /** true quando sale_spouse_name ou sale_spouse_cpf está preenchido na venda */
  hasConjuge: boolean;
  conjugeNome: string;
  conjugeNacionalidade: string;
  conjugeEstadoCivil: string;
  conjugeProfissao: string;
  conjugeRg: string;
  conjugeRgIssuer: string;
  conjugeCpf: string;
  conjugeTelefone: string;
  conjugeEmail: string;
  conjugeEndereco: string;
  quadra: string;
  lote: string;
  lotArea: string;
  areaM2: string;
  enterpriseName: string;
  enterpriseLocation: string;
  municipality: string;
  uf: string;
  frontMeasure: string;
  backMeasure: string;
  rightMeasure: string;
  leftMeasure: string;
  lotSidesText: string;
  lotMeasuresText: string;
  lotObjectText: string;
  lotBoundariesClause: string;
  curvaClause: string;
  forumCity: string;
  forumUf: string;
  foroText: string;
  valorTotalFmt: string;
  valorTotalExtenso: string;
  valorSinalFmt: string;
  valorSinalExtenso: string;
  valorSinalPagoNoAtoFmt: string;
  valorSinalRestanteFmt: string;
  valorAcrescimoSinalFmt: string;
  qtdParcelasSinalRestante: number;
  signalRemainingPaymentMode: string | null;
  signalClauseText: string;
  hasSignalRemaining: boolean;
  signalPaidFullyAtSale: boolean;
  valorParcelaBaseFmt: string;
  valorParcelaComAcrescimoFmt: string;
  parcelasResumoSinalHtml: string;
  valorSaldoParceladoFmt: string;
  valorSaldoParceladoExtenso: string;
  valorParcelaFmt: string;
  valorParcelaExtenso: string;
  qtdParcelas: number;
  paymentMode: SalePaymentMode;
  isCashPayment: boolean;
  singleFutureDueLongFmt: string;
  dueDay: string;
  dataPrimeiraParcelaFmt: string;
  dataUltimaParcelaFmt: string;
  bankBoletoText: string;
  brokerNome: string;
  brokerDocumento: string;
  brokerCreci: string;
  brokerRole: string;
  /** true quando há corretor vinculado à venda com nome resolvido */
  hasBroker: boolean;
  dataContratoFmt: string;
  dataContratoExtensoFmt: string;
  dataContratoCidade: string;
  dataContratoUf: string;
  hasBalloonInstallments?: boolean;
  balloonSummary?: SaleContractBalloonFinanceSummary | null;
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
  return formatRecantoDocument(val);
}

function formatSideMeasure(val: unknown): string {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return '';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAreaM2(val: unknown): string {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return '';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatExtensoCurrency(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '';
  try {
    return extenso(val.toFixed(2).replace('.', ','), { mode: 'currency' });
  } catch {
    return '';
  }
}

function extractDueDay(raw: string | null | undefined): string {
  if (!raw) return '';
  const iso = String(raw).trim().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const day = parseInt(iso.split('-')[2], 10);
  return Number.isFinite(day) ? String(day) : '';
}

function resolveBroker(
  sale: Record<string, unknown>,
  contractSnapshot?: Record<string, unknown>,
) {
  const resolved = resolveBrokerFromSaleRecord(sale, { contractSnapshot });
  const nome = resolved.nome
    ? toTitleCase(sanitizeContractField(resolved.nome))
    : '';

  return {
    hasBroker: Boolean(nome),
    nome,
    documento: resolved.documento,
    creci: resolved.creci,
    role: resolved.role,
  };
}

function buildBankBoletoText(profile: RecantoPrimaveraCompanyProfile): string {
  const parts: string[] = [];
  if (profile.bankName) parts.push(`Banco <strong>${profile.bankName}</strong>`);
  if (profile.bankBranch) parts.push(`Agência <strong>${profile.bankBranch}</strong>`);
  if (profile.bankAccount) parts.push(`Conta <strong>${profile.bankAccount}</strong>`);
  if (profile.bankBeneficiary) {
    parts.push(`Favorecido(a) <strong>${profile.bankBeneficiary}</strong>`);
  }
  if (parts.length === 0) return '';
  return parts.join(', ');
}

function buildLotObjectText(
  lote: string,
  quadra: string,
  enterpriseName: string,
  municipality: string,
  uf: string,
  areaM2: string,
): string {
  const lotLabel = lote ? `nº ${lote}` : '';
  const blockLabel = quadra ? `nº ${quadra}` : '';
  const enterprise = enterpriseName || 'Chacreamento Recanto Primavera';
  const cityUf =
    municipality && uf
      ? `${municipality}/${uf}`
      : municipality || uf || 'Parauapebas/PA';
  const areaSuffix = areaM2 ? ` com área aproximada de ${areaM2} m²` : '';

  return `LOTE DE TERRAS CHÁCARAS ${lotLabel}, QUADRA ${blockLabel} integrante do loteamento denominado <strong>${enterprise}</strong> situado no Município de <strong>${cityUf}</strong>${areaSuffix}`;
}

function buildLotMeasuresText(sidesText: string, boundariesClause: string): string {
  if (sidesText) {
    return `medindo ${sidesText}.`;
  }
  if (boundariesClause) {
    return boundariesClause;
  }
  return 'medindo frente, fundo, lado direito e lado esquerdo conforme memorial descritivo do empreendimento.';
}

function formatRecantoContractDateExtenso(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const months = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  const day = date.getDate();
  const month = months[date.getMonth()] ?? '';
  return `${day} de ${month} de ${date.getFullYear()}.`;
}

function formatRecantoContractDateLine(
  city: string,
  uf: string,
  date: Date,
): string {
  const cityUf = [sanitizeContractField(city), sanitizeContractField(uf)]
    .filter(Boolean)
    .join('/');
  const dateExtenso = formatRecantoContractDateExtenso(date);
  if (!cityUf && !dateExtenso) return '';
  if (!cityUf) return dateExtenso;
  if (!dateExtenso) return cityUf;
  return `${cityUf}, ${dateExtenso}`;
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
    balloonAddons,
  } = params;

  const profile = normalizeRecantoPrimaveraCompanyProfile(tenant);
  const projectRecord = resolveRecantoContractProjectRecord(
    project,
    sale,
    block,
    contractSnapshot,
  );
  const projectFields = resolveRecantoPrimaveraProjectContractFields(
    projectRecord,
    tenant,
  );

  const empresaAssinatura = profile.signatureUrl
    ? `<img src="${profile.signatureUrl}" style="max-height: 56px; margin-bottom: 8px;" alt="Assinatura"/>`
    : '';

  const clienteIdentity = resolveIdentityDocumentFields(customer);
  const clienteNome = toTitleCase(
    sanitizeContractField(customer?.name) || '',
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

  const spouse = extractRecantoSpouseSource(sale, customer);
  const conjugeRg = spouse?.rg || '';
  const conjugeRgIssuer = spouse?.rgIssuer || '';

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
  const frontMeasure = formatSideMeasure(sides.frente);
  const backMeasure = formatSideMeasure(sides.fundo);
  const rightMeasure = formatSideMeasure(sides.ladoDireito);
  const leftMeasure = formatSideMeasure(sides.ladoEsquerdo);

  const lotSidesText = [
    sides.frente
      ? `frente ${Number(sides.frente).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
      : '',
    sides.fundo
      ? `fundo ${Number(sides.fundo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
      : '',
    sides.ladoDireito
      ? `lado direito ${Number(sides.ladoDireito).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
      : '',
    sides.ladoEsquerdo
      ? `lado esquerdo ${Number(sides.ladoEsquerdo).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
      : '',
  ]
    .filter(Boolean)
    .join(', ');

  const areaM2 = formatAreaM2(block?.area);
  const lotArea = areaM2 ? `${areaM2} m²` : '';

  const enterpriseName = projectFields.enterpriseName;
  const enterpriseLocation = projectFields.enterpriseLocation;
  const municipality = projectFields.municipality;
  const uf = projectFields.uf;
  const forumCity = projectFields.forumCity;
  const forumUf = uf || profile.state || 'PA';

  const lotObjectText = buildLotObjectText(
    lote,
    quadra,
    enterpriseName,
    municipality,
    uf,
    areaM2,
  );
  const lotMeasuresText = buildLotMeasuresText(lotSidesText, lotBoundariesClause);

  const foroCidade = forumCity || municipality || profile.city;
  const foroUf = uf || profile.state;
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

  const valSinal = Math.max(
    0,
    Number(sale?.signal_contract_value ?? sale?.down_payment ?? 0),
  );
  const qtdParcelas = Math.max(1, Number(sale?.installments_count) || 1);
  const paymentModeResolution = resolveSalePaymentMode(sale);
  const paymentMode = paymentModeResolution.mode;
  const isCashPayment = paymentModeResolution.isImmediateCash;
  const isSinglePayment =
    paymentModeResolution.isImmediateCash || paymentModeResolution.isSingleFuture;

  const hasExplicitSignalPaid =
    sale?.signal_paid_at_sale != null &&
    String(sale.signal_paid_at_sale).trim() !== '';
  const signalPlan = resolveRecantoSignalPlan({
    contractValue: valSinal,
    paidAtSale: hasExplicitSignalPaid
      ? Number(sale?.signal_paid_at_sale)
      : undefined,
    paymentMode: sale?.signal_remaining_payment_mode as string | null,
    remainingInstallments: sale?.signal_remaining_installments as number | null,
    totalInstallments: qtdParcelas,
  });

  // Recanto: parcela base = valor total da chácara / parcelas (sinal NÃO abate).
  const valorParcelaBase =
    !isSinglePayment && qtdParcelas > 0
      ? resolveInstallmentPrincipal({
          totalValue: valTotal,
          downPayment: valSinal,
          contractModel: 'RECANTO_PRIMAVERA',
        }) / qtdParcelas
      : 0;
  const baseAmounts = !isSinglePayment
      ? splitInstallmentAmounts(
        resolveInstallmentPrincipal({
          totalValue: valTotal,
          downPayment: valSinal,
          contractModel: 'RECANTO_PRIMAVERA',
        }),
        qtdParcelas,
      )
    : [];
  const compositions =
    hasExplicitSignalPaid && !isSinglePayment
      ? applySignalAddonToInstallmentAmounts(baseAmounts, signalPlan)
      : baseAmounts.map((baseAmount) => ({
          baseAmount,
          signalAddonAmount: 0,
          amount: baseAmount,
        }));
  const valorParcela = compositions[0]?.amount ?? valorParcelaBase;
  const valorParcelaComAcrescimo =
    compositions.find((c) => c.signalAddonAmount > 0)?.amount ?? valorParcela;
  const signalClauseText = hasExplicitSignalPaid
    ? buildRecantoSignalClauseText(signalPlan, qtdParcelas)
    : '';

  const baseDisplay = baseAmounts[0] ?? valorParcelaBase;
  const addonDisplay = signalPlan.remainingInstallmentValue;
  const totalComAddonDisplay =
    compositions.find((c) => c.signalAddonAmount > 0)?.amount ??
    valorParcelaComAcrescimo;

  let parcelasResumoSinalHtml = '';
  if (!isSinglePayment && signalPlan.hasRemaining && hasExplicitSignalPaid) {
    const row = (
      range: string,
      baseFmt: string,
      addonFmt: string,
      totalFmt: string,
    ) =>
      `<tr>
        <td style="border: 1px solid #111; padding: 6px; text-align: center;">${range}</td>
        <td style="border: 1px solid #111; padding: 6px; text-align: center;">${baseFmt}</td>
        <td style="border: 1px solid #111; padding: 6px; text-align: center;">${addonFmt}</td>
        <td style="border: 1px solid #111; padding: 6px; text-align: center;"><strong>${totalFmt}</strong></td>
      </tr>`;

    let bodyRows = '';
    if (signalPlan.paymentMode === 'ALL_INSTALLMENTS') {
      bodyRows = row(
        `1 a ${qtdParcelas}`,
        formatBRL(baseDisplay),
        formatBRL(addonDisplay),
        formatBRL(totalComAddonDisplay),
      );
    } else {
      const n = signalPlan.remainingInstallments || 0;
      bodyRows =
        row(
          `1 a ${n}`,
          formatBRL(baseDisplay),
          formatBRL(addonDisplay),
          formatBRL(totalComAddonDisplay),
        ) +
        (n < qtdParcelas
          ? row(
              `${n + 1} a ${qtdParcelas}`,
              formatBRL(baseDisplay),
              formatBRL(0),
              formatBRL(baseDisplay),
            )
          : '');
    }

    parcelasResumoSinalHtml = `
      <p style="margin: 0 0 6px 0; font-size: 10.5pt;"><strong>Quadro de pagamento das parcelas</strong> (valores aproximados; eventuais diferenças de centavos constam no financeiro):</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
        <thead>
          <tr>
            <th style="border: 1px solid #111; padding: 6px; text-align: center;">Parcelas</th>
            <th style="border: 1px solid #111; padding: 6px; text-align: center;">Valor base</th>
            <th style="border: 1px solid #111; padding: 6px; text-align: center;">Complemento do sinal</th>
            <th style="border: 1px solid #111; padding: 6px; text-align: center;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>`;
  }

  const paymentDates = resolveContractPaymentDates(sale, financeReceipts);
  const singleFutureDueRaw =
    String(sale?.down_payment_due_date || paymentDates.entryDueRaw || '')
      .trim()
      .split('T')[0] || '';
  const singleFutureDueLongFmt = singleFutureDueRaw
    ? formatContractDueDateLongBr(singleFutureDueRaw)
    : '';
  const balloonSummary = resolveSaleContractBalloonFinance({
    sale: sale as Record<string, unknown>,
    financeReceipts,
    balloonAddons,
    isCashPayment: isSinglePayment,
  });
  const hasBalloonInstallments = balloonSummary.hasBalloon;
  const dueDay = extractDueDay(paymentDates.firstInstallmentDueRaw);
  const broker = resolveBroker(sale, contractSnapshot);

  const clienteEndereco = toTitleCase(
    sanitizeContractField(customer?.address || customer?.street),
  );
  const clienteBairro = toTitleCase(sanitizeContractField(customer?.neighborhood));
  const clienteCidade = toTitleCase(sanitizeContractField(customer?.city));
  const clienteUf = sanitizeContractField(customer?.state_uf || customer?.state).toUpperCase();
  const clienteCep = formatRecantoCep(customer?.zip_code || customer?.cep);
  const clienteEnderecoCompleto = buildRecantoFullAddress({
    street: clienteEndereco,
    neighborhood: clienteBairro,
    cep: clienteCep,
    city: clienteCidade,
    uf: clienteUf,
    toTitleCase,
  });

  const titleLine2Raw = (enterpriseName || 'CHACREAMENTO RECANTO PRIMAVERA')
    .toUpperCase()
    .trim();
  const titleLine2 = titleLine2Raw.endsWith('.')
    ? titleLine2Raw
    : `${titleLine2Raw}.`;

  const dContrato = parseContractSaleDate(sale as Record<string, unknown>);
  const signaturePlace = resolveRecantoSignatureCity({
    project: projectRecord,
    companyCity: profile.city,
    companyUf: profile.state,
  });
  const dataContratoCidade = signaturePlace.city;
  const dataContratoUf = signaturePlace.uf || uf || profile.state;

  return {
    profile,
    empresaAssinatura,
    titleLine1: 'INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA',
    titleLine2,
    clienteNome,
    clienteCpfCnpj,
    clienteRg,
    clienteRgIssuer,
    clienteProfissao: toTitleCase(sanitizeContractField(customer?.profession)),
    clienteEstadoCivil: toTitleCase(
      sanitizeContractField(customer?.civil_state || customer?.marital_status),
    ),
    clienteNacionalidade: toTitleCase(
      sanitizeContractField(customer?.nationality) || 'Brasileira',
    ),
    clienteTelefone: formatRecantoPhone(customer?.phone),
    clienteEmail: sanitizeContractField(customer?.email),
    clienteEndereco,
    clienteBairro,
    clienteCidade,
    clienteUf,
    clienteCep,
    clienteEnderecoCompleto,
    hasConjuge: !!spouse,
    conjugeNome: spouse ? toTitleCase(String(spouse.name || '')) : '',
    conjugeNacionalidade: spouse
      ? toTitleCase(sanitizeContractField(spouse.nationality) || 'Brasileira')
      : '',
    conjugeEstadoCivil: spouse
      ? toTitleCase(sanitizeContractField(spouse.maritalStatus))
      : '',
    conjugeProfissao: spouse
      ? toTitleCase(sanitizeContractField(spouse.profession))
      : '',
    conjugeRg,
    conjugeRgIssuer,
    conjugeCpf: spouse
      ? formatCNPJCPF(sanitizeContractField(spouse.cpf))
      : '',
    conjugeTelefone: spouse ? formatRecantoPhone(spouse.phone) : '',
    conjugeEmail: spouse ? sanitizeContractField(spouse.email) : '',
    conjugeEndereco: spouse
      ? buildRecantoFullAddress({
          street: spouse.address,
          toTitleCase,
        })
      : '',
    quadra,
    lote,
    lotArea,
    areaM2,
    enterpriseName,
    enterpriseLocation,
    municipality,
    uf,
    frontMeasure,
    backMeasure,
    rightMeasure,
    leftMeasure,
    lotSidesText,
    lotMeasuresText,
    lotObjectText,
    lotBoundariesClause,
    curvaClause,
    forumCity,
    forumUf,
    foroText,
    valorTotalFmt: formatBRL(valTotal),
    valorTotalExtenso: formatExtensoCurrency(valTotal),
    valorSinalFmt: formatBRL(valSinal),
    valorSinalExtenso: formatExtensoCurrency(valSinal),
    valorSinalPagoNoAtoFmt: formatBRL(signalPlan.paidAtSale),
    valorSinalRestanteFmt: formatBRL(signalPlan.remainingValue),
    valorAcrescimoSinalFmt: formatBRL(signalPlan.remainingInstallmentValue),
    qtdParcelasSinalRestante: signalPlan.remainingInstallments || 0,
    signalRemainingPaymentMode: signalPlan.paymentMode,
    signalClauseText,
    hasSignalRemaining: signalPlan.hasRemaining && hasExplicitSignalPaid,
    signalPaidFullyAtSale:
      hasExplicitSignalPaid && !signalPlan.hasRemaining && valSinal > 0,
    valorParcelaBaseFmt: formatBRL(baseDisplay),
    valorParcelaComAcrescimoFmt: formatBRL(totalComAddonDisplay),
    parcelasResumoSinalHtml,
    valorSaldoParceladoFmt: formatBRL(valTotal),
    valorSaldoParceladoExtenso: formatExtensoCurrency(valTotal),
    valorParcelaFmt: formatBRL(valorParcela),
    valorParcelaExtenso: formatExtensoCurrency(valorParcela),
    qtdParcelas,
    paymentMode,
    isCashPayment,
    singleFutureDueLongFmt,
    dueDay,
    dataPrimeiraParcelaFmt: paymentDates.firstInstallmentDueFmt,
    dataUltimaParcelaFmt: paymentDates.lastInstallmentDueFmt,
    bankBoletoText: buildBankBoletoText(profile),
    brokerNome: broker.nome,
    brokerDocumento: broker.documento,
    brokerCreci: broker.creci,
    brokerRole: broker.role,
    hasBroker: broker.hasBroker,
    dataContratoFmt: formatContractSaleDateBr(sale as Record<string, unknown>),
    dataContratoExtensoFmt: dContrato
      ? formatRecantoContractDateLine(dataContratoCidade, dataContratoUf, dContrato)
      : '',
    dataContratoCidade,
    dataContratoUf,
    hasBalloonInstallments,
    balloonSummary: hasBalloonInstallments ? balloonSummary : null,
  };
}
