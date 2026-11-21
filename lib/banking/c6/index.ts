export {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  isC6RemoteOperationBlocked,
  throwIfC6EmissionAttempt,
} from '@/lib/banking/c6/c6EmitGuard';
export {
  EMPTY_C6_BANK_CONFIG,
  type C6BankConfigPublic,
} from '@/lib/banking/c6/c6ConfigTypes';
export { assertC6ConfigResponseSafe } from '@/lib/banking/c6/c6ConfigRepository';
export { C6BoletoCompanyIsolationError, assertC6CompanyIsolation } from '@/lib/banking/c6/c6BoletoValidation';
