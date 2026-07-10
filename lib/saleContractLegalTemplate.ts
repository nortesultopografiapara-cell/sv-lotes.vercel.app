/**
 * Trechos legais do contrato de compra e venda (imobiliárias) — helpers testáveis.
 * Mantém o modelo Meneses; alterações pontuais para assinatura eletrônica e consistência.
 */

export function normalizeSalePaymentType(
  paymentType: unknown,
): string {
  return String(paymentType || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** À vista explícito ou 1 parcela sem entrada (caso Meneses 000000022/2026). */
export function isSaleContractCashPayment(
  sale: Record<string, unknown>,
): boolean {
  const normalized = normalizeSalePaymentType(sale?.payment_type);
  const isAVista =
    normalized === 'a vista' ||
    normalized.includes('vista') && !normalized.includes('parcel');

  if (isAVista) return true;

  const installments = Math.max(1, Number(sale?.installments_count) || 1);
  const downPayment = Number(sale?.down_payment || 0);

  if (installments <= 1 && downPayment <= 0) return true;

  return false;
}

export function isValidRepresentativeCpf(raw: unknown): boolean {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 11;
}

export function formatRepresentativeCpfForDisplay(raw: unknown): string | null {
  if (!isValidRepresentativeCpf(raw)) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function buildSaleContractRepresentativeSignatureHtml(params: {
  representativeName: string;
  representativeCpfRaw: string;
  companyName: string;
  identitySuffix?: string;
}): string {
  const name = String(params.representativeName || '').trim();
  const company = String(params.companyName || '').trim();
  const suffix = params.identitySuffix || '';

  if (!name || /^não informado$/i.test(name)) return '';

  const cpf = formatRepresentativeCpfForDisplay(params.representativeCpfRaw);
  if (cpf) {
    return `<p style="margin: 4px 0 0 0; font-size: 9pt;">${name}<br/>Representante legal<br/>CPF: ${cpf}${suffix}</p>`;
  }

  const companyLabel = company || 'IMOBILIÁRIA';
  return `<p style="margin: 4px 0 0 0; font-size: 9pt;">${name}<br/>Representante legal da ${companyLabel.toUpperCase()}${suffix}</p>`;
}

export function buildSaleContractClauseQuartaHtml(params: {
  isCash: boolean;
  valorTotalFmt: string;
  valorTotalExtenso: string;
  valorEntradaFmt: string;
  valorEntradaExtenso: string;
  qtdParcelas: number;
  valorParcelaFmt: string;
  valorParcelaExtenso: string;
  dataPrimeiraParcelaFmt: string;
  dataUltimaParcelaFmt: string;
  /** Quando true, valores variam (ex.: parcelas balão) — não afirma "parcelas iguais". */
  hasVariableInstallments?: boolean;
  /** Texto completo já montado pelo helper de balão (opcional). */
  balloonClauseBodyHtml?: string | null;
}): string {
  const taxes =
    ' Taxas decorrentes do presente contrato e da escritura definitiva de compra e venda, respectivo registro, bem como todos os impostos e taxas incidentes sobre o imóvel a partir da assinatura do presente instrumento, são de inteira responsabilidade do PROMISSÁRIO COMPRADOR.';

  if (params.isCash) {
    return `<p style="margin-bottom: 0;">
                    <strong>Cláusula Quarta:</strong> O pagamento do valor total de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong> será realizado à vista pelo PROMISSÁRIO COMPRADOR ao PROMITENTE VENDEDOR, na data da assinatura do presente contrato, dando este, após a confirmação do pagamento, plena, geral e irrevogável quitação.${taxes}
                </p>`;
  }

  const entradaExtenso = params.valorEntradaExtenso || 'zero reais';

  if (params.hasVariableInstallments) {
    if (params.balloonClauseBodyHtml) {
      return `<p style="margin-bottom: 0;">
                    <strong>Cláusula Quarta:</strong> ${params.balloonClauseBodyHtml}${taxes}
                </p>`;
    }
    return `<p style="margin-bottom: 0;">
                    <strong>Cláusula Quarta:</strong> Fica a cargo exclusivo do PROMISSÁRIO COMPRADOR, com o valor de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong>, entrada de <strong>${params.valorEntradaFmt} (${entradaExtenso})</strong>, e o restante parcelado via boleto bancário em <strong>${params.qtdParcelas} parcelas</strong>, nos valores e vencimentos constantes do Quadro Financeiro deste contrato, inclusive as parcelas balão com seus respectivos acréscimos. Sendo a primeira parcela para o dia <strong>${params.dataPrimeiraParcelaFmt}</strong> e a última parcela para o dia <strong>${params.dataUltimaParcelaFmt}</strong>.${taxes}
                </p>`;
  }

  return `<p style="margin-bottom: 0;">
                    <strong>Cláusula Quarta:</strong> Fica a cargo exclusivo do PROMISSÁRIO COMPRADOR, com o valor de <strong>${params.valorTotalFmt} (${params.valorTotalExtenso})</strong>, entrada de <strong>${params.valorEntradaFmt} (${entradaExtenso})</strong>, e o restante parcelado via boleto bancário em <strong>${params.qtdParcelas} parcelas iguais no valor de ${params.valorParcelaFmt} (${params.valorParcelaExtenso})</strong>. Sendo a primeira parcela para o dia <strong>${params.dataPrimeiraParcelaFmt}</strong> e a última parcela para o dia <strong>${params.dataUltimaParcelaFmt}</strong>.${taxes}
                </p>`;
}

export function buildSaleContractElectronicSignatureClauseHtml(): string {
  return `
            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 10px;">
                    <strong>Cláusula Décima Segunda:</strong> As partes reconhecem e concordam que o presente contrato poderá ser formalizado por meio de assinatura eletrônica realizada através da plataforma SV LOTES, mediante link individual de assinatura, identificação do signatário, aceite eletrônico, registro de CPF, endereço IP, data e hora da assinatura, histórico de visualização e assinatura, token de autenticação e demais evidências eletrônicas geradas pelo sistema.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Primeiro:</strong> A assinatura eletrônica realizada na plataforma SV LOTES possui validade jurídica e eficácia probatória, nos termos da Medida Provisória nº 2.200-2/2001, da Lei nº 14.063/2020 e demais normas aplicáveis.
                </p>
                <p style="margin-bottom: 10px;">
                    <strong>Parágrafo Segundo:</strong> O certificado eletrônico de assinatura, bem como os registros de acesso, visualização, aceite, IP, data, hora e identificação do signatário, integram este contrato para todos os fins de direito e constituem prova da manifestação de vontade das partes.
                </p>
                <p style="margin-bottom: 0;">
                    <strong>Parágrafo Terceiro:</strong> A assinatura eletrônica dispensa a assinatura física em papel, produzindo os mesmos efeitos jurídicos de documento assinado manualmente, salvo quando as partes optarem por assinatura física complementar.
                </p>
            </div>`;
}

export function buildSaleContractForumClauseHtml(foroText: string): string {
  return `
            <div class="contract-clause" style="padding-bottom: 5px;">
                <p style="margin-bottom: 0;">
                    <strong>Cláusula Décima Terceira:</strong> Fica eleito o foro ${foroText} para a solução de qualquer questão oriunda do presente contrato, renunciando as partes contratantes a qualquer outro, por mais especial que seja.
                </p>
            </div>`;
}
