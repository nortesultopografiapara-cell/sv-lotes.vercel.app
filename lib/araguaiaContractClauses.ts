/**
 * Cláusulas jurídicas — Chacreamento Araguaia.
 * Fonte oficial: INSTRUMENTO PARTICULAR DE PROMESSA DE COMPRA E VENDA (original).
 * Única exclusão autorizada: confrontantes do lote. Medidas permanecem.
 */

import type { AraguaiaContractContext } from '@/lib/araguaiaContractContext';
import {
  ARAGUAIA_SELLERS_ADDRESS,
  formatSellerCpfDisplay,
} from '@/lib/projectContractSellers';

const extenso = require('extenso');

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

function moneyPhrase(fmt: string, extensoText: string): string {
  if (extensoText) return `${strong(fmt)} (${esc(extensoText)})`;
  return strong(fmt);
}

function sideMetersPhrase(fmt: string, extensoText: string): string {
  if (extensoText) return `${strong(fmt)} (${esc(extensoText)})`;
  return strong(fmt);
}

function parcelsCountPhrase(qtd: number): string {
  if (!(qtd > 0)) return '<em>[quantidade de parcelas pendente]</em>';
  try {
    const words = String(extenso(String(qtd)));
    return `${strong(String(qtd))} (${esc(words)})`;
  } catch {
    return strong(String(qtd));
  }
}

function sellerInline(ctx: AraguaiaContractContext, index: number): string {
  const seller = ctx.sellers[index];
  if (!seller) return '<em>[promitente vendedor não configurado]</em>';
  const parts: string[] = [strong(seller.name.toUpperCase())];
  if (seller.nationality) parts.push(esc(seller.nationality));
  if (seller.maritalStatus) parts.push(esc(seller.maritalStatus));
  if (seller.profession) parts.push(esc(seller.profession));
  if (seller.cpf) {
    parts.push(
      `inscrito${index === 1 ? 'a' : ''} no CPF sob o nº ${strong(
        formatSellerCpfDisplay(seller.cpf) || seller.cpf,
      )}`,
    );
  }
  if (seller.rg) {
    parts.push(`e no RG nº ${strong(seller.rg)}`);
  }
  return parts.join(', ');
}

function buyerQualification(ctx: AraguaiaContractContext): string {
  const parts = [
    strong(ctx.buyerName),
    esc(ctx.buyerNationality),
    esc(ctx.buyerMaritalStatus),
    esc(ctx.buyerProfession),
    `e-mail: ${esc(ctx.buyerEmail)}`,
    `telefone/Whatsapp ${esc(ctx.buyerPhone)}`,
    `residente e domiciliado(a) na ${esc(ctx.buyerAddress)}`,
    `inscrito(a) no CPF nº ${strong(ctx.buyerCpf)}`,
  ];
  if (ctx.buyerRgLine && ctx.buyerRgLine !== 'não informado') {
    parts.push(`e no RG nº ${esc(ctx.buyerRgLine)}`);
  }
  return parts.join(', ');
}

function chacaraLabel(ctx: AraguaiaContractContext): string {
  const n = strong(ctx.chacaraNumber);
  if (ctx.quadra) return `chácara nº ${n}, Quadra ${strong(ctx.quadra)}`;
  return `chácara nº ${n}`;
}

function areaPhrase(ctx: AraguaiaContractContext): string {
  const num = strong(ctx.areaFmt);
  if (ctx.areaExtenso) return `${num} (${esc(ctx.areaExtenso)})`;
  return num;
}

/**
 * Título + primeiro parágrafo — evita título órfão na paginação Chromium.
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

function itemP(html: string): string {
  return `<p style="margin: 0 0 10px 0; text-align: justify;">${html}</p>`;
}

/** Mantém o bloco inteiro na mesma página (CSS + avoid ARAGUAIA). */
function keepTogether(extraClass: string, innerHtml: string): string {
  const cls = ['araguaia-keep-together', extraClass].filter(Boolean).join(' ');
  return `<div class="${cls}">${innerHtml}</div>`;
}

/** Marcador estável para testes. */
export const ARAGUAIA_LEGAL_MARKER =
  'CLÁUSULA PRIMEIRA – DESCRIÇÃO DO IMÓVEL';

export const ARAGUAIA_CONTRACT_TITLE =
  'INSTRUMENTO PARTICULAR DE PROMESSA DE COMPRA E VENDA DE IMÓVEL';

export function buildAraguaiaPartiesPreambleHtml(
  ctx: AraguaiaContractContext,
): string {
  const seller1 = sellerInline(ctx, 0);
  const seller2 = sellerInline(ctx, 1);
  const sellersAddress =
    ctx.sellers[0]?.address ||
    ctx.sellers[1]?.address ||
    ARAGUAIA_SELLERS_ADDRESS;
  const intervenienteSeat = ARAGUAIA_SELLERS_ADDRESS;

  const spouseLine = ctx.hasSpouse
    ? itemP(
        `e seu(sua) cônjuge anuente ${ctx.spouseQualificationHtml}, doravante designado(a) simplesmente <strong>CÔNJUGE ANUENTE</strong>;`,
      )
    : '';

  return `
    <div class="contract-clause contract-araguaia-parties" style="margin-bottom: 14px;">
      ${itemP(
        `Pelo presente Instrumento Particular de Promessa de Compra e Venda, de um lado ${seller1} e ${seller2}, ambos residentes e domiciliados na ${esc(
          sellersAddress,
        )}, neste ato representados pela pessoa jurídica <strong>${esc(
          ctx.intervenienteName,
        )}</strong>, com sede na ${esc(
          intervenienteSeat,
        )} (<strong>INTERVENIENTE</strong>), doravante denominados simplesmente de <strong>PROMITENTES VENDEDORES</strong>, e de outro lado ${buyerQualification(
          ctx,
        )}, doravante denominado(s) <strong>PROMITENTE(S) COMPRADOR(A/ES)</strong>, têm entre si justos e contratados mediante as cláusulas e condições abaixo estabelecidas o presente contrato de promessa de compra e venda de bem imóvel:`,
      )}
      ${spouseLine}
    </div>`;
}

export function buildAraguaiaClausesHtml(ctx: AraguaiaContractContext): string {
  const vencimento =
    ctx.primeiroVencimentoFmt ||
    ctx.primeiroVencimentoLong ||
    '<em>[primeiro vencimento pendente]</em>';
  const vencimentoHtml =
    typeof vencimento === 'string' && !vencimento.startsWith('<')
      ? strong(vencimento)
      : vencimento;

  // Redação literal do contrato original (itens 1 e 2). Item 3 permanece IGP-M/FGV.
  const igpmItem1 = 'Índice Geral de Preços de Mercado – IGP-M';
  const igpmItem2 = 'Índice Geral de Preços do Mercado – IGP-M';

  const brokerLine = ctx.brokerCpf
    ? `${strong(ctx.brokerName)}, CPF nº ${strong(ctx.brokerCpf)}`
    : strong(ctx.brokerName);

  const measuresRunning = `medindo: frente ${sideMetersPhrase(
    ctx.frenteM,
    ctx.frenteMExtenso,
  )}, fundo ${sideMetersPhrase(
    ctx.fundoM,
    ctx.fundoMExtenso,
  )}, lateral direita ${sideMetersPhrase(
    ctx.ladoDireitoM,
    ctx.ladoDireitoMExtenso,
  )} e lateral esquerda ${sideMetersPhrase(
    ctx.ladoEsquerdoM,
    ctx.ladoEsquerdoMExtenso,
  )}`;

  return `
    ${clauseHtml(
      ARAGUAIA_LEGAL_MARKER,
      `Os PROMITENTES VENDEDORES afirmam ser senhores e legítimos possuidores do imóvel rural denominado “Lotes 33, 34 e 36 – parte 01”, situado no Projeto de Assentamento Palmares Sul, Zona Rural, localizado no município de Parauapebas – PA, com área total de <strong>13,0958 ha</strong> (treze hectares, nove ares e cinquenta e oito centiares), conforme consta no título nº <strong>MB034600000389</strong>, expedido pelo Instituto Nacional de Colonização e Reforma Agrária – INCRA, nos autos do processo administrativo nº <strong>54600003311/2010-71</strong>, correspondente aos lotes 33, 34 e 36 do Assentamento Palmares Sul – Município de Parauapebas – PA, totalmente livre e desembaraçado de qualquer ônus, conforme consta assentado na matrícula nº <strong>55.278</strong>, lançada no Livro 02 do Registro Geral, ficha 01, do 1º Ofício de Registro de Imóveis de Parauapebas – PA, este servirá para formação do chacreamento denominado Araguaia, composto de <strong>99 chácaras</strong>.`,
    )}

    ${clauseHtml(
      'CLÁUSULA SEGUNDA – DESCRIÇÃO DO OBJETO DA PROMESSA DE COMPRA E VENDA',
      `Na melhor forma de direito o(s) PROMITENTE(S) VENDEDOR(A/ES) prometem vender e o(s) PROMITENTE(S) COMPRADOR(A/ES) prometem comprar o imóvel rural constituído da ${chacaraLabel(
        ctx,
      )}, com área total de ${areaPhrase(
        ctx,
      )}, ${measuresRunning}, com área total de ${areaPhrase(
        ctx,
      )}, constante do chacreamento denominado Araguaia, que é entregue completamente livre de todos e quaisquer ônus judiciais ou extra judicial, foro ou pensão, afirmando ainda sob as penas da lei os ora PROMITENTES VENDEDORES achar-se o imóvel quites de todos os impostos e taxas federais, estaduais e municipais, inclusive condominiais.`,
    )}

    ${clauseHtml(
      'CLÁUSULA TERCEIRA – DA PROMESSA E COMPRA E VENDA. DO VALOR DO IMÓVEL E DAS CONDIÇÕES DE PAGAMENTO',
      `E, assim como possuem, pelo presente e nos melhores termos de direito, os PROMITENTES VENDEDORES prometem e se obrigam a vender o imóvel descrito na cláusula segunda deste instrumento ao(a/s) PROMITENTE(S) COMPRADOR(A/ES), mediante as seguintes cláusulas e condições:`,
      `
      ${itemP(
        `<strong>1</strong> – O preço certo e total ajustado para a presente promessa de compra e venda do imóvel descrito na cláusula segunda deste contrato é de ${moneyPhrase(
          ctx.valorTotalFmt,
          ctx.valorTotalExtenso,
        )}, que será pago a prazo mediante uma entrada no valor de ${moneyPhrase(
          ctx.entradaFmt,
          ctx.entradaExtenso,
        )} e a quitação de ${parcelsCountPhrase(
          ctx.qtdParcelas,
        )} parcelas mensais e consecutivas no valor de ${moneyPhrase(
          ctx.parcelaFmt,
          ctx.parcelaExtenso,
        )}, vencendo a primeira em ${vencimentoHtml}, com incidência de reajustamento monetário aplicado anualmente tendo por base a variação positiva dos 12 meses antecedentes do ${esc(
          igpmItem1,
        )}, ou outro que venha substituí-lo.`,
      )}
      ${itemP(
        `<strong>1.1</strong> – O pagamento, contudo, por opção do(a/s) PROMITENTE(S) COMPRADOR(A/ES), com anuência dos PROMITENTES VENDEDORES, também poderá ser feito em parcela única, mantendo-se as partes obrigadas às demais condições e encargos estabelecidos neste contrato.`,
      )}
      ${itemP(
        `<strong>1.2</strong> – As parcelas descritas no item 1 desta cláusula serão representadas por uma única <strong>nota promissória</strong> emitida pelo(a/s) PROMITENTE(S) COMPRADOR(A/ES) a favor e à ordem dos PROMITENTES VENDEDORES, de natureza <strong>“pro solvendo”</strong> do preço, que deverá ser paga onde for posta em cobrança em caso de inadimplência.`,
      )}
      ${keepTogether(
        'araguaia-financial-item-1-3',
        itemP(
          `<strong>1.3</strong> – Nenhuma parcela poderá ser paga senão em sua totalidade, não sendo admitido o fracionamento do pagamento de qualquer das prestações, salvo se os PROMITENTES VENDEDORES, a seu exclusivo critério e por mera liberalidade, decidir de forma diversa, não se constituindo assim em novação ou alteração dos termos do presente contrato.`,
        ),
      )}
      ${itemP(
        `<strong>2</strong> – O pagamento das parcelas descritas no item 1 desta cláusula será feito mediante a emissão de boletos bancários, sendo que as parcelas serão reajustadas anualmente mediante a aplicação da variação positiva do ${esc(
          igpmItem2,
        )}, ou outro que o substitua.`,
      )}
      ${itemP(
        `<strong>3</strong> – Ocorrendo impontualidade no pagamento de qualquer das parcelas do parcelamento descrito no item 2 deste contrato, a quantia a ser paga será atualizada monetariamente mediante a aplicação do Índice Geral de Preços de Mercado – IGP-M/FGV, desde a data do vencimento da parcela até a data de efetivo pagamento, acrescido ainda de multa moratória de <strong>2%</strong> (dois por cento) calculada sobre o valor total da parcela, acrescida de juros moratórios de <strong>1%</strong> (um por cento) ao mês <em>pro rata die</em>, calculados em <strong>0,0333%</strong> (zero vírgula trinta e três) por dia de atraso, aplicado sobre o valor da parcela devida.`,
      )}
      ${itemP(
        `<strong>4</strong> – Em caso de inadimplência que implique em cobrança judicial ou mesmo extrajudicial, o(a/s) PROMITENTE(S) COMPRADOR(A/ES) arcarão com as custas e honorários advocatícios, estes calculados na base de <strong>20%</strong> (vinte por cento) do valor devido.`,
      )}
      ${itemP(
        `<strong>5</strong> – Em havendo inadimplência superior a <strong>30</strong> (trinta) dias, O(A/S) PROMITENTE(S) COMPRADOR(A/ES) autoriza(m) aos PROMITENTES VENDEDORES a incluir seu nome em bancos de dados de inadimplentes, devendo, para tanto, haver a notificação prévia para quitação do débito inadimplido;`,
      )}
      ${itemP(
        `<strong>6</strong> – Na ocorrência de inadimplência superior a <strong>03</strong> (três) parcelas, o imóvel reverterá em favor dos PROMITENTES VENDEDORES, independente de notificação, sendo que as benfeitorias erigidas sobre o imóvel a ele serão incorporadas, cabendo ao(s) PROMITENTE(S) COMPRADOR(A/ES) a devida indenização pelas obras executadas, cujo valor da indenização será calculado por meio de laudo de avaliação técnica;`,
      )}
      ${itemP(
        `<strong>7</strong> – Ocorrendo a reversão do imóvel em favor dos PROMITENTES VENDEDORES conforme estabelecido no item 6 desta cláusula, os PROMITENTES VENDEDORES deverão pagar a indenização pelas benfeitorias em parcelas não superiores ao parcelamento cumprido pelo(a/s) PROMITENTE(S) COMPRADOR(A/ES);`,
      )}
      ${keepTogether(
        'araguaia-financial-item-8',
        itemP(
          `<strong>8</strong> – Em ocorrendo a reversão do imóvel em favor dos PROMITENTES VENDEDORES por inadimplência do(s) PROMITENTE(ES) COMPRADOR(A/ES) sem que tenham sido erigidas benfeitorias no imóvel, deverão os PROMITENTES VENDEDORES proceder com a devolução dos valores pagos, devendo fazê-lo em tantas parcelas quantas tenham sido quitadas, cabendo-lhes o direito de reter <strong>25%</strong> (vinte e cinco por cento) do valor a ser restituído, a título de taxa de administração; exceto a entrada que será revertida em sua totalidade aos PROMITENTES VENDEDORES.`,
        ),
      )}
      ${itemP(
        `<strong>9</strong> – Nos casos de desistência do(s) PROMITENTE(S) COMPRADOR(A/ES) do negócio estabelecido neste contrato, poderá haver a devolução do imóvel objeto deste compromisso de compra e venda, sendo que no caso do(s) adquirente(s) terem adquirido mais de uma unidade, os valores a serem restituídos poderão ser utilizados para quitação das parcelas ainda devidas da chácara remanescente, valor este que será integralmente creditado em favor do(s) PROMITENTE(S) COMPRADOR(A/ES);`,
      )}
      ${itemP(
        `<strong>10</strong> – No ato da quitação do parcelamento do imóvel objeto deste compromisso de compra e venda, deverá os PROMITENTES VENDEDORES expedirem em favor do(s) PROMITENTE(S) COMPRADOR(A/ES) a respectiva <strong>carta de quitação</strong>.`,
      )}
      `,
    )}

    ${clauseHtml(
      'CLÁUSULA TERCEIRA – CONDIÇÕES GERAIS',
      `Considerando o caráter dessa transação, as partes contratantes reconhecem os termos deste contrato e com eles anuem, especialmente quanto às seguintes condições:`,
      `
      ${itemP(
        `<strong>1</strong> – O imóvel objeto deste contrato é entregue ao(s) PROMITENTE(S) COMPRADOR(A/ES) no ato da assinatura deste instrumento contratual e dele tomam posse, tendo ciência que o empreendimento é entregue com o sistema viário devidamente executado, cabendo ao(s) PROMITENTE(S) COMPRADOR(A/ES) a execução das demais benfeitorias, tais como a implantação do sistema de captação de água e abastecimento de energia elétrica, além do sistema próprio de esgotamento sanitário;`,
      )}
      ${itemP(
        `<strong>2</strong> – O chacreamento é fruto da área pertencente à matrícula nº <strong>55.278</strong>, lançada no Livro 02 do Registro Geral, ficha 01, do 1º Ofício de Registro de Imóveis de Parauapebas – PA, correspondente aos lotes 33; 34 e 36 – parte 01 do Assentamento Palmares Sul – Parauapebas – PA, cabendo ao(s) PROMITENTE(S) COMPRADOR(A/ES) a responsabilidade pela documentação necessária conforme estabelece a legislação regente, inclusive os serviços de <strong>georreferenciamento</strong>, arcando com todos os custos incidentes;`,
      )}
      ${itemP(
        `<strong>3</strong> – Para efeito da efetivação do desmembramento previsto no item 2 desta cláusula, estando o parcelamento devidamente quitado, caberá aos PROMITENTES VENDEDORES fornecerem ao/à(s) PROMITENTE(S) COMPRADOR(A/ES) toda documentação necessária para a concretização deste procedimento, de acordo com o que for requisitado pelo cartório de títulos e documentos.`,
      )}
      ${keepTogether(
        'araguaia-general-conditions-item-4',
        itemP(
          `<strong>4</strong> – O não cumprimento da obrigação estabelecida no item 3 desta cláusula implicará no pagamento de uma multa fixada em <strong>10%</strong> (dez por cento) do valor original da venda em favor do(s) PROMITENTE(S) COMPRADOR(A/ES);`,
        ),
      )}
      ${itemP(
        `<strong>5</strong> – Observadas as disposições contidas neste contrato, estando quitadas as parcelas devidas, os PROMITENTES VENDEDORES outorgarão a(os) PROMITENTE(S) COMPRADOR(A/ES) a respectiva <strong>escritura</strong> pública de venda e compra do imóvel ora negociado, desde que cumpridas as obrigações previstas neste instrumento contratual, inclusive no que se refere aos procedimentos para efetivação do desmembramento da unidade adquirida da porção original do imóvel.`,
      )}
      ${itemP(
        `<strong>6</strong> – Os trabalhos para a concretização da transferência da titularidade do imóvel objeto deste compromisso de compra e venda serão intermediados pela empresa gestora deste contrato, sendo devido pelos serviços prestados o valor correspondente à última parcela paga pelo(s) PROMITENTE(S) COMPRADOR(A/ES);`,
      )}
      `,
    )}

    ${clauseHtml(
      'CLÁUSULA QUARTA – CIÊNCIA DO CONTRATO',
      `O(A/s) PROMITENTE(S) COMPRADOR(A/ES) declara(m) ter pleno conhecimento de todo o teor deste contrato e das cláusulas nele contidas, eximindo os PROMITENTES VENDEDORES de qualquer responsabilidade que não faça parte deste instrumento contratual.`,
    )}

    ${clauseHtml(
      'CLÁUSULA QUINTA – IRREVOGABILIDADE DA TRANSAÇÃO',
      `O presente instrumento é firmado em caráter <strong>IRREVOGÁVEL E IRRETRATÁVEL</strong>, não podendo haver arrependimento nos termos do disposto no artigo 1.094 do Código Civil Brasileiro, obrigação estas que se estende aos contratantes, seus herdeiros e sucessores a qualquer título, devendo-se aplicar ao presente negócio todas as normas previstas no ordenamento jurídico civil vigentes.`,
    )}

    ${clauseHtml(
      'CLÁUSULA SEXTA – RESCISÃO',
      `O presente contrato será rescindido por culpa exclusiva do(a/s) PROMITENTE(S) COMPRADOR(A/ES) em qualquer dos seguintes casos:`,
      `
      ${itemP(
        `<strong>A</strong> – Vencida e não paga qualquer parcela, este compromisso será considerado rescindido <strong>90</strong> (noventa) dias após o vencimento, independentemente de notificação judicial ou extrajudicial, valendo como cláusula resolutiva expressa, nos termos do disposto no artigo 474 do Código Civil (Lei 10.406/2002);`,
      )}
      ${keepTogether(
        'araguaia-sixth-letter-b',
        itemP(
          `<strong>B</strong> – O não pagamento da primeira parcela em até <strong>30</strong> (trinta) dias contados após seu vencimento acarretará a automática rescisão do presente contrato, valendo como cláusula resolutiva, nos termos do disposto no artigo 474 do Código Civil (Lei 10.406/2002);`,
        ),
      )}
      ${keepTogether(
        'araguaia-sixth-letter-c',
        itemP(
          `<strong>C</strong> – Pela venda, cessão de direitos e obrigações ou transferência realizadas sem a expressa anuência dos PROMITENTES VENDEDORES, ou a existência de ações pessoais, reipersecutórias e executivas que de algum modo afetem os direitos e obrigações objeto deste contrato;`,
        ),
      )}
      ${itemP(
        `<strong>D</strong> – Pelo descumprimento de qualquer das cláusulas deste contrato;`,
      )}
      ${itemP(
        `<strong>Parágrafo único</strong> – O(a/s) PROMITENTE(S) COMPRADOR(A/ES) deverá(ão) comunicar aos PROMITENTES VENDEDORES, por escrito, qualquer alteração do seu endereço constante no preâmbulo deste contrato, autorizando senão o fizer a sua convocação, intimação, notificação ou mesmo citação através de edital.`,
      )}
      `,
    )}

    ${clauseHtml(
      'CLÁUSULA SÉTIMA – CESSÃO E TRANSFERÊNCIA',
      `É permitida a cessão e transferência dos direitos relativos a este contrato, que deverá ter a anuência do cônjuge, se for o caso, sendo que a cessão ou transferência somente será possível mediante anuência expressa dos PROMITENTES VENDEDORES, devendo o(a/s) PROMITENTE(S) COMPRADOR(A/ES) estar em dia com o pagamento das parcelas devidas, havendo a cobrança de uma taxa referente a esta transação no valor correspondente ao da última parcela paga.`,
    )}

    ${clauseHtml(
      'CLÁUSULA OITAVA – INFRAESTRUTURA DO CHACREAMENTO',
      `O(A/S) PROMITENTE(S) COMPRADOR(A/ES) desde já declara(m) para todos os efeitos legais e necessários, ter plena ciência de que o chacreamento contará com infraestrutura de <strong>arruamento</strong>, cabendo aos compradores a implantação das demais infraestruturas necessárias.`,
    )}

    ${clauseHtml(
      'CLÁUSULA NONA – OBRIGAÇÕES GERAIS',
      `<strong>A</strong> – O(A/s) PROMITENTE(S) COMPRADOR(A/ES) ficam desde já notificados, que, para fins de atendimento das posturas municipais, bem como para que seja mantido o bom aspecto dos demais lotes da quadra como um todo, deverá manter o imóvel adquirido sempre limpo, providenciando ainda o cercamento da área;`,
      `
      ${itemP(
        `<strong>B</strong> – A partir da celebração deste contrato, todos os tributos que incidem ou venham a incidir sobre o imóvel ora compromissado, correm às expensas do(a/s) PROMITENTE(S) COMPRADOR(A/ES), que se obriga(m) a pagá-los nas épocas e repartições competentes, ainda que lançados em nome de terceiros.`,
      )}
      ${itemP(
        `<strong>C</strong> – O(A/s) PROMITENTE(S) COMPRADOR(A/ES) se declara(m) ciente(s) de que adquiriu o imóvel com a infraestrutura descrita na cláusula oitava deste contrato, sendo que quaisquer outros serviços ou melhoramentos públicos que vierem a ser exigidos pelos poderes públicos correrão à suas expensas.`,
      )}
      `,
    )}

    ${clauseHtml(
      'CLÁUSULA DÉCIMA – SUCESSÃO CONTRATUAL',
      `Pelo falecimento de qualquer uma das partes contratantes, bem como do mutuário originário, não caberá desobrigação a qualquer título dos contratantes, obrigando-se a cumpri-lo por seus respectivos herdeiros e sucessores e quaisquer títulos.`,
    )}

    ${clauseHtml(
      'CLÁUSULA DÉCIMA PRIMEIRA – DISPOSIÇÕES GERAIS',
        `<strong>1</strong> – Pelo princípio da liberdade de contratar prevista no Código Civil Brasileiro, as partes declaram que concordam com plena legalidade das cláusulas aqui entabuladas, isentado-se assim terceiros de toda e qualquer responsabilidade pela assinatura do presente contrato;`,
      `
      ${itemP(
        `<strong>2</strong> – O(A/s) PROMITENTE(S) COMPRADOR(A/ES) declara(m) que visitou(ram) o imóvel prometido conforme descrito na cláusula segunda deste contrato, tendo, portanto, pleno conhecimento quanto à localização, topografia e dimensões;`,
      )}
      ${itemP(
        `<strong>3</strong> – Na eventualidade de ser constatada diferença superior a <strong>05%</strong> (cinco por cento) na área do terreno, para mais ou para menos, a parte prejudicada será ressarcida por meio de acordo a ser firmado entre as partes que passará a integrar este contrato sob a forma de anexo, baseando-se o valor do metro quadrado do terreno vigente à data da formalização deste compromisso;`,
      )}
      ${itemP(
        `<strong>4</strong> – O(A/s) PROMITENTE(S) COMPRADOR(A/ES) declara(m) que os PROMITENTES VENDEDORES e seus prepostos prestaram amplo esclarecimento acerca da presente transação, notadamente no que se refere às características do imóvel, a forma de pagamento e reajustamento das parcelas, tendo as cláusulas deste contrato sido devidamente esclarecidas e que foi concedida antecedência para leitura dos termos lançados neste instrumento, não restando dúvidas quanto ao que foi aqui pactuado;`,
      )}
      ${itemP(
        `<strong>5</strong> – Caberá aos PROMITENTES VENDEDORES arcar com o pagamento da comissão de intermediação e venda realizada pelo corretor de imóveis ${brokerLine}.`,
      )}
      `,
    )}

    ${clauseHtml(
      'CLÁUSULA DÉCIMA SEGUNDA – FORO',
      `As partes contratantes elegem o foro da Comarca de Parauapebas – PA, para que, nele venham a ser dirimidas todas as dúvidas ou questões porventura advindas do presente contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja ou venha a ser.`,
    )}
  `;
}
