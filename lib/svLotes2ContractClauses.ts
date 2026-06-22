/**
 * Cláusulas do modelo SV LOTES 2.0 (Recomendado).
 */

import type { SvLotes2ContractContext } from '@/lib/svLotes2ContractContext';
import { buildSaleContractElectronicSignatureClauseHtml } from '@/lib/saleContractLegalTemplate';

function row(label: string, value: string): string {
  const clean = String(value || '—').trim() || '—';
  return `<tr><td class="label">${label}</td><td>${clean}</td></tr>`;
}

export function buildSvLotes2SummaryHtml(ctx: SvLotes2ContractContext): string {
  const parcelasLabel = ctx.isCashPayment
    ? 'À vista'
    : `${ctx.qtdParcelas} parcela(s)`;

  return `
    <table class="sv2-summary">
      ${row('EMPREENDIMENTO', ctx.empreendimentoNome.toUpperCase())}
      ${row('QUADRA', ctx.quadra)}
      ${row('LOTE', ctx.lote)}
      ${row('ÁREA', ctx.area)}
      ${row('MUNICÍPIO', ctx.municipio)}
      ${row('ESTADO', ctx.estado)}
      ${row('COMPRADOR', ctx.clienteNome)}
      ${row('CPF', ctx.buyerCpfFmt)}
      ${row('VENDEDOR', ctx.empresaNome)}
      ${row('VALOR TOTAL', ctx.valorTotalFmt)}
      ${row('ENTRADA', ctx.isCashPayment ? '—' : ctx.entradaFmt)}
      ${row('PARCELAS', parcelasLabel)}
      ${row('VALOR DA PARCELA', ctx.isCashPayment ? '—' : ctx.valorParcelaFmt)}
      ${row('VENCIMENTO', ctx.vencimentoLabel || '—')}
      ${row('DATA DA VENDA', ctx.dataContratoFmt)}
      ${row('CONTRATO Nº', ctx.contractNumber)}
    </table>`;
}

export function buildSvLotes2VendorQualificationHtml(
  ctx: SvLotes2ContractContext,
): string {
  if (ctx.vendorIsPf) {
    const parts = [
      `<strong>VENDEDOR(A):</strong> ${ctx.empresaNome}`,
      ctx.empresaDocumentoFmt
        ? `<strong>${ctx.empresaDocumentoLabel}:</strong> ${ctx.empresaDocumentoFmt}`
        : '',
      ctx.vendorRg ? `<strong>RG:</strong> ${ctx.vendorRg}` : '',
      ctx.vendorMaritalStatus
        ? `<strong>Estado civil:</strong> ${ctx.vendorMaritalStatus}`
        : '',
      ctx.vendorProfession
        ? `<strong>Profissão:</strong> ${ctx.vendorProfession}`
        : '',
      ctx.empresaEndereco !== 'Não informado'
        ? `<strong>Endereço:</strong> ${ctx.empresaEndereco}${ctx.empresaCidade !== 'Não informado' ? `, ${ctx.empresaCidade}-${ctx.empresaUf}` : ''}`
        : '',
    ].filter(Boolean);
    return `<div class="sv2-party-block">${parts.map((p) => `<p>${p}</p>`).join('')}</div>`;
  }

  const parts = [
    `<strong>VENDEDOR(A):</strong> ${ctx.empresaNome}`,
    ctx.empresaDocumentoFmt
      ? `<strong>CNPJ:</strong> ${ctx.empresaDocumentoFmt}`
      : '',
    ctx.empresaEndereco !== 'Não informado'
      ? `<strong>Endereço:</strong> ${ctx.empresaEndereco}${ctx.empresaCidade !== 'Não informado' ? `, ${ctx.empresaCidade}-${ctx.empresaUf}` : ''}`
      : '',
    ctx.empresaRepresentante && ctx.empresaRepresentante !== 'Não Informado'
      ? `<strong>Representante legal:</strong> ${ctx.empresaRepresentante}${ctx.empresaRepresentanteDocFmt ? `, CPF ${ctx.empresaRepresentanteDocFmt}` : ''}`
      : '',
  ].filter(Boolean);
  return `<div class="sv2-party-block">${parts.map((p) => `<p>${p}</p>`).join('')}</div>`;
}

export function buildSvLotes2BuyerQualificationHtml(
  ctx: SvLotes2ContractContext,
): string {
  const parts = [
    `<strong>COMPRADOR(A):</strong> ${ctx.clienteNome}`,
    `<strong>CPF:</strong> ${ctx.buyerCpfFmt}${ctx.clienteIdentitySuffix}`,
    ctx.clienteRg ? `<strong>RG:</strong> ${ctx.clienteRg}` : '',
    `<strong>Estado civil:</strong> ${ctx.clienteEstadoCivil}`,
    `<strong>Profissão:</strong> ${ctx.clienteProfissao}`,
    ctx.clienteTelefone ? `<strong>Telefone:</strong> ${ctx.clienteTelefone}` : '',
    ctx.clienteEmail ? `<strong>E-mail:</strong> ${ctx.clienteEmail}` : '',
    `<strong>Endereço:</strong> ${ctx.clienteEndereco}${ctx.clienteBairro ? `, ${ctx.clienteBairro}` : ''}, ${ctx.clienteCidade}-${ctx.clienteUf}, CEP ${ctx.clienteCep}${ctx.clienteConjugeSuffix}`,
  ].filter(Boolean);
  return `<div class="sv2-party-block">${parts.map((p) => `<p>${p}</p>`).join('')}</div>`;
}

export function buildSvLotes2ClausesHtml(ctx: SvLotes2ContractContext): string {
  const objeto = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA PRIMEIRA — DO OBJETO:</strong> O(A) VENDEDOR(A) promete vender ao(à) COMPRADOR(A), que promete comprar, o imóvel identificado como <strong>LOTE ${ctx.lote} DA QUADRA ${ctx.quadra}</strong>${ctx.projectDescString}${ctx.lotLocationSuffix}, integrante do empreendimento <strong>${ctx.empreendimentoNome.toUpperCase() || '—'}</strong>, com área de <strong>${ctx.area}</strong>, ${ctx.lotBoundariesClause}${ctx.curvaClause}</p>
    </div>`;

  const preco = `
    <div class="sv2-clause">
      ${ctx.clauseQuartaHtml.replace('Cláusula Quarta', 'CLÁUSULA SEGUNDA — DO PREÇO E FORMA DE PAGAMENTO')}
    </div>`;

  const posse = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA TERCEIRA — DA POSSE:</strong> A posse do imóvel será transmitida ao(à) COMPRADOR(A) na data de assinatura deste instrumento, ou na data acordada entre as partes, exclusivamente para fins de conservação, cercamento e benfeitorias permitidas, respondendo o(a) COMPRADOR(A) por danos causados a terceiros a partir dessa data.</p>
    </div>`;

  const obrigComprador = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA QUARTA — DAS OBRIGAÇÕES DO(A) COMPRADOR(A):</strong> Cumprir pontualmente o pagamento do preço; manter cadastro atualizado; responder por tributos, taxas e encargos incidentes sobre o imóvel após a transmissão da posse; não ceder ou transferir o imóvel sem anuência do(a) VENDEDOR(A), quando aplicável; observar normas urbanísticas, ambientais e registrais.</p>
    </div>`;

  const obrigVendedor = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA QUINTA — DAS OBRIGAÇÕES DO(A) VENDEDOR(A):</strong> Garantir a regularidade dominial do imóvel na data da assinatura; fornecer documentação necessária à outorga da escritura definitiva, quando cabível; colaborar com o registro e eventuais regularizações cadastrais dentro dos prazos legais.</p>
    </div>`;

  const tributos = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA SEXTA — DOS TRIBUTOS E TAXAS:</strong> Desde a transmissão da posse, corre por conta exclusiva do(a) COMPRADOR(A) o pagamento de IPTU, taxas condominiais ou associativas, contribuições de melhoria e demais encargos incidentes sobre o imóvel, salvo disposição legal em contrário.</p>
    </div>`;

  const inadimplencia = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA SÉTIMA — DA INADIMPLÊNCIA:</strong> O atraso no pagamento de qualquer parcela implicará multa moratória de <strong>2% (dois por cento)</strong>, juros de <strong>1% (um por cento) ao mês</strong> e correção monetária pelo índice legal ou contratualmente previsto, sem prejuízo das demais medidas previstas neste instrumento.</p>
    </div>`;

  const rescisao = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA OITAVA — DA RESCISÃO CONTRATUAL:</strong> Em caso de rescisão por culpa do(a) COMPRADOR(A), poderá haver retenção de despesas administrativas e encargos comprovados, bem como devolução parcial dos valores pagos, conforme percentuais e prazos compatíveis com a legislação aplicável e a natureza do empreendimento. A rescisão observará notificação prévia e apuração de saldo devedor ou credor.</p>
    </div>`;

  const benfeitorias = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA NONA — DAS BENFEITORIAS:</strong> Benfeitorias necessárias, úteis ou voluptuárias somente serão indenizadas ou incorporadas ao imóvel nas hipóteses previstas em lei e neste contrato, não gerando direito automático à restituição integral em caso de rescisão.</p>
    </div>`;

  const escritura = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA — DA ESCRITURA DEFINITIVA:</strong> Quitado integralmente o preço e cumpridas as demais condições contratuais, o(a) VENDEDOR(A) outorgará escritura definitiva de compra e venda em favor do(a) COMPRADOR(A), no prazo legal ou acordado, ressalvadas exigências registrais, fiscais e urbanísticas.</p>
    </div>`;

  const sucessores = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA PRIMEIRA — DOS SUCESSORES E HERDEIROS:</strong> O presente contrato vincula as partes, seus herdeiros e sucessores a qualquer título, que assumirão integralmente os direitos e obrigações aqui previstos.</p>
    </div>`;

  const forcaMaior = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA SEGUNDA — DO CASO FORTUITO E FORÇA MAIOR:</strong> Nenhuma das partes responderá por inadimplemento decorrente de caso fortuito ou força maior devidamente comprovados, devendo a parte afetada comunicar o fato à outra no prazo razoável.</p>
    </div>`;

  const lgpd = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA TERCEIRA — DA PROTEÇÃO DE DADOS (LGPD):</strong> As partes declaram ciência de que dados pessoais informados serão tratados exclusivamente para execução deste contrato, cumprimento de obrigações legais, registro, cobrança, assinatura eletrônica e comunicações relacionadas, nos termos da Lei nº 13.709/2018 (LGPD).</p>
    </div>`;

  const assinaturaEletronica = buildSaleContractElectronicSignatureClauseHtml()
    .replace('Cláusula Décima Segunda', 'CLÁUSULA DÉCIMA QUARTA — DA ASSINATURA ELETRÔNICA')
    .replace('class="contract-clause"', 'class="sv2-clause contract-clause"');

  const foro = `
    <div class="sv2-clause">
      ${ctx.forumClauseHtml.replace('Cláusula Décima Terceira', 'CLÁUSULA DÉCIMA QUINTA — DO FORO')}
    </div>`;

  return [
    objeto,
    preco,
    posse,
    obrigComprador,
    obrigVendedor,
    tributos,
    inadimplencia,
    rescisao,
    benfeitorias,
    escritura,
    sucessores,
    forcaMaior,
    lgpd,
    assinaturaEletronica,
    foro,
  ].join('\n');
}

export function buildSvLotes2SignaturesHtml(ctx: SvLotes2ContractContext): string {
  return `
    <div class="sv2-signatures">
      <p style="text-align:center; margin-bottom: 24px;">${ctx.empresaCidade !== 'Não informado' ? ctx.empresaCidade : ctx.municipio || 'Local'}, ${ctx.dataContratoFmt}.</p>
      <div class="sv2-signatures-grid">
        <div class="sv2-sign-line">
          ${ctx.empresaAssinatura}
          <strong>${ctx.empresaNome}</strong><br/>
          ${ctx.empresaDocumentoLabel}: ${ctx.empresaDocumentoFmt}
          ${ctx.representanteAssinaturaHtml}
        </div>
        <div class="sv2-sign-line">
          <strong>${ctx.clienteNome}</strong><br/>
          COMPRADOR(A)<br/>
          CPF: ${ctx.buyerCpfFmt}
        </div>
      </div>
    </div>`;
}
