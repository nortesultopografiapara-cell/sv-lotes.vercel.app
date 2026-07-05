/**
 * Erros controlados — importação de clientes.
 */

export class CustomerImportParseError extends Error {
  readonly code = 'CUSTOMER_IMPORT_PARSE_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'CustomerImportParseError';
  }
}

export function isCustomerImportParseError(error: unknown): error is CustomerImportParseError {
  return error instanceof CustomerImportParseError;
}
