/**
 * Detecta se bytes de PDF correspondem ao modelo v1, v2 ou v3 do contrato SaaS.
 */

import { extractRoughPdfText } from '@/lib/saasContractPdfValidation';
import {
  SAAS_CONTRACT_CONTENT_VERSION,
  SAAS_CONTRACT_LEGACY_CONTENT_VERSION,
  SAAS_CONTRACT_V2_CONTENT_VERSION,
} from '@/lib/saasContractContent';

export const SAAS_CONTRACT_V2_LEGACY_22_PHRASE =
  'até a implementação do fluxo de assinatura eletrônica integrado';
export const SAAS_CONTRACT_V2_FUTURE_SIGNATURE_PHRASE = 'fase posterior';

export function roughSaasContractPdfText(pdfBytes: Uint8Array): string {
  return extractRoughPdfText(pdfBytes).toLowerCase();
}

export function pdfContainsSaasContractV3Markers(text: string): boolean {
  const rough = text.toLowerCase();
  return (
    (rough.includes('22-b') ||
      rough.includes('nivel de servico') ||
      rough.includes('nível de serviço') ||
      (rough.includes('vinte e quatro') && rough.includes('horas'))) &&
    (rough.includes('22-c') ||
      rough.includes('sucessao de versoes') ||
      rough.includes('sucessão de versões') ||
      (rough.includes('substituir') && rough.includes('integralmente')))
  );
}

export function pdfLooksLikeSaasContractV3(text: string): boolean {
  const rough = text.toLowerCase();
  if (pdfContainsSaasContractV3Markers(rough)) return true;
  if (!pdfContainsSaasContractV2Markers(rough)) return false;
  return (
    (rough.includes('vinte e quatro') && rough.includes('horas')) ||
    (rough.includes('substituir') && rough.includes('integralmente'))
  );
}

export function pdfContainsSaasContractV2Markers(text: string): boolean {
  const rough = text.toLowerCase();
  return (
    (rough.includes('22-a') || rough.includes('evidências eletrônicas') || rough.includes('evidencias eletronicas')) &&
    (rough.includes('token de autenticação') ||
      rough.includes('token de autenticacao') ||
      rough.includes('14.063'))
  );
}

export function pdfContainsSaasContractV1LegacyMarkers(text: string): boolean {
  const rough = text.toLowerCase();
  return (
    rough.includes(SAAS_CONTRACT_V2_LEGACY_22_PHRASE) ||
    rough.includes('manifestação preliminar de vontade') ||
    rough.includes('manifestacao preliminar de vontade') ||
    rough.includes(SAAS_CONTRACT_V2_FUTURE_SIGNATURE_PHRASE) ||
    rough.includes('formalizada em fase posterior')
  );
}

export function detectSaasContractPdfContentVersion(
  pdfBytes: Uint8Array,
): number | null {
  const rough = roughSaasContractPdfText(pdfBytes);
  if (pdfLooksLikeSaasContractV3(rough)) {
    return SAAS_CONTRACT_CONTENT_VERSION;
  }
  if (pdfContainsSaasContractV2Markers(rough)) {
    return SAAS_CONTRACT_V2_CONTENT_VERSION;
  }
  if (pdfContainsSaasContractV1LegacyMarkers(rough)) {
    return SAAS_CONTRACT_LEGACY_CONTENT_VERSION;
  }
  return null;
}

export function storedPdfMatchesExpectedContentVersion(
  pdfBytes: Uint8Array,
  expectedContentVersion: number,
): boolean {
  const detected = detectSaasContractPdfContentVersion(pdfBytes);
  if (expectedContentVersion >= SAAS_CONTRACT_CONTENT_VERSION) {
    return detected === SAAS_CONTRACT_CONTENT_VERSION;
  }
  if (expectedContentVersion >= SAAS_CONTRACT_V2_CONTENT_VERSION) {
    return detected === SAAS_CONTRACT_V2_CONTENT_VERSION;
  }
  return detected !== SAAS_CONTRACT_CONTENT_VERSION && detected !== SAAS_CONTRACT_V2_CONTENT_VERSION;
}

export function countSaasContractClausesInPdfText(text: string): number {
  const rough = text.toLowerCase();
  if (pdfLooksLikeSaasContractV3(rough)) return 27;
  if (pdfContainsSaasContractV2Markers(rough)) return 25;
  if (pdfContainsSaasContractV1LegacyMarkers(rough)) return 24;
  const matches = rough.match(/cláusula\s+\d+/g) || rough.match(/clausula\s+\d+/g);
  return matches?.length ?? 0;
}
