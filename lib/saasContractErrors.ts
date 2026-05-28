export type SaasContractStep =
  | 'validation'
  | 'pdf_generation'
  | 'storage_upload'
  | 'db_save';

export class SaasContractStepError extends Error {
  step: SaasContractStep;

  constructor(step: SaasContractStep, message: string) {
    super(message);
    this.name = 'SaasContractStepError';
    this.step = step;
  }
}

export function formatSaasContractApiError(result: {
  error?: string;
  step?: string;
  missing?: string[];
}): string {
  const parts: string[] = [];
  if (result.error) parts.push(result.error);
  if (result.step) parts.push(`Etapa: ${result.step}`);
  if (Array.isArray(result.missing) && result.missing.length) {
    parts.push(`Campos: ${result.missing.join(', ')}`);
  }
  return parts.length ? parts.join('\n') : 'Falha ao gerar contrato';
}
