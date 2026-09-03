export {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  isC6ProviderCode,
  throwIfC6EmissionAttempt,
} from '@/lib/banking/c6/c6EmitGuard';
export {
  EMPTY_C6_BANK_CONFIG,
  type C6BankConfigPublic,
  type C6BankConfigSaveInput,
} from '@/lib/banking/c6/c6ConfigTypes';
export {
  assertC6ConfigResponseSafe,
  getCompanyC6BankConfig,
  saveCompanyC6BankConfig,
} from '@/lib/banking/c6/c6ConfigRepository';
