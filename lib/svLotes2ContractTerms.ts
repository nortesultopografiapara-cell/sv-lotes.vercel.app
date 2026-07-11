import type { SvLotes2ContractContext } from '@/lib/svLotes2ContractContext';
import { buildBalloonAwarePaymentClauseText } from '@/lib/saleContractBalloonFinance';
import { formatContractDueDateLongBr } from '@/lib/contractPaymentDates';

const extenso = require('extenso');

export const SV2_BUYER_LABEL = 'PROMISSÁRIO(A) COMPRADOR(A)';
export const SV2_VENDOR_LABEL = 'PROMITENTE VENDEDOR(A)';

function formatCurrencyExtenso(value: number): string {
  if (value <= 0) return 'zero reais';
  try {
    return extenso(value.toFixed(2).replace('.', ','), { mode: 'currency' });
  } catch {
    return '';
  }
}

/** Cláusula Segunda — preço e forma de pagamento (sem parcela fixa). */
export function buildSvLotes2ClauseSegundaHtml(ctx: SvLotes2ContractContext): string {
  const taxes =
    ' Taxas decorrentes do presente contrato e da escritura definitiva de compra e venda, respectivo registro, bem como todos os impostos e taxas incidentes sobre o imóvel a partir da assinatura do presente instrumento, são de inteira responsabilidade do PROMISSÁRIO(A) COMPRADOR(A).';

  if (ctx.paymentMode === 'SINGLE_FUTURE') {
    const dueLong =
      String(ctx.singleFutureDueLongFmt || '').trim() ||
      formatContractDueDateLongBr(
        ctx.paymentDates?.entryDueRaw || ctx.paymentBreakdown?.singlePaymentDueRaw,
      ) ||
      '—';
    return `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA SEGUNDA — DO PREÇO E FORMA DE PAGAMENTO:</strong> O valor total de <strong>${ctx.valorTotalFmt} (${ctx.valorTotalExtenso})</strong> será pago pelo ${SV2_BUYER_LABEL} ao ${SV2_VENDOR_LABEL} em pagamento único, com vencimento em <strong>${dueLong}</strong>. A quitação plena, geral e irrevogável somente será concedida após a efetiva confirmação do pagamento.${taxes}</p>
    </div>`;
  }

  if (ctx.isCashPayment || ctx.paymentMode === 'IMMEDIATE_CASH') {
    return `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA SEGUNDA — DO PREÇO E FORMA DE PAGAMENTO:</strong> O pagamento do valor total de <strong>${ctx.valorTotalFmt} (${ctx.valorTotalExtenso})</strong> será realizado à vista pelo ${SV2_BUYER_LABEL} ao ${SV2_VENDOR_LABEL}, na data da assinatura do presente contrato, dando este, após a confirmação do pagamento, plena, geral e irrevogável quitação.${taxes}</p>
    </div>`;
  }

  const entradaExtenso = formatCurrencyExtenso(ctx.valEntrada);
  const primeiraParcela = ctx.paymentDates?.firstInstallmentDueFmt || '—';
  const ultimaParcela = ctx.paymentDates?.lastInstallmentDueFmt || '—';

  if (ctx.hasBalloonInstallments && ctx.balloonSummary) {
    const body = buildBalloonAwarePaymentClauseText({
      summary: ctx.balloonSummary,
      valorTotalFmt: ctx.valorTotalFmt,
      valorTotalExtenso: ctx.valorTotalExtenso,
      valorEntradaFmt: ctx.entradaFmt,
      valorEntradaExtenso: entradaExtenso,
      dataPrimeiraParcelaFmt: primeiraParcela,
      dataUltimaParcelaFmt: ultimaParcela,
    });
    return `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA SEGUNDA — DO PREÇO E FORMA DE PAGAMENTO:</strong> ${body}${taxes}</p>
    </div>`;
  }

  return `
    <div class="sv2-clause">
      <p><strong>CLÁUSULA SEGUNDA — DO PREÇO E FORMA DE PAGAMENTO:</strong> Fica a cargo exclusivo do ${SV2_BUYER_LABEL}, o valor de <strong>${ctx.valorTotalFmt} (${ctx.valorTotalExtenso})</strong>, entrada de <strong>${ctx.entradaFmt} (${entradaExtenso})</strong>, e o restante parcelado via boleto bancário em <strong>${ctx.qtdParcelas} parcelas</strong>. As parcelas possuem valor inicial de <strong>${ctx.valorParcelaFmt}</strong> e estarão sujeitas à correção monetária prevista neste contrato. Sendo a primeira parcela para o dia <strong>${primeiraParcela}</strong> e a última parcela para o dia <strong>${ultimaParcela}</strong>.${taxes}</p>
    </div>`;
}
