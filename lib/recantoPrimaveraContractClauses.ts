/**
 * Cláusulas literais do contrato Recanto Primavera — modelo DOCX Ivanilde.
 * Isolado do modelo Meneses/PADRAO.
 */

import type { RecantoPrimaveraContractContext } from '@/lib/recantoPrimaveraContractContext';
import { buildCompactBalloonFinanceScheduleHtml } from '@/lib/saleContractBalloonFinance';

export const RECANTO_PRIMAVERA_CLAUSE_MARKERS = [
  'CLÁUSULA PRIMEIRA – DAS DECLARAÇÕES INICIAIS',
  'CLÁUSULA SEGUNDA – DO OBJETO',
  'CLÁUSULA TERCEIRA – DO PREÇO E FORMA DE PAGAMENTO',
  'CLÁUSULA QUARTA – DA INADIMPLÊNCIA',
  'CLÁUSULA QUINTA – DA POSSE E PROPRIEDADE',
  'CLÁUSULA SEXTA – DAS CONDIÇÕES DO IMÓVEL',
  'CLÁUSULA SÉTIMA – DAS SERVIDÕES E RESTRIÇÕES DE USO',
  'CLÁUSULA OITAVA – DO SANEAMENTO E RECURSOS HÍDRICOS',
  'CLÁUSULA NONA – DA RESCISÃO',
  'CLÁUSULA DÉCIMA PRIMEIRA - DO FORO',
  'CLÁUSULA DÉCIMA SEGUNDA – DA ASSINATURA ELETRÔNICA',
] as const;

export const RECANTO_PRIMAVERA_ELECTRONIC_SIGNATURE_PHRASES = [
  'CLÁUSULA DÉCIMA SEGUNDA – DA ASSINATURA ELETRÔNICA',
  'assinatura eletrônica realizada por meio da plataforma SV LOTES',
  'Medida Provisória nº 2.200-2/2001',
  'produzindo todos os efeitos jurídicos de uma assinatura manuscrita',
  'dispensando reconhecimento de firma, autenticação ou assinatura física adicional',
  'tiveram acesso integral ao conteúdo deste instrumento antes da assinatura',
] as const;

/** Frases literais mínimas do DOCX — usadas em testes de não-resumo. */
export const RECANTO_PRIMAVERA_LITERAL_PHRASES = [
  'sob as penas da lei civil e criminal',
  'prazo máximo de 10 (dez) dias',
  'LOTE DE TERRAS CHÁCARAS',
  'pelo lado direito',
  'pelo lado esquerdo',
  'não possui natureza de entrada, não sendo abatido do valor da chácara',
  'realizados exclusivamente por',
  'boleto bancário',
  'A falta de recebimento do boleto bancário não isenta o(a) COMPRADOR(A) do pagamento',
  'comunicar ao(à) VENDEDOR(A) qualquer alteração de endereço, e-mail e telefone',
  'multa moratória de 2% (dois por cento)',
  'juros de mora de 1% (um por cento) ao mês',
  '3 (três) parcelas, consecutivas ou alternadas',
  'cadastros de proteção ao crédito e bancos de inadimplentes',
  '15 (quinze) dias de inadimplência',
  'lotear, desmembrar, fracionar ou transferir o imóvel',
  'posse direta do imóvel',
  'fração ideal correspondente',
  'termo de quitação no prazo de 60 (sessenta) dias',
  'taxa equivalente ao valor de 1 (uma) parcela',
  'problemas de marco ou divisa com o vizinho',
  'vistoria in loco',
  'ligação individual de energia elétrica',
  'prazo de 90 (noventa) dias',
  'terraplanagem, remoção de pedras, árvores, tocos',
  'garante a existência de água no solo ou subsolo',
  'conservação, limpeza, roçada, aterro, retirada de lixo e entulho',
  'roubos, furtos, acidentes ou quaisquer eventos danosos',
  'servidões de passagem',
  'rede elétrica',
  'domínio da estrada de acesso',
  'plantar, construir, edificar ou ocupar áreas restritas',
  'licenças, autorizações e outorgas exigidas pelos órgãos competentes',
  'não se responsabiliza pelo abastecimento hídrico',
  'multa compensatória de 20% (vinte por cento)',
  'retenção de 20% (vinte por cento) se a rescisão ocorrer até o pagamento de até 20% do valor total',
  'laudos de 3 (três) corretores devidamente inscritos no CRECI',
  'Fica eleito o foro da Comarca de',
] as const;

function buildPaymentTableHtml(ctx: RecantoPrimaveraContractContext): string {
  if (ctx.isCashPayment) {
    return `<p style="margin-bottom: 0;">
      O pagamento do valor total de <strong>${ctx.valorTotalFmt}</strong>${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''} será realizado à vista pelo(a) COMPRADOR(A) ao(à) VENDEDOR(A).
    </p>`;
  }

  const hasBalloon = Boolean(ctx.hasBalloonInstallments && ctx.balloonSummary?.hasBalloon);

  const saldoLine = hasBalloon
    ? `${ctx.valorSaldoParceladoFmt}, em ${ctx.qtdParcelas} parcelas mensais (base ${ctx.valorParcelaBaseFmt}), com parcelas balão discriminadas no Quadro Financeiro`
    : ctx.hasSignalRemaining
      ? `${ctx.valorSaldoParceladoFmt}, em ${ctx.qtdParcelas} parcelas mensais (base ${ctx.valorParcelaBaseFmt})`
      : `${ctx.valorSaldoParceladoFmt}, em ${ctx.qtdParcelas} parcelas mensais de ${ctx.valorParcelaFmt} FIXAS`;

  const sinalDetail = ctx.signalPaidFullyAtSale
    ? `${ctx.valorSinalFmt}<br/><span style="font-size: 9.5pt;">Pago integralmente no ato</span>`
    : ctx.hasSignalRemaining
      ? `${ctx.valorSinalFmt}<br/><span style="font-size: 9.5pt;">Pago no ato: ${ctx.valorSinalPagoNoAtoFmt}<br/>Restante: ${ctx.valorSinalRestanteFmt}</span>`
      : ctx.valorSinalFmt;

  const compositionTable = ctx.parcelasResumoSinalHtml
    ? `<div style="margin-top: 10px;">${ctx.parcelasResumoSinalHtml}</div>`
    : '';

  const balloonTable =
    hasBalloon && ctx.balloonSummary
      ? buildCompactBalloonFinanceScheduleHtml(ctx.balloonSummary)
      : '';

  return `
    <div class="contract-payment-block">
      <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11pt;">
        <thead>
          <tr>
            <th style="border: 1px solid #111; padding: 8px; text-align: center; width: 35%;">SINAL</th>
            <th style="border: 1px solid #111; padding: 8px; text-align: center;">SALDO PARCELADO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #111; padding: 8px; text-align: center;"><strong>${sinalDetail}</strong></td>
            <td style="border: 1px solid #111; padding: 8px; text-align: center;"><strong>${saldoLine}</strong></td>
          </tr>
        </tbody>
      </table>
      ${compositionTable}
      ${balloonTable}
    </div>`;
}

function buildClauseTerceiraHtml(ctx: RecantoPrimaveraContractContext): string {
  const bankDetail = ctx.bankBoletoText
    ? `, mediante pagamento na conta bancária indicada pelo(a) VENDEDOR(A): ${ctx.bankBoletoText}`
    : ', mediante pagamento na conta bancária indicada pelo(a) VENDEDOR(A)';

  /** Nunca afirma valor único “cada” — parcelas podem variar por complemento do sinal e centavos. */
  const dueText =
    ctx.dueDay && ctx.dataPrimeiraParcelaFmt
      ? `O vencimento das parcelas ocorrerá mensalmente, todo dia <strong>${ctx.dueDay}</strong>, com início em <strong>${ctx.dataPrimeiraParcelaFmt}</strong>, observando-se os valores constantes no quadro de pagamento deste contrato.`
      : ctx.dueDay
        ? `O vencimento das parcelas ocorrerá mensalmente, todo dia <strong>${ctx.dueDay}</strong>, observando-se os valores constantes no quadro de pagamento deste contrato.`
        : ctx.dataPrimeiraParcelaFmt
          ? `O vencimento das parcelas ocorrerá mensalmente, com início em <strong>${ctx.dataPrimeiraParcelaFmt}</strong>, observando-se os valores constantes no quadro de pagamento deste contrato.`
          : 'O vencimento das parcelas ocorrerá mensalmente, observando-se os valores constantes no quadro de pagamento deste contrato.';

  if (ctx.isCashPayment) {
    return `
    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA TERCEIRA – DO PREÇO E FORMA DE PAGAMENTO:</strong> O preço total da chácara é de <strong>${ctx.valorTotalFmt}</strong>${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''}, a ser pago à vista pelo(a) COMPRADOR(A) ao(à) VENDEDOR(A).
      </p>
      <p style="margin-bottom: 10px;"><strong>Parágrafo Segundo:</strong> Os pagamentos deverão ser realizados exclusivamente por <strong>boleto bancário</strong>${bankDetail}.</p>
      <p style="margin-bottom: 10px;"><strong>Parágrafo Quarto:</strong> A falta de recebimento do boleto bancário não isenta o(a) COMPRADOR(A) do pagamento na data do vencimento, devendo este solicitar nova via ao(à) VENDEDOR(A). O(A) COMPRADOR(A) compromete-se a comunicar ao(à) VENDEDOR(A) qualquer alteração de endereço, e-mail e telefone no prazo máximo de 10 (dez) dias.</p>
    </div>`;
  }

  return `
    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA TERCEIRA – DO PREÇO E FORMA DE PAGAMENTO:</strong> O preço total da chácara é de <strong>${ctx.valorTotalFmt}</strong>${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''}, a ser pago pelo(a) COMPRADOR(A) ao(à) VENDEDOR(A) nas condições abaixo:
      </p>
      ${buildPaymentTableHtml(ctx)}
      <p style="margin-bottom: 10px;">
        <strong>Parágrafo Primeiro:</strong> ${
          ctx.signalClauseText ||
          'Fica estabelecido que o valor pago a título de sinal não possui natureza de entrada, não sendo abatido do valor da chácara, destinando-se à confirmação do negócio.'
        }
      </p>
      <p style="margin-bottom: 10px;">
        <strong>Parágrafo Segundo:</strong> Os pagamentos das parcelas deverão ser realizados exclusivamente por <strong>boleto bancário</strong>${bankDetail}.
      </p>
      <p style="margin-bottom: 10px;">
        <strong>Parágrafo Terceiro:</strong> ${dueText}
      </p>
      <p style="margin-bottom: 0;">
        <strong>Parágrafo Quarto:</strong> A falta de recebimento do boleto bancário não isenta o(a) COMPRADOR(A) do pagamento na data do vencimento, devendo este solicitar nova via ao(à) VENDEDOR(A). O(A) COMPRADOR(A) compromete-se a comunicar ao(à) VENDEDOR(A) qualquer alteração de endereço, e-mail e telefone no prazo máximo de 10 (dez) dias.
      </p>
    </div>`;
}

export function buildRecantoPrimaveraClausesHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const locationSuffix = ctx.enterpriseLocation
    ? ` (${ctx.enterpriseLocation})`
    : '';

  return `
    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA PRIMEIRA – DAS DECLARAÇÕES INICIAIS:</strong> O(A) COMPRADOR(A) declara, sob as penas da lei civil e criminal, que todas as informações cadastrais fornecidas ao(à) VENDEDOR(A) são verdadeiras, completas e atualizadas, comprometendo-se a comunicar qualquer alteração no prazo máximo de 10 (dez) dias.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA SEGUNDA – DO OBJETO:</strong> O presente contrato tem por objeto a promessa de compra e venda de imóvel, consistente no <strong>LOTE DE TERRAS CHÁCARAS nº ${ctx.lote || '___'}</strong>, <strong>QUADRA nº ${ctx.quadra || '___'}</strong>, integrante do loteamento denominado <strong>${ctx.enterpriseName}</strong>, situado no Município de <strong>${ctx.municipality}/${ctx.uf}</strong>${locationSuffix}, com área aproximada de <strong>${ctx.areaM2 || '___'} m²</strong>, medindo: <strong>${ctx.frontMeasure || '___'}m</strong> de frente; <strong>${ctx.backMeasure || '___'}m</strong> de fundo; <strong>${ctx.rightMeasure || '___'}m</strong> pelo lado direito; <strong>${ctx.leftMeasure || '___'}m</strong> pelo lado esquerdo.
      </p>
    </div>

    ${buildClauseTerceiraHtml(ctx)}

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA QUARTA – DA INADIMPLÊNCIA:</strong> O atraso no pagamento de qualquer parcela implicará multa moratória de 2% (dois por cento) sobre o valor da parcela em atraso, acrescida de juros de mora de 1% (um por cento) ao mês, pro rata die.
      </p>
      <p style="margin-bottom: 10px;">
        O atraso no pagamento de 3 (três) parcelas, consecutivas ou alternadas, autoriza o(a) VENDEDOR(A) a considerar rescindido o presente contrato, independentemente de notificação judicial, resguardados os direitos previstos na CLÁUSULA NONA.
      </p>
      <p style="margin-bottom: 10px;">
        Decorridos 15 (quinze) dias de inadimplência, o(a) COMPRADOR(A) autoriza, desde já, a inclusão de seu nome nos cadastros de proteção ao crédito e bancos de inadimplentes.
      </p>
      <p style="margin-bottom: 0;">
        É vedado ao(à) COMPRADOR(A), enquanto não quitadas todas as parcelas ajustadas, lotear, desmembrar, fracionar ou transferir o imóvel objeto deste contrato, sob pena de rescisão e perdas e danos.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA QUINTA – DA POSSE E PROPRIEDADE:</strong> Com a assinatura do presente instrumento e o pagamento do sinal, o(a) COMPRADOR(A) recebe a posse direta do imóvel, com todos os direitos possessórios inerentes, limitada ao lote adquirido, sem direito a desmembramento individual do imóvel rural.
      </p>
      <p style="margin-bottom: 10px;">
        O(A) COMPRADOR(A) adquire, ainda, a fração ideal correspondente ao lote no empreendimento, comprometendo-se a aguardar a regularização futura do loteamento e a documentação pertinente, quando aplicável.
      </p>
      <p style="margin-bottom: 10px;">
        Quitado integralmente o preço, o(a) VENDEDOR(A) fornecerá termo de quitação no prazo de 60 (sessenta) dias, ressalvadas as obrigações tributárias, condominiais ou associativas que recaiam sobre o imóvel a partir da transmissão da posse.
      </p>
      <p style="margin-bottom: 10px;">
        Qualquer cessão, transferência ou alienação do imóvel somente poderá ocorrer mediante anuência prévia e expressa do(a) VENDEDOR(A), mediante pagamento de taxa equivalente ao valor de 1 (uma) parcela do presente contrato.
      </p>
      <p style="margin-bottom: 10px;">
        Eventuais problemas de marco ou divisa com o vizinho serão de exclusiva responsabilidade do(a) COMPRADOR(A), que se obriga a solucioná-los diretamente com o confrontante, sem ônus para o(a) VENDEDOR(A).
      </p>
      <p style="margin-bottom: 0;">
        É expressamente proibida a subdivisão, fracionamento ou desmembramento do lote adquirido, antes da quitação integral do preço e da regularização documental do empreendimento.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA SEXTA – DAS CONDIÇÕES DO IMÓVEL:</strong> O(A) COMPRADOR(A) declara ter realizado vistoria in loco, tomando pleno conhecimento da localização, confrontações, topografia, acessos e estado de conservação do imóvel, aceitando-o no estado em que se encontra.
      </p>
      <p style="margin-bottom: 10px;">
        O empreendimento dispõe de energia elétrica instalada na via de acesso, cabendo ao(à) COMPRADOR(A), às suas expensas, a ligação individual de energia elétrica ao lote adquirido, devendo providenciar transformador próprio no prazo de 90 (noventa) dias contados da assinatura deste contrato, quando necessário.
      </p>
      <p style="margin-bottom: 10px;">
        O(A) VENDEDOR(A) não se responsabiliza por terraplanagem, remoção de pedras, árvores, tocos ou quaisquer obstáculos naturais existentes no lote, tampouco garante a existência de água no solo ou subsolo.
      </p>
      <p style="margin-bottom: 10px;">
        O(A) COMPRADOR(A) responsabiliza-se pela conservação, limpeza, roçada, aterro, retirada de lixo e entulho do lote, mantendo-o em condições adequadas de uso e preservação ambiental.
      </p>
      <p style="margin-bottom: 0;">
        O(A) VENDEDOR(A) não se responsabiliza por roubos, furtos, acidentes ou quaisquer eventos danosos que venham a ocorrer no imóvel após a transmissão da posse ao(à) COMPRADOR(A).
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA SÉTIMA – DAS SERVIDÕES E RESTRIÇÕES DE USO:</strong> O(A) COMPRADOR(A) obriga-se a respeitar as servidões de passagem, de rede elétrica, de drenagem e demais servidões administrativas previstas no projeto do empreendimento, bem como o domínio da estrada de acesso e das áreas de uso comum.
      </p>
      <p style="margin-bottom: 0;">
        É expressamente proibido ao(à) COMPRADOR(A) plantar, construir, edificar ou ocupar áreas restritas, de preservação, de servidão ou fora dos limites do lote adquirido, sob pena de remoção às suas expensas e rescisão contratual.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA OITAVA – DO SANEAMENTO E RECURSOS HÍDRICOS:</strong> O(A) COMPRADOR(A) responsabiliza-se pela implantação e manutenção de sistema de saneamento adequado ao lote, inclusive fossa, sumidouro, poço ou solução equivalente, observadas as normas ambientais e municipais vigentes.
      </p>
      <p style="margin-bottom: 10px;">
        Caso o(a) COMPRADOR(A) pretenda perfurar poço ou utilizar recursos hídricos superficiais ou subterrâneos, deverá obter previamente todas as licenças, autorizações e outorgas exigidas pelos órgãos competentes, arcando com todos os custos decorrentes.
      </p>
      <p style="margin-bottom: 0;">
        O(A) VENDEDOR(A) não se responsabiliza pelo abastecimento hídrico do lote, pela existência de mananciais, pela qualidade ou quantidade de água, nem pela obtenção de outorgas ou licenças ambientais necessárias ao uso do imóvel.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA NONA – DA RESCISÃO:</strong> Em caso de rescisão por culpa do(a) COMPRADOR(A), este pagará multa compensatória de 20% (vinte por cento) sobre o valor total do contrato, sem prejuízo das demais penalidades previstas neste instrumento.
      </p>
      <p style="margin-bottom: 10px;">
        A restituição dos valores pagos pelo(a) COMPRADOR(A) observará as seguintes faixas de retenção, conforme o tempo de vigência do contrato: retenção de 20% (vinte por cento) se a rescisão ocorrer até o pagamento de até 20% do valor total; 40% (quarenta por cento) se ocorrer entre 20% e 40%; 60% (sessenta por cento) se ocorrer entre 40% e 60%; e 70% (setenta por cento) se ocorrer após 60% do valor total pago.
      </p>
      <p style="margin-bottom: 10px;">
        A devolução dos valores eventualmente restituíveis será feita de forma parcelada, em até 12 (doze) parcelas mensais, conforme disponibilidade financeira do(a) VENDEDOR(A), sem incidência de correção monetária ou juros sobre os valores devolvidos.
      </p>
      <p style="margin-bottom: 10px;">
        Eventuais benfeitorias realizadas no lote somente serão indenizadas se acompanhadas de laudos de 3 (três) corretores devidamente inscritos no CRECI, que atestem a existência, utilidade e valor das melhorias.
      </p>
      <p style="margin-bottom: 0;">
        O pagamento de benfeitorias, quando reconhecidas, ficará condicionado à revenda do lote pelo(a) VENDEDOR(A), não sendo devido em caso de rescisão sem alienação posterior do imóvel.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA DÉCIMA PRIMEIRA - DO FORO:</strong> Fica eleito o foro da Comarca de <strong>${ctx.forumCity}/${ctx.forumUf}</strong>, com renúncia de qualquer outro, por mais privilegiado que seja.
      </p>
    </div>`;
}

export function buildRecantoPrimaveraElectronicSignatureClauseHtml(): string {
  return `
    <div class="contract-clause contract-clause--electronic-signature contract-clause--tight" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA DÉCIMA SEGUNDA – DA ASSINATURA ELETRÔNICA</strong>
      </p>
      <p style="margin-bottom: 10px;">
        As partes reconhecem como válida e eficaz a assinatura eletrônica realizada por meio da plataforma SV LOTES, nos termos da Medida Provisória nº 2.200-2/2001 e legislação aplicável, produzindo todos os efeitos jurídicos de uma assinatura manuscrita, dispensando reconhecimento de firma, autenticação ou assinatura física adicional.
      </p>
      <p style="margin-bottom: 0;">
        As partes declaram que tiveram acesso integral ao conteúdo deste instrumento antes da assinatura, concordando expressamente com todas as suas cláusulas e condições.
      </p>
    </div>`;
}
