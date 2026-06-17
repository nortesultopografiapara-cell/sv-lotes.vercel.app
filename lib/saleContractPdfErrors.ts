/**
 * Erros e logging da geração PDF na assinatura pública de venda.
 */

export type SaleSignPdfErrorDetail = {
  message: string;
  name: string;
  stack?: string;
};

export function shouldExposeSaleSignPdfError(): boolean {
  return (
    process.env.NODE_ENV !== 'production' || process.env.SALE_SIGN_PDF_DEBUG === '1'
  );
}

export function formatSaleSignPdfError(err: unknown): SaleSignPdfErrorDetail {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }
  return {
    message: String(err),
    name: 'UnknownError',
  };
}

export function logSaleSignPdfError(
  context: Record<string, unknown>,
  err: unknown,
): SaleSignPdfErrorDetail {
  const detail = formatSaleSignPdfError(err);
  console.error('[sale-sign-pdf]', {
    ...context,
    error: detail.message,
    name: detail.name,
    stack: detail.stack,
  });
  return detail;
}

export const SALE_SIGN_PDF_DOWNLOAD_ERROR =
  'Não foi possível gerar o PDF para download. Visualize o contrato na página ou tente novamente em instantes.';

export const SALE_SIGN_PDF_PREVIEW_ERROR =
  'Não foi possível gerar o PDF. Exibindo visualização HTML temporária.';
