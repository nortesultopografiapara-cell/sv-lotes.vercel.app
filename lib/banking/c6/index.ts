export {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  isC6ProviderCode,
  throwIfC6EmissionAttempt,
} from '@/lib/banking/c6/c6EmitGuard';
export {
  EMPTY_C6_BANK_CONFIG,
  hasMinimumC6AuthConfig,
  type C6BankConfigPublic,
  type C6BankConfigSaveInput,
} from '@/lib/banking/c6/c6ConfigTypes';
export {
  assertC6ConfigResponseSafe,
  getCompanyC6BankConfig,
  saveCompanyC6BankConfig,
} from '@/lib/banking/c6/c6ConfigRepository';
export {
  C6_AUTH_GRANT_TYPE,
  C6_AUTH_URL,
  buildC6AuthFormBody,
  getC6AuthUrl,
} from '@/lib/banking/c6/c6Endpoints';
export {
  assertC6ConnectionTestPublicSafe,
  requestC6AccessToken,
  sanitizeC6Scopes,
  toPublicC6ConnectionTest,
} from '@/lib/banking/c6/c6AuthClient';
export { runCompanyC6ConnectionTest } from '@/lib/banking/c6/c6ConnectionTest';
