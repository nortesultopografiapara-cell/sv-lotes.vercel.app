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

function sellerQualification(ctx: AraguaiaContractContext, index: number): string {
  const seller = ctx.sellers[index];
  if (!seller) return '<em>[promitente vendedor não configurado]</em>';
  const parts = [
    strong(seller.name),
    seller.nationality
      ? `nacionalidade ${esc(seller.nationality)}`
      : '<em>[nacionalidade pendente]</em>',
    seller.maritalStatus
      ? esc(seller.maritalStatus)
      : '<em>[estado civil pendente]</em>',
    seller.profession
      ? `profissão ${esc(seller.profession)}`
      : '<em>[profissão pendente]</em>',
    seller.rg ? `RG nº ${strong(seller.rg)}` : '<em>[RG pendente]</em>',
    seller.cpf
      ? `CPF nº ${strong(formatSellerCpfDisplay(seller.cpf) || seller.cpf)}`
      : '<em>[CPF pendente]</em>',
    seller.address
      ? `residente e domiciliado(a) em ${esc(seller.address)}`
      : '<em>[endereço pendente]</em>',
  ];
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
          // número simples por extenso via texto auxiliar curto
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
    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">${ARAGUAIA_LEGAL_MARKER}</p>
      <p style="margin: 0 0 10px 0;">
        Os PROMITENTES VENDEDORES prometem vender ao(à) PROMITENTE COMPRADOR(A), que promete comprar, o imóvel situado no empreendimento <strong>Chacreamento Araguaia</strong>,
        identificado como ${chacaraLabel(ctx)}, com área total de ${areaPhrase(ctx)}, confrontando-se da seguinte forma:
      </p>
      <p style="margin: 0 0 6px 0; padding-left: 12px;">
        <strong>Frente:</strong> ${strong(ctx.frenteM)}, confrontando com ${esc(ctx.confrontanteFrente)};
      </p>
      <p style="margin: 0 0 6px 0; padding-left: 12px;">
        <strong>Fundo:</strong> ${strong(ctx.fundoM)}, confrontando com ${esc(ctx.confrontanteFundo)};
      </p>
      <p style="margin: 0 0 6px 0; padding-left: 12px;">
        <strong>Lateral Direita:</strong> ${strong(ctx.ladoDireitoM)}, confrontando com ${esc(ctx.confrontanteDireita)};
      </p>
      <p style="margin: 0 0 10px 0; padding-left: 12px;">
        <strong>Lateral Esquerda:</strong> ${strong(ctx.ladoEsquerdoM)}, confrontando com ${esc(ctx.confrontanteEsquerda)}.
      </p>
      <p style="margin: 0 0 10px 0;">
        O imóvel objeto deste instrumento é transferido no estado em que se encontra, conhecidas e aceitas pelo(a) PROMITENTE COMPRADOR(A) suas características, confrontações e medidas.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA SEGUNDA – DO PREÇO E FORMA DE PAGAMENTO</p>
      <p style="margin: 0 0 10px 0;">
        O preço total da promessa de compra e venda é de ${moneyPhrase(ctx.valorTotalFmt, ctx.valorTotalExtenso)}, a ser pago pelo(a) PROMITENTE COMPRADOR(A) da seguinte forma:
      </p>
      <p style="margin: 0 0 8px 0; padding-left: 12px;">
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
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA TERCEIRA – DO REAJUSTE</p>
      <p style="margin: 0 0 10px 0;">
        As parcelas pactuadas neste instrumento sujeitam-se a reajustamento monetário anual pela variação positiva do índice <strong>${esc(ctx.correctionLabel)}</strong>, ou outro índice que venha a substituí-lo oficialmente, conforme condição financeira registrada na venda.
      </p>
      <p style="margin: 0 0 10px 0;">
        Não haverá aplicação de índice negativo em prejuízo das parcelas já vencidas e pagas.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA QUARTA – DA POSSE</p>
      <p style="margin: 0 0 10px 0;">
        A posse do imóvel será transmitida ao(à) PROMITENTE COMPRADOR(A) nas condições ajustadas entre as partes, passando o(a) PROMITENTE COMPRADOR(A) a responder, a partir de então, por todas as obrigações decorrentes da ocupação, uso e conservação do imóvel, inclusive tributos e taxas que sobre ele incidam.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA QUINTA – DA INFRAESTRUTURA</p>
      <p style="margin: 0 0 10px 0;">
        O(A) PROMITENTE COMPRADOR(A) declara ter ciência das condições de infraestrutura do empreendimento Chacreamento Araguaia, inclusive quanto a água, energia elétrica e demais serviços, comprometendo-se a observar as normas do empreendimento e da legislação aplicável, bem como a arcar com custos de ligações individuais e padrões exigidos pelas concessionárias.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA SEXTA – DO INADIMPLEMENTO</p>
      <p style="margin: 0 0 10px 0;">
        O atraso no pagamento de qualquer parcela implicará a incidência de multa, juros e correção monetária na forma da lei e das condições financeiras da venda, sem prejuízo das demais sanções previstas neste instrumento.
      </p>
      <p style="margin: 0 0 10px 0;">
        Persistindo o inadimplemento, os PROMITENTES VENDEDORES poderão considerar rescindido o presente contrato, resguardados os direitos e as retenções legalmente admitidos.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA SÉTIMA – DA RESCISÃO</p>
      <p style="margin: 0 0 10px 0;">
        Em caso de rescisão por inadimplemento do(a) PROMITENTE COMPRADOR(A), aplicar-se-ão as retenções e devoluções previstas na legislação vigente e neste instrumento, observando-se a boa-fé e o equilíbrio contratual.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA OITAVA – DA IRREVOGABILIDADE</p>
      <p style="margin: 0 0 10px 0;">
        O presente instrumento é celebrado em caráter irrevogável e irretratável, obrigando as partes, seus herdeiros e sucessores, salvo nas hipóteses expressamente previstas em lei ou neste contrato.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA NONA – DOS TRIBUTOS</p>
      <p style="margin: 0 0 10px 0;">
        Correrão por conta do(a) PROMITENTE COMPRADOR(A), a partir da imissão na posse, o ITBI, IPTU, ITR e demais tributos, taxas e contribuições que incidam ou venham a incidir sobre o imóvel, bem como as despesas de escritura e registro, quando devidos.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA DÉCIMA – DAS OBRIGAÇÕES GERAIS</p>
      <p style="margin: 0 0 10px 0;">
        O(A) PROMITENTE COMPRADOR(A) obriga-se a não transferir os direitos deste contrato a terceiros sem anuência prévia e escrita dos PROMITENTES VENDEDORES e da INTERVENIENTE, bem como a manter atualizados seus dados de contato.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA DÉCIMA PRIMEIRA – DA INTERVENIÊNCIA</p>
      <p style="margin: 0 0 10px 0;">
        A INTERVENIENTE participa deste instrumento para intermediação e acompanhamento da operação, sem transferir para si a qualidade de PROMITENTE VENDEDORA do imóvel, a qual permanece com as pessoas físicas acima qualificadas.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA DÉCIMA SEGUNDA – DO FORO</p>
      <p style="margin: 0 0 10px 0;">
        Fica eleito o foro da comarca do imóvel ou da sede da INTERVENIENTE, à escolha do autor da ação, para dirimir quaisquer dúvidas oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0; text-align: center; font-weight: bold; text-transform: uppercase;">CLÁUSULA DÉCIMA TERCEIRA – DA CORRETAGEM</p>
      <p style="margin: 0 0 10px 0;">
        A intermediação desta operação foi realizada pelo(a) corretor(a) ${brokerLine}, reconhecendo as partes a atuação do profissional na concretização do negócio, nos termos da legislação aplicável.
      </p>
    </div>

    <div class="contract-clause" style="margin-bottom: 12px; text-align: justify;">
      <p style="margin: 0 0 10px 0;">
        E, por estarem assim justos e contratados, firmam o presente instrumento em tantas vias quantas necessárias, na presença das testemunhas abaixo.
      </p>
    </div>`;
}
