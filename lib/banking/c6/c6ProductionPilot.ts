/**
 * Empresa piloto da C6 Production.
 * Não emite, não grava credencial e não libera outras imobiliárias.
 */

import {
  isC6BoletoSandboxLiveAuthorized,
  throwIfC6EmissionAttempt,
} from '@/lib/banking/c6/c6EmitGuard';

/** UUID antigo de configuração. Não existe em public.companies. */
export const C6_PRODUCTION_STALE_COMPANY_ID = '5ebfe934-e1ae-4252-b3dd-808390c32551';
/**
 * S.V TOPOGRAFIA E PROJETO LTDA, confirmada em Production.
 * is_test_company permanece true.
 * A titularidade foi confirmada pelo proprietário, mas esta flag só muda com autorização expressa.
 * A troca isolada está preparada e não aplicada.
 */
export const C6_PRODUCTION_PILOT_COMPANY_ID = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
export const C6_PRODUCTION_PILOT_OWNERSHIP_APPROVED = false;
export const C6_PRODUCTION_PILOT_SUPABASE_REF = 'aezktedncttwpqeunjej';

export function isC6ProductionPilotCompany(companyId: string | null | undefined): boolean {
  return String(companyId || '').trim().toLowerCase() === C6_PRODUCTION_PILOT_COMPANY_ID.toLowerCase();
}

export function evaluateC6ProductionPilot(input: {
  companyId?: string | null;
}): {
  pilotCompany: boolean;
  otherCompaniesAllowed: false;
  sandboxIntegrationAccepted: false;
  danielEnabled: false;
  emissionAllowed: false;
  oauthAuthorizesEmission: false;
  financialWriteAllowed: false;
  ownershipApproved: false;
  installAuthorized: false;
  globalEmissionAuthorized: boolean;
} {
  const pilotCompany = isC6ProductionPilotCompany(input.companyId);
  return {
    pilotCompany,
    otherCompaniesAllowed: false,
    sandboxIntegrationAccepted: false,
    danielEnabled: false,
    emissionAllowed: false,
    oauthAuthorizesEmission: false,
    financialWriteAllowed: false,
    ownershipApproved: C6_PRODUCTION_PILOT_OWNERSHIP_APPROVED,
    installAuthorized: false,
    globalEmissionAuthorized: isC6BoletoSandboxLiveAuthorized('PRODUCTION'),
  };
}

export function assertC6ProductionPilotStillBlocked(companyId: string | null | undefined): void {
  if (!isC6ProductionPilotCompany(companyId)) {
    throw new Error('Empresa fora da piloto C6.');
  }
  throwIfC6EmissionAttempt('C6');
}
