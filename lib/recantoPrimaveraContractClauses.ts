/**
 * Cláusulas do contrato Recanto Primavera — estrutura e texto do DOCX Ivanilde.
 * Isolado do modelo Meneses/PADRAO.
 */

import type { RecantoPrimaveraContractContext } from '@/lib/recantoPrimaveraContractContext';

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
] as const;

function buildPaymentTableHtml(ctx: RecantoPrimaveraContractContext): string {
  if (ctx.isCashPayment) {
    return `<p style="margin-bottom: 0;">
      O pagamento do valor total de <strong>${ctx.valorTotalFmt}</strong>${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''} será realizado à vista pelo(a) COMPRADOR(A) ao(à) VENDEDOR(A).
    </p>`;
  }

  const saldoLine = `${ctx.valorSaldoParceladoFmt}, em ${ctx.qtdParcelas} parcelas mensais de ${ctx.valorParcelaFmt} FIXAS`;

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11pt;">
      <thead>
        <tr>
          <th style="border: 1px solid #111; padding: 8px; text-align: center; width: 35%;">SINAL</th>
          <th style="border: 1px solid #111; padding: 8px; text-align: center;">SALDO PARCELADO</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: 1px solid #111; padding: 8px; text-align: center;"><strong>${ctx.valorSinalFmt}</strong></td>
          <td style="border: 1px solid #111; padding: 8px; text-align: center;"><strong>${saldoLine}</strong></td>
        </tr>
      </tbody>
    </table>`;
}

function buildClauseTerceiraHtml(ctx: RecantoPrimaveraContractContext): string {
  const sinalNatureText =
    'o valor pago a título de sinal não possui natureza de entrada, não sendo abatido do valor da chácara, destinando-se à confirmação do negócio;';

  const bankParagraph = ctx.bankBoletoText
    ? `<p style="margin-bottom: 10px;"><strong>Parágrafo Segundo:</strong> Os pagamentos das parcelas deverão ser realizados exclusivamente por <strong>boleto bancário</strong>, mediante depósito na conta indicada pelo(a) VENDEDOR(A): ${ctx.bankBoletoText}.</p>`
    : `<p style="margin-bottom: 10px;"><strong>Parágrafo Segundo:</strong> Os pagamentos das parcelas deverão ser realizados exclusivamente por <strong>boleto bancário</strong>, na conta bancária indicada pelo(a) VENDEDOR(A).</p>`;

  const dueParagraph =
    ctx.dueDay && ctx.valorParcelaFmt && ctx.dataPrimeiraParcelaFmt
      ? `<p style="margin-bottom: 0;"><strong>Parágrafo Terceiro:</strong> O vencimento das parcelas ocorrerá todo dia <strong>${ctx.dueDay}</strong>, no valor de <strong>${ctx.valorParcelaFmt}</strong> cada, com início em <strong>${ctx.dataPrimeiraParcelaFmt}</strong>.</p>`
      : ctx.dueDay && ctx.valorParcelaFmt
        ? `<p style="margin-bottom: 0;"><strong>Parágrafo Terceiro:</strong> O vencimento das parcelas ocorrerá todo dia <strong>${ctx.dueDay}</strong>, no valor de <strong>${ctx.valorParcelaFmt}</strong> cada.</p>`
        : '';

  if (ctx.isCashPayment) {
    return `
    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA TERCEIRA – DO PREÇO E FORMA DE PAGAMENTO:</strong> O preço total da chácara é de <strong>${ctx.valorTotalFmt}</strong>${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''}, a ser pago à vista pelo(a) COMPRADOR(A) ao(à) VENDEDOR(A).
      </p>
      ${bankParagraph}
    </div>`;
  }

  return `
    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 10px;">
        <strong>CLÁUSULA TERCEIRA – DO PREÇO E FORMA DE PAGAMENTO:</strong> O preço total da chácara é de <strong>${ctx.valorTotalFmt}</strong>${ctx.valorTotalExtenso ? ` (${ctx.valorTotalExtenso})` : ''}, a ser pago pelo(a) COMPRADOR(A) ao(à) VENDEDOR(A) nas condições abaixo:
      </p>
      ${buildPaymentTableHtml(ctx)}
      <p style="margin-bottom: 10px;">
        <strong>Parágrafo Primeiro:</strong> Fica estabelecido que ${sinalNatureText}
      </p>
      ${bankParagraph}
      ${dueParagraph}
    </div>`;
}

export function buildRecantoPrimaveraClausesHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const objectText = ctx.lotObjectText;

  return `
    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA PRIMEIRA – DAS DECLARAÇÕES INICIAIS:</strong> O(A) VENDEDOR(A) declara ser legítimo(a) possuidor(a) do imóvel objeto deste contrato, livre e desembaraçado de quaisquer ônus, gravames ou restrições que impeçam a presente negociação, responsabilizando-se pela veracidade das informações aqui prestadas. O(A) COMPRADOR(A) declara ter plena capacidade civil para contratar, ter conhecimento das características do imóvel e do empreendimento, e manifestar expressamente sua vontade de adquirir o lote nas condições estabelecidas neste instrumento.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA SEGUNDA – DO OBJETO:</strong> O presente contrato tem por objeto a promessa de compra e venda do <strong>${objectText}</strong>, ${ctx.lotMeasuresText}
      </p>
    </div>

    ${buildClauseTerceiraHtml(ctx)}

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA QUARTA – DA INADIMPLÊNCIA:</strong> O não pagamento de qualquer parcela na data do vencimento implicará a incidência de multa moratória, juros e demais encargos previstos em lei e neste instrumento, sem prejuízo das demais medidas cabíveis para a cobrança do débito e eventual rescisão contratual.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA QUINTA – DA POSSE E PROPRIEDADE:</strong> A posse do imóvel será transmitida ao(à) COMPRADOR(A) após a assinatura do presente instrumento e o pagamento do sinal, limitada ao uso e fruição do lote adquirido, permanecendo a propriedade com o(a) VENDEDOR(A) até a quitação integral do preço e formalização da escritura definitiva, quando aplicável.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA SEXTA – DAS CONDIÇÕES DO IMÓVEL:</strong> O(A) COMPRADOR(A) declara ter visitado o imóvel, tomado conhecimento de suas dimensões, localização, acessos e características físicas, aceitando-o no estado em que se encontra, comprometendo-se a não realizar obras ou alterações que contrariem o projeto do loteamento ou normas municipais aplicáveis.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA SÉTIMA – DAS SERVIDÕES E RESTRIÇÕES DE USO:</strong> O(A) COMPRADOR(A) obriga-se a respeitar as servidões, restrições de uso, recuos, áreas de preservação e demais limitações previstas no projeto do empreendimento e na legislação vigente, não podendo destinar o imóvel a finalidade diversa da prevista para chácaras residenciais/rurais do loteamento.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA OITAVA – DO SANEAMENTO E RECURSOS HÍDRICOS:</strong> O(A) COMPRADOR(A) responsabiliza-se pelo cumprimento das normas ambientais e de saneamento aplicáveis ao imóvel, inclusive quanto ao uso de recursos hídricos, fossas, reservatórios e demais instalações necessárias, arcando com os custos de implantação e manutenção conforme exigências dos órgãos competentes.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA NONA – DA RESCISÃO:</strong> O descumprimento de qualquer obrigação prevista neste contrato poderá ensejar sua rescisão, com as consequências legais e contratuais aplicáveis, inclusive retenção ou restituição de valores nos termos acordados entre as partes e na forma da lei.
      </p>
    </div>

    <div class="contract-clause" style="padding-bottom: 5px;">
      <p style="margin-bottom: 0;">
        <strong>CLÁUSULA DÉCIMA PRIMEIRA - DO FORO:</strong> Fica eleito o foro ${ctx.foroText} para dirimir quaisquer dúvidas ou controvérsias oriundas do presente contrato, com renúncia a qualquer outro, por mais privilegiado que seja.
      </p>
    </div>`;
}
