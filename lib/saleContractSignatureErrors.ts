/**
 * Erros tipados da assinatura eletrônica de venda.
 */

export class SaleContractSignatureError extends Error {
  constructor(
    message: string,
    readonly step: 'validation' | 'db_save' | 'html' = 'validation',
  ) {
    super(message);
    this.name = 'SaleContractSignatureError';
  }
}
