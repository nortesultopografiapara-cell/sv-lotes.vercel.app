/**
 * Modelo CUSTOM "LF ESTRELA".
 * Conteúdo: texto oficial fornecido. Diagramação: 10 páginas de referência.
 * Não usa generateEstrelaDoSulContract nem o motor ESTRELA_DO_SUL.
 */
import { renderCompanyLogoBlock } from '@/lib/customContractLogo';
import { customPlaceholderToken } from '@/lib/customContractPlaceholders';

export const LF_ESTRELA_MODEL_NAME = 'LF ESTRELA';
export const LF_ESTRELA_CATALOG_CODE = 'CUSTOM';
export const LF_ESTRELA_ENGINE_KEY = 'custom';

/** Marcadores de desenvolvedor — nunca entram no HTML, editor, prévia ou PDF. */
export const LF_ESTRELA_PAGE_MARKER_RE = /p[aá]gina\s+\d+\s+acima/gi;

const PAGE_BREAK =
  '<div data-sv-page-break="true" class="sv-page-break"></div>';

function t(key: string): string {
  return customPlaceholderToken(key);
}

function p(html: string, className = 'sv-lf-body lf-estrela-body'): string {
  const cls = className ? ` class="${className}"` : '';
  return `<p${cls}>${html}</p>`;
}

function note(n: number, html: string): string {
  return `<p class="sv-lf-note sv-lf-footnote lf-estrela-footnote"><sup>${n}</sup> ${html}</p>`;
}

function footnotes(items: string[]): string {
  return `<div class="sv-lf-footnotes">${items.join('')}</div>`;
}

function th(text: string, pct: number): string {
  return `<th colspan="1" rowspan="1" style="width:${pct}%">${text}</th>`;
}

function td(html: string, pct?: number): string {
  const attr = pct ? ` style="width:${pct}%"` : '';
  return `<td colspan="1" rowspan="1"${attr}>${html}</td>`;
}

function table(
  className: string,
  head: string[],
  pcts: number[],
  rows: string[][],
  rowAttrs: Array<string | undefined> = [],
): string {
  const headRow = `<tr>${head.map((cell, i) => th(cell, pcts[i] || 50)).join('')}</tr>`;
  const body = rows
    .map(
      (row, rowIndex) =>
        `<tr${rowAttrs[rowIndex] ? ` ${rowAttrs[rowIndex]}` : ''}>${row
          .map((cell, i) => td(cell, pcts[i]))
          .join('')}</tr>`,
    )
    .join('');
  const classes = `${className} lf-estrela-table`.trim();
  return `<table class="${classes}"><thead>${headRow}</thead><tbody>${body}</tbody></table>`;
}

export function isLfEstrelaModelName(name: string): boolean {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase() === LF_ESTRELA_MODEL_NAME;
}

export function findLfEstrelaPageMarkers(html: string): string[] {
  return String(html || '').match(LF_ESTRELA_PAGE_MARKER_RE) || [];
}

export function assertNoLfEstrelaPageMarkers(html: string, where = 'HTML LF ESTRELA'): void {
  const hits = findLfEstrelaPageMarkers(html);
  if (hits.length) {
    throw new Error(`${where} contém marcador de página proibido: ${hits.join(', ')}`);
  }
}

function objectRows(): string[][] {
  return [
    ['Nome do Projeto', t('PROJECT_NAME')],
    ['Localização do Imóvel', t('PROJECT_LOCATION')],
    [
      'Área Vendida',
      `Chácara: Quadra nº: ${t('BLOCK_NAME')} – Lote ${t('LOT_NUMBER')} – Área Total: ${t('LOT_AREA')} (metros quadrado)`,
    ],
    [
      'Confrontações',
      `${t('LOT_FRONT')} (metros) de frente ${t('LOT_BACK')} (metros) de fundo ${t('LOT_RIGHT')} (metros) do lado direito ${t('LOT_LEFT')} (metros) do lado esquerdo.`,
    ],
    ['Outras informações', t('PARTNERSHIP_NOTE')],
  ];
}

function financeRows(arrasNote: number, parcelasNote: number): string[][] {
  return [
    ['VALOR TOTAL DO IMÓVEL', `${t('SALE_VALUE')} (${t('SALE_VALUE_EXTENSO')})`],
    ['VALOR DE CORRETAGEM', `${t('BROKER_COMMISSION')} (${t('BROKER_COMMISSION_EXTENSO')})`],
    [
      `VALOR DO SINAL/ENTRADA (ARRAS)<sup>${arrasNote}</sup>`,
      `${t('DOWN_PAYMENT')} (${t('DOWN_PAYMENT_EXTENSO')})`,
    ],
    [
      `PARCELAS E VALORES<sup>${parcelasNote}</sup>`,
      t('INSTALLMENTS_SCHEDULE'),
    ],
    ['VENCIMENTO DAS 1ª PARCELA', t('FIRST_DUE_DATE')],
    ['ÍNDICE DE CORREÇÃO ANUAL', t('CORRECTION_INDEX')],
    ['MULTA MORATÓRIA POR ATRASO', '2% (dois por cento) sobre a parcela vencida'],
    ['JUROS DE MORA POR ATRASO', '1% (um por cento) ao mês'],
  ];
}

function objectTable(extraClass = ''): string {
  return table(
    `sv-lf-table sv-lf-table-object ${extraClass}`.trim(),
    ['Informação', 'Detalhamento'],
    [32, 68],
    objectRows(),
  );
}

function financeTable(extraClass = '', arrasNote = 2, parcelasNote = 3): string {
  return table(
    `sv-lf-table sv-lf-table-finance ${extraClass}`.trim(),
    ['ITEM', 'VALOR / DETALHAMENTO'],
    [43, 57],
    financeRows(arrasNote, parcelasNote),
  );
}

function signatureSlot(labelHtml: string, extraHtml: string): string {
  const line = '<p class="sv-lf-sign-line">&nbsp;</p>';
  return `<div class="sv-lf-sign-slot">${line}<p><strong>${labelHtml}</strong></p><p>${extraHtml}</p></div>`;
}

function signatureBlock(): string {
  return `<div class="sv-lf-sign lf-estrela-signatures" data-sv-keep-block="true">
<div class="sv-lf-sign-row">
${signatureSlot('COMPRADOR 1', `CPF n° ${t('CLIENT_CPF')}`)}
${signatureSlot(t('COMPANY_LEGAL_NAME'), `CNPJ ${t('COMPANY_CNPJ')}`)}
</div>
<div class="sv-lf-sign-row">
<div class="sv-lf-sign-slot" data-sv-if="spouse"><p class="sv-lf-sign-line">&nbsp;</p><p><strong>COMPRADOR 2</strong></p><p>CPF n° ${t('SPOUSE_CPF')}</p></div>
<div class="sv-lf-sign-slot sv-lf-sign-empty" data-sv-if="noSpouse" aria-hidden="true"></div>
${signatureSlot(t('SELLER_2_NAME'), `CPF n°: ${t('SELLER_2_CPF_CNPJ')}`)}
</div>
<div class="sv-lf-sign-row">
${signatureSlot(t('WITNESS_1_NAME'), `CPF n°: ${t('WITNESS_1_CPF')}`)}
${signatureSlot(t('WITNESS_2_NAME'), `CPF n°: ${t('WITNESS_2_CPF')}`)}
</div>
</div>`;
}

function lfPage(n: number, inner: string, last = false): string {
  return `<section class="sv-lf-page" data-sv-lf-page="${n}">${logo()}${inner}</section>${
    last ? '' : PAGE_BREAK
  }`;
}

function clauseHead(main: string, sub: string): string {
  return `<h2 class="sv-lf-clause lf-estrela-clause-title">${main}</h2><h3 class="sv-lf-clause-sub">${sub}</h3>`;
}

function clauseOpen(main: string, sub: string, firstHtml: string): string {
  return `<div class="sv-lf-keep-with-next">${clauseHead(main, sub)}</div>${firstHtml}`;
}

function dateLine(): string {
  return p(
    `<strong>${t('PROJECT_CITY')}/${t('PROJECT_STATE')}, ${t('CONTRACT_DATE_EXTENSO')}.</strong>`,
    'sv-lf-date',
  );
}

function logo(): string {
  return renderCompanyLogoBlock({
    align: 'center',
    width: 120,
    marginBefore: 0,
    marginAfter: 8,
  });
}

export const LF_ESTRELA_REQUIRED_PHRASES = [
  'CAPA RESUMO DO CONTRATO DE PROMESSA DE COMPRA E VENDA',
  'DAS PARTES CONTRATANTES (QUALIFICAÇÃO)',
  'DO OBJETO E GEORREFERENCIAMENTO (INFORMAÇÕES MACRO)',
  'DAS CONDIÇÕES FINANCEIRAS E PERCENTUAIS APLICÁVEIS',
  'DOS ASPECTOS DE SEGURANÇA E CONFLITOS',
  'DOCUMENTO DE REFERÊNCIA DA OBRA',
  'INFRAESTRUTURA ESSENCIAL',
  'INFRAESTRUTURA SECUNDÁRIA',
  'CONDIÇÃO DE POSSE AO COMPRADOR',
  'DA CONSTRUÇÃO NO LOTE',
  'CONTRATO DE PROMESSA DE COMPRA E VENDA',
  'Instrumento particular de compra e venda de imóvel do tipo chácara rural',
  'CLÁUSULA PRIMEIRA',
  'DO OBJETO, DA CAPA RESUMO E DOS ANEXOS',
  'CLÁUSULA SEGUNDA',
  'PAGAMENTO, REAJUSTE E MORA',
  'CLÁUSULA TERCEIRA',
  'DA TRANSMISSÃO DA POSSE DEFINITIVA',
  'CLÁUSULA QUARTA',
  'DO INÍCIO DA CONSTRUÇÃO PELO COMPRADOR',
  'CLÁUSULA QUINTA',
  'DA EDIFICAÇÃO IRREGULAR E SUAS PENALIDADES',
  'CLÁUSULA SEXTA',
  'DAS CONSTRUÇÕES COLETIVAS E DE SUA VIABILIDADE',
  'CLÁUSULA SÉTIMA',
  'DA RESPONSABILIDADE PELOS TRIBUTOS E ENCARGOS',
  'CLÁUSULA OITAVA',
  'DA CESSÃO DE DIREITOS E TRANSFERÊNCIA',
  'CLÁUSULA NONA',
  'DA RESOLUÇÃO CONTRATUAL, PENALIDADES E RESTITUIÇÃO DE VALORES',
  'CLÁUSULA DÉCIMA',
  'DA RESOLUÇÃO DE LOTE COM EDIFICAÇÕES E BENFEITORIAS',
  'CLÁUSULA DÉCIMA PRIMEIRA',
  'DO DIREITO DE RECOMPRA, DA FORÇA EXECUTIVA EXTRAJUDICIAL',
  'CLÁUSULA DÉCIMA SEGUNDA',
  'DAS CONDIÇÕES FINAIS E DO FORO DE ELEIÇÃO',
  'venda ad corpus',
  'TÍTULO EXECUTIVO EXTRAJUDICIAL',
  'Lei nº 13.709/2018 (LGPD)',
  'Lei nº 13.786/2018',
  'Foro da Comarca',
  'suinocultura',
  '0,5% (meio por cento)',
  'R$ 500,00 (quinhentos reais)',
  'Taxa de Cessão e Anuência fixada no patamar de 5%',
  'multa não compensatória equivalente a 10%',
  'multa não compensatória equivalente a 20%',
  'Retenção de 25%',
  'Dedução de Taxa Administrativa de Distrato se encontra fixada em 5%',
] as const;

export const LF_ESTRELA_REQUIRED_TOKENS = [
  'COMPANY_LOGO_URL',
  'COMPANY_LEGAL_NAME',
  'COMPANY_CNPJ',
  'COMPANY_ADDRESS',
  'COMPANY_NEIGHBORHOOD',
  'COMPANY_CITY',
  'COMPANY_STATE',
  'COMPANY_ZIP',
  'COMPANY_EMAIL',
  'COMPANY_PHONE',
  'COMPANY_CRECI',
  'CLIENT_NAME',
  'CLIENT_CPF',
  'CLIENT_RG',
  'CLIENT_RG_ISSUER',
  'CLIENT_NATIONALITY',
  'CLIENT_CIVIL_STATE',
  'CLIENT_PROFESSION',
  'CLIENT_ADDRESS',
  'SPOUSE_NAME',
  'SPOUSE_CPF',
  'SELLER_2_NAME',
  'SELLER_2_CPF_CNPJ',
  'SELLER_2_RG',
  'SELLER_2_RG_ISSUER',
  'SELLER_2_NATIONALITY',
  'SELLER_2_CIVIL_STATE',
  'SELLER_2_PROFESSION',
  'SELLER_2_ADDRESS',
  'SELLER_2_EMAIL',
  'PROJECT_NAME',
  'PROJECT_LOCATION',
  'PROJECT_CITY',
  'PROJECT_STATE',
  'PROJECT_FORUM_CITY',
  'BLOCK_NAME',
  'LOT_NUMBER',
  'LOT_AREA',
  'LOT_FRONT',
  'LOT_BACK',
  'LOT_RIGHT',
  'LOT_LEFT',
  'PARTNERSHIP_NOTE',
  'SALE_VALUE',
  'SALE_VALUE_EXTENSO',
  'BROKER_COMMISSION',
  'BROKER_COMMISSION_EXTENSO',
  'DOWN_PAYMENT',
  'DOWN_PAYMENT_EXTENSO',
  'INSTALLMENTS_SCHEDULE',
  'FIRST_DUE_DATE',
  'CORRECTION_INDEX',
  'CONTRACT_DATE_EXTENSO',
] as const;

export function buildLfEstrelaCustomHtml(): string {
  const html = `<div class="sv-lf-estrela">
${lfPage(1, `
<h1 class="sv-lf-cover-title lf-estrela-title">CAPA RESUMO DO CONTRATO DE PROMESSA DE COMPRA E VENDA</h1>
<p class="sv-lf-green"><strong>CHACREAMENTO: ${t('PROJECT_NAME')}</strong></p>
<h2 class="sv-lf-section">1. DAS PARTES CONTRATANTES (QUALIFICAÇÃO)<sup>1</sup></h2>
${table(
  'sv-lf-table sv-lf-table-parties sv-lf-capa',
  ['Parte', 'Nome/Razão Social', 'Qualidade no Contrato', 'Documento – CNPJ/CPF'],
  [17, 32, 25, 26],
  [
    ['VENDEDOR (A)', t('COMPANY_LEGAL_NAME'), 'VENDEDOR (A)', t('COMPANY_CNPJ')],
    ['VENDEDOR (A)', t('SELLER_2_NAME'), 'VENDEDOR (A)', t('SELLER_2_CPF_CNPJ')],
    ['COMPRADOR (A)', t('CLIENT_NAME'), 'COMPRADOR (A)', t('CLIENT_CPF')],
    ['COMPRADOR (A)', t('SPOUSE_NAME'), 'COMPRADOR (A)', t('SPOUSE_CPF')],
  ],
  [undefined, undefined, undefined, 'data-sv-if="spouse"'],
)}
<h2 class="sv-lf-section">2. DO OBJETO E GEORREFERENCIAMENTO (INFORMAÇÕES MACRO)</h2>
${objectTable('sv-lf-capa')}
<h2 class="sv-lf-section">3. DAS CONDIÇÕES FINANCEIRAS E PERCENTUAIS APLICÁVEIS</h2>
${financeTable('sv-lf-capa')}
<h2 class="sv-lf-section">4. DOS ASPECTOS DE SEGURANÇA E CONFLITOS<sup>4</sup></h2>
${table(
  'sv-lf-table sv-lf-capa',
  ['ITEM', 'Detalhamento'],
  [32, 68],
  [['', '']],
)}
${footnotes([
  note(1, 'É responsabilidade do(a) COMPRADOR(A) informar ao VENDEDOR(A) sobre seu estado civil (casado ou união estável), garantindo a inclusão do cônjuge/companheiro(a) neste contrato e na Escritura Pública, conforme exigência legal.'),
  note(2, 'Natureza jurídica: as ARRAS nos termos dos arts. 417 a 420 do Código Civil – É considerado um valor em dinheiro entregue pela parte compradora ao momento da assinatura de um contrato com objetivo de garantia de cumprimento do negócio e, em outras oportunidades, podendo ser aplicada como indenização pré-fixada.'),
  note(3, `A comissão de corretagem possui natureza de remuneração pelos serviços de intermediação e não será restituída em caso de distrato, sendo este valor na importância de ${t('BROKER_COMMISSION')} (${t('BROKER_COMMISSION_EXTENSO')}).`),
  note(4, 'Na hipótese de rescisão motivada pelo Comprador, o saldo a ser restituído sofrerá o desconto de: arras, retenção de até 25% do valor pago, corretagem, taxa de fruição, tributos, despesas operacionais, custos de revenda e eventuais multas contratuais.'),
])}
`)}
${lfPage(2, `
${table(
  'sv-lf-table sv-lf-table-infra sv-lf-capa',
  ['ITEM', 'Detalhamento'],
  [43, 57],
  [
    ['DOCUMENTO DE REFERÊNCIA DA OBRA', 'Planta Topográfica.'],
    [
      'INFRAESTRUTURA ESSENCIAL',
      'Abertura de ruas, Marcação das chácaras, Energia em alta (Rede de Alta Tensão), Poço artesiano coletivo.',
    ],
    [
      'PRAZO DE ENTREGA DA INFRAESTRUTURA ESSENCIAL',
      'Máximo de 12 (doze) meses, contados da data de assinatura do Contrato.',
    ],
    [
      "INFRAESTRUTURA SECUNDÁRIA (CAIXA D'ÁGUA/MANGUEIRAS)",
      'Realização e entrega conforme cronograma, a ser aplicado após findar 12 (doze) meses do início das obras essenciais.',
    ],
    [
      'CONDIÇÃO DE POSSE AO COMPRADOR',
      'Somente após a finalização da Infraestrutura Essencial.',
    ],
    [
      'DA CONSTRUÇÃO NO LOTE',
      'Será permitida somente após o pagamento da 4ª (quarta) parcela do contrato ou com prazo mínimo de 04 (quatro) meses em caso de quitação antecipada.',
    ],
  ],
)}
${dateLine()}
${signatureBlock()}
`)}
${lfPage(3, `
<h1 class="sv-lf-instrument-title lf-estrela-title">CONTRATO DE PROMESSA<br>DE COMPRA E VENDA</h1>
<p class="sv-lf-subtitle"><em>Instrumento particular de compra e venda de imóvel do tipo chácara rural que se regerá pelas cláusulas e condições a seguir.</em></p>
${p(`Pelo presente instrumento particular de CONTRATO DE COMPRA E VENDA DE CHÁCARA RURAL, que se regerá pelas cláusulas e condições abaixo descritas, de um lado temos ${t('CLIENT_NAME')}, ${t('CLIENT_NATIONALITY')}, ${t('CLIENT_CIVIL_STATE')}, ${t('CLIENT_PROFESSION')}, portador(a) do RG sob n° ${t('CLIENT_RG')} ${t('CLIENT_RG_ISSUER')} e do CPF sob n° ${t('CLIENT_CPF')}, residente e domiciliada(o) na ${t('CLIENT_ADDRESS')}, doravante denominada COMPRADOR/CONTRATANTE e do outro temos a contratada ${t('COMPANY_LEGAL_NAME')}, pessoa jurídica de direito privado, inscrita no CNPJ sob o n° ${t('COMPANY_CNPJ')}<span data-sv-if="companyCreci">, CRECI/(PA) n° ${t('COMPANY_CRECI')}</span>, com sede na ${t('COMPANY_ADDRESS')}, ${t('COMPANY_NEIGHBORHOOD')}, ${t('COMPANY_CITY')}/${t('COMPANY_STATE')}, CEP: ${t('COMPANY_ZIP')}, com o seguinte endereço eletrônico: ${t('COMPANY_EMAIL')}, Telefone: ${t('COMPANY_PHONE')}, doravante designada simplesmente como VENDEDOR/CONTRATADA.`)}
${p(`${t('SELLER_2_NAME')}, ${t('SELLER_2_NATIONALITY')}, ${t('SELLER_2_CIVIL_STATE')}, ${t('SELLER_2_PROFESSION')}, Carteira de identidade n° ${t('SELLER_2_RG')} ${t('SELLER_2_RG_ISSUER')}, CPF: ${t('SELLER_2_CPF_CNPJ')}, Residente e domiciliado na: ${t('SELLER_2_ADDRESS')}, Endereço eletrônico: ${t('SELLER_2_EMAIL')}. doravante designado simplesmente como VENDEDOR/CONTRATADA.`)}
${p('As Partes, de livre e espontânea vontade, resolvem firmar o presente Instrumento Particular de Compra e Venda de Imóvel Rural, cujo objeto consiste na transação do loteamento de terra correspondente à chácara a seguir identificada.')}
${clauseOpen(
  'CLÁUSULA PRIMEIRA',
  'DO OBJETO, DA CAPA RESUMO E DOS ANEXOS',
  p(`<strong>1.1.</strong> O objeto deste contrato consubstancia-se na compra e venda a prazo da fração de terras individualizada e designada como CHACARA RURAL, componente do PROJETO/CHACREAMENTO ${t('PROJECT_NAME')}, situado no perímetro rural do Município de ${t('PROJECT_CITY')}, Estado do ${t('PROJECT_STATE')}.`),
)}
${p('O COMPRADOR declara ter ciência de que o imóvel objeto deste contrato integra empreendimento rural de natureza privada, comprometendo-se a observar as limitações legais e ambientais inerentes à área rural.')}
${p('<strong>1.2.</strong> A qualificação, confrontações, memorial descritivo e demais dados técnicos da referida unidade imobiliária constam expressamente da CAPA RESUMO e do ANEXO I – Descrição do Imóvel, os quais constituem partes integrantes e complementares deste pacto.')}
${p('<strong>1.3.</strong> A exata delimitação e as medidas perimetrais da chácara negociada são as seguintes:')}
${objectTable()}
${clauseOpen(
  'CLÁUSULA SEGUNDA',
  'PAGAMENTO, REAJUSTE E MORA',
  p('<strong>2.1.</strong> O preço certo e ajustado da unidade imobiliária rural é de:'),
)}
`)}
${lfPage(4, `
${financeTable('', 5, 6)}
${p('<strong>2.2.</strong> Do Saldo Remanescente: O saldo remanescente do preço ajustado será adimplido pelo COMPRADOR em parcelas mensais e sucessivas, cujos valores, quantidades e datas de vencimento encontram-se rigorosamente especificados na Capa Resumo (ou Anexo correspondente) deste instrumento.')}
${p('<strong>2.3.</strong> Da Correção Monetária: As parcelas vincendas sofrerão reajuste monetário anual, aplicando-se a variação positiva acumulada do Índice Geral de Preços - Mercado (IGP-M), apurado pela Fundação Getúlio Vargas (FGV). O reajuste incidirá a cada período de 12 (doze) meses, contados a partir da data de assinatura deste contrato (data-base).')}
${p('<strong>2.4.</strong> Na hipótese de extinção, vedação legal ou ausência de divulgação do IGP-M/FGV, adotar-se-á, de imediato, o IPCA/IBGE ou outro índice oficial que venha a substituí-lo, visando a preservação do equilíbrio econômico-financeiro da avença.')}
${p('<strong>2.5.</strong> Dos Encargos Moratórios: O impontual pagamento de qualquer das parcelas, ou de seus respectivos reajustes, constituirá o COMPRADOR em mora de pleno direito, independentemente de prévio aviso, interpelação ou notificação, sujeitando o valor em atraso aos seguintes encargos, calculados de forma cumulativa desde a data do vencimento até a data da efetiva liquidação:')}
${p('a) Atualização monetária calculada pro rata die (proporcional aos dias de atraso), com base na variação do IGP-M/FGV;')}
${p('b) Juros de mora de 1% (um por cento) ao mês, calculados pro rata die;')}
${p('c) Multa moratória e irredutível de 2% (dois por cento), incidente sobre o valor total do débito devidamente atualizado.')}
${p('<strong>2.6.</strong> Das Arras (Sinal): O valor pago a título de entrada e princípio de pagamento tem caráter de Arras, nos termos dos artigos 417 e seguintes do Código Civil Brasileiro, integrando o preço total do imóvel e sujeitando-se às regras de retenção previstas nas Cláusulas Penais em caso de inexecução do contrato.')}
${p('<strong>2.7.</strong> Do Termo de Quitação: Comprovada a liquidação integral do saldo devedor e o fiel cumprimento de todas as obrigações contratuais por parte do COMPRADOR, o VENDEDOR obriga-se a emitir e outorgar o respectivo Termo de Quitação no prazo máximo de 15 (quinze) dias úteis, instrumento este indispensável para a posterior lavratura da Escritura Pública Definitiva.')}
${p('<strong>2.8.</strong> Da Comissão de Corretagem: O COMPRADOR declara-se ciente de que o serviço de intermediação imobiliária foi efetivamente prestado, sendo de sua exclusiva responsabilidade o pagamento da comissão de corretagem aos corretores ou imobiliária vinculada, conforme valores e condições discriminados na Capa Resumo deste instrumento.')}
${p(`<strong>2.8.1.</strong> O valor de ${t('BROKER_COMMISSION')} (${t('BROKER_COMMISSION_EXTENSO')}) é destinado exclusivamente à corretagem e não integra o preço do imóvel para fins de quitação junto ao VENDEDOR, tratando-se de obrigação autônoma por serviços de intermediação já concluídos.`)}
${p('<strong>2.8.2.</strong> Em caso de resolução ou rescisão do presente contrato por culpa do COMPRADOR, o valor pago a título de corretagem não será objeto de restituição, nos termos do Art. 725 do Código Civil.')}
${p('<strong>2.9.</strong> Da Rescisão por Inadimplência: Sem prejuízo dos encargos moratórios previstos na cláusula anterior, o atraso no pagamento de qualquer parcela por período superior a 90 (noventa) dias conferirá à VENDEDORA (e/ou Corretora/Imobiliária, se houver poderes de representação) o direito de rescindir o presente contrato de pleno direito.')}
${p('<strong>2.9.1.</strong> A rescisão de que trata este artigo fica condicionada à prévia notificação do COMPRADOR, via cartório de títulos e documentos ou carta com aviso de recebimento (AR), concedendo-lhe o prazo de 15 (quinze) dias para purgação da mora (pagamento do débito atualizado).', 'sv-lf-body lf-estrela-body sv-lf-keep-para')}
${p('<strong>2.9.2.</strong> Transcorrido o prazo da notificação sem a devida quitação, a rescisão se consolidará, sujeitando o COMPRADOR às penalidades de retenção de valores previstas nas Cláusulas Penais deste instrumento e na legislação vigente.')}
${footnotes([
  note(5, 'Natureza jurídica: as ARRAS nos termos dos arts. 417 a 420 do Código Civil – É considerado um valor em dinheiro entregue pela parte compradora ao momento da assinatura de um contrato com objetivo de garantia de cumprimento do negócio e, em outras oportunidades, podendo ser aplicada como indenização pré-fixada.'),
  note(6, `A comissão de corretagem possui natureza de remuneração pelos serviços de intermediação e não será restituída em caso de distrato, sendo este valor na importância de ${t('BROKER_COMMISSION')} (${t('BROKER_COMMISSION_EXTENSO')}).`),
])}
${clauseOpen(
  'CLÁUSULA TERCEIRA',
  'DA TRANSMISSÃO DA POSSE DEFINITIVA',
  p('<strong>3.1.</strong> A eventual liberação do acesso e uso da chácara ao COMPRADOR (antes da conclusão da infraestrutura), na pendência de pagamento do saldo devedor, configurará posse meramente precária, resolúvel e vinculada ao fiel cumprimento deste instrumento.'),
)}
${p('<strong>3.2.</strong> A referida posse não induzirá, em tempo algum, posse ad usucapionem (para fins de usucapião) e não transferirá a titularidade do bem, a qual permanecerá sob o domínio do VENDEDOR até a efetiva lavratura e registro da Escritura Pública de Compra e Venda, condicionada à quitação total do preço.')}
${p('<strong>3.3.</strong> O COMPRADOR reconhece e declara, de forma irretratável, ter procedido à prévia e minuciosa vistoria física da unidade rural ora transacionada, bem como atesta ter verificado sua inserção no loteamento, sua topografia, demarcação perimetral e marcos divisórios, em cotejo com o memorial descritivo e a planta do empreendimento.')}
${p('<strong>3.4.</strong> Por conseguinte, o COMPRADOR concorda em adquirir o imóvel como coisa certa e discriminada (venda ad corpus, nos termos do art. 500, § 3º, do Código Civil), aceitando-o no exato estado de conservação e fático em que se encontra, renunciando expressamente ao direito de pleitear eventuais abatimentos de preço, indenizações ou a resolução do contrato por vícios aparentes ou eventuais e irrisórias divergências de metragem.')}
${p('<strong>3.5.</strong> Após a quitação integral do preço ora acordado da(s) unidade(s) rurais comercializadas no presente termo e desde que o comprador tenha cumprido todas as suas obrigações previstas neste contrato, será transferida automaticamente ao comprador a posse definitiva, ficando a posse condicionada à finalização das obras de infraestrutura.')}
${clauseOpen(
  'CLÁUSULA QUARTA',
  'DO INÍCIO DA CONSTRUÇÃO PELO COMPRADOR',
  p('<strong>4.1.</strong> Das Condições para Edificação e Benfeitorias: A execução de quaisquer obras, edificações ou benfeitorias – sejam elas úteis, necessárias ou voluptuárias – no lote rural objeto deste contrato ficará estritamente condicionada ao cumprimento cumulativo dos seguintes requisitos por parte do COMPRADOR:'),
)}
${p('<strong>I.</strong> Comprovar a rigorosa adimplência de todas as obrigações financeiras e contratuais assumidas até a data da solicitação;')}
${p('<strong>II.</strong> Obter a prévia e expressa anuência, por escrito, da VENDEDORA;')}
${p('<strong>III.</strong> Ter efetivado, no mínimo, o pagamento integral e tempestivo da 4ª (quarta) parcela do cronograma de pagamento deste instrumento.')}
${p('<strong>4.2.</strong> Da Carência para Início das Obras: Na hipótese de o COMPRADOR optar pela antecipação ou quitação das 4 (quatro) parcelas iniciais antes de seus respectivos vencimentos, ficará, ainda assim, sujeito a um prazo de carência mínima de 04 (quatro) meses, contados a partir da data de assinatura deste contrato, para o início de qualquer intervenção no lote. Ficando assegurado à VENDEDORA o direito de prorrogar referido prazo por igual período, mediante justificativa formalizada ao COMPRADOR.')}
${p('<strong>4.3.</strong> Da Remarcação Topográfica: Caso o COMPRADOR necessite de nova demarcação ou conferência dos marcos divisórios da unidade, deverá apresentar requerimento formal e por escrito à VENDEDORA.')}
${p('<strong>4.4.</strong> O deferimento e a execução do serviço estarão condicionados à irrestrita adimplência contratual do solicitante e ao recolhimento prévio de taxa de serviço (honorários topográficos) equivalente a 1% (um por cento) do valor total e atualizado deste Contrato, pagável mediante boleto bancário emitido especificamente para este fim.')}
${clauseOpen(
  'CLÁUSULA QUINTA',
  'DA EDIFICAÇÃO IRREGULAR E SUAS PENALIDADES',
  p('<strong>5.1.</strong> Da Infração: A execução de qualquer obra, edificação, benfeitoria ou supressão de vegetação em desacordo com as condições estipuladas neste contrato (incluindo a ausência de prévia e expressa autorização da VENDEDORA), <span class="sv-lf-widow-pair">bem como o desrespeito às normas ambientais, urbanísticas ou aos recuos obrigatórios do lote rural individualizado, configurará infração contratual grave e posse de má-fé por parte do COMPRADOR.</span>'),
)}
${p('<strong>5.2.</strong> Das Sanções e Demolição: Constatada a irregularidade, o COMPRADOR será notificado extrajudicialmente para, no prazo improrrogável de 15 (quinze) dias, paralisar a obra e promover a demolição e o desfazimento das intervenções irregulares, arcando integralmente com os custos de remoção de entulhos e de ações necessárias para a recuperação da área.')}
${p('<strong>I.</strong> O descumprimento da notificação sujeitará o COMPRADOR ao pagamento de multa não compensatória equivalente a 10% (dez por cento) do valor atualizado deste contrato, sem prejuízo da rescisão de pleno direito do presente instrumento.')}
${p('<strong>II.</strong> Fica resguardado à VENDEDORA o direito de, a seu exclusivo critério, promover a demolição das obras irregulares às custas do COMPRADOR, cobrando-lhe os valores despendidos com acréscimo de juros e correção monetária.')}
${p('<strong>5.3.</strong> Da Perda das Benfeitorias: Nos termos dos artigos 1.220 e 1.255 do Código Civil, as acessões e benfeitorias introduzidas irregularmente, sem anuência da VENDEDORA ou em violação à lei, não conferirão ao COMPRADOR qualquer direito de retenção ou de indenização, integrando-se ao imóvel em caso de rescisão contratual, se a VENDEDORA não optar por sua demolição.')}
${p('<strong>5.4.</strong> Da Responsabilidade Ambiental: O COMPRADOR assume, de forma exclusiva e irrestrita, a responsabilidade civil, penal e administrativa por eventuais danos ambientais que vier a causar no lote (desmatamento irregular, intervenção em Área de Preservação Permanente - APP, poluição, queimadas e outros), obrigando-se a isentar e ressarcir à VENDEDORA por quaisquer multas, autuações ou embargos aplicados por órgãos públicos (IBAMA, SEMAS/PA, SEMMA, Ministério Público e outros).')}
${p('<strong>5.5.</strong> Considerando a finalidade de lazer e moradia do chacreamento, é terminantemente proibida a instalação de atividade comercial de suinocultura na unidade imobiliária, bem como de qualquer outra atividade que gere odores fétidos, dejetos poluentes ou ruídos que afetem o direito de vizinhança e a salubridade pública. O descumprimento desta vedação sujeitará o infrator à imediata notificação para encerramento da atividade, sob pena de aplicação de multa contratual e responsabilização por eventuais infrações ambientais.')}
${clauseOpen(
  'CLÁUSULA SEXTA',
  'DAS CONSTRUÇÕES COLETIVAS E DE SUA VIABILIDADE',
  p('<strong>6.1.</strong> Do Escopo da Infraestrutura: O escopo de responsabilidade da VENDEDORA quanto às obras da área restringe-se, única e exclusivamente, à entrega das seguintes benfeitorias:'),
)}
${p('<strong>I.</strong> abertura das vias de acesso interno;')}
${p('<strong>II.</strong> demarcação física dos lotes rurais;')}
${p('<strong>III.</strong> implantação de rede primária de energia elétrica; e')}
${p('<strong>IV.</strong> perfuração de poço tubular profundo para captação coletiva de água.')}
${p('<strong>6.2.</strong> Fica o COMPRADOR ciente de que quaisquer outras obras de infraestrutura não elencadas neste rol não são de responsabilidade da VENDEDORA.')}
${p('<strong>6.3.</strong> Da Condição Suspensiva: O cronograma físico de execução das referidas obras sujeita-se a uma condição suspensiva estritamente vinculada ao sucesso comercial do empreendimento. Por conseguinte, As obras de infraestrutura iniciar-se-ão quando atingido o marco comercial mínimo de 30% das unidades comercializadas ou quando houver capitalização suficiente para o início das obras, o que ocorrer primeiro, respeitado o prazo máximo de 06 (seis) meses contados da assinatura deste contrato.')}
${p('<strong>6.4.</strong> O COMPRADOR declara expressa ciência e anuência de que as obras de infraestrutura do empreendimento serão executadas sob o regime de implantação em etapas e que o desenvolvimento do cronograma físico-financeiro e a consequente entrega das benfeitorias ocorrerão de maneira escalonada e estritamente proporcional ao volume de vendas e de capitalização do projeto, sem que tal progressividade ou faseamento configure, por si só, mora automática da VENDEDORA, desde que respeitados os prazos máximos previstos neste contrato.')}
${p('<strong>6.5.</strong> O prazo estimado para conclusão da infraestrutura essencial é de até 120 (cento e vinte) dias, admitida prorrogação por motivo de força maior, caso fortuito, condições climáticas adversas ou exigências administrativas de órgãos públicos.')}
`)}
${lfPage(7, `
${clauseOpen(
  'CLÁUSULA SÉTIMA',
  'DA RESPONSABILIDADE PELOS TRIBUTOS E ENCARGOS',
  p('<strong>7.1.</strong> Dos Encargos Fiscais e Tributários: O COMPRADOR assume, a partir da assinatura do presente contrato, a responsabilidade exclusiva pelo pagamento de todos os tributos federais, estaduais ou municipais (ITR, IPTU, CCIR/INCRA, taxas ambientais e correlatas) incidentes sobre a unidade adquirida, devendo promover a alteração do cadastro de cobrança para o seu nome assim que legalmente autorizado.'),
)}
${p('<strong>7.2.</strong> Caso ainda não exista individualização cadastral da unidade perante os órgãos competentes, o comprador reembolsará à vendedora os tributos incidentes proporcionalmente à área adquirida.')}
${p('<strong>7.3.</strong> Do Reembolso e Infração: Caso a VENDEDORA seja compelida a recolher qualquer tributo ou taxa em atraso para evitar a inscrição em Dívida Ativa ou execuções fiscais, exigirá do COMPRADOR o imediato reembolso do valor pago, acrescido de correção monetária (IGP-M/FGV), juros de 1% ao mês e multa de 2%.')}
${p('<strong>7.4.</strong> Do Prazo para o Reembolso: O não reembolso no prazo de 48 (quarenta e oito) horas, bem como a reincidência na inadimplência tributária, configurarão infração contratual grave, passível de rescisão do presente instrumento.')}
${clauseOpen(
  'CLÁUSULA OITAVA',
  'DA CESSÃO DE DIREITOS E TRANSFERÊNCIA',
  p('<strong>8.1.</strong> Da Anuência e Requisitos para a Cessão de Direitos: A cessão, transferência ou alienação dos direitos e obrigações decorrentes deste instrumento a terceiros (Cessionários) somente será admitida mediante o cumprimento estrito e cumulativo dos seguintes requisitos:'),
)}
${p('<strong>I.</strong> Estar o COMPRADOR (Cedente) rigorosamente em dia com o pagamento de todas as parcelas, tributos e taxas referentes ao imóvel;')}
${p('<strong>II.</strong> Solicitação formal e por escrito apresentada pelo COMPRADOR com antecedência mínima de 30 (trinta) dias;')}
${p('<strong>III.</strong> Aprovação em prévia e rigorosa análise cadastral e de capacidade financeira do pretenso Cessionário, a critério exclusivo da VENDEDORA;')}
${p('<strong>IV.</strong> Emissão de aprovação expressa e formal por parte da VENDEDORA;')}
${p('<strong>V.</strong> Pagamento, à vista, de uma Taxa de Cessão e Anuência fixada no patamar de 5% (cinco por cento) do valor total e atualizado deste contrato, destinada ao custeio de despesas administrativas, jurídicas e de refação de cadastro.')}
${p('<strong>8.2.</strong> Do Direito de Preferência (Preempção): Em caso de intenção de venda, cessão ou transferência da unidade imobiliária, o COMPRADOR deverá oferecer o lote previamente e por escrito à VENDEDORA. Esta terá o direito de preferência para a aquisição do bem nas exatas condições (preço e forma de pagamento) ofertadas a terceiros, devendo exercer seu direito no prazo decadencial de 15 (quinze) dias úteis.')}
${p('<strong>8.3.</strong> Da Exclusividade na Intermediação (Fase de Cessão de Direitos): Não havendo interesse da VENDEDORA no exercício do direito de preferência, e enquanto não houver a quitação integral do preço ajustado neste contrato, a eventual revenda ou cessão de direitos aquisitivos a terceiros deverá, obrigatoriamente, ocorrer por intermédio da própria VENDEDORA ou de imobiliária/corretor por ela expressamente indicado, visando resguardar a segurança da operação e a análise cadastral do novo adquirente.')}
${p('<strong>8.4.</strong> Da Extinção da Exclusividade: Fica expressamente pactuado que a obrigatoriedade de intermediação exclusiva prevista no item 8.2 somente existirá enquanto houver saldo devedor pendente perante a VENDEDORA, a partir do momento de sua quitação, o COMPRADOR estará livre para comercializar o imóvel da forma que melhor lhe convier.')}
${p('<strong>8.5.</strong> Das Penalidades: A cessão, venda ou transferência irregular da unidade à revelia das regras acima estabelecidas implicará na cobrança de multa não compensatória equivalente a 20% (vinte por cento) do valor total e atualizado deste contrato, sem prejuízo da rescisão contratual de pleno direito e da ineficácia do negócio perante a VENDEDORA.')}
${clauseOpen(
  'CLÁUSULA NONA',
  'DA RESOLUÇÃO CONTRATUAL, PENALIDADES E RESTITUIÇÃO DE VALORES',
  p('<strong>9.1.</strong> Da Natureza Jurídica das Arras: Fica estabelecido que o valor entregue pelo COMPRADOR no ato da assinatura deste instrumento possui natureza jurídica de Arras Confirmatórias, nos estritos termos dos'),
)}
`)}
${lfPage(8, `
${p('artigos 417 a 420 do Código Civil. Referida quantia consubstancia a garantia de cumprimento do negócio jurídico entabulado, operando-se, em caso de inexecução culposa ou desistência por parte do COMPRADOR, como indenização pré-fixada em favor da VENDEDORA.')}
${p(`<strong>9.2.</strong> Da Comissão de Corretagem: As Partes declaram expressa ciência de que o valor de ${t('BROKER_COMMISSION')} (${t('BROKER_COMMISSION_EXTENSO')}) ostenta a natureza de remuneração pelos serviços de intermediação imobiliária (corretagem) efetivamente prestados. Por se tratar de serviço consumado no ato da assinatura deste instrumento (art. 725 do Código Civil), referida quantia não integrará a base de cálculo para devolução e não será restituída ao COMPRADOR em nenhuma hipótese de distrato ou rescisão motivada por este.`)}
${p('<strong>9.3.</strong> Das Penalidades por Rescisão: Operando-se a resolução do presente instrumento por iniciativa, inadimplemento ou culpa exclusiva do COMPRADOR, este sujeitar-se-á, de pleno direito e cumulativamente, às seguintes deduções e penalidades, calculadas sobre o montante atualizado a ser eventualmente restituído:')}
${p('<strong>I.</strong> Perda integral da quantia paga a título de Arras/Sinal de Negócio (art. 418 do Código Civil);')}
${p('<strong>II.</strong> Retenção de 25% (vinte e cinco por cento) sobre o valor total das parcelas efetivamente pagas, a título de cláusula penal compensatória e indenização pelos custos operacionais, administrativos<sup>7</sup> e de comercialização suportados pela VENDEDORA, em conformidade com os parâmetros da Lei nº 13.786/2018 (Lei do Distrato).')}
${footnotes([
  note(7, 'A composição referente à Dedução de Taxa Administrativa de Distrato se encontra fixada em 5% (cinco por cento) sobre o valor total do contrato, destinada à cobertura de despesas operacionais e jurídicas indissociáveis ao cancelamento do negócio e reintegração do imóvel ao estoque da VENDEDORA.'),
])}
${p('<strong>9.4.</strong> Da Taxa de Fruição (Ocupação do Imóvel): Em caso de resolução contratual por inadimplemento ou culpa do COMPRADOR, será devida à VENDEDORA uma indenização mensal a título de fruição (taxa de ocupação) do imóvel.')}
${p('<strong>Parágrafo Único:</strong> A referida taxa será calculada à razão de 0,5% (meio por cento) ao mês sobre o valor total e atualizado deste contrato, ou no valor fixo mensal de R$ 500,00 (quinhentos reais), prevalecendo e aplicando-se sempre o que for maior. A taxa incidirá desde a data em que o COMPRADOR teve o lote disponibilizado para seu uso (imissão na posse) até a data da efetiva, comprovada e pacífica desocupação e devolução do bem à VENDEDORA, podendo este montante ser deduzido do saldo a ser restituído.')}
${p('<strong>9.5.</strong> Da Forma e Prazo de Restituição: O saldo remanescente a ser restituído ao COMPRADOR - apurado após sofrer o desconto cumulativo das arras, da retenção de até 25% do valor pago, da comissão de corretagem, da taxa de fruição, dos tributos (IPTU/ITR), das despesas operacionais, dos custos de revenda e de eventuais multas contratuais – será pago somente após a efetiva e incontroversa desocupação e devolução da posse do imóvel à VENDEDORA.')}
${p('<strong>Parágrafo Único:</strong> A restituição ocorrerá em prazo não superior a 12 (doze) meses, contados da data da formalização da rescisão e devolução da posse, ou de forma imediata após a efetiva revenda da unidade a um novo adquirente e o recebimento dos respectivos valores pela VENDEDORA, prevalecendo o evento que ocorrer primeiro.')}
${clauseOpen(
  'CLÁUSULA DÉCIMA',
  'DA RESOLUÇÃO DE LOTE COM EDIFICAÇÕES E BENFEITORIAS',
  p('<strong>10.1.</strong> Da Retomada do Imóvel: Na hipótese de rescisão por culpa do COMPRADOR havendo acessões ou benfeitorias introduzidas no lote rural, a VENDEDORA terá assegurado o direito potestativo de retomar a posse imediata do imóvel com todas as suas melhorias, aplicando-se as mesmas regras de retenção financeiras delineadas neste instrumento.'),
)}
${p('<strong>10.2.</strong> Do Direito à Indenização e Retenção: O COMPRADOR fará jus à indenização exclusivamente pelas benfeitorias úteis e necessárias, sendo terminantemente excluídas as voluptuárias. Fica expressamente condicionado que tal indenização somente será devida se as obras tiverem sido edificadas em estrita observância às normas legais, ambientais, municipais e com a prévia aprovação expressa da VENDEDORA, conforme exigido neste contrato.')}
${p('<strong>Parágrafo Único:</strong> O COMPRADOR renuncia expressamente ao direito de retenção do imóvel por benfeitorias (art. 1.219 do Código Civil), obrigando-se a desocupar a chácara imediatamente após a')}
`)}
${lfPage(9, `
${p('notificação de rescisão, sob pena de caracterização de esbulho possessório, sujeitando-se à reintegração de posse e ao pagamento de taxa de fruição diária.')}
${p('<strong>10.3.</strong> Da Isenção de Responsabilidade da VENDEDORA: Fica expressamente pactuado que a VENDEDORA não se responsabilizará por desembolsar, com recursos próprios, qualquer quantia a título de indenização pelas acessões ou benfeitorias erigidas no lote. O direito ao recebimento de tais valores pelo COMPRADOR ficará estritamente condicionado à efetiva revenda da unidade imobiliária a um terceiro (Novo Adquirente), operando-se a liquidação exclusivamente sob as condições delineadas no parágrafo seguinte.')}
${p('<strong>10.4.</strong> Da Condição e Forma de Repasse pelo Novo Adquirente: O repasse financeiro correspondente à avaliação das benfeitorias úteis e necessárias será suportado pelo Novo Adquirente. O COMPRADOR original declara ciência e concordância de que receberá a referida indenização de forma parcelada, nos exatos prazos, proporções e condições estabelecidos na nova negociação de venda, figurando a VENDEDORA apenas como mandatária, interveniente e facilitadora do repasse dos valores, isenta de qualquer solidariedade ou responsabilidade caso o Novo Adquirente torne-se inadimplente.')}
${p('<strong>10.5.</strong> Da Retenção para Regularização Documental e Tributária: A exigibilidade e a liberação de qualquer saldo indenizatório ao COMPRADOR ficam estritamente subordinadas à comprovação da absoluta regularidade técnica, documental e fiscal da obra.')}
${p('<strong>I.</strong> O COMPRADOR deverá apresentar as aprovações de projeto, licenças ambientais, Alvará de Construção, Carta de "Habite-se" (ou equivalente rural) e as Certidões Negativas de Débitos (municipais, estaduais, federais, previdenciários e trabalhistas) vinculadas à edificação.')}
${p('<strong>II.</strong> Fica a VENDEDORA irrevogavelmente autorizada a abater e reter do saldo a ser restituído todo e qualquer montante necessário para quitar impostos atrasados, multas, pendências trabalhistas da obra ou taxas de regularização exigidas pelos órgãos públicos, a fim de viabilizar a transferência limpa e desembaraçada ao Novo Adquirente.')}
${p('<strong>10.6.</strong> Das Benfeitorias Voluptuárias: Em obediência ao art. 1.219 do Código Civil, sob nenhuma hipótese haverá indenização ou direito de retenção por benfeitorias voluptuárias (obras de mero luxo, estética ou deleite). Fica facultado ao COMPRADOR, contudo, o direito de levantá-las (retirá-las) às suas exclusivas expensas, desde que tal remoção não acarrete qualquer dano, depreciação ou prejuízo à estrutura do imóvel principal, restabelecendo-o ao seu estado original.')}
${clauseOpen(
  'CLÁUSULA DÉCIMA PRIMEIRA',
  'DO DIREITO DE RECOMPRA, DA FORÇA EXECUTIVA EXTRAJUDICIAL',
  p('<strong>11.1.</strong> Da Opção De Recompra e Retomada: Fica assegurado à VENDEDORA, a seu exclusivo critério e conveniência, o direito potestativo de exercer a recompra da unidade imobiliária ou a resolução do contrato com a retomada do bem, nas hipóteses de inadimplência superior a 90 (noventa) dias ou mediante solicitação de distrato por parte do COMPRADOR.'),
)}
${p('<strong>11.2.</strong> O exercício deste direito implicará na aplicação imediata das cláusulas de retenção, multas e taxa de fruição previstas neste instrumento, servindo o presente instrumento como prova contratual para eventual ação de reintegração de posse.')}
${p('<strong>11.3.</strong> Da Força Executiva Extrajudicial: O presente instrumento é firmado sob a égide do artigo 784, inciso III, do Código de Processo Civil, constituindo-se como TÍTULO EXECUTIVO EXTRAJUDICIAL, apto a amparar execução imediata de quantia certa (parcelas vencidas e encargos) ou execução de obrigação de fazer/entregar, independente de prévia ação de conhecimento.')}
${clauseOpen(
  'CLÁUSULA DÉCIMA SEGUNDA',
  'DAS CONDIÇÕES FINAIS E DO FORO DE ELEIÇÃO',
  p('<strong>12.1.</strong> O presente contrato é celebrado em caráter irrevogável e irretratável, não admitindo arrependimento unilateral, obrigando as partes contratantes, seus herdeiros e sucessores a qualquer título, ao fiel e integral cumprimento de todas as cláusulas e condições aqui pactuadas.'),
)}
${p('<strong>12.2.</strong> A tolerância de qualquer das partes quanto ao descumprimento de obrigações contratuais, ou a não aplicação imediata das sanções previstas, será considerada mera liberalidade, não constituindo novação, renúncia de direitos ou alteração das cláusulas aqui pactuadas.')}
`)}
${lfPage(10, `
${p('<strong>12.3.</strong> As comunicações entre as partes poderão ser realizadas via e-mail, aplicativos de mensagens (whatsapp ou equivalente a ser indicado pelo comprador) ou carta com AR.')}
${p('<strong>Parágrafo único:</strong> O COMPRADOR obriga-se a manter seu endereço e contatos atualizados perante a VENDEDORA, sendo considerada válida e entregue qualquer notificação enviada para o último endereço informado no cadastro.')}
${p('<strong>12.4.</strong> Se qualquer cláusula ou disposição deste contrato for declarada nula ou inexequível por decisão judicial, tal nulidade não afetará as demais cláusulas, as quais permanecerão em pleno vigor e efeito entre as partes.')}
${p('<strong>12.5.</strong> O COMPRADOR declara ter ciência de que o imóvel objeto deste contrato situa-se em área rural/expansão urbana, obrigando-se a respeitar as normas de Direito Ambiental vigentes.')}
${p('<strong>I.</strong> Fica terminantemente proibido qualquer desmatamento, corte de árvores, intervenção em Áreas de Preservação Permanente (APP) ou Reserva Legal sem a prévia e expressa autorização dos órgãos ambientais competentes de ordem municipal, estadual e/ou federal.')}
${p('<strong>II.</strong> O COMPRADOR assume total e exclusiva responsabilidade civil, administrativa e criminal por quaisquer danos ambientais que venha a causar no imóvel, isentando a VENDEDORA de toda e qualquer solidariedade quanto a multas ou embargos aplicados após a imissão na posse.')}
${p('<strong>12.6.</strong> O COMPRADOR autoriza a VENDEDORA a coletar e tratar seus dados pessoais estritamente para fins de gestão contratual, emissão de boletos, cobrança e órgãos de proteção ao crédito, em conformidade com a Lei nº 13.709/2018 (LGPD).')}
${p(`<strong>12.7.</strong> Para dirimir quaisquer dúvidas ou controvérsias oriundas do presente contrato que não puderem ser resolvidas amigavelmente, as partes elegem, com exclusão de qualquer outro por mais privilegiado que seja, o Foro da Comarca de ${t('PROJECT_FORUM_CITY')}/Estado do ${t('PROJECT_STATE')}.`)}
${p('E por estarem assim justas e contratadas, as partes assinam o presente instrumento em 02 (duas) vias de igual teor e forma, na presença de 02 (duas) testemunhas instrumentárias abaixo identificadas.')}
${dateLine()}
${signatureBlock()}
`, true)}
</div>`;

  assertNoLfEstrelaPageMarkers(html);
  if (/30%\s+do valor e\s+70%/i.test(html)) {
    throw new Error('LF ESTRELA congelou participação 30/70. Use {{PARTNERSHIP_NOTE}}.');
  }
  if (/\[data de publica/i.test(html)) {
    throw new Error('LF ESTRELA ainda contém [Data de Publicação] no lugar da corretagem.');
  }
  if (/30 DE SETEMBRO DE 2026/i.test(html)) {
    throw new Error('LF ESTRELA congelou a data 30 DE SETEMBRO DE 2026.');
  }
  return html;
}
