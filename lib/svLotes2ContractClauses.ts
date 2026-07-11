/**
 * Cláusulas do modelo SV LOTES 2.0 (Recomendado).
 */

import type { SvLotes2ContractContext } from '@/lib/svLotes2ContractContext';
import {
  buildSvLotes2ContractSignatureDateLine,
  buildSvLotes2SummaryGridHtml,
} from '@/lib/svLotes2ContractFormat';
import {
  SV2_BUYER_LABEL,
  SV2_VENDOR_LABEL,
  buildSvLotes2ClauseSegundaHtml,
} from '@/lib/svLotes2ContractTerms';
import { buildSaleContractElectronicSignatureClauseHtml } from '@/lib/saleContractLegalTemplate';

export function buildSvLotes2SummaryHtml(ctx: SvLotes2ContractContext): string {
  // Resumo superior compacto (4 colunas) — só imóvel + partes.
  const fields = [
    { label: 'EMPREENDIMENTO', value: ctx.empreendimentoNome.toUpperCase() },
    { label: 'QUADRA', value: ctx.quadra },
    { label: 'LOTE', value: ctx.lote },
    { label: 'ÁREA', value: ctx.area },
    { label: 'MUNICÍPIO', value: ctx.municipio },
    { label: 'UF', value: ctx.estado },
    { label: 'PROMISSÁRIO(A)', value: ctx.clienteNome },
    { label: 'CPF', value: ctx.buyerCpfFmt },
    { label: 'PROMITENTE VENDEDOR(A)', value: ctx.empresaNome, span: 2 as const },
    { label: 'DATA DA VENDA', value: ctx.dataContratoFmt, span: 2 as const },
  ];

  const grid = buildSvLotes2SummaryGridHtml(fields);
  const financeHtml = String(ctx.balloonFinanceHtml || '');
  return `${grid}${financeHtml}`;
}

export function buildSvLotes2VendorQualificationHtml(
  ctx: SvLotes2ContractContext,
): string {
  if (ctx.vendorIsPf) {
    const parts = [
      `<strong>${SV2_VENDOR_LABEL}:</strong> ${ctx.empresaNome}`,
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
        ? `<strong>Endereço:</strong> ${ctx.empresaEndereco}`
        : '',
    ].filter(Boolean);
    return `<div class="sv2-party-block">${parts.map((p) => `<p>${p}</p>`).join('')}</div>`;
  }

  const parts = [
    `<strong>${SV2_VENDOR_LABEL}:</strong> ${ctx.empresaNome}`,
    ctx.empresaDocumentoFmt
      ? `<strong>CNPJ:</strong> ${ctx.empresaDocumentoFmt}`
      : '',
    ctx.empresaEndereco && ctx.empresaEndereco !== 'Não informado'
      ? `<strong>Endereço:</strong> ${ctx.empresaEndereco}`
      : '',
    ctx.empresaTelefone && ctx.empresaTelefone !== 'Não informado'
      ? `<strong>Telefone:</strong> ${ctx.empresaTelefone}`
      : '',
    ctx.empresaEmail && ctx.empresaEmail !== 'Não informado'
      ? `<strong>E-mail:</strong> ${ctx.empresaEmail}`
      : '',
    ctx.empresaRepresentante && ctx.empresaRepresentante !== 'Não Informado'
      ? `<strong>Representante legal:</strong> ${ctx.empresaRepresentante}${ctx.empresaRepresentanteDocFmt ? `, CPF ${ctx.empresaRepresentanteDocFmt}` : ''}${ctx.vendorRepresentativeRole ? ` — ${ctx.vendorRepresentativeRole}` : ''}`
      : '',
    ctx.vendorRepresentativeEmail
      ? `<strong>E-mail do representante:</strong> ${ctx.vendorRepresentativeEmail}`
      : '',
    ctx.vendorRepresentativePhone
      ? `<strong>Telefone do representante:</strong> ${ctx.vendorRepresentativePhone}`
      : '',
  ].filter(Boolean);
  return `<div class="sv2-party-block">${parts.map((p) => `<p>${p}</p>`).join('')}</div>`;
}

export function buildSvLotes2BuyerQualificationHtml(
  ctx: SvLotes2ContractContext,
): string {
  const parts = [
    `<strong>${SV2_BUYER_LABEL}:</strong> ${ctx.clienteNome}`,
    `<strong>CPF:</strong> ${ctx.buyerCpfFmt}${ctx.clienteIdentitySuffix}`,
    ctx.clienteRg ? `<strong>RG:</strong> ${ctx.clienteRg}` : '',
    `<strong>Estado civil:</strong> ${ctx.clienteEstadoCivil}`,
    `<strong>Profissão:</strong> ${ctx.clienteProfissao}`,
    ctx.clienteTelefone ? `<strong>Telefone:</strong> ${ctx.clienteTelefone}` : '',
    ctx.clienteEmail ? `<strong>E-mail:</strong> ${ctx.clienteEmail}` : '',
    `<strong>Endereço:</strong> ${ctx.clienteEndereco}${ctx.clienteBairro ? `, ${ctx.clienteBairro}` : ''}${ctx.clienteCidade && ctx.clienteCidade !== 'cidade não informada' ? `, ${ctx.clienteCidade}-${ctx.clienteUf}` : ''}${ctx.clienteCep && ctx.clienteCep !== 'cep não informado' ? `, CEP ${ctx.clienteCep}` : ''}${ctx.clienteConjugeSuffix}`,
  ].filter(Boolean);
  return `<div class="sv2-party-block">${parts.map((p) => `<p>${p}</p>`).join('')}</div>`;
}

export function buildSvLotes2ClausesHtml(ctx: SvLotes2ContractContext): string {
  const objeto = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA PRIMEIRA — DO OBJETO:</strong> O(A) ${SV2_VENDOR_LABEL} promete vender ao(à) ${SV2_BUYER_LABEL}, que promete comprar, o imóvel identificado como <strong>LOTE ${ctx.lote} DA QUADRA ${ctx.quadra}</strong>${ctx.projectDescString}${ctx.lotLocationSuffix}, com área de <strong>${ctx.area}</strong>, ${ctx.lotBoundariesClause}${ctx.curvaClause}</p>
    </div>`;

  const preco = buildSvLotes2ClauseSegundaHtml(ctx);

  const posse = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA TERCEIRA — DA POSSE:</strong> A posse do imóvel será transmitida ao(à) ${SV2_BUYER_LABEL} na data de assinatura deste instrumento, ou na data acordada entre as partes, exclusivamente para fins de conservação, cercamento e benfeitorias permitidas, respondendo o(a) ${SV2_BUYER_LABEL} por danos causados a terceiros a partir dessa data.</p>
    </div>`;

  const obrigComprador = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA QUARTA — DAS OBRIGAÇÕES DO(A) ${SV2_BUYER_LABEL}:</strong> Cumprir pontualmente o pagamento do preço; manter cadastro atualizado; responder por tributos, taxas e encargos incidentes sobre o imóvel após a transmissão da posse; não ceder ou transferir o imóvel sem anuência do(a) ${SV2_VENDOR_LABEL}, quando aplicável; observar normas urbanísticas, ambientais e registrais.</p>
    </div>`;

  const obrigVendedor = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA QUINTA — DAS OBRIGAÇÕES DO(A) ${SV2_VENDOR_LABEL}:</strong> Garantir a regularidade dominial do imóvel na data da assinatura; fornecer documentação necessária à outorga da escritura definitiva, quando cabível; colaborar com o registro e eventuais regularizações cadastrais dentro dos prazos legais.</p>
    </div>`;

  const tributos = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA SEXTA — DOS TRIBUTOS E TAXAS:</strong> Desde a transmissão da posse, corre por conta exclusiva do(a) ${SV2_BUYER_LABEL} o pagamento de IPTU, taxas condominiais ou associativas, contribuições de melhoria e demais encargos incidentes sobre o imóvel, salvo disposição legal em contrário.</p>
    </div>`;

  const inadimplenciaAtraso =
    ctx.paymentMode === 'SINGLE_FUTURE'
      ? 'O atraso no pagamento do valor na data de vencimento'
      : 'O atraso no pagamento de qualquer parcela';

  const inadimplencia = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA SÉTIMA — DA INADIMPLÊNCIA:</strong> ${inadimplenciaAtraso} implicará multa moratória de <strong>2% (dois por cento)</strong>, juros de <strong>1% (um por cento) ao mês</strong> e correção monetária pelo índice legal ou contratualmente previsto, sem prejuízo das demais medidas previstas neste instrumento.</p>
    </div>`;

  // TODO(jurídico): parametrizar percentual de retenção em distrato/rescisão via configuração da empresa ou do contrato.
  const rescisao = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA OITAVA — DA RESCISÃO CONTRATUAL:</strong> Em caso de rescisão por culpa do(a) ${SV2_BUYER_LABEL}, poderá haver retenção de despesas administrativas e encargos comprovados, bem como devolução parcial dos valores pagos, conforme percentuais e prazos compatíveis com a legislação aplicável e a natureza do empreendimento. A rescisão observará notificação prévia e apuração de saldo devedor ou credor.</p>
    </div>`;

  const benfeitorias = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA NONA — DAS BENFEITORIAS:</strong> Benfeitorias necessárias, úteis ou voluptuárias somente serão indenizadas ou incorporadas ao imóvel nas hipóteses previstas em lei e neste contrato, não gerando direito automático à restituição integral em caso de rescisão.</p>
    </div>`;

  const escritura = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA — DA ESCRITURA DEFINITIVA:</strong> Quitado integralmente o preço e cumpridas as demais condições contratuais, o(a) ${SV2_VENDOR_LABEL} outorgará escritura definitiva de compra e venda em favor do(a) ${SV2_BUYER_LABEL}, no prazo legal ou acordado, ressalvadas exigências registrais, fiscais e urbanísticas.</p>
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

  const vistoria = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA QUARTA — DA VISTORIA E ACEITE DO IMÓVEL:</strong> O(A) ${SV2_BUYER_LABEL} declara ter realizado vistoria prévia do imóvel, tomando pleno conhecimento de sua localização, dimensões, confrontações, topografia, acessos, servidões e estado de conservação, aceitando-o no estado em que se encontra, nada tendo a reclamar quanto às condições físicas do lote.</p>
    </div>`;

  const protecaoAmbiental = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA QUINTA — DA PROTEÇÃO AMBIENTAL E APP:</strong> O(A) ${SV2_BUYER_LABEL} obriga-se a respeitar a legislação ambiental vigente, inclusive quanto a Áreas de Preservação Permanente (APP), reservas legais, cursos d'água e demais restrições ambientais incidentes sobre o imóvel ou em seu entorno, responsabilizando-se por eventuais infrações praticadas após a transmissão da posse.</p>
    </div>`;

  const cessao = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA SEXTA — DA CESSÃO DE DIREITOS:</strong> É vedada a cessão, transferência ou alienação dos direitos e obrigações decorrentes deste contrato sem prévia anuência escrita do(a) ${SV2_VENDOR_LABEL}, salvo hipóteses previstas em lei ou autorizadas expressamente neste instrumento.</p>
    </div>`;

  const tolerancia = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA SÉTIMA — DA TOLERÂNCIA CADASTRAL E REGISTRAL:</strong> As partes reconhecem que eventuais divergências cadastrais, registrais, de metragem, confrontação ou numeração do lote serão sanadas de boa-fé, dentro dos prazos legais e administrativos aplicáveis, sem que tal tolerância implique renúncia de direitos ou alteração do objeto contratado.</p>
    </div>`;

  const comunicacoes = `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA DÉCIMA OITAVA — DAS COMUNICAÇÕES ELETRÔNICAS:</strong> As partes autorizam o envio de avisos, cobranças, boletos, notificações, links de assinatura e demais comunicações contratuais por meios eletrônicos, inclusive e-mail, WhatsApp e plataforma SV LOTES, reconhecendo validade probatória das comunicações enviadas aos contatos cadastrados.</p>
    </div>`;

  const assinaturaEletronica = buildSaleContractElectronicSignatureClauseHtml()
    .replace('Cláusula Décima Segunda', 'CLÁUSULA DÉCIMA NONA — DA ASSINATURA ELETRÔNICA')
    .replace('class="contract-clause"', 'class="sv2-clause contract-clause"');

  const foro = `
    <div class="sv2-clause">
      ${ctx.forumClauseHtml.replace('Cláusula Décima Terceira', 'CLÁUSULA VIGÉSIMA — DO FORO')}
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
    vistoria,
    protecaoAmbiental,
    cessao,
    tolerancia,
    comunicacoes,
    assinaturaEletronica,
    foro,
  ].join('\n');
}

export function buildSvLotes2SignaturesHtml(ctx: SvLotes2ContractContext): string {
  const signatureDateLine = buildSvLotes2ContractSignatureDateLine(
    ctx.empresaCidade !== 'Não informado' ? ctx.empresaCidade : ctx.municipio || '',
    ctx.empresaUf !== 'Não informado' ? ctx.empresaUf : ctx.estado || '',
    {},
    ctx.dataContratoExtensoFmt,
  );

  return `
    <div class="sv2-signatures">
      <p style="text-align:center; margin-bottom: 24px;">${signatureDateLine}</p>
      <div class="sv2-signatures-grid">
        <div class="sv2-sign-line">
          ${ctx.empresaAssinatura}
          <strong>${ctx.empresaNome}</strong><br/>
          ${SV2_VENDOR_LABEL}<br/>
          ${ctx.empresaDocumentoLabel}: ${ctx.empresaDocumentoFmt}
          ${ctx.representanteAssinaturaHtml}
        </div>
        <div class="sv2-sign-line">
          <strong>${ctx.clienteNome}</strong><br/>
          ${SV2_BUYER_LABEL}<br/>
          CPF: ${ctx.buyerCpfFmt}
        </div>
      </div>
    </div>`;
}
