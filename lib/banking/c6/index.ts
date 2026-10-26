export {
  C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  isC6BoletoSandboxLiveAuthorized,
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
  formatC6At01EvidenceReport,
  parseC6OAuthBodyFields,
  sanitizeC6Scopes,
  toC6At01EvidencePublic,
  type C6At01EvidencePublic,
  type C6AuthFieldSource,
} from '@/lib/banking/c6/c6At01Evidence';
export {
  assertC6ConnectionTestPublicSafe,
  requestC6AccessToken,
  toPublicC6ConnectionTest,
} from '@/lib/banking/c6/c6AuthClient';
export { runCompanyC6ConnectionTest } from '@/lib/banking/c6/c6ConnectionTest';
export {
  C6_BOLETO_BILLING_SCHEME,
  C6_BOLETO_OPENAPI_VERSION,
  C6_BOLETO_OPERATIONS,
} from '@/lib/banking/c6/c6BoletoOpenApi';
export {
  C6_BANK_SLIPS_URL,
  getC6BillingScheme,
  buildC6BankSlipEmitUrl,
} from '@/lib/banking/c6/c6BoletoEndpoints';
export {
  capturePreparedC6BoletoEvidence,
  executeC6BankSlipAlter,
  executeC6BankSlipCancel,
  executeC6BankSlipCreate,
  executeC6BankSlipGet,
  executeC6BankSlipPdf,
  prepareC6BankSlipAlter,
  prepareC6BankSlipCancel,
  prepareC6BankSlipCreate,
  prepareC6BankSlipGet,
  prepareC6BankSlipPdf,
} from '@/lib/banking/c6/c6BoletoClient';
export {
  assertC6BoletoEvidencePublicSafe,
  formatC6BoletoEvidenceReport,
  toC6BoletoEvidencePublic,
} from '@/lib/banking/c6/c6BoletoEvidence';
export {
  C6BoletoCompanyIsolationError,
  C6BoletoValidationError,
  buildC6BankSlipCreateBody,
} from '@/lib/banking/c6/c6BoletoValidation';
export {
  C6_BOLETO_HOMOLOG_CASES,
  C6_BOLETO_INTERNAL_CASES,
} from '@/lib/banking/c6/c6BoletoHomologCatalog';
export {
  C6_B01_CONFIRMATION_PHRASE,
  captureC6HomologB01Blocked,
  executeC6HomologB01Simulated,
  executeC6HomologB01WithIdempotency,
} from '@/lib/banking/c6/c6BoletoHomologB01';
export {
  C6_HOMOLOG_IDEMPOTENCY_META_KEY,
  assertC6HomologRefAvailable,
  parseC6HomologIdempotency,
} from '@/lib/banking/c6/c6BoletoIdempotency';
export {
  C6_B01_RECONCILE_PHRASE,
  C6_HOMOLOG_TABLE,
  C6HomologIdempotencyError,
  classifyC6HomologHttpOutcome,
  createMemoryC6HomologIdempotencyStore,
} from '@/lib/banking/c6/c6HomologIdempotency';
