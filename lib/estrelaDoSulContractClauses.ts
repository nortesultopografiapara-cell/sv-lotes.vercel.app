/**
 * Cláusulas literais — Chacreamento Estrela do Sul.
 * Interpola só dados dinâmicos. Não resume nem reescreve o jurídico.
 */

import type { EstrelaDoSulContractContext } from '@/lib/estrelaDoSulContractContext';
import {
  ESTRELA_ASSIGNMENT_FEE_PERCENT,
  ESTRELA_CLAUSE_6_5_ESSENTIAL_INFRA_DAYS,
  ESTRELA_COMMERCIAL_START_MAX_MONTHS,
  ESTRELA_COMMERCIAL_START_PERCENT,
  ESTRELA_CONSTRUCTION_EARLY_PAYOFF_MONTHS,
  ESTRELA_CONSTRUCTION_MIN_INSTALLMENT,
  ESTRELA_CORRECTION_INDEX_LABEL,
  ESTRELA_CORRECTION_PERIOD_MONTHS,
  ESTRELA_IRREGULAR_ASSIGNMENT_PENALTY_PERCENT,
  ESTRELA_IRREGULAR_BUILDING_PENALTY_PERCENT,
  ESTRELA_LATE_FINE_PERCENT,
  ESTRELA_LATE_INTEREST_PERCENT,
  ESTRELA_OCCUPANCY_FEE_FLOOR,
  ESTRELA_OCCUPANCY_FEE_PERCENT,
  ESTRELA_RESCISSION_RETENTION_PERCENT,
  ESTRELA_TOPOGRAPHY_FEE_PERCENT,
} from '@/lib/estrelaDoSulContractConstants';
import {
  escEstrelaHtml,
  formatEstrelaBRL,
  formatEstrelaMoneyPhrase,
  estrelaStrong,
} from '@/lib/estrelaDoSulContractFormat';

function plainLen(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

/** Itens acima disto podem quebrar entre linhas; os curtos ficam íntegros. */
const SHORT_ITEM_MAX = 920;

/**
 * Remove só duplicação editorial consecutiva inequívoca herdada do Word
 * (`1.1. 1.1.`, `<strong>2.1.</strong> 2.1.`). Não altera remissões cruzadas
 * (`8.4` citando `8.2`) nem o texto jurídico.
 */
export function collapseEstrelaDuplicateEditorialNumbers(html: string): string {
  return html
    .replace(/(\d+(?:\.\d+)+\.)\s+\1/g, '$1')
    .replace(/(<strong>)(\d+(?:\.\d+)+\.)(<\/strong>)\s*\2/g, '$1$2$3');
}

function p(html: string): string {
  const cleaned = collapseEstrelaDuplicateEditorialNumbers(html);
  const long = plainLen(cleaned) > SHORT_ITEM_MAX;
  const wrapClass = long ? 'estrela-item estrela-item--long' : 'estrela-item';
  return `<div class="${wrapClass}"><p class="estrela-item-p" style="margin: 0 0 6px 0; text-align: justify;">${cleaned}</p></div>`;
}

function item(html: string): string {
  return p(html);
}

function itemGroup(inner: string): string {
  return `<div class="estrela-item-group">${inner}</div>`;
}

function leadTable(lead: string, tableHtml: string): string {
  return `<div class="estrela-lead-table">${lead}${tableHtml}</div>`;
}

function clauseHead(inner: string): string {
  return `<div class="estrela-clause-head">${inner}</div>`;
}

function title(text: string): string {
  return `<h3 class="estrela-clause-title" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; font-weight: bold; text-align: center; text-transform: uppercase; margin: 10px 0 4px 0;">${escEstrelaHtml(text)}</h3>`;
}

function money(ctxAmountFmt: string, extenso: string): string {
  if (extenso) return `${estrelaStrong(ctxAmountFmt)} (${escEstrelaHtml(extenso)})`;
  return estrelaStrong(ctxAmountFmt);
}

function td(html: string): string {
  return `<td style="border:1px solid #111; padding:2px 4px;"><div class="estrela-td-keep">${html}</div></td>`;
}

function thCell(html: string, extra = ''): string {
  return `<th style="border:1px solid #111; padding:2px 4px; text-align:left;${extra}"><div class="estrela-td-keep">${html}</div></th>`;
}

function objectTableCols(): string {
  return `<colgroup><col class="estrela-col-info" style="width:33%;"/><col class="estrela-col-detail" style="width:67%;"/></colgroup>`;
}

export function buildEstrelaDoSulClausesHtml(
  ctx: EstrelaDoSulContractContext,
): string {
  const foro = [ctx.forumCity, ctx.uf].filter(Boolean).join('/');
  const lotLabel = [
    ctx.quadra ? `Quadra ${escEstrelaHtml(ctx.quadra)}` : '',
    ctx.lote ? `lote ${escEstrelaHtml(ctx.lote)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const areaCell = [
    lotLabel ? `Chácara: ${lotLabel}` : 'Chácara',
    ctx.areaPhrase ? `Área Total: ${escEstrelaHtml(ctx.areaPhrase)}` : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const objectTable = `
    <table class="estrela-table estrela-object-table">
      ${objectTableCols()}
      <thead>
        <tr>${thCell('Informação')}${thCell('Detalhamento')}</tr>
      </thead>
      <tbody>
        <tr>${td('Nome do Projeto')}${td(escEstrelaHtml(ctx.enterpriseName))}</tr>
        <tr>${td('Localização do Imóvel')}${td(escEstrelaHtml(ctx.enterpriseLocation))}</tr>
        <tr>${td('Área Vendida')}${td(areaCell || '—')}</tr>
        <tr>${td('MEDIDAS E CONFRONTAÇÕES')}${td(escEstrelaHtml(ctx.confrontacoesText) || '—')}</tr>
        ${
          ctx.partnershipNote
            ? `<tr>${td('Outras informações')}${td(escEstrelaHtml(ctx.partnershipNote))}</tr>`
            : ''
        }
      </tbody>
    </table>`;

  const financeTable = `
    <table class="estrela-table estrela-finance-table estrela-object-table">
      ${objectTableCols()}
      <thead>
        <tr>${thCell('ITEM')}${thCell('VALOR / DETALHAMENTO')}</tr>
      </thead>
      <tbody>
        <tr>${td('VALOR TOTAL DO IMÓVEL')}${td(money(ctx.valorTotalFmt, ctx.valorTotalExtenso))}</tr>
        <tr>${td('VALOR DE CORRETAGEM')}${td(money(ctx.valorCorretagemFmt, ctx.valorCorretagemExtenso))}</tr>
        <tr>${td('VALOR DO SINAL/ENTRADA (ARRAS)')}${td(money(ctx.valorSinalFmt, ctx.valorSinalExtenso))}</tr>
        <tr>${td('PARCELAS E VALORES')}${td(escEstrelaHtml(ctx.parcelasResumo))}</tr>
        <tr>${td('VENCIMENTO DA 1ª PARCELA')}${td(escEstrelaHtml(ctx.dataPrimeiraParcelaFmt || '—'))}</tr>
        <tr>${td('ÍNDICE DE CORREÇÃO ANUAL')}${td(escEstrelaHtml(ctx.indiceCorrecaoCapa))}</tr>
        <tr>${td('MULTA MORATÓRIA POR ATRASO')}${td(`${ESTRELA_LATE_FINE_PERCENT}% (dois por cento) sobre a parcela vencida`)}</tr>
        <tr>${td('JUROS DE MORA POR ATRASO')}${td(`${ESTRELA_LATE_INTEREST_PERCENT}% (um por cento) ao mês`)}</tr>
      </tbody>
    </table>`;

  return `
    <div class="contract-clause">
      ${clauseHead(`
        ${title('CLÁUSULA PRIMEIRA')}
        ${title('DO OBJETO, DA CAPA RESUMO E DOS ANEXOS')}
        ${item(`<strong>1.1.</strong> O objeto deste contrato consubstancia-se na compra e venda a prazo da fração de terras individualizada e designada como ${estrelaStrong(lotLabel || 'CHÁCARA RURAL')}, componente do ${estrelaStrong(ctx.enterpriseName)}, situado no perímetro rural do Município de ${escEstrelaHtml(ctx.municipality || foro)}, Estado do ${escEstrelaHtml(ctx.uf || 'Pará')}. O COMPRADOR declara ter ciência de que o imóvel objeto deste contrato integra empreendimento rural de natureza privada, comprometendo-se a observar as limitações legais e ambientais inerentes à área rural.`)}
      `)}
      ${item('<strong>1.2.</strong> A qualificação, confrontações, memorial descritivo e demais dados técnicos da referida unidade imobiliária constam expressamente da CAPA RESUMO e do ANEXO I – Descrição do Imóvel, os quais constituem partes integrantes e complementares deste pacto.')}
      ${leadTable(
        item('<strong>1.3.</strong> A exata delimitação e as medidas perimetrais da chácara negociada são as seguintes:'),
        objectTable,
      )}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
        ${title('CLÁUSULA SEGUNDA')}
        ${title('PAGAMENTO, REAJUSTE E MORA')}
      `)}
      ${leadTable(
        item('<strong>2.1.</strong> O preço certo e ajustado da unidade imobiliária rural é de:'),
        financeTable,
      )}
      ${p(`<strong>2.2.</strong> Do Saldo Remanescente: O saldo remanescente do preço ajustado será adimplido pelo COMPRADOR em parcelas mensais e sucessivas, cujos valores, quantidades e datas de vencimento encontram-se rigorosamente especificados na Capa Resumo (ou Anexo correspondente) deste instrumento. Saldo remanescente apurado: ${estrelaStrong(ctx.valorSaldoFmt)}.`)}
      ${p(`<strong>2.3.</strong> Da Correção Monetária: As parcelas vincendas sofrerão reajuste monetário anual, aplicando-se a variação positiva acumulada do ${escEstrelaHtml(ESTRELA_CORRECTION_INDEX_LABEL)}. O reajuste incidirá a cada período de ${ESTRELA_CORRECTION_PERIOD_MONTHS} (doze) meses, contados a partir da data de assinatura deste contrato (data-base).`)}
      ${p('<strong>2.4.</strong> Na hipótese de extinção, vedação legal ou ausência de divulgação do IGP-M/FGV, adotar-se-á, de imediato, o IPCA/IBGE ou outro índice oficial que venha a substituí-lo, visando a preservação do equilíbrio econômico-financeiro da avença.')}
      ${itemGroup(`
      ${p(`<strong>2.5.</strong> Dos Encargos Moratórios: O impontual pagamento de qualquer das parcelas, ou de seus respectivos reajustes, constituirá o COMPRADOR em mora de pleno direito, independentemente de prévio aviso, interpelação ou notificação, sujeitando o valor em atraso aos seguintes encargos, calculados de forma cumulativa desde a data do vencimento até a data da efetiva liquidação:`)}
      ${p(`a) Atualização monetária calculada <em>pro rata die</em> (proporcional aos dias de atraso), com base na variação do IGP-M/FGV;<br/>b) Juros de mora de ${ESTRELA_LATE_INTEREST_PERCENT}% (um por cento) ao mês, calculados <em>pro rata die</em>;<br/>c) Multa moratória e irredutível de ${ESTRELA_LATE_FINE_PERCENT}% (dois por cento), incidente sobre o valor total do débito devidamente atualizado.`)}
      `)}
      ${p('<strong>2.6.</strong> Das Arras (Sinal): O valor pago a título de entrada e princípio de pagamento tem caráter de Arras, nos termos dos artigos 417 e seguintes do Código Civil Brasileiro, integrando o preço total do imóvel e sujeitando-se às regras de retenção previstas nas Cláusulas Penais em caso de inexecução do contrato.')}
      ${p('<strong>2.7.</strong> Do Termo de Quitação: Comprovada a liquidação integral do saldo devedor e o fiel cumprimento de todas as obrigações contratuais por parte do COMPRADOR, o VENDEDOR obriga-se a emitir e outorgar o respectivo Termo de Quitação no prazo máximo de 15 (quinze) dias úteis, instrumento este indispensável para a posterior lavratura da Escritura Pública Definitiva.')}
      ${p('<strong>2.8.</strong> Da Comissão de Corretagem: O COMPRADOR declara-se ciente de que o serviço de intermediação imobiliária foi efetivamente prestado, sendo de sua exclusiva responsabilidade o pagamento da comissão de corretagem aos corretores ou imobiliária vinculada, conforme valores e condições discriminados na Capa Resumo deste instrumento.')}
      ${p(`<strong>2.8.1.</strong> O valor de ${money(ctx.valorCorretagemFmt, ctx.valorCorretagemExtenso)} é destinado exclusivamente à corretagem e não integra o preço do imóvel para fins de quitação junto ao VENDEDOR, tratando-se de obrigação autônoma por serviços de intermediação já concluídos.`)}
      ${p('<strong>2.8.2.</strong> Em caso de resolução ou rescisão do presente contrato por culpa do COMPRADOR, o valor pago a título de corretagem não será objeto de restituição, nos termos do Art. 725 do Código Civil.')}
      ${p('<strong>2.9.</strong> Da Rescisão por Inadimplência: Sem prejuízo dos encargos moratórios previstos na cláusula anterior, o atraso no pagamento de qualquer parcela por período superior a 90 (noventa) dias conferirá à VENDEDORA (e/ou Corretora/Imobiliária, se houver poderes de representação) o direito de rescindir o presente contrato de pleno direito.')}
      ${p('<strong>2.9.1.</strong> A rescisão de que trata este artigo fica condicionada à prévia notificação do COMPRADOR, via cartório de títulos e documentos ou carta com aviso de recebimento (AR), concedendo-lhe o prazo de 15 (quinze) dias para purgação da mora (pagamento do débito atualizado).')}
      ${p('<strong>2.9.2.</strong> Transcorrido o prazo da notificação sem a devida quitação, a rescisão se consolidará, sujeitando o COMPRADOR às penalidades de retenção de valores previstas nas Cláusulas Penais deste instrumento e na legislação vigente.')}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA TERCEIRA')}
      ${title('DA TRANSMISSÃO DA POSSE DEFINITIVA')}
      ${p('<strong>3.1.</strong> A eventual liberação do acesso e uso da chácara ao COMPRADOR (antes da conclusão da infraestrutura), na pendência de pagamento do saldo devedor, configurará posse meramente precária, resolúvel e vinculada ao fiel cumprimento deste instrumento.')}
      `)}
      ${p('<strong>3.2.</strong> A referida posse não induzirá, em tempo algum, <em>posse ad usucapionem</em> (para fins de usucapião) e não transferirá a titularidade do bem, a qual permanecerá sob o domínio da VENDEDOR até a efetiva lavratura e registro da Escritura Pública de Compra e Venda, condicionada à quitação total do preço.')}
      ${p('<strong>3.3.</strong> O COMPRADOR reconhece e declara, de forma irretratável, ter procedido à prévia e minuciosa vistoria física da unidade rural ora transacionada, bem como atesta ter verificado sua inserção no loteamento, sua topografia, demarcação perimetral e marcos divisórios, em cotejo com o memorial descritivo e a planta do empreendimento.')}
      ${p('<strong>3.4.</strong> Por conseguinte, o COMPRADOR concorda em adquirir o imóvel como coisa certa e discriminada (venda <em>ad corpus</em>, nos termos do art. 500, § 3º, do Código Civil), aceitando-o no exato estado de conservação e fático em que se encontra, renunciando expressamente ao direito de pleitear eventuais abatimentos de preço, indenizações ou a resolução do contrato por vícios aparentes ou eventuais e irrisórias divergências de metragem.')}
      ${p('<strong>3.5.</strong> Após a quitação integral do preço ora acordado da(s) unidade(s) rurais comercializadas no presente termo e desde que o comprador tenha cumprido todas as suas obrigações previstas neste contrato, será transferida automaticamente ao comprador a posse definitiva, ficando a posse condicionada à finalização das obras de infraestrutura.')}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA QUARTA')}
      ${title('DO INÍCIO DA CONSTRUÇÃO PELO COMPRADOR')}
      `)}
      ${itemGroup(`
      ${p('<strong>4.1.</strong> Das Condições para Edificação e Benfeitorias: A execução de quaisquer obras, edificações ou benfeitorias sejam elas úteis, necessárias ou voluptuárias no lote rural objeto deste contrato ficará estritamente condicionada ao cumprimento cumulativo dos seguintes requisitos por parte do COMPRADOR:')}
      ${p(`I. Comprovar a rigorosa adimplência de todas as obrigações financeiras e contratuais assumidas até a data da solicitação;<br/>II. Obter a prévia e expressa anuência, por escrito, da VENDEDORA;<br/>III. Ter efetivado, no mínimo, o pagamento integral e tempestivo da ${ESTRELA_CONSTRUCTION_MIN_INSTALLMENT}ª (quarta) parcela do cronograma de pagamento deste instrumento.`)}
      `)}
      ${p(`<strong>4.2.</strong> Da Carência para Início das Obras: Na hipótese de o COMPRADOR optar pela antecipação ou quitação das ${ESTRELA_CONSTRUCTION_MIN_INSTALLMENT} (quatro) parcelas iniciais antes de seus respectivos vencimentos, ficará, ainda assim, sujeito a um prazo de carência mínima de ${ESTRELA_CONSTRUCTION_EARLY_PAYOFF_MONTHS} (quatro) meses, contados a partir da data de assinatura deste contrato, para o início de qualquer intervenção no lote. Ficando assegurado à VENDEDORA o direito de prorrogar referido prazo por igual período, mediante justificativa formalizada ao COMPRADOR.`)}
      ${p('<strong>4.3.</strong> Da Remarcação Topográfica: Caso o COMPRADOR necessite de nova demarcação ou conferência dos marcos divisórios da unidade, deverá apresentar requerimento formal e por escrito à VENDEDORA.')}
      ${p(`<strong>4.4.</strong> O deferimento e a execução do serviço estarão condicionados à irrestrita adimplência contratual do solicitante e ao recolhimento prévio de taxa de serviço (honorários topográficos) equivalente a ${ESTRELA_TOPOGRAPHY_FEE_PERCENT}% (um por cento) do valor total e atualizado deste Contrato, pagável mediante boleto bancário emitido especificamente para este fim.`)}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA QUINTA')}
      ${title('DA EDIFICAÇÃO IRREGULAR E SUAS PENALIDADES')}
      `)}
      ${p('<strong>5.1.</strong> Da Infração: A execução de qualquer obra, edificação, benfeitoria ou supressão de vegetação em desacordo com as condições estipuladas neste contrato (incluindo a ausência de prévia e expressa autorização da VENDEDORA), bem como o desrespeito às normas ambientais, urbanísticas ou aos recuos obrigatórios do lote rural individualizado, configurará infração contratual grave e posse de má-fé por parte do COMPRADOR.')}
      ${itemGroup(`
      ${p('<strong>5.2.</strong> Das Sanções e Demolição: Constatada a irregularidade, o COMPRADOR será notificado extrajudicialmente para, no prazo improrrogável de 15 (quinze) dias, paralisar a obra e promover a demolição e o desfazimento das intervenções irregulares, arcando integralmente com os custos de remoção de entulhos e de ações necessárias para a recuperação da área.')}
      ${p(`I. O descumprimento da notificação sujeitará o COMPRADOR ao pagamento de multa não compensatória equivalente a ${ESTRELA_IRREGULAR_BUILDING_PENALTY_PERCENT}% (dez por cento) do valor atualizado deste contrato, sem prejuízo da rescisão de pleno direito do presente instrumento.<br/>II. Fica resguardado à VENDEDORA o direito de, a seu exclusivo critério, promover a demolição das obras irregulares às custas do COMPRADOR, cobrando-lhe os valores despendidos com acréscimo de juros e correção monetária.`)}
      `)}
      ${p('<strong>5.3.</strong> Da Perda das Benfeitorias: Nos termos dos artigos 1.220 e 1.255 do Código Civil, as acessões e benfeitorias introduzidas irregularmente, sem anuência da VENDEDORA ou em violação à lei, não conferirão ao COMPRADOR qualquer direito de retenção ou de indenização, integrando-se ao imóvel em caso de rescisão contratual, se a VENDEDORA não optar por sua demolição.')}
      ${p('<strong>5.4.</strong> Da Responsabilidade Ambiental: O COMPRADOR assume, de forma exclusiva e irrestrita, a responsabilidade civil, penal e administrativa por eventuais danos ambientais que vier a causar no lote (desmatamento irregular, intervenção em Área de Preservação Permanente – APP, poluição, queimadas e outros), obrigando-se a isentar e ressarcir a VENDEDORA por quaisquer multas, autuações ou embargos aplicados por órgãos públicos (IBAMA, SEMAS/PA, SEMMA, Ministério Público e outros).')}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA SEXTA')}
      ${title('DAS CONSTRUÇÕES COLETIVAS E DE SUA VIABILIDADE')}
      `)}
      ${p('<strong>6.1.</strong> Do Escopo da Infraestrutura: O escopo de responsabilidade da VENDEDORA quanto às obras da área restringe-se, única e exclusivamente, à entrega das seguintes benfeitorias:<br/>I. abertura das vias de acesso interno;<br/>II. demarcação física dos lotes rurais;<br/>III. implantação de rede primária de energia elétrica; e<br/>IV. perfuração de poço tubular profundo para captação coletiva de água.')}
      ${p('<strong>6.2.</strong> Fica o COMPRADOR ciente de que quaisquer outras obras de infraestrutura não elencadas neste rol não são de responsabilidade da VENDEDORA.')}
      ${p(`<strong>6.3.</strong> Da Condição Suspensiva: O cronograma físico de execução das referidas obras sujeita-se a uma condição suspensiva estritamente vinculada ao sucesso comercial do empreendimento. Por conseguinte, as obras de infraestrutura iniciar-se-ão quando atingido o marco comercial mínimo de ${ESTRELA_COMMERCIAL_START_PERCENT}% das unidades comercializadas ou quando houver capitalização suficiente para o início das obras, o que ocorrer primeiro, respeitado o prazo máximo de ${ESTRELA_COMMERCIAL_START_MAX_MONTHS} (seis) meses contados da assinatura deste contrato.`)}
      ${p('<strong>6.4.</strong> O COMPRADOR declara expressa ciência e anuência de que as obras de infraestrutura do empreendimento serão executadas sob o regime de implantação em etapas e que o desenvolvimento do cronograma físico-financeiro e a consequente entrega das benfeitorias ocorrerão de maneira escalonada e estritamente proporcional ao volume de vendas e de capitalização do projeto, sem que tal progressividade ou faseamento configure, por si só, mora automática da VENDEDORA, desde que respeitados os prazos máximos previstos neste contrato.')}
      ${p(`<strong>6.5.</strong> O prazo estimado para conclusão da infraestrutura essencial é de até ${ESTRELA_CLAUSE_6_5_ESSENTIAL_INFRA_DAYS} (cento e vinte) dias, admitida prorrogação por motivo de força maior, caso fortuito, condições climáticas adversas ou exigências administrativas de órgãos públicos.`)}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA SÉTIMA')}
      ${title('DA RESPONSABILIDADE PELOS TRIBUTOS E ENCARGOS')}
      `)}
      ${p('<strong>7.1.</strong> Dos Encargos Fiscais e Tributários: O COMPRADOR assume, a partir da assinatura do presente contrato, a responsabilidade exclusiva pelo pagamento de todos os tributos federais, estaduais ou municipais (ITR, IPTU, CCIR/INCRA, taxas ambientais e correlatas) incidentes sobre a unidade adquirida, devendo promover a alteração do cadastro de cobrança para o seu nome assim que legalmente autorizado.')}
      ${p('<strong>7.2.</strong> Caso ainda não exista individualização cadastral da unidade perante os órgãos competentes, o comprador reembolsará a vendedora os tributos incidentes proporcionalmente à área adquirida.')}
      ${p('<strong>7.3.</strong> Do Reembolso e Infração: Caso a VENDEDORA seja compelida a recolher qualquer tributo ou taxa em atraso para evitar a inscrição em Dívida Ativa ou execuções fiscais, exigirá do COMPRADOR o imediato reembolso do valor pago, acrescido de correção monetária (IGP-M/FGV), juros de 1% ao mês e multa de 2%.')}
      ${p('<strong>7.4.</strong> Do Prazo para o Reembolso: O não reembolso no prazo de 48 (quarenta e oito) horas, bem como a reincidência na inadimplência tributária, configurarão infração contratual grave, passível de rescisão do presente instrumento.')}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA OITAVA')}
      ${title('DA CESSÃO DE DIREITOS E TRANSFERÊNCIA')}
      `)}
      ${p('<strong>8.1.</strong> Da Anuência e Requisitos para a Cessão de Direitos: A cessão, transferência ou alienação dos direitos e obrigações decorrentes deste instrumento a terceiros (Cessionários) somente será admitida mediante o cumprimento estrito e cumulativo dos seguintes requisitos:')}
      ${p('I. Estar o COMPRADOR (Cedente) rigorosamente em dia com o pagamento de todas as parcelas, tributos e taxas referentes ao imóvel;')}
      ${p('II. Solicitação formal e por escrito apresentada pelo COMPRADOR com antecedência mínima de 30 (trinta) dias;')}
      ${p('III. Aprovação em prévia e rigorosa análise cadastral e de capacidade financeira do pretenso Cessionário, a critério exclusivo da VENDEDORA;')}
      ${p('IV. Emissão de aprovação expressa e formal por parte da VENDEDORA;')}
      ${p(`V. Pagamento, à vista, de uma Taxa de Cessão e Anuência fixada no patamar de ${ESTRELA_ASSIGNMENT_FEE_PERCENT}% (cinco por cento) do valor total e atualizado deste contrato, destinada ao custeio de despesas administrativas, jurídicas e de refação de cadastro.`)}
      ${p('<strong>8.2.</strong> Do Direito de Preferência (Preempção): Em caso de intenção de venda, cessão ou transferência da unidade imobiliária, o COMPRADOR deverá oferecer o lote previamente e por escrito à VENDEDORA. Esta terá o direito de preferência para a aquisição do bem nas exatas condições (preço e forma de pagamento) ofertadas a terceiros, devendo exercer seu direito no prazo decadencial de 15 (quinze) dias úteis.')}
      ${p('<strong>8.3.</strong> Da Exclusividade na Intermediação (Fase de Cessão de Direitos): Não havendo interesse da VENDEDORA no exercício do direito de preferência, e enquanto não houver a quitação integral do preço ajustado neste contrato, a eventual revenda ou cessão de direitos aquisitivos a terceiros deverá, obrigatoriamente, ocorrer por intermédio da própria VENDEDORA ou de imobiliária/corretor por ela expressamente indicado, visando resguardar a segurança da operação e a análise cadastral do novo adquirente.')}
      ${p('<strong>8.4.</strong> Da Extinção da Exclusividade: Fica expressamente pactuado que a obrigatoriedade de intermediação exclusiva prevista no item 8.2 somente existirá enquanto houver saldo devedor pendente perante a VENDEDORA, a partir do momento de sua quitação, o COMPRADOR estará livre para comercializar o imóvel da forma que melhor lhe convier.')}
      ${p(`<strong>8.5.</strong> Das Penalidades: A cessão, venda ou transferência irregular da unidade à revelia das regras acima estabelecidas implicará na cobrança de multa não compensatória equivalente a ${ESTRELA_IRREGULAR_ASSIGNMENT_PENALTY_PERCENT}% (vinte por cento) do valor total e atualizado deste contrato, sem prejuízo da rescisão contratual de pleno direito e da ineficácia do negócio perante a VENDEDORA.`)}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA NONA')}
      ${title('DA RESOLUÇÃO CONTRATUAL, PENALIDADES E RESTITUIÇÃO DE VALORES')}
      `)}
      ${p('<strong>9.1.</strong> Da Natureza Jurídica das Arras: Fica estabelecido que o valor entregue pelo COMPRADOR no ato da assinatura deste instrumento possui natureza jurídica de Arras Confirmatórias, nos estritos termos dos artigos 417 a 420 do Código Civil. Referida quantia consubstancia a garantia de cumprimento do negócio jurídico entabulado, operando-se, em caso de inexecução culposa ou desistência por parte do COMPRADOR, como indenização pré-fixada em favor da VENDEDORA.')}
      ${p(`<strong>9.2.</strong> Da Comissão de Corretagem: As Partes declaram expressa ciência de que o valor de ${money(ctx.valorCorretagemFmt, ctx.valorCorretagemExtenso)} ostenta a natureza de remuneração pelos serviços de intermediação imobiliária (corretagem) efetivamente prestados. Por se tratar de serviço consumado no ato da assinatura deste instrumento (art. 725 do Código Civil), referida quantia não integrará a base de cálculo para devolução e não será restituída ao COMPRADOR em nenhuma hipótese de distrato ou rescisão motivada por este.`)}
      ${p(`<strong>9.3.</strong> Das Penalidades por Rescisão: Operando-se a resolução do presente instrumento por iniciativa, inadimplemento ou culpa exclusiva do COMPRADOR, este sujeitar-se-á, de plano direto e cumulativamente, às seguintes deduções e penalidades, calculadas sobre o montante atualizado a ser eventualmente restituído:<br/>I. Perda integral da quantia paga a título de Arras/Sinal de Negócio (art. 418 do Código Civil);<br/>II. Retenção de ${ESTRELA_RESCISSION_RETENTION_PERCENT}% (vinte e cinco por cento) sobre o valor total das parcelas efetivamente pagas, a título de cláusula penal compensatória e indenização pelos custos operacionais, administrativos e de comercialização suportados pela VENDEDORA, em conformidade com os parâmetros da Lei nº 13.786/2018 (Lei do Distrato).`)}
      ${itemGroup(`
      ${p(`<strong>9.4.</strong> Da Taxa de Fruição (Ocupação do Imóvel): Em caso de resolução contratual por inadimplemento ou culpa do COMPRADOR, será devida à VENDEDORA uma indenização mensal a título de fruição (taxa de ocupação) do imóvel.`)}
      ${p(`Parágrafo Único: A referida taxa será calculada à razão de ${ESTRELA_OCCUPANCY_FEE_PERCENT}% (meio por cento) ao mês sobre o valor total e atualizado deste contrato, ou no valor fixo mensal de ${formatEstrelaMoneyPhrase(ESTRELA_OCCUPANCY_FEE_FLOOR)}, prevalecendo e aplicando-se sempre o que for maior. A taxa incidirá desde a data em que o COMPRADOR teve o lote disponibilizado para seu uso (imissão na posse) até a data da efetiva, comprovada e pacífica desocupação e devolução do bem à VENDEDORA, podendo este montante ser deduzido do saldo a ser restituído.`)}
      `)}
      ${p('<strong>9.5.</strong> Da Forma e Prazo de Restituição: O saldo remanescente a ser restituído ao COMPRADOR – apurado após sofrer o desconto cumulativo das arras, da retenção de até 25% do valor pago, da comissão de corretagem, da taxa de fruição, dos tributos (IPTU/ITR), das despesas operacionais, dos custos de revenda e de eventuais multas contratuais – será pago somente após a efetiva e incontroversa desocupação e devolução da posse do imóvel à VENDEDORA.')}
      ${p('<strong>Parágrafo Único:</strong> A restituição ocorrerá em prazo não superior a 12 (doze) meses, contados da data da formalização da rescisão e devolução da posse, ou de forma imediata após a efetiva revenda da unidade a um novo adquirente e o recebimento dos respectivos valores pela VENDEDORA, prevalecendo o evento que ocorrer primeiro.')}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA DÉCIMA')}
      ${title('DA RESOLUÇÃO DE LOTE COM EDIFICAÇÕES E BENFEITORIAS')}
      `)}
      ${p('<strong>10.1.</strong> Da Retomada do Imóvel: Na hipótese de rescisão por culpa do COMPRADOR havendo acessões ou benfeitorias introduzidas no lote rural, a VENDEDORA terá assegurado o direito potestativo de retomar a posse imediata do imóvel com todas as suas melhorias, aplicando-se as mesmas regras de retenção financeiras delineadas neste instrumento.')}
      ${p('<strong>10.2.</strong> Do Direito à Indenização e Retenção: O COMPRADOR fará jus à indenização exclusivamente pelas benfeitorias úteis e necessárias, sendo terminantemente excluídas as voluptuárias. Fica expressamente condicionado que tal indenização somente será devida se as obras tiverem sido edificadas em estrita observância às normas legais, ambientais, municipais e com a prévia aprovação expressa da VENDEDORA, conforme exigido neste contrato.')}
      ${p('<strong>Parágrafo Único:</strong> O COMPRADOR renuncia expressamente ao direito de retenção do imóvel por benfeitorias (art. 1.219 do Código Civil), obrigando-se a desocupar a chácara imediatamente após a notificação de rescisão, sob pena de caracterização de esbulho possessório, sujeitando-se à reintegração de posse e ao pagamento de taxa de fruição diária.')}
      ${p('<strong>10.3.</strong> Da Isenção de Responsabilidade da VENDEDORA: Fica expressamente pactuado que a VENDEDORA não se responsabilizará por desembolsar, com recursos próprios, qualquer quantia a título de indenização pelas acessões ou benfeitorias erigidas no lote. O direito ao recebimento de tais valores pelo COMPRADOR ficará estritamente condicionado à efetiva revenda da unidade imobiliária a um terceiro (Novo Adquirente), operando-se a liquidação exclusivamente sob as condições delineadas no parágrafo seguinte.')}
      ${p('<strong>10.4.</strong> Da Condição e Forma de Repasse pelo Novo Adquirente: O repasse financeiro correspondente à avaliação das benfeitorias úteis e necessárias será suportado pelo Novo Adquirente. O COMPRADOR original declara ciência e concordância de que receberá a referida indenização de forma parcelada, nos exatos prazos, proporções e condições estabelecidos na nova negociação de venda, figurando a VENDEDORA apenas como mandatária, interveniente e facilitadora do repasse dos valores, isenta de qualquer solidariedade ou responsabilidade caso o Novo Adquirente torne-se inadimplente.')}
      ${p('<strong>10.5.</strong> Da Retenção para Regularização Documental e Tributária: A exigibilidade e a liberação de qualquer saldo indenizatório ao COMPRADOR ficam estritamente subordinadas à comprovação da absoluta regularidade técnica, documental e fiscal da obra.<br/>I. O COMPRADOR deverá apresentar as aprovações de projeto, licenças ambientais, Alvará de Construção, Carta de “Habite-se” (ou equivalente rural) e as Certidões Negativas de Débitos (municipais, estaduais, federais, previdenciários e trabalhistas) vinculadas à edificação.<br/>II. Fica a VENDEDORA irrevogavelmente autorizada a abater e reter do saldo a ser restituído todo e qualquer montante necessário para quitar impostos atrasados, multas, pendências trabalhistas da obra ou taxas de regularização exigidas pelos órgãos públicos, a fim de viabilizar a transferência limpa e desembaraçada ao Novo Adquirente.')}
      ${p('<strong>10.6.</strong> Das Benfeitorias Voluptuárias: Em obediência ao art. 1.219 do Código Civil, sob nenhuma hipótese haverá indenização ou direito de retenção por benfeitorias voluptuárias (obras de mero luxo, estética ou deleite). Fica facultado ao COMPRADOR, contudo, o direito de levantá-las (retirá-las) às suas exclusivas expensas, desde que tal remoção não acarrete qualquer dano, depreciação ou prejuízo à estrutura do imóvel principal, restabelecendo-o ao seu estado original.')}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA DÉCIMA PRIMEIRA')}
      ${title('DO DIREITO DE RECOMPRA, DA FORÇA EXECUTIVA EXTRAJUDICIAL')}
      `)}
      ${p('<strong>11.1.</strong> Da Opção de Recompra e Retomada: Fica assegurado à VENDEDORA, a seu exclusivo critério e conveniência, o direito potestativo de exercer a recompra da unidade imobiliária ou a resolução do contrato com a retomada do bem, nas hipóteses de inadimplência superior a 90 (noventa) dias ou mediante solicitação de distrato por parte do COMPRADOR.')}
      ${p('<strong>11.2.</strong> O exercício deste direito implicará na aplicação imediata das cláusulas de retenção, multas e taxa de fruição previstas neste instrumento, servindo o presente instrumento como prova contratual para eventual ação de reintegração de posse.')}
      ${p('<strong>11.3.</strong> Da Força Executiva Extrajudicial: O presente instrumento é firmado sob a égide do artigo 784, inciso III, do Código de Processo Civil, constituindo-se como TÍTULO EXECUTIVO EXTRAJUDICIAL, apto a amparar execução imediata de quantia certa (parcelas vencidas e encargos) ou execução de obrigação de fazer/entregar, independente de prévia ação de conhecimento.')}
    </div>

    <div class="contract-clause">
      ${clauseHead(`
      ${title('CLÁUSULA DÉCIMA SEGUNDA')}
      ${title('DAS CONDIÇÕES FINAIS E DO FORO DE ELEIÇÃO')}
      ${p('<strong>12.1.</strong> O presente contrato é celebrado em caráter irrevogável e irretratável, não admitindo arrependimento unilateral, obrigando as partes contratantes, seus herdeiros e sucessores a qualquer título, ao fiel e integral cumprimento de todas as cláusulas e condições aqui pactuadas.')}
      `)}
      ${p('<strong>12.2.</strong> A tolerância de qualquer das partes quanto ao descumprimento de obrigações contratuais, ou a não aplicação imediata das sanções previstas, será considerada mera liberalidade, não constituindo novação, renúncia de direitos ou alteração das cláusulas aqui pactuadas.')}
      ${itemGroup(`
      ${p('<strong>12.3.</strong> As comunicações entre as partes poderão ser realizadas via e-mail, aplicativos de mensagens (WhatsApp ou equivalente a ser indicado pelo comprador) ou carta com AR.')}
      ${p('<strong>Parágrafo único:</strong> O COMPRADOR obriga-se a manter seu endereço e contatos atualizados perante a VENDEDORA, sendo considerada válida e entregue qualquer notificação enviada para o último endereço informado no cadastro.')}
      `)}
      ${p('<strong>12.4.</strong> Se qualquer cláusula ou disposição deste contrato for declarada nula ou inexequível por decisão judicial, tal nulidade não afetará as demais cláusulas, as quais permanecerão em pleno vigor e efeito entre as partes.')}
      ${itemGroup(`
      ${p('<strong>12.5.</strong> O COMPRADOR declara ter ciência de que o imóvel objeto deste contrato situa-se em área rural/expansão urbana, obrigando-se a respeitar as normas de Direito Ambiental vigentes.')}
      ${p('I. Fica terminantemente proibido qualquer desmatamento, corte de árvores, intervenção em Áreas de Preservação Permanente (APP) ou Reserva Legal sem a prévia e expressa autorização dos órgãos ambientais competentes de ordem municipal, estadual e/ou federal.')}
      ${p('II. O COMPRADOR assume total e exclusiva responsabilidade civil, administrativa e criminal por quaisquer danos ambientais que venha a causar no imóvel, isentando a VENDEDORA de toda e qualquer solidariedade quanto a multas ou embargos aplicados após a imissão na posse.')}
      `)}
      ${p('<strong>12.6.</strong> O COMPRADOR autoriza a VENDEDORA a coletar e tratar seus dados pessoais estritamente para fins de gestão contratual, emissão de boletos, cobrança e órgãos de proteção ao crédito, em conformidade com a Lei nº 13.709/2018 (LGPD).')}
      ${p(`<strong>12.7.</strong> Para dirimir quaisquer dúvidas ou controvérsias oriundas do presente contrato que não puderem ser resolvidas amigavelmente, as partes elegem, com exclusão de qualquer outro por mais privilegiado que seja, o Foro da Comarca de ${estrelaStrong(foro || 'Parauapebas/Estado do Pará')}.`)}
    </div>
  `;
}
