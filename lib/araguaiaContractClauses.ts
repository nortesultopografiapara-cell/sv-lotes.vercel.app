/**
 * Cláusulas jurídicas — Chacreamento Araguaia (texto corrido).
 * Redação alinhada ao instrumento de referência anexado; dados variáveis via contexto.
 */

import type { AraguaiaContractContext } from '@/lib/araguaiaContractContext';
import { formatSellerCpfDisplay } from '@/lib/projectContractSellers';

function esc(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function strong(value: string): string {
  return `<strong>${esc(value)}</strong>`;
}

/** Qualificação do vendedor: omite campos ausentes (sem placeholders). */
function sellerQualification(ctx: AraguaiaContractContext, index: number): string {
  const seller = ctx.sellers[index];
  if (!seller) return '<em>[promitente vendedor não configurado]</em>';
  const parts: string[] = [strong(seller.name)];
  if (seller.nationality) parts.push(`nacionalidade ${esc(seller.nationality)}`);
  if (seller.maritalStatus) parts.push(esc(seller.maritalStatus));
  if (seller.profession) parts.push(`profissão ${esc(seller.profession)}`);
  if (seller.rg) parts.push(`RG nº ${strong(seller.rg)}`);
  if (seller.cpf) {
    parts.push(
      `CPF nº ${strong(formatSellerCpfDisplay(seller.cpf) || seller.cpf)}`,
    );
  }
  if (seller.address) {
    parts.push(`residente e domiciliado(a) em ${esc(seller.address)}`);
  }
  return parts.join(', ');
}

function buyerQualification(ctx: AraguaiaContractContext): string {
  const parts = [
    strong(ctx.buyerName),
    `nacionalidade ${esc(ctx.buyerNationality)}`,
    esc(ctx.buyerMaritalStatus),
    `profissão ${esc(ctx.buyerProfession)}`,
    ctx.buyerRgLine && ctx.buyerRgLine !== 'não informado'
      ? esc(ctx.buyerRgLine)
      : '<em>[RG pendente]</em>',
    `CPF nº ${strong(ctx.buyerCpf)}`,
    `E-MAIL: ${esc(ctx.buyerEmail)}`,
    `WHATSAPP: ${esc(ctx.buyerPhone)}`,
    `residente e domiciliado(a) em ${esc(ctx.buyerAddress)}`,
  ];
  return parts.join(', ');
}

function chacaraLabel(ctx: AraguaiaContractContext): string {
  const n = strong(ctx.chacaraNumber);
  if (ctx.quadra) return `Chácara nº ${n}, Quadra ${strong(ctx.quadra)}`;
  return `Chácara nº ${n}`;
}

function areaPhrase(ctx: AraguaiaContractContext): string {
  const num = strong(ctx.areaFmt);
  if (ctx.areaExtenso) return `${num} (${esc(ctx.areaExtenso)})`;
  return num;
}

function moneyPhrase(fmt: string, extenso: string): string {
  if (extenso) return `${strong(fmt)} (${esc(extenso)})`;
  return strong(fmt);
}

/**
 * Título + primeiro parágrafo no mesmo bloco evitável de quebra de página
 * (Chromium/Puppeteer print). Demais parágrafos ficam fora do keep.
 */
function clauseHtml(title: string, leadHtml: string, restHtml = ''): string {
  return `
    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <div class="araguaia-clause-keep">
        <p class="araguaia-clause-title" style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">${title}</p>
        <p class="araguaia-clause-lead" style="margin: 0 0 10px 0;">${leadHtml}</p>
      </div>
      ${restHtml}
    </div>`;
}

/** Marcador estável para testes. */
export const ARAGUAIA_LEGAL_MARKER =
  'CLÁUSULA PRIMEIRA – DO OBJETO';

export const ARAGUAIA_CONTRACT_TITLE =
  'INSTRUMENTO PARTICULAR DE PROMESSA DE COMPRA E VENDA DE IMÓVEL';

export function buildAraguaiaPartiesPreambleHtml(
  ctx: AraguaiaContractContext,
): string {
  const spouseLine = ctx.hasSpouse
    ? `<p style="margin: 0 0 12px 0; text-align: justify;">e seu(sua) cônjuge anuente ${ctx.spouseQualificationHtml}, doravante designado(a) simplesmente <strong>CÔNJUGE ANUENTE</strong>;</p>`
    : '';

  return `
    <div class="contract-clause contract-araguaia-parties" style="margin-bottom: 14px;">
      <p style="margin: 0 0 12px 0; text-align: justify;">
        Pelo presente instrumento particular de promessa de compra e venda de imóvel, de um lado:
      </p>
      <p style="margin: 0 0 12px 0; text-align: justify;">
        <strong>PROMITENTE VENDEDOR 1:</strong> ${sellerQualification(ctx, 0)}, doravante designado simplesmente <strong>PROMITENTE VENDEDOR</strong>;
      </p>
      <p style="margin: 0 0 12px 0; text-align: justify;">
        <strong>PROMITENTE VENDEDOR 2:</strong> ${sellerQualification(ctx, 1)}, doravante igualmente designada <strong>PROMITENTE VENDEDOR</strong>;
      </p>
      <p style="margin: 0 0 12px 0; text-align: justify;">
        <strong>PROMITENTE COMPRADOR(A):</strong> ${buyerQualification(ctx)}, doravante designado(a) simplesmente <strong>PROMITENTE COMPRADOR(A)</strong>;
      </p>
      ${spouseLine}
      <p style="margin: 0 0 12px 0; text-align: justify;">
        e, como <strong>INTERVENIENTE</strong>, a empresa <strong>${esc(ctx.intervenienteName)}</strong>,
        inscrita no CNPJ sob o nº ${strong(ctx.intervenienteCnpj)}, com sede em ${esc(ctx.intervenienteAddress)}${ctx.intervenienteCityUf ? `, ${esc(ctx.intervenienteCityUf)}` : ''},
        doravante designada simplesmente <strong>INTERVENIENTE</strong>.
      </p>
      <p style="margin: 0 0 12px 0; text-align: justify;">
        As partes acima qualificadas têm entre si justo e contratado o seguinte:
      </p>
    </div>`;
}

export function buildAraguaiaClausesHtml(ctx: AraguaiaContractContext): string {
  const parcelasTxt =
    ctx.qtdParcelas > 0
      ? `${strong(String(ctx.qtdParcelas))} (${esc(
          ctx.qtdParcelas === 1 ? 'uma' : String(ctx.qtdParcelas),
        )}) parcelas mensais e consecutivas de ${moneyPhrase(ctx.parcelaFmt, ctx.parcelaExtenso)}`
      : '<em>[quantidade de parcelas pendente]</em>';

  const vencimento =
    ctx.primeiroVencimentoLong ||
    ctx.primeiroVencimentoFmt ||
    '<em>[primeiro vencimento pendente]</em>';

  const brokerLine = ctx.brokerCpf
    ? `${strong(ctx.brokerName)}, CPF nº ${strong(ctx.brokerCpf)}`
    : strong(ctx.brokerName);

  return `
    ${clauseHtml(
      ARAGUAIA_LEGAL_MARKER,
      `Os PROMITENTES VENDEDORES prometem vender ao(à) PROMITENTE COMPRADOR(A), que promete comprar, o imóvel situado no empreendimento <strong>Chacreamento Araguaia</strong>, identificado como ${chacaraLabel(ctx)}, com área total de ${areaPhrase(ctx)}, possuindo:`,
      `<p style="margin: 0 0 6px 0; padding-left: 12px;">
        <strong>Frente:</strong> ${strong(ctx.frenteM)};
      </p>
      <p style="margin: 0 0 6px 0; padding-left: 12px;">
        <strong>Fundo:</strong> ${strong(ctx.fundoM)};
      </p>
      <p style="margin: 0 0 6px 0; padding-left: 12px;">
        <strong>Lateral Direita:</strong> ${strong(ctx.ladoDireitoM)};
      </p>
      <p style="margin: 0 0 10px 0; padding-left: 12px;">
        <strong>Lateral Esquerda:</strong> ${strong(ctx.ladoEsquerdoM)}.
      </p>
      <p style="margin: 0 0 10px 0;">
        O imóvel objeto deste instrumento é transferido no estado em que se encontra, conhecidas e aceitas pelo(a) PROMITENTE COMPRADOR(A) suas características e área total.
      </p>`,
    )}

    ${clauseHtml(
      'CLÁUSULA SEGUNDA – DO PREÇO E FORMA DE PAGAMENTO',
      `O preço total da promessa de compra e venda é de ${moneyPhrase(ctx.valorTotalFmt, ctx.valorTotalExtenso)}, a ser pago pelo(a) PROMITENTE COMPRADOR(A) da seguinte forma:`,
      `<p style="margin: 0 0 8px 0; padding-left: 12px;">
        <strong>a)</strong> Entrada no valor de ${moneyPhrase(ctx.entradaFmt, ctx.entradaExtenso)}, paga na forma e data ajustadas entre as partes;
      </p>
      <p style="margin: 0 0 8px 0; padding-left: 12px;">
        <strong>b)</strong> O saldo remanescente em ${parcelasTxt}, vencendo a primeira em ${typeof vencimento === 'string' && !vencimento.startsWith('<') ? strong(vencimento) : vencimento}, e as demais no mesmo dia dos meses subsequentes;
      </p>
      <p style="margin: 0 0 10px 0; padding-left: 12px;">
        <strong>c)</strong> Os pagamentos poderão ser efetuados mediante boleto bancário ou outro meio indicado pela INTERVENIENTE, correndo por conta do(a) PROMITENTE COMPRADOR(A) eventuais encargos de emissão e liquidação.
      </p>
      <p style="margin: 0 0 10px 0;">
        A quitação plena, geral e irrevogável somente será concedida após a efetiva confirmação do pagamento integral do preço.
      </p>`,
    )}

    ${clauseHtml(
      'CLÁUSULA TERCEIRA – DO REAJUSTE',
      `As parcelas pactuadas neste instrumento sujeitam-se a reajustamento monetário anual pela variação positiva do índice <strong>${esc(ctx.correctionLabel)}</strong>, ou outro índice que venha a substituí-lo oficialmente, conforme condição financeira registrada na venda.`,
      `<p style="margin: 0 0 10px 0;">
        Não haverá aplicação de índice negativo em prejuízo das parcelas já vencidas e pagas.
      </p>`,
    )}

    ${clauseHtml(
      'CLÁUSULA QUARTA – DA POSSE',
      `A posse do imóvel será transmitida ao(à) PROMITENTE COMPRADOR(A) nas condições ajustadas entre as partes, passando o(a) PROMITENTE COMPRADOR(A) a responder, a partir de então, por todas as obrigações decorrentes da ocupação, uso e conservação do imóvel, inclusive tributos e taxas que sobre ele incidam.`,
    )}

    ${clauseHtml(
      'CLÁUSULA QUINTA – DA INFRAESTRUTURA',
      `O(A) PROMITENTE COMPRADOR(A) declara ter ciência das condições de infraestrutura do empreendimento Chacreamento Araguaia, inclusive quanto a água, energia elétrica e demais serviços, comprometendo-se a observar as normas do empreendimento e da legislação aplicável, bem como a arcar com custos de ligações individuais e padrões exigidos pelas concessionárias.`,
    )}

    ${clauseHtml(
      'CLÁUSULA SEXTA – DO INADIMPLEMENTO',
      `O atraso no pagamento de qualquer parcela implicará a incidência de multa, juros e correção monetária na forma da lei e das condições financeiras da venda, sem prejuízo das demais sanções previstas neste instrumento.`,
      `<p style="margin: 0 0 10px 0;">
        Persistindo o inadimplemento, os PROMITENTES VENDEDORES poderão considerar rescindido o presente contrato, resguardados os direitos e as retenções legalmente admitidos.
      </p>`,
    )}

    ${clauseHtml(
      'CLÁUSULA SÉTIMA – DA RESCISÃO',
      `Em caso de rescisão por inadimplemento do(a) PROMITENTE COMPRADOR(A), aplicar-se-ão as retenções e devoluções previstas na legislação vigente e neste instrumento, observando-se a boa-fé e o equilíbrio contratual.`,
    )}

    ${clauseHtml(
      'CLÁUSULA OITAVA – DA IRREVOGABILIDADE',
      `O presente instrumento é celebrado em caráter irrevogável e irretratável, obrigando as partes, seus herdeiros e sucessores, salvo nas hipóteses expressamente previstas em lei ou neste contrato.`,
    )}

    ${clauseHtml(
      'CLÁUSULA NONA – DOS TRIBUTOS',
      `Correrão por conta do(a) PROMITENTE COMPRADOR(A), a partir da imissão na posse, o ITBI, IPTU, ITR e demais tributos, taxas e contribuições que incidam ou venham a incidir sobre o imóvel, bem como as despesas de escritura e registro, quando devidos.`,
    )}

    ${clauseHtml(
      'CLÁUSULA DÉCIMA – DAS OBRIGAÇÕES GERAIS',
      `O(A) PROMITENTE COMPRADOR(A) obriga-se a não transferir os direitos deste contrato a terceiros sem anuência prévia e escrita dos PROMITENTES VENDEDORES e da INTERVENIENTE, bem como a manter atualizados seus dados de contato.`,
    )}

    ${clauseHtml(
      'CLÁUSULA DÉCIMA PRIMEIRA – DA INTERVENIÊNCIA',
      `A INTERVENIENTE participa deste instrumento para intermediação e acompanhamento da operação, sem transferir para si a qualidade de PROMITENTE VENDEDORA do imóvel, a qual permanece com as pessoas físicas acima qualificadas.`,
    )}

    ${clauseHtml(
      'CLÁUSULA DÉCIMA SEGUNDA – DO FORO',
      `Fica eleito o foro da comarca do imóvel ou da sede da INTERVENIENTE, à escolha do autor da ação, para dirimir quaisquer dúvidas oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.`,
    )}

    ${clauseHtml(
      'CLÁUSULA DÉCIMA TERCEIRA – DA CORRETAGEM',
      `A intermediação desta operação foi realizada pelo(a) corretor(a) ${brokerLine}, reconhecendo as partes a atuação do profissional na concretização do negócio, nos termos da legislação aplicável.`,
    )}`;
}
