const extenso = require("extenso");

import { resolveLotMeasuresFromBlock } from "@/lib/lotChanfre";
import { formatCurveClause } from "@/lib/officialLotMeasurements";
import { buildLotAddressLine } from "@/lib/streetGuide";
import {
  getCompanyDisplayName,
  normalizeCompanyAddressLine,
} from "@/lib/contractCompanyDisplay";
import { formatContractLotBoundariesClause } from "@/lib/contractLotBoundaries";
import { CONTRACT_PDF_PRINT_CSS } from "@/lib/contractPdfPostProcess";
import {
  formatClassicSellerInstallationText,
  normalizeSellerFromCompany,
} from "@/lib/contractSeller";
import {
  formatContractIdentityDocumentSuffix,
  formatSellerRepresentativeIdentitySuffix,
} from "@/lib/contractIdentity";
import {
  resolveSaleSpouseContext,
} from "@/lib/saleSpouseFields";
import {
  buildClassicSpouseQualificationHtml,
  buildClassicSpouseSignatureSlotHtml,
} from "@/lib/saleSpouseContractHtml";
import {
  buildSaleContractClauseQuartaHtml,
  buildSaleContractClauseTerceiraHtml,
  buildSaleContractElectronicSignatureClauseHtml,
  buildSaleContractForumClauseHtml,
  buildSaleContractRepresentativeSignatureHtml,
} from "@/lib/saleContractLegalTemplate";
import {
  buildSaleContractPaymentSummaryHtml,
  resolveSaleContractPaymentBreakdown,
  type ContractInstallmentScheduleRow,
} from "@/lib/saleContractPaymentSummary";
import {
  buildBalloonAwarePaymentClauseText,
  resolveSaleContractBalloonFinance,
} from "@/lib/saleContractBalloonFinance";
import {
  isAraguaiaContractModel,
  isRecantoPrimaveraContractModel,
  isSvLotes2ContractModel,
  resolveSaleContractModel,
} from "@/lib/contractModel";
import { buildMenesesClausesHtml } from "@/lib/menesesContractClauses";
import { toContractTitleCase } from "@/lib/contractTitleCase";
import { generateAraguaiaContract } from "@/lib/araguaiaContractTemplate";
import { generateRecantoPrimaveraContract } from "@/lib/recantoPrimaveraContractTemplate";
import { generateSvLotes2Contract } from "@/lib/svLotes2ContractTemplate";
import {
  formatContractDueDateBr,
  formatContractDueDateLongBr,
  formatContractSaleDateBr,
  formatContractSaleDateLongBr,
  resolveContractPaymentDates,
  type ContractFinanceReceiptRef,
  type ContractPaymentDates,
} from "@/lib/contractPaymentDates";
import { resolveSalePaymentMode } from "@/lib/salePaymentMode";
import { resolveSingleFuturePaymentDueDateFmt } from "@/lib/resolveSingleFuturePaymentDueDate";

export type { ContractFinanceReceiptRef, ContractPaymentDates };
export { formatContractDueDateBr, formatContractSaleDateBr, resolveContractPaymentDates };

const formatArea = (val: any) => {
  if (!val) return "não informado";

  const num = Number(val);

  if (isNaN(num)) return String(val);

  return (
    num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " m²"
  );
};

interface GenerateContractParams {
  tenant: any;
  customer: any;
  project: any;
  block: any;
  sale: any;
  contractSnapshot?: any;
  contractDate?: string;
  financeReceipts?: ContractFinanceReceiptRef[] | null;
  /** Fonte exclusiva: sale_balloon_installments. Nunca inferir por valores. */
  balloonAddons?: Array<{ installment_number: number; additional_amount: number }> | null;
  /** @deprecated Contrato não usa confrontações; mantido para compatibilidade de chamadas. */
  projectBlocks?: Record<string, unknown>[] | null;
  streetGuides?: Record<string, unknown>[] | null;
  manualConfrontants?: Record<string, unknown> | null;
}

export function generateContractHTML({
  tenant,
  customer,
  project,
  block,
  sale,
  contractSnapshot,
  contractDate,
  financeReceipts,
  balloonAddons,
  projectBlocks,
  streetGuides,
  manualConfrontants,
}: GenerateContractParams) {
  if (isAraguaiaContractModel(tenant)) {
    return generateAraguaiaContract({
      tenant,
      customer,
      project,
      block,
      sale,
      contractSnapshot,
      contractDate,
      financeReceipts,
      projectBlocks,
      streetGuides,
    });
  }

  if (isRecantoPrimaveraContractModel(tenant)) {
    return generateRecantoPrimaveraContract({
      tenant,
      customer,
      project,
      block,
      sale,
      contractSnapshot,
      contractDate,
      financeReceipts,
      balloonAddons,
    });
  }

  if (isSvLotes2ContractModel(tenant)) {
    return generateSvLotes2Contract({
      tenant,
      customer,
      project,
      block,
      sale,
      contractSnapshot,
      contractDate,
      financeReceipts,
      balloonAddons,
    });
  }

  const formatBRL = (val: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);

  const isValid = (v: any) => {
    if (v == null || v === "") return false;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v !== "string") {
      const s = String(v).trim();
      return Boolean(s) && s !== "undefined" && s !== "null" && s !== "-";
    }
    return (
      !v.toLowerCase().includes("não informad") &&
      !v.toLowerCase().includes("cidade - uf") &&
      v.toLowerCase() !== "n/a" &&
      v !== "undefined" &&
      v !== "null" &&
      v !== "-"
    );
  };

  const formatCNPJCPF = (val: string) => {
    if (!val) return "";
    const numeric = val.replace(/\D/g, "");
    if (numeric.length === 14) {
      return numeric.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    if (numeric.length === 11) {
      return numeric.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    return val;
  };

  const toTitleCase = (str: string) => toContractTitleCase(str);

  // Extenso support for currency
  const extensoOptions = { mode: "currency", currency: { type: "BRL" } };

  const seller = normalizeSellerFromCompany(tenant);
  const empresaNome = getCompanyDisplayName(tenant);
  const empresaCnpj =
    seller.cnpj !== "Não informado"
      ? formatCNPJCPF(seller.cnpj)
      : "Não informado";
  const empresaEndereco =
    seller.address !== "Não informado"
      ? toTitleCase(normalizeCompanyAddressLine(seller.address))
      : "Não informado";
  const empresaCidade =
    seller.city !== "Não informado" ? toTitleCase(seller.city) : "Não informado";
  const empresaUf =
    seller.state !== "Não informado"
      ? seller.state.toUpperCase()
      : "Não informado";
  const empresaCep = seller.zip;
  const empresaTelefone = seller.phone;
  const empresaEmail = seller.email;
  const empresaRepresentante = toTitleCase(seller.representative);
  const vendedorRepresentanteIdentitySuffix =
    formatSellerRepresentativeIdentitySuffix(tenant);
  const representanteAssinaturaHtml = buildSaleContractRepresentativeSignatureHtml({
    representativeName: empresaRepresentante,
    representativeCpfRaw: seller.representativeCpf,
    companyName: empresaNome,
    identitySuffix: vendedorRepresentanteIdentitySuffix,
  });
  const sellerText = formatClassicSellerInstallationText(seller);
  const empresaAssinatura = seller.signatureUrl
    ? `<img src="${seller.signatureUrl}" style="max-height: 40px; margin-bottom: 2px;" alt="Assinatura"/>`
    : "";

  const clienteNome = toTitleCase(customer?.name || "cliente não informado");
  const clienteCpfCnpj = formatCNPJCPF(customer?.document || customer?.cpf || "cpf/cnpj não informado");
  const clienteIdentitySuffix = formatContractIdentityDocumentSuffix(customer);
  // Fonte de verdade: venda (sale_spouse_*), não cadastro do cliente / estado civil.
  const spouseCtx = resolveSaleSpouseContext(sale);
  const spouseQualificationHtml = spouseCtx.hasSpouse
    ? buildClassicSpouseQualificationHtml(spouseCtx.spouse)
    : '';
  const spouseSignatureSlotHtml = spouseCtx.hasSpouse
    ? buildClassicSpouseSignatureSlotHtml(spouseCtx.spouse)
    : '';
  const clienteProfissao = toTitleCase(
    customer?.profession || "profissão não informada",
  );
  const clienteEstadoCivil = toTitleCase(
    customer?.civil_state || customer?.marital_status || "estado civil não informado",
  );
  const clienteEndereco = toTitleCase(
    customer?.address || customer?.street || "endereço não informado",
  );
  const clienteBairro = toTitleCase(customer?.neighborhood || "bairro não informado");
  const clienteCidade = toTitleCase(customer?.city || "cidade não informada");
  const clienteUf = (
    customer?.state_uf ||
    customer?.state ||
    ""
  )
    .toString()
    .toUpperCase() || "UF";
  const clienteCep =
    customer?.zip_code || customer?.cep || "cep não informado";

  const empreendimentoNome = toTitleCase(
    (isValid(project?.name) ? project.name : null) ||
    (isValid(sale?.projects?.name) ? sale.projects.name : null) ||
    (isValid(sale?.project?.name) ? sale.project.name : null) ||
    (isValid(block?.projects?.name) ? block.projects.name : null) ||
    (isValid(block?.project?.name) ? block.project.name : null) ||
    (isValid(contractSnapshot?.project_name_snapshot)
      ? contractSnapshot.project_name_snapshot
      : null) ||
    ""
  );

  const quadra =
    (isValid(block?.block) ? block.block : null) ||
    (isValid(block?.block_name) ? block.block_name : null) ||
    (isValid(block?.quadra) ? block.quadra : null) ||
    (isValid(sale?.blocks?.block_name) ? sale.blocks.block_name : null) ||
    (isValid(sale?.blocks?.name) ? sale.blocks.name : null) ||
    (isValid(block?.name) ? block.name : null) ||
    "";

  const lote = 
    (isValid(block?.lot) ? block.lot : null) ||
    (isValid(block?.number) ? block.number : null) ||
    (isValid(sale?.lot_number) ? sale.lot_number : null) ||
    (isValid(sale?.blocks?.number) ? sale.blocks.number : null) ||
    "";

  const { curva: curvaInfo } = resolveLotMeasuresFromBlock(block);

  const lotBoundariesClause = formatContractLotBoundariesClause({
    block: block || {},
  });

  const curvaClause =
    curvaInfo && curvaInfo.totalLength > 0
      ? formatCurveClause(curvaInfo)
      : "";

  const lotAddressLine = buildLotAddressLine(block || {});
  const lotLocationSuffix = lotAddressLine
    ? `, situado em <strong>${lotAddressLine}</strong>`
    : '';

  // Cidade, UF e Foro hierarquia correta
  const empreendimentoCidade = toTitleCase(
    (isValid(project?.city) ? project.city : null) ||
    (isValid(sale?.projects?.city) ? sale.projects.city : null) ||
    (isValid(sale?.project?.city) ? sale.project.city : null) ||
    (isValid(block?.projects?.city) ? block.projects.city : null) ||
    (isValid(block?.project?.city) ? block.project.city : null) ||
    (isValid(contractSnapshot?.project_city_snapshot)
      ? contractSnapshot.project_city_snapshot
      : null) ||
    ""
  );

  const empreendimentoUf = (
    (isValid(project?.uf) ? project.uf : null) ||
    (isValid(sale?.projects?.uf) ? sale.projects.uf : null) ||
    (isValid(sale?.project?.uf) ? sale.project.uf : null) ||
    (isValid(block?.projects?.uf) ? block.projects.uf : null) ||
    (isValid(block?.project?.uf) ? block.project.uf : null) ||
    (isValid(contractSnapshot?.project_uf_snapshot)
      ? contractSnapshot.project_uf_snapshot
      : null) ||
    ""
  ).toUpperCase();

  const foroCidade =
    empresaCidade && !/^não informado$/i.test(empresaCidade)
      ? empresaCidade
      : toTitleCase(
          (isValid(project?.forum_city) ? project.forum_city : null) ||
            (isValid(project?.city) ? project.city : null) ||
            (isValid(empreendimentoCidade) ? empreendimentoCidade : null) ||
            "",
        );

  const foroUf =
    empresaUf && !/^não informado$/i.test(empresaUf)
      ? empresaUf
      : (
          (isValid(project?.uf) ? project.uf : null) ||
          empreendimentoUf ||
          ""
        ).toUpperCase();

  let foroText = "";
  if (foroCidade && foroUf) {
      foroText = `da Comarca de <strong>${foroCidade} - ${foroUf}</strong>`;
  } else if (foroCidade) {
      foroText = `da Comarca de <strong>${foroCidade}</strong>`;
  } else {
      foroText = "competente";
  }

  let valTotal =
    Number(sale?.total_value) ||
    Number(sale?.agreed_price) ||
    Number(sale?.sale_price) ||
    Number(block?.price) ||
    0;

  // Se ainda for zero e houver recibos (finance_receipts não é passado no escopo atual, mas podemos somar receipts_sum se injetado)
  if (valTotal <= 0 && sale?.receipts_sum) {
    valTotal = Number(sale.receipts_sum);
  }

  if (valTotal <= 0 && block?.price) valTotal = Number(block.price);

  const valEntrada = Number(sale?.down_payment || 0);

  const valorTotalFmt = formatBRL(valTotal);

  let valorTotalExtenso = "";
  try {
    // @ts-ignore
    valorTotalExtenso = extenso(valTotal.toFixed(2).replace(".", ","), {
      mode: "currency",
    });
  } catch (e) {}

  const paymentModeResolution = resolveSalePaymentMode(sale as Record<string, unknown>);
  const paymentMode = paymentModeResolution.mode;
  const isCashPayment = paymentModeResolution.isImmediateCash;
  const valorEntradaFmt = formatBRL(valEntrada);

  let valorEntradaExtenso = "";
  try {
    // @ts-ignore
    if (valEntrada > 0)
      valorEntradaExtenso = extenso(valEntrada.toFixed(2).replace(".", ","), {
        mode: "currency",
      });
  } catch (e) {}

  const qtdParcelas = sale?.installments_count || 1;
  let valorParcela = 0;
  if (qtdParcelas > 0) {
    valorParcela = (valTotal - valEntrada) / qtdParcelas;
  }
  const valorParcelaFmt = formatBRL(valorParcela);
  let valorParcelaExtenso = "";
  try {
    // @ts-ignore
    if (valorParcela > 0)
      valorParcelaExtenso = extenso(valorParcela.toFixed(2).replace(".", ","), {
        mode: "currency",
      });
  } catch (e) {}

  const paymentDates = resolveContractPaymentDates(
    sale as Record<string, unknown>,
    financeReceipts,
  );
  const dataPrimeiraParcelaFmt = paymentDates.firstInstallmentDueFmt;
  const dataUltimaParcelaFmt = paymentDates.lastInstallmentDueFmt;

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
    balloonAddons,
    isCashPayment: !paymentModeResolution.isInstallment,
  });
  const hasVariableInstallments = balloonSummary.hasBalloon;

  // Com balão: valor base derivado dos registros persistidos (nunca min(amount)).
  if (hasVariableInstallments) {
    valorParcela = balloonSummary.baseInstallmentValue;
  }

  const valorParcelaFmtBalloonAware = formatBRL(valorParcela);
  let valorParcelaExtensoBalloonAware = valorParcelaExtenso;
  if (hasVariableInstallments) {
    try {
      // @ts-ignore
      if (valorParcela > 0)
        valorParcelaExtensoBalloonAware = extenso(
          valorParcela.toFixed(2).replace(".", ","),
          { mode: "currency" },
        );
    } catch (e) {}
  }

  const balloonClauseBody = balloonSummary.hasBalloon
    ? buildBalloonAwarePaymentClauseText({
        summary: balloonSummary,
        valorTotalFmt,
        valorTotalExtenso,
        valorEntradaFmt,
        valorEntradaExtenso,
        dataPrimeiraParcelaFmt,
        dataUltimaParcelaFmt,
      })
    : null;

  const singleFutureDue = resolveSingleFuturePaymentDueDateFmt({
    sale: sale as Record<string, unknown>,
    financeReceipts,
  });
  const singleFutureDueLongFmt = singleFutureDue.longFmt;

  const isMenesesModel = resolveSaleContractModel(tenant) === "MENESES";

  const dataContratoFmt = formatContractSaleDateBr(sale as Record<string, unknown>);
  /** Fecho do contrato: MENESES usa data por extenso; PADRAO mantém dd/mm/aaaa. */
  const dataContratoFechoFmt = isMenesesModel
    ? formatContractSaleDateLongBr(sale as Record<string, unknown>) || dataContratoFmt
    : dataContratoFmt;

  // Build the locality string according to the requested hierarchy and fields
  let projectDescParts = [];
  if (empreendimentoNome) projectDescParts.push(`integrante do empreendimento <strong>${empreendimentoNome.toUpperCase()}</strong>`);
  if (empreendimentoCidade && empreendimentoUf && empreendimentoCidade !== "Cidade Não Informada") {
      projectDescParts.push(`localizado no município de <strong>${empreendimentoCidade} - ${empreendimentoUf}</strong>`);
  }

  const projectDescString = projectDescParts.length > 0 ? `, ${projectDescParts.join(', ')}` : '';

  const vendedorContato = [
    empresaTelefone !== "Não informado" ? `Tel.: ${empresaTelefone}` : "",
    empresaEmail !== "Não informado" ? `E-mail: ${empresaEmail}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const paymentBreakdown = resolveSaleContractPaymentBreakdown(sale, {
    isCashPayment,
    financeReceipts,
    balloonAddons,
    contractModel: resolveSaleContractModel(tenant),
  });
  const paymentSummaryHtml = buildSaleContractPaymentSummaryHtml(
    paymentBreakdown,
    {
      scheduleRows,
      hasVariableInstallments,
      balloonSummary,
      // Mesma fonte da Cláusula Quarta — parcela mensal 1 (não entrada).
      firstDueDateFmt: dataPrimeiraParcelaFmt || null,
    },
  );

  /** Corpo jurídico: MENESES = cláusulas 1–14 novas; PADRAO = clássicas atuais. */
  const legalClausesHtml = isMenesesModel
    ? buildMenesesClausesHtml({
        loteLabel: `LOTE ${lote} DA QUADRA ${quadra}`,
        lote: String(lote || ""),
        quadra: String(quadra || ""),
        areaFmt: formatArea(block?.area),
        lotBoundariesClause,
        curvaClause,
        projectDescString,
        lotLocationSuffix,
        foroText,
        finance: {
          paymentMode,
          // Mesma base numérica do Quadro-Resumo (valor do lote / líquido).
          valorTotalFmt: paymentBreakdown.netValueFmt || valorTotalFmt,
          valorTotalExtenso,
          valorEntradaFmt: paymentBreakdown.entryFmt || valorEntradaFmt,
          valorEntradaExtenso,
          valorSaldoFmt: paymentBreakdown.installmentBalanceFmt,
          qtdParcelas: paymentBreakdown.installmentsCount || qtdParcelas,
          valorParcelaFmt: hasVariableInstallments
            ? valorParcelaFmtBalloonAware
            : paymentBreakdown.installmentValueFmt || valorParcelaFmtBalloonAware,
          dataPrimeiraParcelaFmt,
          dataUltimaParcelaFmt,
          singleFutureDueLongFmt,
          hasVariableInstallments,
          balloonClauseBodyHtml: balloonClauseBody,
          correctionLabel: paymentBreakdown.correctionLabel,
        },
      })
    : (() => {
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
          valorParcelaFmt: valorParcelaFmtBalloonAware,
          valorParcelaExtenso: valorParcelaExtensoBalloonAware,
          dataPrimeiraParcelaFmt,
          dataUltimaParcelaFmt,
          singleFutureDueLongFmt,
          hasVariableInstallments,
          balloonClauseBodyHtml: balloonClauseBody,
        });
        const electronicSignatureClauseHtml =
          buildSaleContractElectronicSignatureClauseHtml();
        const forumClauseHtml = buildSaleContractForumClauseHtml(foroText);
        return `
            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Primeira:</strong> O PROMITENTE VENDEDOR, pelo presente instrumento e na melhor forma de direito, declara-se senhor e legítimo possuidor, livre e desembaraçado de quaisquer ônus do imóvel a seguir descriminado: o imóvel identificado como <strong>LOTE ${lote} DA QUADRA ${quadra}</strong>${projectDescString}${lotLocationSuffix}, com área total de <strong>${formatArea(block?.area)}</strong>, ${lotBoundariesClause}${curvaClause}
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Segunda:</strong> Pelo presente instrumento e na melhor forma de direito, o PROMITENTE VENDEDOR promete vender ao PROMISSÁRIO COMPRADOR, que promete comprar, o imóvel descrito na cláusula primeira, pelo preço e condições descritas nas cláusulas seguintes.
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                ${clauseTerceiraHtml}
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                ${clauseQuartaHtml}
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Quinta:</strong> A não quitação das cláusulas penais ou resolutórias, previstas neste contrato por parte de seus beneficiários, será sempre havida como mera tolerância, não importando nunca em novação das obrigações descumpridas, podendo ser aplicada a qualquer tempo, enquanto subsistir o inadimplemento. Em caso de desistência será ressarcido somente 40% do valor pago.
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Sexta:</strong> Fica estabelecido a irretratabilidade e irrevogabilidade do presente contrato, podendo, se necessário, o PROMITENTE COMPRADOR ou seus eventuais sucessores, requerer adjudicação compulsória dos imóveis, nos termos da legislação vigente.
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Sétima:</strong> Fica estabelecido que a escritura definitiva de compra e venda somente será outorgada pelo PROMITENTE VENDEDOR ao PROMISSÁRIO COMPRADOR no prazo de 6 (seis) meses contados da data em que for expedido o decreto aprovando o loteamento.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Único:</strong> O prazo previsto no "caput" da presente cláusula será automaticamente prorrogado se a Prefeitura Municipal não aprovar o loteamento até tal data, ou por qualquer outro motivo de força maior.
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Oitava:</strong> O presente contrato obriga aos contratantes, seus herdeiros e sucessores, os quais deverão igualmente observar e cumprir todos os termos, condições e cláusulas deste instrumento.
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Nona:</strong> Fica estipulado que, a parte que descumprir quaisquer das cláusulas, termos ou condições do presente instrumento incorrerá na multa penal de 2% (dois por cento) do valor total do contrato, atualizada monetariamente de acordo com índice oficial vigente, sem prejuízo das outras penalidades também previstas neste instrumento.
                </p>
            </div>

            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Décima:</strong> Fica estabelecido que, em havendo necessidade de se recorrer às vias judiciais para solucionar qualquer controvérsia, a parte vencida arcará, além das despesas e custas processuais, com honorários advocatícios de 20% (vinte por cento) em favor da parte vencedora.
                </p>
            </div>

            ${electronicSignatureClauseHtml}

            ${forumClauseHtml}`;
      })();

  return `
        ${CONTRACT_PDF_PRINT_CSS}
        <div class="sv-contract-document" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #111; background: #fff; padding: 10px; text-align: justify;">

            <div class="contract-title">
                 <h2 style="font-family: 'Times New Roman', Times, serif; font-size: 17px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 0; padding: 0; line-height: 1.3;">INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA</h2>
            </div>
            
            <div class="contract-clause">
                <p style="margin-bottom: 10px;">
                    <strong>Promitente Proprietário Vendedor:</strong> <strong>${empresaNome}</strong>, CNPJ n° ${empresaCnpj}, ${sellerText}
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Promitente Comprador:</strong> <strong>${clienteNome}</strong>, CPF n° ${clienteCpfCnpj}, Brasileiro, Profissão: ${clienteProfissao}, Estado Civil: ${clienteEstadoCivil}${clienteIdentitySuffix}, Residente e domiciliado na ${clienteEndereco}, Bairro ${clienteBairro}, CEP: ${clienteCep}, Cidade de ${clienteCidade} - ${clienteUf}.
                </p>
                ${spouseQualificationHtml}
            </div>

            <div class="contract-preamble">
                <p style="margin-bottom: 0;">
                    Pelo presente instrumento particular, partes acima qualificadas têm entre si justo e acertado a celebração do presente compromisso de compra e venda que se regerá pelas cláusulas, termos e condições, estipuladas a seguir, que as partes mutuamente outorgam e aceitam, as quais comprometem cumprir e respeitar, por si, seus herdeiros e sucessores, na forma da lei:
                </p>
            </div>

            ${paymentSummaryHtml}

            ${legalClausesHtml}

            <div class="contract-signature-pack">
            <div class="contract-clause contract-closing">
                <p>
                    E, por estarem assim justos e contratados, assinam o presente contrato em 2 (duas) vias de igual teor e forma.
                </p>
                <div class="contract-closing-date">
                    <p style="margin: 0;">${empresaCidade} - ${empresaUf}, ${dataContratoFechoFmt}</p>
                </div>
            </div>

            <div class="contract-signatures">
                <div class="signature-grid">
                <div class="signature-slot" data-party-role="VENDOR">
                    ${empresaAssinatura}
                    <div class="signature-line"></div>
                    <p style="font-weight: bold; text-transform: uppercase;">${empresaNome}</p>
                    <p style="font-size: 9pt; font-weight: normal;">PROMITENTE VENDEDOR<br/>CNPJ: ${empresaCnpj}</p>
                    ${representanteAssinaturaHtml}
                </div>

                <div class="signature-slot" data-party-role="BUYER">
                    <div class="signature-line"></div>
                    <p style="font-weight: bold; text-transform: uppercase;">${clienteNome}</p>
                    <p style="font-size: 9pt; font-weight: normal;">PROMISSÁRIO COMPRADOR<br/>CPF: ${clienteCpfCnpj}</p>
                </div>

                ${spouseSignatureSlotHtml}

                <div class="signature-slot" data-party-role="WITNESS">
                    <div class="signature-line"></div>
                    <p style="margin: 0 0 1px 0; font-weight: bold;">TESTEMUNHA 1</p>
                    <p style="margin: 0 0 1px 0; font-size: 9pt;">Nome: ________________________________</p>
                    <p style="margin: 0; font-size: 9pt;">CPF: _________________________________</p>
                </div>

                <div class="signature-slot" data-party-role="WITNESS">
                    <div class="signature-line"></div>
                    <p style="margin: 0 0 1px 0; font-weight: bold;">TESTEMUNHA 2</p>
                    <p style="margin: 0 0 1px 0; font-size: 9pt;">Nome: ________________________________</p>
                    <p style="margin: 0; font-size: 9pt;">CPF: _________________________________</p>
                </div>
                </div>
            </div>

            <div class="contract-institutional-footer">
                <p>${empresaNome} — CNPJ ${empresaCnpj}</p>
                <p>${empresaEndereco}, ${empresaCidade} - ${empresaUf}, CEP ${empresaCep}</p>
                ${vendedorContato ? `<p>${vendedorContato}</p>` : ""}
            </div>
            </div>
        </div>
    `;
}
